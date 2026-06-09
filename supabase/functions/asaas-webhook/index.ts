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
  return "Taxa Asaas";
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
};

async function registerAsaasFees(
  supabase: ReturnType<typeof createClient>,
  entry: EntryContext,
  apiKey: string,
  paymentDate: string,
) {
  try {
    const res = await fetch(
      `${ASAAS_BASE}/financialTransactions?payment=${entry.asaas_payment_id}&type=DEBIT`,
      { headers: { "access_token": apiKey } },
    );

    if (!res.ok) {
      console.warn(`[registerAsaasFees] API retornou ${res.status} para payment ${entry.asaas_payment_id}`);
      return;
    }

    const json = await res.json();
    // Filtra apenas taxas deste pagamento específico (dupla proteção contra retornos incorretos da API)
    const fees = ((json.data || []) as Array<{ id: string; date: string; value: number; description: string; payment?: { id: string } }>)
      .filter(f => !f.payment?.id || f.payment.id === entry.asaas_payment_id);

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

      if (error) {
        console.error(`[registerAsaasFees] erro ao inserir taxa ${fee.id}:`, error.message);
      } else {
        console.log(`[registerAsaasFees] taxa registrada: ${subcategoria} R$ ${feeAmount} em ${feeDate}`);
      }
    }
  } catch (err) {
    console.error("[registerAsaasFees] erro inesperado:", err);
  }
}

async function registerJurosMulta(
  supabase: ReturnType<typeof createClient>,
  entry: EntryContext,
  payment: { id: string; interest?: { value?: number }; fine?: { value?: number } },
  paymentDate: string,
) {
  const interestValue = Number(payment.interest?.value || 0);
  const fineValue = Number(payment.fine?.value || 0);
  const total = interestValue + fineValue;

  if (total <= 0) return;

  const parts: string[] = [];
  if (interestValue > 0) parts.push(`Juros R$ ${interestValue.toFixed(2)}`);
  if (fineValue > 0) parts.push(`Multa R$ ${fineValue.toFixed(2)}`);

  const { error } = await supabase.from("financial_entries").upsert({
    id: await deterministicUUID(`asaas-juros:${payment.id}`),
    tipo: "receita",
    categoria: "juros_atraso",
    subcategoria: "Mensal",
    descricao: `Juros/Multa - ${entry.cliente_nome || ""}`.trim(),
    observacao: parts.join(" + "),
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
  }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    console.error(`[registerJurosMulta] erro para payment ${payment.id}:`, error.message);
  } else {
    console.log(`[registerJurosMulta] R$ ${total} registrado (${parts.join(", ")}) para payment ${payment.id}`);
  }
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

    console.log(`[asaas-webhook] event=${event} paymentId=${payment?.id}`);

    if (!event || !payment?.id) {
      return new Response(JSON.stringify({ error: "Payload inválido" }), { status: 400 });
    }

    const newStatus = STATUS_MAP[event];
    if (!newStatus) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const { data: entry, error } = await supabase
      .from("financial_entries")
      .select("id, pago, asaas_status, asaas_payment_id, company_id, cliente_id, cliente_nome, moto_id, placa, rental_id")
      .eq("asaas_payment_id", payment.id)
      .single();

    if (error || !entry) {
      console.warn(`[asaas-webhook] entrada não encontrada para payment ${payment.id}`);
      return new Response(JSON.stringify({ ok: true, notFound: true }), { status: 200 });
    }

    const updates: Record<string, unknown> = { asaas_status: newStatus };
    if (payment.bankSlipUrl) updates.asaas_boleto_url = payment.bankSlipUrl;
    if (payment.invoiceUrl) updates.asaas_invoice_url = payment.invoiceUrl;

    const paymentDate = payment.paymentDate || payment.confirmedDate || new Date().toISOString().split("T")[0];

    if (newStatus === "RECEIVED") {
      updates.pago = true;
      updates.data = paymentDate;
      updates.conta = "Asaas";
    }

    await supabase.from("financial_entries").update(updates).eq("id", entry.id);
    console.log(`[asaas-webhook] entrada ${entry.id} atualizada: asaas_status=${newStatus}`);

    if (newStatus === "RECEIVED" && entry.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("asaas_config")
        .eq("id", entry.company_id)
        .single();
      const apiKey = company?.asaas_config?.apiKey || Deno.env.get("ASAAS_API_KEY") || "";
      if (apiKey) {
        await Promise.all([
          registerAsaasFees(supabase, entry, apiKey, paymentDate),
          registerJurosMulta(supabase, entry, payment, paymentDate),
        ]);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("[asaas-webhook]", err);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }
});
