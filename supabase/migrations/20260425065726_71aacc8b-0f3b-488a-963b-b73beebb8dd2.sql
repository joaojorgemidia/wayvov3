-- Tabela de réguas de cobrança (uma por empresa + módulo)
CREATE TABLE public.collection_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('pagamento','multa','oleo','vistoria','manutencao')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- stages: [{ stage: 1, offset_days: 0, template: "..." }, ...]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, module)
);

ALTER TABLE public.collection_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company collection_rules"
  ON public.collection_rules FOR SELECT
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company collection_rules"
  ON public.collection_rules FOR INSERT
  WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company collection_rules"
  ON public.collection_rules FOR UPDATE
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company collection_rules"
  ON public.collection_rules FOR DELETE
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE TRIGGER trg_collection_rules_updated_at
  BEFORE UPDATE ON public.collection_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de follow-ups enviados
CREATE TABLE public.collection_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('pagamento','multa','oleo','vistoria','manutencao')),
  entity_id TEXT NOT NULL,
  cliente_id TEXT,
  moto_id TEXT,
  stage_number INT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','copy_msg','copy_phone','manual')),
  message_snapshot TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID,
  regularized_at TIMESTAMPTZ,
  escalated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_followups_company_module_entity
  ON public.collection_followups (company_id, module, entity_id);
CREATE INDEX idx_followups_open
  ON public.collection_followups (company_id, regularized_at)
  WHERE regularized_at IS NULL;

ALTER TABLE public.collection_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company collection_followups"
  ON public.collection_followups FOR SELECT
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company collection_followups"
  ON public.collection_followups FOR INSERT
  WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company collection_followups"
  ON public.collection_followups FOR UPDATE
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company collection_followups"
  ON public.collection_followups FOR DELETE
  USING (company_id = ANY (get_user_companies(auth.uid())));