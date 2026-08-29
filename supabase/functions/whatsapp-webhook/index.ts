// Recebe o callback da Z-API quando uma mensagem chega no WhatsApp de
// atendimento e grava em whatsapp_messages (inbound). Não chama LLM aqui —
// mantém o webhook rápido/barato; a decisão de cobrar fica no
// collection-ai-dispatch (cron), que lê esse histórico depois.
//
// A URL desse webhook precisa ser cadastrada no painel da Z-API de CADA
// empresa como .../whatsapp-webhook?companyId=<ID_DA_EMPRESA>, já que o
// payload da Z-API não inclui o companyId do Wayvo.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/extract-ai.ts";
import { normalizePhone } from "../_shared/collection-ai-lib.ts";

interface ZapiTextWebhook {
  phone?: string;
  fromMe?: boolean;
  messageId?: string;
  text?: { message?: string };
  message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId ausente na URL do webhook" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const body = (await req.json()) as ZapiTextWebhook;

    // Ignora mensagens enviadas pelo próprio número (eco do que o whatsapp-send
    // ou um humano mandou) e eventos sem texto (status, mídia, reação, etc.)
    if (body.fromMe) {
      return new Response(JSON.stringify({ ignored: "fromMe" }), { headers: jsonHeaders });
    }
    const text = body.text?.message ?? body.message ?? null;
    const rawPhone = body.phone ?? null;
    if (!text || !rawPhone) {
      return new Response(JSON.stringify({ ignored: "sem texto ou telefone" }), { headers: jsonHeaders });
    }

    const phone = normalizePhone(rawPhone);

    const { data: clients } = await supabase
      .from("clients")
      .select("id, telefone")
      .eq("company_id", companyId)
      .is("deleted_at", null);

    const clienteId = (clients || []).find((c) => normalizePhone(c.telefone) === phone)?.id || null;

    await supabase.from("whatsapp_messages").insert({
      company_id: companyId,
      cliente_id: clienteId,
      phone,
      direction: "inbound",
      body: text,
      provider_message_id: body.messageId || null,
    });

    return new Response(JSON.stringify({ success: true, clienteId }), { headers: jsonHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
