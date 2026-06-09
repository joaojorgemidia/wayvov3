import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";

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

    const linkFields = {
      company_id: companyId,
      cliente_id: entry?.cliente_id || null,
      cliente_nome: entry?.cliente_nome || null,
      moto_id: entry?.moto_id || null,
      placa: entry?.placa || null,
      rental_id: entry?.rental_id || null,
    };

    // ── 1. Taxas de plataforma Asaas (DEBIT) ────────────────────────────────
    let registeredFees = 0;
    const feesRes = await fetch(
      `${ASAAS_BASE}/financialTransactions?payment=${asaasPaymentId}&type=DEBIT`,
      { headers: { "access_token": apiKey } },
    );

    if (feesRes.ok) {
      const json = await feesRes.json();
      // Filtra apenas taxas deste pagamento (dupla proteção: payment.id na resposta)
      const fees = ((json.data || []) as Array<{ id: string; date: string; value: number; description: string; payment?: { id: string } }>)
        .filter(f => !f.payment?.id || f.payment.id === asaasPaymentId);

      for (const fee of fees) {
        const feeAmount = Math.abs(Number(fee.value));
        if (feeAmount <= 0) continue;

        const feeDate = fee.date || paymentDate;
        const subcategoria = parseFeeSubcategoria(fee.description || "");

        const { error } = await supabase.from("financial_entries").upsert({
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
          natureza: linkFields.placa || linkFields.moto_id ? "operacional" : "administrativa",
          ...linkFields,
          tags: ["Asaas"],
          recorrente: false,
          despesa_fixa: false,
          ignorada: false,
          deleted_at: null,
        }, { onConflict: "id", ignoreDuplicates: true });

        if (!error) {
          registeredFees++;
          console.log(`[asaas-sync-fees] taxa registrada: ${subcategoria} R$ ${feeAmount} em ${feeDate}`);
        } else {
          console.error(`[asaas-sync-fees] erro ao inserir taxa ${fee.id}:`, error.message);
        }
      }
    } else {
      console.warn(`[asaas-sync-fees] financialTransactions retornou ${feesRes.status}`);
    }

    // ── 2. Juros e multa recebidos (receita juros_atraso) ────────────────────
    let registeredJuros = 0;
    const paymentRes = await fetch(
      `${ASAAS_BASE}/payments/${asaasPaymentId}`,
      { headers: { "access_token": apiKey } },
    );

    if (paymentRes.ok) {
      const paymentData = await paymentRes.json();
      const interestValue = Number(paymentData.interest?.value || 0);
      const fineValue = Number(paymentData.fine?.value || 0);
      const total = interestValue + fineValue;

      if (total > 0) {
        const parts: string[] = [];
        if (interestValue > 0) parts.push(`Juros R$ ${interestValue.toFixed(2)}`);
        if (fineValue > 0) parts.push(`Multa R$ ${fineValue.toFixed(2)}`);

        const { error } = await supabase.from("financial_entries").upsert({
          id: await deterministicUUID(`asaas-juros:${asaasPaymentId}`),
          tipo: "receita",
          categoria: "juros_atraso",
          subcategoria: "Mensal",
          descricao: `Juros/Multa - ${entry?.cliente_nome || ""}`.trim(),
          observacao: parts.join(" + "),
          valor: total,
          data: paymentDate,
          data_prevista: paymentDate,
          pago: true,
          conta: "Asaas",
          natureza: "operacional",
          ...linkFields,
          tags: ["Asaas", "Pago Asaas"],
          recorrente: false,
          despesa_fixa: false,
          ignorada: false,
          deleted_at: null,
        }, { onConflict: "id", ignoreDuplicates: true });

        if (!error) {
          registeredJuros++;
          console.log(`[asaas-sync-fees] juros/multa registrado: R$ ${total} (${parts.join(", ")})`);
        } else {
          console.error(`[asaas-sync-fees] erro ao inserir juros/multa:`, error.message);
        }
      }
    } else {
      console.warn(`[asaas-sync-fees] GET payment retornou ${paymentRes.status}`);
    }

    return new Response(
      JSON.stringify({ registeredFees, registeredJuros }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[asaas-sync-fees]", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
