-- Tabela de vistorias (histórico)
CREATE TABLE public.inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  moto_id TEXT NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  km INTEGER,
  observacao TEXT NOT NULL DEFAULT '',
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspections_company ON public.inspections(company_id);
CREATE INDEX idx_inspections_moto ON public.inspections(moto_id);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company inspections"
ON public.inspections FOR SELECT
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company inspections"
ON public.inspections FOR INSERT
WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company inspections"
ON public.inspections FOR UPDATE
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company inspections"
ON public.inspections FOR DELETE
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE TRIGGER update_inspections_updated_at
BEFORE UPDATE ON public.inspections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Configuração de intervalo de vistoria por empresa
CREATE TABLE public.inspection_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE,
  interval_days INTEGER NOT NULL DEFAULT 30,
  warning_days INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company inspection_settings"
ON public.inspection_settings FOR SELECT
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company inspection_settings"
ON public.inspection_settings FOR INSERT
WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company inspection_settings"
ON public.inspection_settings FOR UPDATE
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE TRIGGER update_inspection_settings_updated_at
BEFORE UPDATE ON public.inspection_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket privado para mídias de vistoria
INSERT INTO storage.buckets (id, name, public)
VALUES ('vistoria-media', 'vistoria-media', false)
ON CONFLICT (id) DO NOTHING;

-- Estrutura de pastas: {company_id}/{moto_id}/{inspection_id}/{filename}
CREATE POLICY "Users can view own company vistoria media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'vistoria-media'
  AND (storage.foldername(name))[1] = ANY (get_user_companies(auth.uid()))
);

CREATE POLICY "Users can upload own company vistoria media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vistoria-media'
  AND (storage.foldername(name))[1] = ANY (get_user_companies(auth.uid()))
);

CREATE POLICY "Users can update own company vistoria media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'vistoria-media'
  AND (storage.foldername(name))[1] = ANY (get_user_companies(auth.uid()))
);

CREATE POLICY "Users can delete own company vistoria media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'vistoria-media'
  AND (storage.foldername(name))[1] = ANY (get_user_companies(auth.uid()))
);