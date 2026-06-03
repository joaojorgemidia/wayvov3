import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";

function parseFeeSubcategoria(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("mensageria") || d.includes("sms") || d.includes("whatsapp")) return "Taxa de mensageria";
  if (d.includes("boleto")) return "Taxa de boleto";
  if (d.includes("pix")) return "Taxa PIX";
  if (d.includes("transferência") || d.includes("transferencia") || d.includes("ted") || d.includes("doc")) return "Taxa de transferência";
  if (d.includes("antecipação") || d.includes("antecipacao")) return "Taxa de antecipação";
  return "Taxa Asaas";
}

async function feeIdToUUID(feeId: string | number): Promise<string> {
  const data = new TextEncoder().encode(`asaas-fee:${feeId}`);
  const buf = await crypto.subtle.digest("SHA-1", data);
  const h = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-${(["8","9","a","b"])[parseInt(h[16],16)&3]}${h.slice(17,20)}-${h.slice(20,32)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { asaasPaymentId, entryId, companyId } = await req.json();

    if (!asaasPaymentId || !companyId) {
      return new Response(JSON.stringify({ error: "asaasPaymentId e companyId são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca a chave de API da empresa
    const { data: company } = await supabase
      .from("companies")
      .select("asaas_config")
      .eq("id", companyId)
      .single();

    const apiKey = company?.asaas_config?.apiKey || Deno.env.get("ASAAS_API_KEY") || "";
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Chave de API Asaas não configurada" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca a entrada financeira para obter os dados de vínculo
    let entry: Record<string, any> | null = null;
    if (entryId) {
      const { data } = await supabase
        .from("financial_entries")
        .select("id, asaas_payment_id, company_id, cliente_id, cliente_nome, moto_id, placa, rental_id, data")
        .eq("id", entryId)
        .single();
      entry = data;
    } else {
      const { data } = await supabase
        .from("financial_entries")
        .select("id, asaas_payment_id, company_id, cliente_id, cliente_nome, moto_id, placa, rental_id, data")
        .eq("asaas_payment_id", asaasPaymentId)
        .single();
      entry = data;
    }

    const paymentDate = entry?.data || new Date().toISOString().split("T")[0];

    // Busca transações financeiras (taxas) do Asaas para este pagamento
    const res = await fetch(
      `${ASAAS_BASE}/financialTransactions?payment.id=${asaasPaymentId}&type=DEBIT`,
      { headers: { "access_token": apiKey } },
    );

    if (!res.ok) {
      const txt = await res.text();
      return new Response(JSON.stringify({ error: `Asaas API ${res.status}: ${txt.slice(0, 200)}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    const fees = (json.data || []) as Array<{ id: string; date: string; value: number; description: string }>;

    if (fees.length === 0) {
      return new Response(JSON.stringify({ registered: 0, message: "Nenhuma taxa encontrada no Asaas para este pagamento." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let registered = 0;
    for (const fee of fees) {
      const feeAmount = Math.abs(Number(fee.value));
      if (feeAmount <= 0) continue;

      const feeDate = fee.date || paymentDate;
      const subcategoria = parseFeeSubcategoria(fee.description || "");
      const feeUUID = await feeIdToUUID(fee.id);

      const { error } = await supabase
        .from("financial_entries")
        .upsert({
          id: feeUUID,
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
          natureza: "administrativa",
          company_id: companyId,
          cliente_id: entry?.cliente_id || null,
          cliente_nome: entry?.cliente_nome || null,
          moto_id: entry?.moto_id || null,
          placa: entry?.placa || null,
          rental_id: entry?.rental_id || null,
          tags: ["Asaas"],
          recorrente: false,
          despesa_fixa: false,
          ignorada: false,
          deleted_at: null,
        }, { onConflict: "id", ignoreDuplicates: true });

      if (!error) {
        registered++;
        console.log(`[asaas-sync-fees] taxa registrada: ${subcategoria} R$ ${feeAmount} em ${feeDate}`);
      } else {
        console.error(`[asaas-sync-fees] erro ao inserir taxa ${fee.id}:`, error.message);
      }
    }

    return new Response(JSON.stringify({ registered, total: fees.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[asaas-sync-fees]", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
