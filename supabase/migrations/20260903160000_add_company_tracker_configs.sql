-- Configuração do provedor de rastreamento GPS (BrasilSat / Velotrack) por empresa.
--
-- Antes ficava só no localStorage do navegador que configurou (ver src/lib/tracker.ts),
-- então cada usuário/dispositivo novo caía na tela de login de novo. Aqui a config passa
-- a viver no banco, isolada por empresa via RLS — configurou uma vez, todo mundo da
-- empresa entra direto no mapa.
--
-- Tabela SEPARADA de propósito: não mexe em nenhuma coluna nem política da tabela
-- `companies` (onde vivem asaas_config, sicoob_config, etc.), pra não haver risco de
-- afetar as integrações já existentes.
--
-- Modelo de acesso (mesmo padrão da policy de UPDATE de gt06_devices):
--  * leitura: qualquer usuário da empresa (precisa ler as credenciais pra autenticar
--    no provedor no próprio navegador) + superadmin;
--  * escrita: superadmin (cross-tenant) OU admin/operador **apenas nas próprias
--    empresas** — nunca cross-tenant.

CREATE TABLE IF NOT EXISTS public.company_tracker_configs (
  company_id  text PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('velotrack', 'brasilsat')),
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE public.company_tracker_configs ENABLE ROW LEVEL SECURITY;

-- anon não precisa de nada aqui (evita expor a tabela na introspecção do GraphQL)
REVOKE ALL ON public.company_tracker_configs FROM anon;

DROP POLICY IF EXISTS "members read tracker config" ON public.company_tracker_configs;
CREATE POLICY "members read tracker config"
  ON public.company_tracker_configs FOR SELECT
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR company_id = ANY (get_user_companies(auth.uid()))
  );

DROP POLICY IF EXISTS "staff write tracker config" ON public.company_tracker_configs;
CREATE POLICY "staff write tracker config"
  ON public.company_tracker_configs FOR ALL
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
