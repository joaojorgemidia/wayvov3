import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";
const TERMINAL = new Set(["RECEIVED", "CANCELLED", "REFUNDED", "REFUND_REQUESTED", "DELETED"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Busca todos os boletos pendentes (com asaas_payment_id, não pagos, não terminais)
  const { data: entries, error } = await supabase
    .from("financial_entries")
    .select("id, asaas_payment_id, asaas_status, company_id")
    .not("asaas_payment_id", "is", null)
    .eq("pago", false)
    .is("deleted_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const toSync = (entries || []).filter(e => !TERMINAL.has(e.asaas_status ?? ""));

  // Monta mapa de chave de API por empresa
  const companyIds = [...new Set(toSync.map(e => e.company_id).filter(Boolean))];
  const apiKeyMap = new Map<string, string>();

  for (const companyId of companyIds) {
    const { data: company } = await supabase
      .from("companies")
      .select("asaas_config")
      .eq("id", companyId)
      .single();
    const key = company?.asaas_config?.apiKey || Deno.env.get("ASAAS_API_KEY") || "";
    if (key) apiKeyMap.set(companyId, key);
  }

  const results = { synced: 0, paid: 0, unchanged: 0, failed: 0, total: toSync.length };

  for (const entry of toSync) {
    const apiKey = apiKeyMap.get(entry.company_id) || Deno.env.get("ASAAS_API_KEY") || "";
    if (!apiKey) { results.failed++; continue; }

    try {
      const res = await fetch(`${ASAAS_BASE}/payments/${entry.asaas_payment_id}`, {
        headers: { "access_token": apiKey },
      });
      if (!res.ok) { results.failed++; continue; }

      const payment = await res.json();
      const newStatus: string = payment.status;

      if (newStatus === entry.asaas_status) { results.unchanged++; continue; }

      const update: Record<string, unknown> = {
        asaas_status: TERMINAL.has(newStatus) && newStatus !== "RECEIVED" ? newStatus : newStatus,
        asaas_boleto_url: payment.bankSlipUrl || null,
        asaas_invoice_url: payment.invoiceUrl || null,
      };

      if (newStatus === "RECEIVED" || newStatus === "CONFIRMED") {
        update.pago = true;
        update.asaas_status = "RECEIVED";
        // data de pagamento: usa confirmedDate ou paymentDate do Asaas
        const payDate = payment.confirmedDate || payment.paymentDate || new Date().toISOString().split("T")[0];
        update.data = payDate;
        update.conta = "Asaas";
        results.paid++;
      }

      await supabase.from("financial_entries").update(update).eq("id", entry.id);
      results.synced++;
    } catch {
      results.failed++;
    }
  }

  console.log("[asaas-sync-status]", results);
  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
