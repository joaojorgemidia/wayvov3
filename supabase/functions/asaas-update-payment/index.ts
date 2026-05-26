import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";

async function asaas(path: string, method: string, body?: object) {
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurado");

  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: {
      "access_token": apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || JSON.stringify(data);
    throw new Error(`Asaas ${method} ${path} falhou: ${msg}`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { asaasPaymentId, dueDate, value } = await req.json();

    if (!asaasPaymentId) {
      return new Response(JSON.stringify({ error: "asaasPaymentId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dueDate && value === undefined) {
      return new Response(JSON.stringify({ error: "Informe dueDate e/ou value para atualizar" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updatePayload: Record<string, unknown> = {};
    if (dueDate) updatePayload.dueDate = dueDate;
    if (value !== undefined) updatePayload.value = Number(value);

    const updated = await asaas(`/payments/${asaasPaymentId}`, "PUT", updatePayload);

    return new Response(
      JSON.stringify({ success: true, paymentId: updated.id, status: updated.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[asaas-update-payment]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
