import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";
const TERMINAL = new Set(["RECEIVED", "CANCELLED", "REFUNDED", "REFUND_REQUESTED", "DELETED"]);

async function deterministicUUID(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest("SHA-1", data);
  const h = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-${(["8","9","a","b"])[parseInt(h[16],16)&3]}${h.slice(17,20)}-${h.slice(20,32)}`;
}

function parseFeeSubcategoria(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("mensageria") || d.includes("sms") || d.includes("whatsapp")) return "Taxa de mensageria";
  if (d.includes("boleto")) return "Taxa de boleto";
  if (d.includes("pix")) return "Taxa PIX";
  if (d.includes("transferência") || d.includes("transferencia") || d.includes("ted") || d.includes("doc")) return "Taxa de transferência";
  if (d.includes("antecipação") || d.includes("antecipacao")) return "Taxa de antecipação";
  return "Taxa Asaas";
}

async function registerAsaasFees(
  supabase: ReturnType<typeof createClient>,
  entry: {
    id: string;
    asaas_payment_id: string;
    company_id: string;
    cliente_id?: string | null;
    cliente_nome?: string | null;
    moto_id?: string | null;
    placa?: string | null;
    rental_id?: string | null;
  },
  apiKey: string,
  paymentDate: string,
): Promise<number> {
  let registered = 0;
  try {
    const res = await fetch(
      `${ASAAS_BASE}/financialTransactions?payment=${entry.asaas_payment_id}&type=DEBIT`,
      { headers: { "access_token": apiKey } },
    );

    if (!res.ok) {
      console.warn(`[registerAsaasFees] ${res.status} para payment ${entry.asaas_payment_id}`);
      return 0;
    }

    const json = await res.json();
    // Filtra apenas taxas deste pagamento (dupla proteção: payment.id na resposta)
    const fees = ((json.data || []) as Array<{ id: string; date: string; value: number; description: string; payment?: { id: string } }>)
      .filter(f => !f.payment?.id || f.payment.id === entry.asaas_payment_id);

    for (const fee of fees) {
      const feeAmount = Math.abs(Number(fee.value));
      if (feeAmount <= 0) continue;

      const feeDate = fee.date || paymentDate;
      const subcategoria = parseFeeSubcategoria(fee.description || "");

      const { error } = await supabase
        .from("financial_entries")
        .upsert({
          id: await deterministicUUID(`asaas-fee:${fee.id}`),
          tipo: "despesa",
          categoria: "taxas",
          subcategoria,
          descricao: fee.description || subcategoria,
          observacao: fee.description || subcategoria,
          valor: feeAmount,
          data: feeDate,
          data_prevista: feeDate,
          pago: true,
          conta: "Asaas",
          natureza: entry.placa || entry.moto_id ? "operacional" : "administrativa",
          company_id: entry.company_id,
          cliente_id: entry.cliente_id || null,
          cliente_nome: entry.cliente_nome || null,
          moto_id: entry.moto_id || null,
          placa: entry.placa || null,
          rental_id: entry.rental_id || null,
          tags: ["Asaas"],
          recorrente: false,
          despesa_fixa: false,
          ignorada: false,
          deleted_at: null,
        }, { onConflict: "id", ignoreDuplicates: true });

      if (!error) registered++;
    }
  } catch (err) {
    console.error("[registerAsaasFees]", err);
  }
  return registered;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Busca todos os boletos pendentes com campos necessários para registrar taxas
  const { data: entries, error } = await supabase
    .from("financial_entries")
    .select("id, asaas_payment_id, asaas_status, company_id, cliente_id, cliente_nome, moto_id, placa, rental_id")
    .not("asaas_payment_id", "is", null)
    .eq("pago", false)
    .is("deleted_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const toSync = (entries || []).filter(e => !TERMINAL.has(e.asaas_status ?? ""));

  // Mapa de chave de API por empresa
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

  const results = { synced: 0, paid: 0, fees: 0, unchanged: 0, failed: 0, total: toSync.length };

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

      const paymentDate = payment.confirmedDate || payment.paymentDate || new Date().toISOString().split("T")[0];

      const update: Record<string, unknown> = {
        asaas_status: newStatus,
        asaas_boleto_url: payment.bankSlipUrl || null,
        asaas_invoice_url: payment.invoiceUrl || null,
      };

      if (newStatus === "RECEIVED" || newStatus === "CONFIRMED") {
        update.pago = true;
        update.asaas_status = "RECEIVED";
        update.data = paymentDate;
        update.conta = "Asaas";
        results.paid++;

        // Registra taxas do Asaas para este pagamento
        const feeCount = await registerAsaasFees(supabase, entry, apiKey, paymentDate);
        results.fees += feeCount;
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
