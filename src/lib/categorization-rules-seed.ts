import { supabase } from "@/integrations/supabase/client";
import { normalizeText } from "./text-normalize";

// Mesmo vocabulário usado em supabase/functions/asaas-webhook/index.ts (parseFeeSubcategoria)
// para que tarifas bancárias óbvias já cheguem categorizadas no dia 1, sem o usuário
// precisar ensinar nada.
const DEFAULT_RULES: Array<{ padrao: string; tipo: "receita" | "despesa"; categoria: string; subcategoria: string }> = [
  { padrao: "mensageria", tipo: "despesa", categoria: "taxas", subcategoria: "Taxa de mensageria" },
  { padrao: "sms", tipo: "despesa", categoria: "taxas", subcategoria: "Taxa de mensageria" },
  { padrao: "tarifa boleto", tipo: "despesa", categoria: "taxas", subcategoria: "Taxa de boleto" },
  { padrao: "tarifa pix", tipo: "despesa", categoria: "taxas", subcategoria: "Taxa PIX" },
  { padrao: "tarifa ted", tipo: "despesa", categoria: "taxas", subcategoria: "Taxa de transferência" },
  { padrao: "tarifa doc", tipo: "despesa", categoria: "taxas", subcategoria: "Taxa de transferência" },
  { padrao: "manutencao de conta", tipo: "despesa", categoria: "taxas", subcategoria: "Taxa Asaas" },
  { padrao: "tarifa de manutencao", tipo: "despesa", categoria: "taxas", subcategoria: "Taxa Asaas" },
];

/** Semeia regras default (fonte='sistema') para a empresa, sem duplicar as que já existem. */
export async function seedDefaultCategorizationRules(companyId: string): Promise<void> {
  const db = supabase as any;
  const { data: existing } = await db
    .from("categorization_rules")
    .select("padrao, tipo")
    .eq("company_id", companyId)
    .eq("fonte", "sistema");

  const existingKeys = new Set((existing || []).map((r: any) => `${r.padrao}::${r.tipo}`));
  const toInsert = DEFAULT_RULES
    .map((r) => ({ ...r, padrao: normalizeText(r.padrao) }))
    .filter((r) => !existingKeys.has(`${r.padrao}::${r.tipo}`))
    .map((r) => ({
      company_id: companyId,
      padrao: r.padrao,
      tipo: r.tipo,
      categoria: r.categoria,
      subcategoria: r.subcategoria,
      tags: [],
      origem_escopo: "sicoob",
      fonte: "sistema",
      prioridade: 0,
      usos_count: 0,
      ativo: true,
    }));

  if (toInsert.length === 0) return;
  await db.from("categorization_rules").insert(toInsert);
}
