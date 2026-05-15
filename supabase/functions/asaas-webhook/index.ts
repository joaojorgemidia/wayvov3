import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Asaas events que atualizam status
const STATUS_MAP: Record<string, string> = {
  PAYMENT_RECEIVED: "RECEIVED",
  PAYMENT_CONFIRMED: "RECEIVED",
  PAYMENT_OVERDUE: "OVERDUE",
  PAYMENT_DELETED: "DELETED",
  PAYMENT_RESTORED: "PENDING",
  PAYMENT_REFUNDED: "REFUNDED",
  PAYMENT_PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
};

serve(async (req) => {
  // Asaas envia POST
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
      // Evento não mapeado — apenas acknowledge
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    // Busca a entrada pelo asaas_payment_id
    const { data: entry, error } = await supabase
      .from("financial_entries")
      .select("id, pago, asaas_status")
      .eq("asaas_payment_id", payment.id)
      .single();

    if (error || !entry) {
      // Pode ser um pagamento não rastreado; retorna 200 para Asaas não retentar
      console.warn(`[asaas-webhook] entrada não encontrada para payment ${payment.id}`);
      return new Response(JSON.stringify({ ok: true, notFound: true }), { status: 200 });
    }

    const updates: Record<string, unknown> = {
      asaas_status: newStatus,
    };

    // Atualiza URL do boleto se vier no evento
    if (payment.bankSlipUrl) updates.asaas_boleto_url = payment.bankSlipUrl;
    if (payment.invoiceUrl) updates.asaas_invoice_url = payment.invoiceUrl;

    // Pagamento confirmado: marca como pago com data e conta do Asaas
    if (newStatus === "RECEIVED") {
      updates.pago = true;
      updates.data = payment.paymentDate || payment.confirmedDate || new Date().toISOString().split("T")[0];
      updates.conta = "Asaas";
    }

    await supabase
      .from("financial_entries")
      .update(updates)
      .eq("id", entry.id);

    console.log(`[asaas-webhook] entrada ${entry.id} atualizada: asaas_status=${newStatus}`);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("[asaas-webhook]", err);
    // Retorna 200 para evitar reenvio em erro de parse
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }
});
