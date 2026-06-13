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

// O Asaas pode retornar `payment` como string-ID ou como objeto { id }.
// Também testa o campo `document` usado em algumas versões da API.
function feeMatchesPayment(f: Record<string, unknown>, paymentId: string): boolean {
  const p = f.payment;
  if (typeof p === "string") return p === paymentId;
  if (p && typeof p === "object") return (p as { id?: string }).id === paymentId;
  const d = f.document;
  if (typeof d === "string") return d === paymentId;
  if (d && typeof d === "object") return (d as { id?: string }).id === paymentId;
  return false;
}

function computePeriodoRef(dataInicio: string, frequencia: string, dueDateStr: string): string {
  const start = new Date(dataInicio + "T00:00:00");
  const dueDate = new Date(dueDateStr + "T00:00:00");
  const periodDays = frequencia === "quinzenal" ? 14 : frequencia === "mensal" ? 30 : 7;
  const diffDays = Math.round((dueDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const periodoIdx = Math.max(0, Math.floor(diffDays / periodDays));
  const periodoNum = periodoIdx + 1;
  const periodoInicio = new Date(start.getTime() + periodoIdx * periodDays * 24 * 60 * 60 * 1000);
  const periodoFim = new Date(periodoInicio.getTime() + (periodDays - 1) * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const labelTipo = frequencia === "quinzenal" ? "Quinzena" : frequencia === "mensal" ? "Mês" : "Semana";
  return `${labelTipo} ${String(periodoNum).padStart(2, "0")}: ${fmt(periodoInicio)} até ${fmt(periodoFim)}`;
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
        .select("id, asaas_payment_id, company_id, cliente_id, cliente_nome, moto_id, placa, rental_id, data, data_prevista")
        .eq("id", entryId)
        .single();
      entry = data;
    } else {
      const { data } = await supabase
        .from("financial_entries")
        .select("id, asaas_payment_id, company_id, cliente_id, cliente_nome, moto_id, placa, rental_id, data, data_prevista")
        .eq("asaas_payment_id", asaasPaymentId)
        .single();
      entry = data;
    }

    const today = new Date().toISOString().split("T")[0];

    const linkFields = {
      company_id: companyId,
      cliente_id: entry?.cliente_id || null,
      cliente_nome: entry?.cliente_nome || null,
      moto_id: entry?.moto_id || null,
      placa: entry?.placa || null,
      rental_id: entry?.rental_id || null,
    };

    // ── Busca dados do pagamento para obter a data real de recebimento ────────
    let paymentData: Record<string, any> = {};
    const paymentRes = await fetch(
      `${ASAAS_BASE}/payments/${asaasPaymentId}`,
      { headers: { "access_token": apiKey } },
    );
    if (paymentRes.ok) {
      paymentData = await paymentRes.json();
    } else {
      console.warn(`[asaas-sync-fees] GET payment retornou ${paymentRes.status}`);
    }

    // creditDate = data em que o valor fica disponível para saque na conta Asaas
    const paymentDate = paymentData.creditDate || paymentData.paymentDate || entry?.data || today;

    // ── 1. Taxas de plataforma Asaas (DEBIT) ────────────────────────────────
    let registeredFees = 0;
    const seenFeeIds = new Set<string>();
    const feesToInsert: Array<{ id: string; value: number; description: string }> = [];

    // Estratégia 1: filtrar diretamente pelo payment ID
    const s1Res = await fetch(
      `${ASAAS_BASE}/financialTransactions?payment=${asaasPaymentId}&type=DEBIT`,
      { headers: { "access_token": apiKey } },
    );
    if (s1Res.ok) {
      const s1Rows = ((await s1Res.json()).data || []) as Array<Record<string, unknown>>;
      console.log(`[asaas-sync-fees] s1: ${s1Rows.length} rows`);
      for (const f of s1Rows) {
        const fId = String(f.id ?? "");
        if (!fId || seenFeeIds.has(fId)) continue;
        if (!feeMatchesPayment(f, asaasPaymentId)) {
          console.log(`[asaas-sync-fees] s1 skip id=${fId} payment=${JSON.stringify(f.payment)}`);
          continue;
        }
        seenFeeIds.add(fId);
        feesToInsert.push({ id: fId, value: Number(f.value ?? 0), description: String(f.description ?? "") });
      }
    }

    // Estratégia 2: busca todos os lançamentos do creditDate e filtra pelo nº da fatura.
    // O Asaas vincula taxas ao pagamento via "fatura nr. XXXXX" na descrição,
    // não necessariamente pelo campo payment.id. Buscamos o crédito de recebimento
    // para extrair o nº da fatura e então filtramos os débitos por esse número.
    if (feesToInsert.length === 0 && paymentDate) {
      const s2Res = await fetch(
        `${ASAAS_BASE}/financialTransactions?startDate=${paymentDate}&finishDate=${paymentDate}&limit=100`,
        { headers: { "access_token": apiKey } },
      );
      if (s2Res.ok) {
        const s2Rows = ((await s2Res.json()).data || []) as Array<Record<string, unknown>>;
        console.log(`[asaas-sync-fees] s2: ${s2Rows.length} rows`);

        // Tenta extrair o nº da fatura do nossoNumero ou da descrição do crédito
        let faturaRef = String(paymentData.nossoNumero || "");
        if (!faturaRef) {
          const creditTx = s2Rows.find(tx => {
            if (Number(tx.value) <= 0) return false;
            if (feeMatchesPayment(tx, asaasPaymentId)) return true;
            // Fallback: mesmo valor do pagamento ± R$0,50
            return Math.abs(Number(tx.value) - (paymentData.value || 0)) < 0.50;
          });
          if (creditTx) {
            const m = String(creditTx.description || "").match(/fatura\s+nr\.?\s*(\d+)/i);
            if (m) faturaRef = m[1];
            console.log(`[asaas-sync-fees] s2 creditTx desc="${creditTx.description}" faturaRef=${faturaRef}`);
          }
        } else {
          console.log(`[asaas-sync-fees] s2 usando nossoNumero=${faturaRef}`);
        }

        for (const f of s2Rows) {
          if (Number(f.value) >= 0) continue; // somente débitos
          const fId = String(f.id ?? "");
          if (!fId || seenFeeIds.has(fId)) continue;
          const desc = String(f.description ?? "").toLowerCase();
          // Considera apenas transações que pareçam taxas de plataforma
          const isFee = desc.includes("taxa") || desc.includes("tarifa") || desc.includes("antecip");
          if (!isFee) continue;
          const matches = feeMatchesPayment(f, asaasPaymentId) ||
                          (faturaRef && String(f.description ?? "").includes(faturaRef));
          if (!matches) continue;
          seenFeeIds.add(fId);
          feesToInsert.push({ id: fId, value: Number(f.value ?? 0), description: String(f.description ?? "") });
        }
      }
    }

    for (const fee of feesToInsert) {
      const feeAmount = Math.abs(fee.value);
      if (feeAmount <= 0) continue;

      const feeDate = paymentDate;
      const subcategoria = parseFeeSubcategoria(fee.description);

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

    // ── 2. Juros e multa recebidos (receita juros_atraso) ────────────────────
    let registeredJuros = 0;
    if (paymentRes.ok) {
      const interestValue = Number(paymentData.interest?.value || 0);
      const fineValue = Number(paymentData.fine?.value || 0);
      const total = interestValue + fineValue;

      if (total > 0) {
        const parts: string[] = [];
        if (interestValue > 0) parts.push(`Juros R$ ${interestValue.toFixed(2)}`);
        if (fineValue > 0) parts.push(`Multa R$ ${fineValue.toFixed(2)}`);

        // Calcula referência de período usando data_prevista da entrada (= vencimento original)
        let periodoRef = "";
        const dueDateStr = entry?.data_prevista || paymentData.dueDate || "";
        if (entry?.rental_id && dueDateStr) {
          const { data: rental } = await supabase
            .from("rentals")
            .select("data_inicio, frequencia_pagamento")
            .eq("id", entry.rental_id)
            .single();
          if (rental?.data_inicio && rental?.frequencia_pagamento) {
            periodoRef = computePeriodoRef(rental.data_inicio, rental.frequencia_pagamento, dueDateStr);
          }
        }

        const descricao = periodoRef
          ? `Juros/Multa - ${entry?.cliente_nome || ""} (${periodoRef})`.trim()
          : `Juros/Multa - ${entry?.cliente_nome || ""}`.trim();
        const observacao = periodoRef
          ? `${parts.join(" + ")} | ${periodoRef}`
          : parts.join(" + ");

        const { error } = await supabase.from("financial_entries").upsert({
          id: await deterministicUUID(`asaas-juros:${asaasPaymentId}`),
          tipo: "receita",
          categoria: "juros_atraso",
          subcategoria: "Mensal",
          descricao,
          observacao,
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
          console.log(`[asaas-sync-fees] juros/multa registrado: R$ ${total} (${parts.join(", ")})${periodoRef ? ` | ${periodoRef}` : ""}`);
        } else {
          console.error(`[asaas-sync-fees] erro ao inserir juros/multa:`, error.message);
        }
      }
    }

    // Sinaliza quando não há taxas esperadas (value == netValue) para evitar retries infinitos
    const noFeesExpected = paymentRes.ok &&
      registeredFees === 0 &&
      Math.abs((paymentData.value || 0) - (paymentData.netValue || 0)) < 0.01;

    return new Response(
      JSON.stringify({ registeredFees, registeredJuros, noFeesExpected }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[asaas-sync-fees]", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
