-- Infraestrutura para cobrança automática via WhatsApp com decisão por IA
-- (módulos óleo e pagamento). Ver plano: cobrança automática WhatsApp + IA.

-- 1) Config da automação por empresa (mesmo padrão de asaas_config)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS whatsapp_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.companies.whatsapp_config IS
  'Configuração da automação de cobrança via WhatsApp: { enabled, provider ("zapi"), instanceId, autoSendMode ("review"|"auto"), maxMessagesPerClientPerWeek, businessHoursStart, businessHoursEnd }. Credenciais sensíveis (token/client-token) ficam em Supabase secrets, nunca nesta coluna.';

-- 2) Histórico de conversa do WhatsApp (mensagens enviadas e recebidas)
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  cliente_id TEXT,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_company_cliente
  ON public.whatsapp_messages (company_id, cliente_id, created_at DESC);
CREATE INDEX idx_whatsapp_messages_phone
  ON public.whatsapp_messages (company_id, phone, created_at DESC);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company whatsapp_messages"
  ON public.whatsapp_messages FOR SELECT
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company whatsapp_messages"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company whatsapp_messages"
  ON public.whatsapp_messages FOR UPDATE
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company whatsapp_messages"
  ON public.whatsapp_messages FOR DELETE
  USING (company_id = ANY (get_user_companies(auth.uid())));

-- 3) Auditoria/fila de aprovação das decisões da IA (enviar ou pular, e por quê)
CREATE TABLE public.collection_ai_dispatch_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('pagamento','multa','oleo','vistoria','manutencao')),
  entity_id TEXT NOT NULL,
  cliente_id TEXT,
  moto_id TEXT,
  stage_number INT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('send','skip')),
  reasoning TEXT NOT NULL DEFAULT '',
  proposed_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','approved','rejected','sent','skipped')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  followup_id UUID REFERENCES public.collection_followups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_dispatch_log_company_status
  ON public.collection_ai_dispatch_log (company_id, status, created_at DESC);
CREATE INDEX idx_ai_dispatch_log_entity
  ON public.collection_ai_dispatch_log (company_id, module, entity_id);

ALTER TABLE public.collection_ai_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company collection_ai_dispatch_log"
  ON public.collection_ai_dispatch_log FOR SELECT
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company collection_ai_dispatch_log"
  ON public.collection_ai_dispatch_log FOR INSERT
  WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company collection_ai_dispatch_log"
  ON public.collection_ai_dispatch_log FOR UPDATE
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company collection_ai_dispatch_log"
  ON public.collection_ai_dispatch_log FOR DELETE
  USING (company_id = ANY (get_user_companies(auth.uid())));

-- 4) Pausa server-side de um item específico (o snooze atual de óleo é só
--    localStorage do navegador, então o cron nunca o enxergaria)
CREATE TABLE public.automation_pauses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('pagamento','multa','oleo','vistoria','manutencao')),
  entity_id TEXT NOT NULL,
  snoozed_until DATE NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, module, entity_id)
);

CREATE INDEX idx_automation_pauses_company_module
  ON public.automation_pauses (company_id, module, entity_id);

ALTER TABLE public.automation_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company automation_pauses"
  ON public.automation_pauses FOR SELECT
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company automation_pauses"
  ON public.automation_pauses FOR INSERT
  WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company automation_pauses"
  ON public.automation_pauses FOR UPDATE
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company automation_pauses"
  ON public.automation_pauses FOR DELETE
  USING (company_id = ANY (get_user_companies(auth.uid())));

-- Nota: o CHECK de "channel" em collection_followups (definido na migration
-- 20260425065726) não existe de fato no banco remoto (verificado via
-- pg_constraint — só a PRIMARY KEY está presente). Por isso 'whatsapp_auto'
-- pode ser inserido em collection_followups.channel sem nenhuma alteração aqui.
