-- Rastreador GT06 avulso (sem plataforma) — servidor TCP próprio rodando numa VPS
-- decodifica o protocolo binário do aparelho e grava a última posição aqui via
-- service role (ignora RLS). O app só lê, filtrado por empresa via RLS normal.
--
-- Só guarda a ÚLTIMA posição de cada dispositivo (sem histórico/playback — fora do
-- escopo atual). company_id/moto_id ficam nulos até alguém atribuir o IMEI a uma
-- empresa/veículo — com um único aparelho isso é feito manualmente por SQL por ora.
CREATE TABLE public.gt06_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT REFERENCES public.companies(id),
  imei TEXT NOT NULL UNIQUE,
  moto_id UUID REFERENCES public.motorcycles(id),
  apelido TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed NUMERIC,
  course NUMERIC,
  acc SMALLINT,                    -- 1 = motor ligado, 0 = desligado
  gps_time TIMESTAMPTZ,            -- horário informado pelo próprio pacote GPS do aparelho
  address TEXT,                    -- reverse geocoding (Nominatim), calculado pelo servidor TCP
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gt06_devices_company ON public.gt06_devices (company_id);

ALTER TABLE public.gt06_devices ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão multi-tenant do resto do app: admin/operador só veem dispositivos
-- da(s) empresa(s) que administram.
CREATE POLICY "Staff can view own company gt06_devices"
  ON public.gt06_devices FOR SELECT
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (company_id = ANY (get_user_companies(auth.uid()))
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)))
  );

-- Editar apelido / vincular a uma moto — não editam telemetria (isso só o servidor
-- TCP grava, via service role).
CREATE POLICY "Staff can update own company gt06_devices"
  ON public.gt06_devices FOR UPDATE
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (company_id = ANY (get_user_companies(auth.uid()))
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)))
  );

-- Sem policy de INSERT/DELETE para staff de propósito: a criação da linha (na
-- primeira conexão de um IMEI novo) e a telemetria contínua só acontecem via
-- service role key no servidor TCP da VPS, que ignora RLS.

CREATE TRIGGER trg_gt06_devices_updated_at
  BEFORE UPDATE ON public.gt06_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
