import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ASAAS_BASE = "https://www.asaas.com/api/v3";

const STATUS_MAP: Record<string, string> = {
  PAYMENT_RECEIVED: "RECEIVED",
  PAYMENT_CONFIRMED: "RECEIVED",
  PAYMENT_OVERDUE: "OVERDUE",
  PAYMENT_DELETED: "DELETED",
  PAYMENT_RESTORED: "PENDING",
  PAYMENT_REFUNDED: "REFUNDED",
  PAYMENT_PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
};

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

function calcPlatformFee(payment: Record<string, any>): number {
  const value = Number(payment.value || 0);
  const netValue = Number(payment.netValue ?? payment.net_value ?? value);
  return Math.max(0, Math.round((value - netValue) * 100) / 100);
}

function calcJurosAmount(payment: Record<string, any>): number {
  // Usa o valor exato cobrado pelo Asaas quando disponível
  const direct = Number(payment.interestValue ?? 0);
  if (direct > 0) return Math.round(direct * 100) / 100;

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
  // Usa o valor exato cobrado pelo Asaas quando disponível
  const direct = Number(payment.fineValue ?? 0);
  if (direct > 0) return Math.round(direct * 100) / 100;

  // Se interestValue já foi fornecido pelo Asaas, o total está lá (combinado ou só juros).
  // Não recalcular multa pela taxa para evitar dupla contagem.
  if (Number(payment.interestValue ?? 0) > 0) return 0;

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

type EntryContext = {
  id: string;
  asaas_payment_id: string;
  company_id: string;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  moto_id?: string | null;
  placa?: string | null;
  rental_id?: string | null;
  data_prevista?: string | null;
};

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

// Estratégia primária: busca todas as taxas pelo número da fatura no creditDate.
// Captura taxa de boleto/PIX + taxa de mensageria em uma única consulta.
async function syncFeesFromTransactions(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  payment: Record<string, any>,
  linkFields: LinkFields,
  creditDate: string,
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  if (creditDate > today) {
    console.log(`[syncFeesFromTransactions] creditDate=${creditDate} futuro — aguardar cron`);
    return 0;
  }

  // Janela de 4 dias: taxa de mensageria pode aparecer 1-2 dias úteis após compensação.
  const finishDate = dateAddDays(creditDate, 3) > today ? today : dateAddDays(creditDate, 3);
  const txRes = await fetch(
    `${ASAAS_BASE}/financialTransactions?startDate=${creditDate}&finishDate=${finishDate}&limit=100`,
    { headers: { "access_token": apiKey } },
  );
  if (!txRes.ok) {
    console.warn(`[syncFeesFromTransactions] financialTransactions retornou ${txRes.status}`);
    return 0;
  }

  const rows = ((await txRes.json()).data || []) as Array<Record<string, unknown>>;
  console.log(`[syncFeesFromTransactions] ${rows.length} transações em ${creditDate}`);

  // Filtra todas as transações desse pagamento usando o campo paymentId nativo do Asaas.
  // Mais confiável que comparar valores ou regex no nossoNumero.
  const paymentTxs = rows.filter(tx => String(tx.paymentId || "") === payment.id);
  console.log(`[syncFeesFromTransactions] ${paymentTxs.length} transações para ${payment.id}`);

  const feeTxs = paymentTxs.filter(tx => {
    if (Number(tx.value) >= 0) return false;
    const desc = String(tx.description || "").toLowerCase();
    return desc.includes("taxa") || desc.includes("tarifa");
  });

  if (feeTxs.length === 0) {
    console.log(`[syncFeesFromTransactions] nenhuma taxa encontrada para ${payment.id} — usando fallback`);
    return 0;
  }

  console.log(`[syncFeesFromTransactions] ${feeTxs.length} taxas para ${payment.id}`);

  let inserted = 0;
  for (const fee of feeTxs) {
    const feeId = String(fee.id ?? "");
    const feeAmount = Math.abs(Number(fee.value));
    if (!feeId || feeAmount <= 0.005) continue;

    const desc = String(fee.description || "");
    const subcategoria = parseFeeSubcategoria(desc);

    const { error } = await supabase.from("financial_entries").upsert({
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
    }, { onConflict: "id", ignoreDuplicates: true });

    if (!error) {
      inserted++;
      console.log(`[syncFeesFromTransactions] ${subcategoria} R$ ${feeAmount} (tx=${feeId})`);
    } else {
      console.error(`[syncFeesFromTransactions] erro tx ${feeId}:`, error.message);
    }
  }

  // Se as taxas reais foram inseridas, remove o fallback anterior (value-netValue)
  // para evitar duplicata da taxa de processamento.
  if (inserted > 0) {
    const fallbackId = await deterministicUUID(`asaas-fee:${payment.id}`);
    await supabase.from("financial_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", fallbackId)
      .is("deleted_at", null);
  }

  return inserted;
}

// Fallback: insere apenas a taxa de processamento via value - netValue.
// Usado quando creditDate ainda é futuro (boleto com liquidação D+1).
// O cron vai substituir isso pelas taxas reais quando o creditDate chegar.
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
    console.log(`[syncFeeFromNetValue] fallback: ${subcategoria} R$ ${feeAmount}`);
    return 1;
  }
  console.error(`[syncFeeFromNetValue] erro:`, error.message);
  return 0;
}

