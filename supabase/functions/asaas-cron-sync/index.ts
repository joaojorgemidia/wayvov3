import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffDate = cutoff.toISOString().split("T")[0];

  const { data: entries, error } = await supabase
    .from("financial_entries")
    .select("id, asaas_payment_id, company_id")
    .eq("pago", true)
    .not("asaas_payment_id", "is", null)
    .gte("data", cutoffDate)
    .is("deleted_at", null);

  if (error) {
    console.error("[asaas-cron-sync] erro ao buscar entradas:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const fnUrl = `${supabaseUrl}/functions/v1/asaas-sync-fees`;
  let synced = 0;
  let already = 0;
  let failed = 0;

  for (const entry of entries || []) {
    try {
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          asaasPaymentId: entry.asaas_payment_id,
          entryId: entry.id,
          companyId: entry.company_id,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.registeredFees > 0 || result.registeredJuros > 0) {
          synced++;
          console.log(`[asaas-cron-sync] ${entry.id}: fees=${result.registeredFees} juros=${result.registeredJuros}`);
        } else {
          already++;
        }
      } else {
        failed++;
        console.error(`[asaas-cron-sync] ${entry.id}: HTTP ${res.status}`);
      }
    } catch (err) {
      failed++;
      console.error(`[asaas-cron-sync] ${entry.id}:`, err);
    }
  }

  const summary = { total: entries?.length || 0, synced, already, failed };
  console.log("[asaas-cron-sync] concluído:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
