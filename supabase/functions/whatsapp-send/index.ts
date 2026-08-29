// Envia uma mensagem de texto via Z-API para o WhatsApp de atendimento da
// empresa, grava no histórico (whatsapp_messages) e, quando vier module/
// entityId/stageNumber, registra o follow-up em collection_followups
// (channel "whatsapp_auto") — mesmo insert que o registerFollowup do
// src/hooks/useCollections.ts já faz para envios manuais.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/extract-ai.ts";
import { normalizePhone } from "../_shared/collection-ai-lib.ts";

interface SendPayload {
  companyId: string;
  phone: string;
  message: string;
  clienteId?: string | null;
  motoId?: string | null;
  module?: string | null;
  entityId?: string | null;
  stageNumber?: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const payload = (await req.json()) as SendPayload;
    const { companyId, phone, message, clienteId, motoId, module, entityId, stageNumber } = payload;

    if (!companyId || !phone || !message) {
      return new Response(JSON.stringify({ error: "companyId, phone e message são obrigatórios" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("whatsapp_config")
      .eq("id", companyId)
      .single();

    const cfg = company?.whatsapp_config as { instanceId?: string; token?: string; clientToken?: string } | null;
    if (companyErr || !cfg?.instanceId || !cfg?.token) {
      return new Response(JSON.stringify({ error: "Empresa sem integração WhatsApp (Z-API) configurada" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return new Response(JSON.stringify({ error: "Telefone inválido" }), { status: 400, headers: jsonHeaders });
    }

    const zapiRes = await fetch(`https://api.z-api.io/instances/${cfg.instanceId}/token/${cfg.token}/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.clientToken ? { "Client-Token": cfg.clientToken } : {}),
      },
      body: JSON.stringify({ phone: normalizedPhone, message }),
    });

    const zapiJson: Record<string, unknown> = await zapiRes.json().catch(() => ({}));
    if (!zapiRes.ok) {
      return new Response(
        JSON.stringify({ error: `Z-API ${zapiRes.status}: ${JSON.stringify(zapiJson).slice(0, 300)}` }),
        { status: 502, headers: jsonHeaders },
      );
    }

    await supabase.from("whatsapp_messages").insert({
      company_id: companyId,
      cliente_id: clienteId || null,
      phone: normalizedPhone,
      direction: "outbound",
      body: message,
      provider_message_id: (zapiJson?.messageId as string) || (zapiJson?.zaapId as string) || null,
    });

    let followupId: string | null = null;
    if (module && entityId && stageNumber != null) {
      const { data: fup } = await supabase
        .from("collection_followups")
        .insert({
          company_id: companyId,
          module,
          entity_id: entityId,
          cliente_id: clienteId || null,
          moto_id: motoId || null,
          stage_number: stageNumber,
          channel: "whatsapp_auto",
          message_snapshot: message,
          sent_by: null,
          escalated: false,
        })
        .select("id")
        .single();
      followupId = fup?.id || null;
    }

    return new Response(JSON.stringify({ success: true, followupId }), { headers: jsonHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
