import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results = { generated: 0, skipped: 0, failed: 0, errors: [] as string[] };

  const chargeEntries = async (entryIds: string[]) => {
    for (const entryId of entryIds) {
      try {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-charge`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ entryId }),
          },
        );

        const body = await res.json();
        if (!res.ok || body.error) {
          results.failed++;
          results.errors.push(`${entryId}: ${body.error ?? res.status}`);
        } else {
          results.generated++;
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`${entryId}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
  };

  // Busca todas as empresas com asaas habilitado
  const { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("id, asaas_config")
    .not("asaas_config", "is", null);

  if (compErr) {
    return new Response(JSON.stringify({ error: compErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // Multas: janela fixa de 2 dias antes do vencimento real da multa (fines.data_vencimento),
  // independente do gerarBoletoXDiasAntes configurado pra aluguel/caução — a cobrança da
  // multa (financial_entries.data_prevista) já nasce "vencendo hoje" no cadastro (ver
  // MultasPage.handleSave), então usar esse campo aqui geraria o boleto sempre no dia do
  // cadastro, não perto do vencimento real da multa.
  const multaTargetDate = new Date(today);
  multaTargetDate.setDate(multaTargetDate.getDate() + 2);
  const multaTargetDateStr = multaTargetDate.toISOString().split("T")[0];

  for (const company of (companies || [])) {
    const cfg = company.asaas_config;
    if (!cfg?.enabled) continue;

    if (cfg.gerarBoletoXDiasAntes) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + Number(cfg.gerarBoletoXDiasAntes));
      const targetDateStr = targetDate.toISOString().split("T")[0];

      // Qualquer cobrança de receita (aluguel, caução, parcelamento, cobrança consolidada de
      // encerramento etc.) sem boleto, não paga, com vencimento até a data alvo. Antes só uma
      // lista fixa de categorias entrava aqui (ex.: cobrança consolidada de encerramento
      // ficava de fora e nunca gerava boleto sozinha) — agora é "qualquer receita", exceto
      // multa (tratada abaixo com sua própria janela de vencimento). Usa "<=" (não "=") para
      // recuperar entradas que ficaram sem boleto por falha pontual num dia anterior — com
      // "=" elas nunca mais seriam pegas, já que no dia seguinte a data alvo já é outra.
      const { data: entries } = await supabase
        .from("financial_entries")
        .select("id")
        .eq("company_id", company.id)
        .eq("tipo", "receita")
        .neq("categoria", "multa_transito_receita")
        .is("asaas_payment_id", null)
        .eq("pago", false)
        .is("deleted_at", null)
        .lte("data_prevista", targetDateStr);

      await chargeEntries((entries || []).map(e => e.id));
    }

    // Multas: acha as multas dessa empresa com vencimento até 2 dias à frente (ou já hoje/
    // vencidas — "<=", mesmo raciocínio do "<=" acima) e busca a receita (cobrança ao
    // locatário) vinculada a cada uma que ainda não tem boleto.
    const { data: duefines } = await supabase
      .from("fines")
      .select("id")
      .eq("company_id", company.id)
      .not("data_vencimento", "is", null)
      .lte("data_vencimento", multaTargetDateStr)
      .is("deleted_at", null);

    const fineIds = (duefines || []).map(f => f.id);
    if (fineIds.length > 0) {
      const { data: multaEntries } = await supabase
        .from("financial_entries")
        .select("id")
        .eq("company_id", company.id)
        .eq("categoria", "multa_transito_receita")
        .in("fine_id", fineIds)
        .is("asaas_payment_id", null)
        .eq("pago", false)
        .is("deleted_at", null);

      await chargeEntries((multaEntries || []).map(e => e.id));
    }
  }

  console.log("[asaas-auto-boleto]", results);
  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
