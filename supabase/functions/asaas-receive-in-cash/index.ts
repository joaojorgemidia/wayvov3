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

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || JSON.stringify(data);
    throw new Error(`Asaas ${method} ${path} falhou: ${msg}`);
  }
  return data;
}

// Marca um boleto/cobrança Asaas como recebido fora da plataforma (dinheiro, PIX manual,
// etc.), ou desfaz essa marcação. Usado quando o usuário confirma (ou desfaz a confirmação
// de) um pagamento direto no app para uma cobrança que já tem boleto gerado — sem isso, o
// boleto continua aparecendo como vencido/pago errado lá, fora de sincronia com o app.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { asaasPaymentId, paymentDate, value, companyId, action } = await req.json();

    if (!asaasPaymentId) {
      return new Response(JSON.stringify({ error: "asaasPaymentId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let apiKey = Deno.env.get("ASAAS_API_KEY") || "";
    if (companyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("asaas_config")
        .eq("id", companyId)
        .single();
      if (company?.asaas_config?.apiKey) {
        apiKey = company.asaas_config.apiKey;
      }
    }
    if (!apiKey) throw new Error("Chave de API Asaas não configurada para esta empresa");

    // "status": só consulta o estado atual no Asaas, sem mudar nada — usado para reconciliar
    // registros antigos cujo asaas_status local está desatualizado (nem toda divergência
    // significa "precisa marcar como recebido em dinheiro"; às vezes já foi pago ou removido
    // direto no Asaas e o app só não ficou sabendo).
    if (action === "status") {
      const current = await asaas(`/payments/${asaasPaymentId}`, "GET", apiKey);
      return new Response(
        JSON.stringify({
          success: true, paymentId: current.id, status: current.status, dueDate: current.dueDate,
          value: current.value, fine: current.fine, interest: current.interest, description: current.description,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let updated: Record<string, unknown>;
    if (action === "undo") {
      updated = await asaas(`/payments/${asaasPaymentId}/undoReceivedInCash`, "POST", apiKey);
    } else {
      if (!paymentDate) {
        return new Response(JSON.stringify({ error: "paymentDate é obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const payload: Record<string, unknown> = { paymentDate, notifyCustomer: false };
      if (value !== undefined && value !== null) payload.value = Number(value);
      try {
        updated = await asaas(`/payments/${asaasPaymentId}/receiveInCash`, "POST", apiKey, payload);
      } catch (err) {
        // Asaas exige paymentDate >= data de criação do boleto. Para registros antigos onde
        // a data confirmada no app é anterior à criação do boleto no Asaas, tenta de novo com
        // hoje em vez de falhar de vez.
        const msg = err instanceof Error ? err.message : String(err);
        const today = new Date().toISOString().split("T")[0];
        if (msg.includes("data de criação da cobrança") && paymentDate !== today) {
          updated = await asaas(`/payments/${asaasPaymentId}/receiveInCash`, "POST", apiKey, { ...payload, paymentDate: today });
        } else {
          throw err;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, paymentId: updated.id, status: updated.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[asaas-receive-in-cash]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
