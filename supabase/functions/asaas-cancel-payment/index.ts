import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";

async function asaas(path: string, method: string, apiKey: string, body?: object) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: {
      "access_token": apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { if (text) data = JSON.parse(text); } catch { /* resposta sem JSON */ }

  if (!res.ok) {
    const msg = (data?.errors as any)?.[0]?.description || data?.message || text || "Erro desconhecido";
    throw new Error(`Asaas ${method} ${path} falhou: ${msg}`);
  }
  return data;
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
    const { asaasPaymentId, companyId } = await req.json();

    if (!asaasPaymentId) {
      return new Response(JSON.stringify({ error: "asaasPaymentId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve API key: company config > env var
    let apiKey = Deno.env.get("ASAAS_API_KEY") || "";
    const cid = companyId;
    if (cid) {
      const { data: company } = await supabase
        .from("companies")
        .select("asaas_config")
        .eq("id", cid)
        .single();
      if (company?.asaas_config?.apiKey) {
        apiKey = company.asaas_config.apiKey;
      }
    }
    if (!apiKey) throw new Error("Chave de API Asaas não configurada para esta empresa");

    // A API do Asaas não tem um endpoint "/cancel" — cancelar um boleto pendente é feito
    // com DELETE direto no recurso (POST .../cancel não existe e retorna 404).
    const result = await asaas(`/payments/${asaasPaymentId}`, "DELETE", apiKey);

    return new Response(
      JSON.stringify({ success: true, deleted: result.deleted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[asaas-cancel-payment]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
