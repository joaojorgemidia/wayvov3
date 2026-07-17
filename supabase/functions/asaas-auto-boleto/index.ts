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

  // Busca todas as empresas com asaas habilitado e gerarBoletoXDiasAntes > 0
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

  for (const company of (companies || [])) {
    const cfg = company.asaas_config;
    if (!cfg?.enabled || !cfg?.gerarBoletoXDiasAntes) continue;

    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + Number(cfg.gerarBoletoXDiasAntes));
    const targetDateStr = targetDate.toISOString().split("T")[0];

    // Entradas de aluguel/caução sem boleto, não pagas, com vencimento até a data alvo.
    // Usa "<=" (não "=") para recuperar entradas que ficaram sem boleto por falha pontual
    // num dia anterior — com "=" elas nunca mais seriam pegas, já que no dia seguinte a
    // data alvo já é outra.
    const { data: entries } = await supabase
      .from("financial_entries")
      .select("id")
      .eq("company_id", company.id)
      .in("categoria", ["aluguel", "caucao"])
      .is("asaas_payment_id", null)
      .eq("pago", false)
      .is("deleted_at", null)
      .lte("data_prevista", targetDateStr);

    for (const entry of (entries || [])) {
      try {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-charge`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ entryId: entry.id }),
          },
        );

        const body = await res.json();
        if (!res.ok || body.error) {
          results.failed++;
          results.errors.push(`${entry.id}: ${body.error ?? res.status}`);
        } else {
          results.generated++;
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`${entry.id}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
  }

  console.log("[asaas-auto-boleto]", results);
  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
