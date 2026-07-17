// Port em Deno do motor de conciliação/categorização (espelha src/lib/sicoob-matching.ts
// no frontend). Duplicado de propósito, mesmo padrão do resto do projeto (edge functions
// são módulos Deno isolados, sem acesso ao bundler do frontend) — ver
// supabase/functions/asaas-webhook/index.ts para o mesmo estilo de helpers autocontidos.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const DAYS_LATE_TOLERANCE = 7;
const DAYS_EARLY_TOLERANCE = 3;
const VALUE_TOLERANCE = 0.01;

function normalizeText(value?: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function dateAddDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

interface StagingRow {
  id: string;
  company_id: string;
  data: string;
  tipo: "credito" | "debito";
  valor: number;
  descricao_normalizada: string;
  sicoob_transaction_id: string;
}

async function findReconciliationCandidates(supabase: SupabaseClient, staging: StagingRow) {
  const tipoEsperado = staging.tipo === "credito" ? "receita" : "despesa";

  const { data, error } = await supabase
    .from("financial_entries")
    .select("id, valor, data_prevista, data")
    .eq("company_id", staging.company_id)
    .eq("tipo", tipoEsperado)
    .eq("pago", false)
    .is("deleted_at", null);
  if (error || !data) return [];

  const from = dateAddDays(staging.data, -DAYS_LATE_TOLERANCE);
  const to = dateAddDays(staging.data, DAYS_EARLY_TOLERANCE);

  // deno-lint-ignore no-explicit-any
  return data.filter((e: any) => {
    if (Math.abs(Number(e.valor) - staging.valor) > VALUE_TOLERANCE) return false;
    const vencimento = e.data_prevista || e.data;
    if (!vencimento) return false;
    return vencimento >= from && vencimento <= to;
  });
}

async function findCategorizationRuleMatch(supabase: SupabaseClient, companyId: string, descricaoNormalizada: string, tipo: "receita" | "despesa") {
  const { data, error } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("company_id", companyId)
    .eq("tipo", tipo)
    .eq("ativo", true)
    .is("deleted_at", null);
  if (error || !data) return null;

  // deno-lint-ignore no-explicit-any
  const sorted = [...data].sort((a: any, b: any) => {
    if (b.prioridade !== a.prioridade) return b.prioridade - a.prioridade;
    return (b.padrao?.length || 0) - (a.padrao?.length || 0);
  });

  // deno-lint-ignore no-explicit-any
  return sorted.find((r: any) => descricaoNormalizada.includes(r.padrao)) || null;
}

/**
 * Processa uma linha pendente de extrato: primeiro tenta conciliar com um
 * lançamento já existente e pendente; se não achar, sugere categoria por regra.
 * Nunca cria `financial_entries` novo sozinho — só atualiza um já existente.
 */
export async function processStagingRow(
  supabase: SupabaseClient,
  bankAccountNome: string | null,
  staging: StagingRow,
): Promise<void> {
  const candidates = await findReconciliationCandidates(supabase, staging);

  if (candidates.length === 1) {
    const candidate = candidates[0];
    await supabase.from("financial_entries").update({
      pago: true,
      data: staging.data,
      conta: bankAccountNome || undefined,
      sicoob_transaction_id: staging.sicoob_transaction_id,
    }).eq("id", candidate.id).eq("company_id", staging.company_id);

    await supabase.from("sicoob_transactions")
      .update({ status: "conciliado", matched_financial_entry_id: candidate.id })
      .eq("id", staging.id);
    return;
  }

  if (candidates.length > 1) {
    // deno-lint-ignore no-explicit-any
    await supabase.from("sicoob_transactions")
      .update({ candidate_financial_entry_ids: candidates.map((c: any) => c.id) })
      .eq("id", staging.id);
    return;
  }

  const tipoEsperado = staging.tipo === "credito" ? "receita" : "despesa";
  const rule = await findCategorizationRuleMatch(supabase, staging.company_id, staging.descricao_normalizada, tipoEsperado);
  if (!rule) return;

  await supabase.from("sicoob_transactions").update({
    status: "categorizado",
    suggested_categoria: rule.categoria,
    suggested_subcategoria: rule.subcategoria || null,
    suggested_tags: rule.tags || [],
    applied_rule_id: rule.id,
  }).eq("id", staging.id);
}

export async function runMatchingForPendingRows(supabase: SupabaseClient, companyId: string, bankAccountNome: string | null): Promise<number> {
  const { data, error } = await supabase
    .from("sicoob_transactions")
    .select("id, company_id, data, tipo, valor, descricao_normalizada, sicoob_transaction_id")
    .eq("company_id", companyId)
    .eq("status", "pendente")
    .is("deleted_at", null);
  if (error || !data) return 0;

  for (const row of data) {
    await processStagingRow(supabase, bankAccountNome, row as StagingRow);
  }
  return data.length;
}

export { normalizeText };