async function registerJurosMulta(
  supabase: ReturnType<typeof createClient>,
  entry: EntryContext,
  payment: Record<string, any>,
  paymentDate: string,
) {
  const interestValue = calcJurosAmount(payment);
  const fineValue = calcMultaAmount(payment);
  const total = interestValue + fineValue;
  if (total <= 0) return;

  const parts: string[] = [];
  if (interestValue > 0) parts.push(`Juros R$ ${interestValue.toFixed(2)}`);
  if (fineValue > 0) parts.push(`Multa R$ ${fineValue.toFixed(2)}`);

  let periodoRef = "";
  const dueDateStr = payment.dueDate || entry.data_prevista || "";
  if (entry.rental_id && dueDateStr) {
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
    ? `Juros/Multa - ${entry.cliente_nome || ""} (${periodoRef})`.trim()
    : `Juros/Multa - ${entry.cliente_nome || ""}`.trim();
  const observacao = periodoRef
    ? `${parts.join(" + ")} | ${periodoRef}`
    : parts.join(" + ");

  const { error } = await supabase.from("financial_entries").upsert({
    id: await deterministicUUID(`asaas-juros:${payment.id}`),
    tipo: "receita",
    categoria: "juros_atraso",
    subcategoria: null,
    descricao,
    observacao,
    valor: total,
    data: paymentDate,
    data_prevista: paymentDate,
    pago: true,
    conta: "Asaas",
    natureza: "operacional",
    company_id: entry.company_id,
    cliente_id: entry.cliente_id || null,
    cliente_nome: entry.cliente_nome || null,
    moto_id: entry.moto_id || null,
    placa: entry.placa || null,
    rental_id: entry.rental_id || null,
    tags: ["Asaas", "Pago Asaas"],
    recorrente: false,
    despesa_fixa: false,
    ignorada: false,
    deleted_at: null,
  }, { onConflict: "id", ignoreDuplicates: false });

  if (error) {
    console.error(`[registerJurosMulta] erro para ${payment.id}:`, error.message);
  } else {
    console.log(`[registerJurosMulta] R$ ${total} para ${payment.id}${periodoRef ? ` | ${periodoRef}` : ""}`);
  }
}

// Busca o pagamento completo na API se o webhook não trouxer netValue ou nossoNumero.
async function fetchPaymentIfNeeded(
  payment: Record<string, any>,
  apiKey: string,
): Promise<Record<string, any>> {
  if (payment.netValue != null && payment.nossoNumero != null) return payment;
  try {
    const res = await fetch(`${ASAAS_BASE}/payments/${payment.id}`, {
      headers: { "access_token": apiKey },
    });
    if (res.ok) {
      const full = await res.json();
      console.log(`[fetchPaymentIfNeeded] dados completos: netValue=${full.netValue} nossoNumero=${full.nossoNumero}`);
      return { ...payment, ...full };
    }
  } catch (err) {
    console.warn("[fetchPaymentIfNeeded] erro:", err);
  }
  return payment;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { event, payment } = body;

    console.log(`[asaas-webhook] event=${event} id=${payment?.id} billingType=${payment?.billingType} value=${payment?.value} netValue=${payment?.netValue} creditDate=${payment?.creditDate} nossoNumero=${payment?.nossoNumero}`);

    if (!event || !payment?.id) {
      return new Response(JSON.stringify({ error: "Payload inválido" }), { status: 400 });
    }

    const newStatus = STATUS_MAP[event];
    if (!newStatus) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const { data: entry, error } = await supabase
      .from("financial_entries")
      .select("id, pago, asaas_status, asaas_payment_id, company_id, cliente_id, cliente_nome, moto_id, placa, rental_id, data_prevista")
      .eq("asaas_payment_id", payment.id)
      .single();

    if (error || !entry) {
      console.warn(`[asaas-webhook] entrada não encontrada para ${payment.id}`);
      return new Response(JSON.stringify({ ok: true, notFound: true }), { status: 200 });
    }

    // RECEIVED_IN_CASH é o status usado quando o próprio app marca manualmente um
    // pagamento como recebido fora do Asaas (dinheiro/PIX direto). Nesse caso o app já
    // é a fonte da verdade para pago/data/conta e já tratou juros/multa no momento da
    // confirmação — o webhook só deve atualizar o asaas_status, sem sobrescrever nada
    // nem gerar taxa/juros duplicados.
    const isReceivedInCash = payment.status === "RECEIVED_IN_CASH";

    const updates: Record<string, unknown> = { asaas_status: newStatus };
    if (payment.bankSlipUrl) updates.asaas_boleto_url = payment.bankSlipUrl;
    if (payment.invoiceUrl) updates.asaas_invoice_url = payment.invoiceUrl;

    const paymentDate = payment.creditDate || payment.paymentDate || payment.confirmedDate || new Date().toISOString().split("T")[0];

    if (newStatus === "RECEIVED" && !isReceivedInCash) {
      updates.pago = true;
      updates.data = paymentDate;
      updates.conta = "Asaas";
    }

    await supabase.from("financial_entries").update(updates).eq("id", entry.id);
    console.log(`[asaas-webhook] ${entry.id} → asaas_status=${newStatus}`);

    if (newStatus === "RECEIVED" && !isReceivedInCash && entry.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("asaas_config")
        .eq("id", entry.company_id)
        .single();
      const apiKey = company?.asaas_config?.apiKey || Deno.env.get("ASAAS_API_KEY") || "";

      if (apiKey) {
        // Enriquece o pagamento com nossoNumero e netValue se ausentes no payload
        const fullPayment = await fetchPaymentIfNeeded(payment, apiKey);

        const linkFields: LinkFields = {
          company_id: entry.company_id,
          cliente_id: entry.cliente_id || null,
          cliente_nome: entry.cliente_nome || null,
          moto_id: entry.moto_id || null,
          placa: entry.placa || null,
          rental_id: entry.rental_id || null,
        };

        const creditDate = fullPayment.creditDate || paymentDate;

        // Primária: taxas via financialTransactions (boleto/PIX + mensageria)
        // Fallback: apenas taxa de processamento via value - netValue
        const feesFromTx = await syncFeesFromTransactions(supabase, apiKey, fullPayment, linkFields, creditDate);
        if (feesFromTx === 0) {
          await syncFeeFromNetValue(supabase, fullPayment, linkFields, creditDate);
        }

        await registerJurosMulta(supabase, entry, fullPayment, paymentDate);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("[asaas-webhook]", err);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }
});
