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

// Detecta a subcategoria da taxa a partir da descrição da transação Asaas.
function parseFeeSubcategoria(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("mensageria") || d.includes("sms") || d.includes("whatsapp")) return "Taxa de mensageria";
  if (d.includes("boleto")) return "Taxa de boleto";
  if (d.includes("pix")) return "Taxa PIX";
  if (d.includes("transferência") || d.includes("transferencia") || d.includes("ted") || d.includes("doc")) return "Taxa de transferência";
  if (d.includes("antecipação") || d.includes("antecipacao")) return "Taxa de antecipação";
  if (d.includes("cartão") || d.includes("cartao") || d.includes("credit") || d.includes("debit")) return "Taxa de cartão";
  return "Taxa Asaas";
}

function billingTypeToSubcategoria(billingType: string): string {
  switch ((billingType || "").toUpperCase()) {
    case "PIX":         return "Taxa PIX";
    case "BOLETO":      return "Taxa de boleto";
    case "CREDIT_CARD": return "Taxa de cartão";
    case "DEBIT_CARD":  return "Taxa de cartão";
    default:            return "Taxa Asaas";
  }
}

// Calcula a taxa de plataforma como fallback via value - netValue.
// Cobre apenas a taxa de processamento (boleto/PIX), sem mensageria.
function calcPlatformFee(payment: Record<string, any>): number {
  const value = Number(payment.value || 0);
  const netValue = Number(payment.netValue ?? payment.net_value ?? value);
  return Math.max(0, Math.round((value - netValue) * 100) / 100);
}

function calcJurosAmount(payment: Record<string, any>): number {
  const interest = payment.interest;
  if (!interest) return 0;
  const rate = Number(interest.value || 0);
  if (rate <= 0) return 0;
  const type = String(interest.type || "PERCENTAGE").toUpperCase();
  const principal = Number(payment.value || 0);
  const dueDate = payment.dueDate ? new Date(payment.dueDate + "T00:00:00") : null;
  const payDate = payment.paymentDate
    ? new Date(payment.paymentDate + "T00:00:00")
    : payment.creditDate
    ? new Date(payment.creditDate + "T00:00:00")
    : null;
  if (!dueDate || !payDate) return 0;
  const daysLate = payDate > dueDate
    ? Math.floor((payDate.getTime() - dueDate.getTime()) / 86400000)
    : 0;
  if (daysLate <= 0) return 0;
  if (type === "MONTHLY_PERCENTAGE" || type === "PERCENTAGE") {
    return Math.floor((principal * (rate / 100) / 30) * daysLate * 100) / 100;
  }
  if (type === "DAILY_PERCENTAGE") {
    return Math.floor((principal * (rate / 100)) * daysLate * 100) / 100;
  }
  return Math.floor(rate * daysLate * 100) / 100;
}

