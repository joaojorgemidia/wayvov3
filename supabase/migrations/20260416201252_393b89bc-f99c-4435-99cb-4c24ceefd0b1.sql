-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('crlv-documents', 'crlv-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (owner-scoped)
CREATE POLICY "Owner read CRLV"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'crlv-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner upload CRLV"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'crlv-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Auth read client docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'client-documents');

CREATE POLICY "Auth upload client docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'client-documents');

-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'operador', 'visualizador');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'visualizador',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- User-company link
CREATE TABLE public.user_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  UNIQUE (user_id, company_id)
);
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

-- has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- get_user_companies
CREATE OR REPLACE FUNCTION public.get_user_companies(_user_id UUID)
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY_AGG(company_id) FROM public.user_companies WHERE user_id = _user_id
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- user_roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- user_companies policies
CREATE POLICY "Users can view own companies" ON public.user_companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all companies" ON public.user_companies FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage companies" ON public.user_companies FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Motorcycles
CREATE TABLE public.motorcycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  placa TEXT NOT NULL,
  modelo TEXT NOT NULL DEFAULT '',
  ano_modelo INTEGER,
  cor TEXT NOT NULL DEFAULT '',
  chassi TEXT NOT NULL DEFAULT '',
  renavam TEXT NOT NULL DEFAULT '',
  num_motor TEXT NOT NULL DEFAULT '',
  aplicativo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'propria',
  proprietario TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel',
  km_atual INTEGER, km_compra INTEGER, km_troca_oleo INTEGER, km_venda INTEGER,
  ultima_vistoria DATE, ultima_troca_oleo DATE,
  historico_oleo JSONB NOT NULL DEFAULT '[]'::jsonb,
  valor_compra NUMERIC(12,2), data_compra DATE,
  valor_fipe NUMERIC(12,2), data_fipe DATE,
  valor_venda NUMERIC(12,2), data_venda DATE,
  lucro_operacional NUMERIC(12,2), decisao TEXT,
  crlv_pdf_name TEXT, crlv_storage_path TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.motorcycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company motorcycles" ON public.motorcycles FOR SELECT USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can insert own company motorcycles" ON public.motorcycles FOR INSERT WITH CHECK (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can update own company motorcycles" ON public.motorcycles FOR UPDATE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can delete own company motorcycles" ON public.motorcycles FOR DELETE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE INDEX idx_motorcycles_company ON public.motorcycles(company_id);
CREATE INDEX idx_motorcycles_placa ON public.motorcycles(placa);
CREATE INDEX idx_motorcycles_not_deleted ON public.motorcycles (company_id) WHERE deleted_at IS NULL;

-- Clients
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '', cpf TEXT NOT NULL DEFAULT '',
  cnh TEXT NOT NULL DEFAULT '', cnh_categoria TEXT NOT NULL DEFAULT '', cnh_validade DATE,
  cnh_pdf_name TEXT, cnh_storage_path TEXT,
  telefone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '', rua TEXT NOT NULL DEFAULT '', numero TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '', bairro TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT '',
  comprovante_endereco_name TEXT, comprovante_endereco_storage_path TEXT,
  emergencia_nome1 TEXT NOT NULL DEFAULT '', emergencia_tel1 TEXT NOT NULL DEFAULT '',
  emergencia_nome2 TEXT NOT NULL DEFAULT '', emergencia_tel2 TEXT NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL DEFAULT '',
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company clients" ON public.clients FOR SELECT USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can insert own company clients" ON public.clients FOR INSERT WITH CHECK (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can update own company clients" ON public.clients FOR UPDATE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can delete own company clients" ON public.clients FOR DELETE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE INDEX idx_clients_company ON public.clients(company_id);
CREATE INDEX idx_clients_not_deleted ON public.clients (company_id) WHERE deleted_at IS NULL;

-- Rentals
CREATE TABLE public.rentals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  moto_id TEXT NOT NULL DEFAULT '', cliente_id TEXT NOT NULL DEFAULT '',
  vendedor TEXT NOT NULL DEFAULT '',
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE, hora_inicio TEXT NOT NULL DEFAULT '',
  data_fim DATE, data_fim_contrato DATE, proximo_pagamento DATE,
  tempo_minimo_contrato INTEGER, frequencia_pagamento TEXT NOT NULL DEFAULT '',
  valor_diario NUMERIC(12,2) NOT NULL DEFAULT 0, valor_caucao NUMERIC(12,2) NOT NULL DEFAULT 0,
  caucao_pendente BOOLEAN NOT NULL DEFAULT false, caucao_parcelado BOOLEAN NOT NULL DEFAULT false,
  parcelas_caucao JSONB NOT NULL DEFAULT '[]'::jsonb,
  multa_atraso NUMERIC(12,2) NOT NULL DEFAULT 0, juros_atraso_mes NUMERIC(5,2) NOT NULL DEFAULT 0,
  local_retirada TEXT NOT NULL DEFAULT '', local_devolucao TEXT NOT NULL DEFAULT '',
  km_inicio INTEGER NOT NULL DEFAULT 0, km_fim INTEGER,
  nivel_combustivel TEXT NOT NULL DEFAULT '', plano TEXT NOT NULL DEFAULT '',
  raio_circulacao TEXT NOT NULL DEFAULT '',
  seguro_terceiros BOOLEAN NOT NULL DEFAULT false,
  gerar_cobranca_caucao BOOLEAN NOT NULL DEFAULT false,
  gerar_cobranca_pagamento BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativa',
  checklist_retirada JSONB NOT NULL DEFAULT '[]'::jsonb,
  checklist_devolucao JSONB NOT NULL DEFAULT '[]'::jsonb,
  observacoes TEXT NOT NULL DEFAULT '',
  numero SERIAL NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company rentals" ON public.rentals FOR SELECT USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can insert own company rentals" ON public.rentals FOR INSERT WITH CHECK (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can update own company rentals" ON public.rentals FOR UPDATE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can delete own company rentals" ON public.rentals FOR DELETE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE INDEX idx_rentals_company ON public.rentals(company_id);
CREATE INDEX idx_rentals_not_deleted ON public.rentals (company_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_rentals_numero_company ON public.rentals (company_id, numero);

-- Fines
CREATE TABLE public.fines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  moto_id TEXT NOT NULL DEFAULT '', cliente_id TEXT, rental_id TEXT,
  data_multa DATE NOT NULL DEFAULT CURRENT_DATE, data_notificacao DATE,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0, descricao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente', responsavel TEXT NOT NULL DEFAULT 'locadora',
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company fines" ON public.fines FOR SELECT USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can insert own company fines" ON public.fines FOR INSERT WITH CHECK (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can update own company fines" ON public.fines FOR UPDATE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can delete own company fines" ON public.fines FOR DELETE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE INDEX idx_fines_company ON public.fines(company_id);
CREATE INDEX idx_fines_not_deleted ON public.fines (company_id) WHERE deleted_at IS NULL;

-- Maintenance
CREATE TABLE public.maintenance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  moto_id TEXT NOT NULL DEFAULT '', tipo TEXT NOT NULL DEFAULT 'outro',
  data DATE NOT NULL DEFAULT CURRENT_DATE, km INTEGER,
  custo NUMERIC(12,2) NOT NULL DEFAULT 0, descricao TEXT NOT NULL DEFAULT '',
  fornecedor TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'agendada',
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company maintenance" ON public.maintenance FOR SELECT USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can insert own company maintenance" ON public.maintenance FOR INSERT WITH CHECK (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can update own company maintenance" ON public.maintenance FOR UPDATE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can delete own company maintenance" ON public.maintenance FOR DELETE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE INDEX idx_maintenance_company ON public.maintenance(company_id);
CREATE INDEX idx_maintenance_not_deleted ON public.maintenance (company_id) WHERE deleted_at IS NULL;

-- Financial Entries
CREATE TABLE public.financial_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'despesa', categoria TEXT NOT NULL DEFAULT '', subcategoria TEXT,
  descricao TEXT NOT NULL DEFAULT '', valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  data DATE NOT NULL DEFAULT CURRENT_DATE, data_prevista DATE,
  moto_id TEXT, rental_id TEXT, cliente_id TEXT,
  pago BOOLEAN NOT NULL DEFAULT false, recorrente BOOLEAN NOT NULL DEFAULT false,
  recorrencia_tipo TEXT, recorrencia_vezes INTEGER,
  despesa_fixa BOOLEAN NOT NULL DEFAULT false, ignorada BOOLEAN NOT NULL DEFAULT false,
  observacao TEXT, tags TEXT[] NOT NULL DEFAULT '{}',
  conta TEXT, natureza TEXT, placa TEXT, cliente_nome TEXT,
  classificacao_manual BOOLEAN NOT NULL DEFAULT false,
  serie_id TEXT, fixed_origin_id TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company financial_entries" ON public.financial_entries FOR SELECT USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can insert own company financial_entries" ON public.financial_entries FOR INSERT WITH CHECK (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can update own company financial_entries" ON public.financial_entries FOR UPDATE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can delete own company financial_entries" ON public.financial_entries FOR DELETE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE INDEX idx_financial_company ON public.financial_entries(company_id);
CREATE INDEX idx_financial_data ON public.financial_entries(data);
CREATE INDEX idx_financial_tipo ON public.financial_entries(tipo);
CREATE INDEX idx_financial_entries_not_deleted ON public.financial_entries (company_id) WHERE deleted_at IS NULL;

-- Bank Accounts
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '', banco TEXT NOT NULL DEFAULT '',
  saldo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company bank_accounts" ON public.bank_accounts FOR SELECT USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can insert own company bank_accounts" ON public.bank_accounts FOR INSERT WITH CHECK (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can update own company bank_accounts" ON public.bank_accounts FOR UPDATE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE POLICY "Users can delete own company bank_accounts" ON public.bank_accounts FOR DELETE USING (company_id = ANY(public.get_user_companies(auth.uid())));
CREATE INDEX idx_bank_accounts_company ON public.bank_accounts(company_id);
CREATE INDEX idx_bank_accounts_not_deleted ON public.bank_accounts (company_id) WHERE deleted_at IS NULL;

-- Update triggers
CREATE TRIGGER update_motorcycles_updated_at BEFORE UPDATE ON public.motorcycles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rentals_updated_at BEFORE UPDATE ON public.rentals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fines_updated_at BEFORE UPDATE ON public.fines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON public.maintenance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financial_entries_updated_at BEFORE UPDATE ON public.financial_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','soft_delete','restore')),
  payload jsonb DEFAULT '{}'::jsonb,
  user_id uuid DEFAULT auth.uid(),
  company_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit logs" ON public.audit_log FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert audit logs for own companies" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));
CREATE INDEX idx_audit_log_table_record ON public.audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_company ON public.audit_log (company_id, created_at DESC);