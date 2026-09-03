-- Apelido dos aparelhos de rastreamento (o nome que aparece no pino do mapa),
-- compartilhado por empresa. Antes só no localStorage do navegador — renomear
-- num aparelho não refletia nos outros. Mesmo motivo da company_tracker_configs.
--
-- Vale para qualquer aparelho da empresa, independente do provedor (BrasilSat,
-- Velotrack, GT06...), por isso é indexado por IMEI, não por provedor.
--
-- RLS: leitura para membros da empresa; escrita para superadmin (cross-tenant)
-- ou admin/operador só nas próprias empresas — mesmo padrão de gt06_devices e
-- company_tracker_configs.

CREATE TABLE IF NOT EXISTS public.company_tracker_device_names (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  imei       text NOT NULL,
  name       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (company_id, imei)
);

ALTER TABLE public.company_tracker_device_names ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.company_tracker_device_names FROM anon;

DROP POLICY IF EXISTS "members read device names" ON public.company_tracker_device_names;
CREATE POLICY "members read device names"
  ON public.company_tracker_device_names FOR SELECT
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY (get_user_companies(auth.uid()))
  );

DROP POLICY IF EXISTS "staff write device names" ON public.company_tracker_device_names;
CREATE POLICY "staff write device names"
  ON public.company_tracker_device_names FOR ALL
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (
      company_id = ANY (get_user_companies(auth.uid()))
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (
      company_id = ANY (get_user_companies(auth.uid()))
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role))
    )
  );