function calcMultaAmount(payment: Record<string, any>): number {
  const fine = payment.fine;
  if (!fine) return 0;
  const value = Number(fine.value || 0);
  if (value <= 0) return 0;
  const dueDate = payment.dueDate ? new Date(payment.dueDate + "T00:00:00") : null;
  const payDate = payment.paymentDate
    ? new Date(payment.paymentDate + "T00:00:00")
    : payment.creditDate
    ? new Date(payment.creditDate + "T00:00:00")
    : null;
  if (!dueDate || !payDate) return 0;
  if (payDate <= dueDate) return 0;
  const type = String(fine.type || "").toUpperCase();
  if (type === "PERCENTAGE") {
    return Math.floor(Number(payment.value || 0) * (value / 100) * 100) / 100;
  }
  return Math.floor(value * 100) / 100;
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

type LinkFields = {
  company_id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  moto_id: string | null;
  placa: string | null;
  rental_id: string | null;
};

function dateAddDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Estratégia primária: busca TODAS as taxas do creditDate pelo número da fatura.
// Captura taxa de boleto/PIX E taxa de mensageria em uma única consulta.
// Retorna o número de taxas inseridas (0 = não encontrou nada, usar fallback).
async function syncFeesFromTransactions(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  payment: Record<string, any>,
  linkFields: LinkFields,
  creditDate: string,
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  // Transações só existem após o creditDate; se ainda não chegou, não há o que buscar.
  if (creditDate > today) {
    console.log(`[syncFeesFromTransactions] creditDate=${creditDate} ainda no futuro — aguardar cron`);
    return 0;
  }

  // Consulta janela de 4 dias (creditDate até creditDate+3) para capturar
  // débitos de taxa que aparecem 1-2 dias úteis após a compensação.
  const finishDate = dateAddDays(creditDate, 3) > today ? today : dateAddDays(creditDate, 3);
  const txRes = await fetch(
    `${ASAAS_BASE}/financialTransactions?startDate=${creditDate}&finishDate=${finishDate}&limit=100`,
    { headers: { "access_token": apiKey } },
  );
  if (!txRes.ok) {
    console.warn(`[syncFeesFromTransactions] GET financialTransactions retornou ${txRes.status}`);
    return 0;
  }

  const rows = ((await txRes.json()).data || []) as Array<Record<string, unknown>>;
  console.log(`[syncFeesFromTransactions] ${rows.length} transações em ${creditDate}`);

  // Obtém a referência da fatura: nossoNumero do pagamento (boleto) ou
  // extrai da descrição do lançamento de crédito (PIX e outros).
  let faturaRef = String(payment.nossoNumero || "").trim();
  if (!faturaRef) {
    const creditTx = rows.find(tx =>
      Number(tx.value) > 0 &&
      Math.abs(Number(tx.value) - Number(payment.value || 0)) < 1.00
    );
    if (creditTx) {
      const m = String(creditTx.description || "").match(/fatura\s+nr\.?\s*(\d+)/i);
      if (m) faturaRef = m[1];
      console.log(`[syncFeesFromTransactions] faturaRef extraída da descrição: ${faturaRef} | desc: "${creditTx.description}"`);
    }
  } else {
    console.log(`[syncFeesFromTransactions] faturaRef do nossoNumero: ${faturaRef}`);
  }

  // Todas as taxas do Asaas (PIX, boleto, mensageria) contêm "fatura nr. XXXXXX"
  // na descrição — o mesmo número do lançamento de crédito. O filtro por faturaRef
  // associa automaticamente cada taxa ao pagamento correto.
  const feeTxs = rows.filter(tx => {
    if (Number(tx.value) >= 0) return false;
    const desc = String(tx.description || "");
    const descLower = desc.toLowerCase();
    if (!descLower.includes("taxa") && !descLower.includes("tarifa")) return false;
    return !!faturaRef && desc.includes(faturaRef);
  });

  if (feeTxs.length === 0) {
    console.warn(`[syncFeesFromTransactions] nenhuma taxa encontrada${faturaRef ? ` para fatura ${faturaRef}` : " (sem faturaRef)"} — usando fallback`);
    return 0; // 0 = nada encontrado → chamar fallback
  }

  console.log(`[syncFeesFromTransactions] ${feeTxs.length} taxas encontradas${faturaRef ? ` para fatura ${faturaRef}` : ""}`);

  let inserted = 0;
  for (const fee of feeTxs) {
    const feeId = String(fee.id ?? "");
    const feeAmount = Math.abs(Number(fee.value));
    if (!feeId || feeAmount <= 0.005) continue;

    const desc = String(fee.description || "");
    const subcategoria = parseFeeSubcategoria(desc);

    const { data: upserted, error } = await supabase.from("financial_entries").upsert({
      id: await deterministicUUID(`asaas-fee-tx:${feeId}`),
      tipo: "despesa",
      categoria: "taxas",
      subcategoria,
      descricao: desc,
      observacao: desc,
      valor: feeAmount,
      data: creditDate,
      data_prevista: creditDate,
      pago: true,
      conta: "Asaas",
      natureza: linkFields.placa || linkFields.moto_id ? "operacional" : "administrativa",
      ...linkFields,
      tags: ["Asaas"],
      recorrente: false,
      despesa_fixa: false,
      ignorada: false,
      deleted_at: null,
    }, { onConflict: "id", ignoreDuplicates: true }).select("id");

    if (error) {
      console.error(`[syncFeesFromTransactions] erro ao inserir tx ${feeId}:`, error.message);
    } else if (upserted && upserted.length > 0) {
      inserted++;
      console.log(`[syncFeesFromTransactions] taxa inserida: ${subcategoria} R$ ${feeAmount} (txId=${feeId})`);
    } else {
      console.log(`[syncFeesFromTransactions] taxa já existia, ignorada: ${subcategoria} R$ ${feeAmount} (txId=${feeId})`);
    }
  }

  // Retorna -1 quando encontrou taxas mas todas já existiam no banco.
  // Isso impede o fallback (que criaria duplicata com UUID diferente)
  // e sinaliza ao frontend para marcar o entry como sincronizado sem exibir toast.
  return inserted > 0 ? inserted : -1;
}

// Fallback: insere somente a taxa de processamento a partir de value - netValue.
// Usado quando as transações do creditDate ainda não estão disponíveis.
async function syncFeeFromNetValue(
  supabase: ReturnType<typeof createClient>,
  payment: Record<string, any>,
  linkFields: LinkFields,
  creditDate: string,
): Promise<number> {
  const feeAmount = calcPlatformFee(payment);
  if (feeAmount <= 0.005) return 0;

  const subcategoria = billingTypeToSubcategoria(payment.billingType || "");
  const faturaRef = payment.nossoNumero || payment.id;
  const descricao = `${subcategoria} - fatura nr. ${faturaRef}`;

  const { error } = await supabase.from("financial_entries").upsert({
    id: await deterministicUUID(`asaas-fee:${payment.id}`),
    tipo: "despesa",
    categoria: "taxas",
    subcategoria,
    descricao,
    observacao: descricao,
    valor: feeAmount,
    data: creditDate,
    data_prevista: creditDate,
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
    console.log(`[syncFeeFromNetValue] fallback: ${subcategoria} R$ ${feeAmount} inserida para ${payment.id}`);
    return 1;
  } else {
    console.error(`[syncFeeFromNetValue] erro:`, error.message);
    return 0;
  }
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

    // Busca entrada financeira para campos de vínculo
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

    const linkFields: LinkFields = {
      company_id: companyId,
      cliente_id: entry?.cliente_id || null,
      cliente_nome: entry?.cliente_nome || null,
      moto_id: entry?.moto_id || null,
      placa: entry?.placa || null,
      rental_id: entry?.rental_id || null,
    };

    // Busca dados completos do pagamento no Asaas
    const paymentRes = await fetch(
      `${ASAAS_BASE}/payments/${asaasPaymentId}`,
      { headers: { "access_token": apiKey } },
    );
    if (!paymentRes.ok) {
      console.error(`[asaas-sync-fees] GET payment retornou ${paymentRes.status}`);
      return new Response(JSON.stringify({ error: `Asaas retornou ${paymentRes.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentData = await paymentRes.json();
    const today = new Date().toISOString().split("T")[0];
    const creditDate = paymentData.creditDate || paymentData.paymentDate || entry?.data || today;

    console.log(`[asaas-sync-fees] payment=${asaasPaymentId} value=${paymentData.value} netValue=${paymentData.netValue} billingType=${paymentData.billingType} creditDate=${creditDate} nossoNumero=${paymentData.nossoNumero}`);

    // ── 1. Taxas de plataforma ───────────────────────────────────────────────
    // Primária: busca todas as taxas (boleto + mensageria) via financialTransactions.
    // Fallback: apenas taxa de processamento via value - netValue.
    // txResult: 0 = nada encontrado (fallback), -1 = tudo já existia (não usar fallback), >0 = N novas taxas
    const txResult = await syncFeesFromTransactions(supabase, apiKey, paymentData, linkFields, creditDate);
    const usedFallback = txResult === 0;
    let registeredFees = Math.max(0, txResult); // -1 → 0 para a resposta
    if (usedFallback) {
      registeredFees = await syncFeeFromNetValue(supabase, paymentData, linkFields, creditDate);
    }

    // ── 2. Juros e multa recebidos (receita juros_atraso) ────────────────────
    let registeredJuros = 0;
    const enrichedPayment = {
      ...paymentData,
      paymentDate: paymentData.paymentDate || paymentData.creditDate || creditDate,
      dueDate: paymentData.dueDate || entry?.data_prevista,
    };
    const interestValue = calcJurosAmount(enrichedPayment);
    const fineValue = calcMultaAmount(enrichedPayment);
    const jurosTotal = interestValue + fineValue;

    if (jurosTotal > 0) {
      const parts: string[] = [];
      if (interestValue > 0) parts.push(`Juros R$ ${interestValue.toFixed(2)}`);
      if (fineValue > 0) parts.push(`Multa R$ ${fineValue.toFixed(2)}`);

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
        valor: jurosTotal,
        data: creditDate,
        data_prevista: creditDate,
        pago: true,
        conta: "Asaas",
        natureza: "operacional",
        ...linkFields,
        tags: ["Asaas", "Pago Asaas"],
        recorrente: false,
        despesa_fixa: false,
        ignorada: false,
        deleted_at: null,
      }, { onConflict: "id", ignoreDuplicates: false });

      if (!error) {
        registeredJuros++;
        console.log(`[asaas-sync-fees] juros/multa R$ ${jurosTotal} registrado${periodoRef ? ` | ${periodoRef}` : ""}`);
      } else {
        console.error(`[asaas-sync-fees] erro ao inserir juros/multa:`, error.message);
      }
    }

    // noFeesExpected = true quando: taxas já existiam no banco (txResult === -1)
    // ou quando não há taxa de plataforma esperada (PIX sem custo, etc.)
    const noFeesExpected = txResult === -1 || (calcPlatformFee(paymentData) <= 0.005 && !usedFallback);

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
