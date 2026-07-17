import { supabase } from "@/integrations/supabase/client";
import { normalizeText } from "./text-normalize";
import { dbToCategorizationRule } from "./db-mappers";
import type { CategorizationRule } from "./types";

// Vencimento pode estar até N dias no passado (atraso, mais comum) ou M dias no
// futuro (pagamento adiantado) em relação à data da transação no extrato.
const DAYS_LATE_TOLERANCE = 7;
const DAYS_EARLY_TOLERANCE = 3;
const VALUE_TOLERANCE = 0.01;

function dateAddDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Recorte curto e limpo da descrição, usado como sugestão de "padrão" de regra de categorização. */
export function suggestPatternFromDescription(descricao: string): string {
  return normalizeText(descricao)
    .replace(/\d+/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ");
}

export interface ReconciliationCandidate {
  id: string;
  valor: number;
  dataPrevista: string | null;
  data: string;
  descricao: string;
}

async function findReconciliationCandidates(
  companyId: string,
  staging: { data: string; tipo: "credito" | "debito"; valor: number },
): Promise<ReconciliationCandidate[]> {
  const tipoEsperado = staging.tipo === "credito" ? "receita" : "despesa";
  const db = supabase as any;

  const { data, error } = await db
    .from("financial_entries")
    .select("id, valor, data_prevista, data, descricao")
    .eq("company_id", companyId)
    .eq("tipo", tipoEsperado)
    .eq("pago", false)
    .is("deleted_at", null);
  if (error || !data) return [];

  const from = dateAddDays(staging.data, -DAYS_LATE_TOLERANCE);
  const to = dateAddDays(staging.data, DAYS_EARLY_TOLERANCE);

  return data
    .filter((e: any) => {
      if (Math.abs(Number(e.valor) - staging.valor) > VALUE_TOLERANCE) return false;
      const vencimento = e.data_prevista || e.data;
      if (!vencimento) return false;
      return vencimento >= from && vencimento <= to;
    })
    .map((e: any) => ({
      id: e.id,
      valor: Number(e.valor),
      dataPrevista: e.data_prevista || null,
      data: e.data,
      descricao: e.descricao || "",
    }));
}

export async function findCategorizationRuleMatch(
  companyId: string,
  descricaoNormalizada: string,
  tipo: "receita" | "despesa",
): Promise<CategorizationRule | null> {
  const db = supabase as any;
  const { data, error } = await db
    .from("categorization_rules")
    .select("*")
    .eq("company_id", companyId)
    .eq("tipo", tipo)
    .eq("ativo", true)
    .is("deleted_at", null);
  if (error || !data) return null;

  // Regra mais específica (padrão mais longo) e de maior prioridade primeiro
  const sorted = [...data].sort((a: any, b: any) => {
    if (b.prioridade !== a.prioridade) return b.prioridade - a.prioridade;
    return (b.padrao?.length || 0) - (a.padrao?.length || 0);
  });

  const match = sorted.find((r: any) => descricaoNormalizada.includes(r.padrao));
  return match ? dbToCategorizationRule(match) : null;
}

interface StagingRowInput {
  id: string;
  data: string;
  tipo: "credito" | "debito";
  valor: number;
  descricaoNormalizada: string;
  sicoobTransactionId: string;
}

/**
 * Processa uma linha pendente de extrato: primeiro tenta conciliar com um
 * lançamento já existente e pendente; se não achar, sugere categoria por regra.
 * Nunca cria `financial_entries` novo sozinho — só atualiza um já existente.
 */
export async function processStagingRow(
  companyId: string,
  bankAccountNome: string | null,
  staging: StagingRowInput,
): Promise<void> {
  const db = supabase as any;
  const candidates = await findReconciliationCandidates(companyId, staging);

  if (candidates.length === 1) {
    const candidate = candidates[0];
    const { error: entryError } = await db
      .from("financial_entries")
      .update({
        pago: true,
        data: staging.data,
        conta: bankAccountNome || undefined,
        sicoob_transaction_id: staging.sicoobTransactionId,
      })
      .eq("id", candidate.id)
      .eq("company_id", companyId);
    if (entryError) throw entryError;

    const { error: stagingError } = await db
      .from("sicoob_transactions")
      .update({ status: "conciliado", matched_financial_entry_id: candidate.id })
      .eq("id", staging.id)
      .eq("company_id", companyId);
    if (stagingError) throw stagingError;
    return;
  }

  if (candidates.length > 1) {
    await db
      .from("sicoob_transactions")
      .update({ candidate_financial_entry_ids: candidates.map((c) => c.id) })
      .eq("id", staging.id)
      .eq("company_id", companyId);
    return;
  }

  const tipoEsperado = staging.tipo === "credito" ? "receita" : "despesa";
  const rule = await findCategorizationRuleMatch(companyId, staging.descricaoNormalizada, tipoEsperado);
  if (!rule) return;

  await db
    .from("sicoob_transactions")
    .update({
      status: "categorizado",
      suggested_categoria: rule.categoria,
      suggested_subcategoria: rule.subcategoria || null,
      suggested_tags: rule.tags || [],
      applied_rule_id: rule.id,
    })
    .eq("id", staging.id)
    .eq("company_id", companyId);
}

/** Reprocessa todas as linhas pendentes de uma empresa (após importar um CSV, por exemplo). */
export async function runMatchingForPendingRows(companyId: string, bankAccountNome: string | null): Promise<void> {
  const db = supabase as any;
  const { data, error } = await db
    .from("sicoob_transactions")
    .select("id, data, tipo, valor, descricao_normalizada, sicoob_transaction_id")
    .eq("company_id", companyId)
    .eq("status", "pendente")
    .is("deleted_at", null);
  if (error || !data) return;

  for (const row of data) {
    await processStagingRow(companyId, bankAccountNome, {
      id: row.id,
      data: row.data,
      tipo: row.tipo,
      valor: Number(row.valor),
      descricaoNormalizada: row.descricao_normalizada || normalizeText(row.descricao_normalizada),
      sicoobTransactionId: row.sicoob_transaction_id,
    });
  }
}
