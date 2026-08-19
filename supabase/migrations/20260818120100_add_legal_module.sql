-- Módulo Jurídico: casos de cobrança pós-encerramento de contrato, abertos manualmente
-- pelo financeiro e acompanhados por um advogado externo com login próprio.
--
-- IMPORTANTE (decisão de segurança): o advogado NUNCA recebe uma linha em
-- user_companies. Hoje, qualquer usuário com acesso a uma empresa via user_companies
-- enxerga TODOS os dados dessa empresa em clients/rentals/financial_entries (o
-- controle por papel só existe na interface, não no banco) — foi exatamente esse
-- padrão que vazou dados entre empresas no passado (ver
-- 20260813130000_fix_admin_role_cross_tenant_rls_leak.sql). Dar ao advogado uma linha
-- em user_companies o exporia a CPF, todas as locações e todo o financeiro da
-- empresa, não só os casos jurídicos.
--
-- Por isso o acesso dele é controlado por legal_company_access, uma tabela dedicada
-- que só é consultada pelas policies de legal_cases/legal_case_updates abaixo —
-- nenhuma policy existente é tocada. E os dados de contrato/locatário que ele vê ficam
-- congelados (snapshot) na própria legal_cases no momento em que o caso é aberto: ele
-- nunca precisa (nem consegue) consultar clients/rentals/financial_entries.

-- Quais empresas um usuário jurídico pode ver casos — independente de user_companies.
CREATE TABLE public.legal_company_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

ALTER TABLE public.legal_company_access ENABLE ROW LEVEL SECURITY;

-- Só quem já gerencia usuários da empresa concede/revoga acesso — o advogado nunca
-- gerencia a própria concessão.
CREATE POLICY "Admins manage legal_company_access"
  ON public.legal_company_access FOR ALL
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (company_id = ANY (get_user_companies(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (company_id = ANY (get_user_companies(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
  );

-- O próprio usuário jurídico só lê quais empresas tem acesso (pra montar a lista de
-- casos na tela dele).
CREATE POLICY "Juridico can view own legal_company_access"
  ON public.legal_company_access FOR SELECT
  USING (user_id = auth.uid());

-- Casos jurídicos — um por locação encerrada com saldo pendente enviada ao jurídico.
CREATE TABLE public.legal_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  rental_id TEXT,
  client_id TEXT,
  -- snapshot congelado na abertura — a tela do advogado só lê daqui, nunca de
  -- clients/rentals/financial_entries diretamente.
  company_nome TEXT NOT NULL DEFAULT '',
  cliente_nome TEXT NOT NULL DEFAULT '',
  cliente_cpf TEXT,
  cliente_telefone TEXT,
  cliente_endereco TEXT,
  contrato_numero TEXT,
  moto_placa TEXT,
  moto_modelo TEXT,
  data_inicio_contrato DATE,
  data_fim_contrato DATE,
  saldo_pendente_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  detalhe_pendencias JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{descricao, valor, vencimento}]
  status TEXT NOT NULL DEFAULT 'nao_iniciado'
    CHECK (status IN ('nao_iniciado','em_andamento','sucesso','falha')),
  valor_recuperado NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_em_recuperacao NUMERIC(12,2) NOT NULL DEFAULT 0,
  opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_legal_cases_company_status ON public.legal_cases (company_id, status);
CREATE INDEX idx_legal_cases_rental ON public.legal_cases (rental_id);

ALTER TABLE public.legal_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own company legal_cases"
  ON public.legal_cases FOR SELECT
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (company_id = ANY (get_user_companies(auth.uid()))
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)))
  );

CREATE POLICY "Juridico can view assigned legal_cases"
  ON public.legal_cases FOR SELECT
  USING (
    has_role(auth.uid(), 'juridico'::app_role)
    AND company_id IN (SELECT company_id FROM public.legal_company_access WHERE user_id = auth.uid())
  );

-- Abertura de caso é sempre manual, feita pelo financeiro/admin a partir de uma
-- locação encerrada — o advogado nunca cria casos.
CREATE POLICY "Staff can insert legal_cases"
  ON public.legal_cases FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (company_id = ANY (get_user_companies(auth.uid()))
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)))
  );

CREATE POLICY "Staff can update own company legal_cases"
  ON public.legal_cases FOR UPDATE
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR (company_id = ANY (get_user_companies(auth.uid()))
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)))
  );

-- Advogado pode atualizar status/valores dos casos atribuídos a ele.
CREATE POLICY "Juridico can update assigned legal_cases"
  ON public.legal_cases FOR UPDATE
  USING (
    has_role(auth.uid(), 'juridico'::app_role)
    AND company_id IN (SELECT company_id FROM public.legal_company_access WHERE user_id = auth.uid())
  );

-- Encerrar um caso é mudança de status, não remoção — exclusão fica só com
-- superadmin, pra corrigir erro de cadastro.
CREATE POLICY "Superadmin can delete legal_cases"
  ON public.legal_cases FOR DELETE
  USING (has_role(auth.uid(), 'superadmin'::app_role));

CREATE TRIGGER trg_legal_cases_updated_at
  BEFORE UPDATE ON public.legal_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Timeline de atualizações por caso — append-only (sem policy de UPDATE/DELETE:
-- uma vez escrita, uma atualização não é editável, pra manter o histórico confiável).
CREATE TABLE public.legal_case_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_label TEXT NOT NULL DEFAULT '', -- nome/e-mail no momento (sobrevive à remoção do usuário)
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_legal_case_updates_case ON public.legal_case_updates (case_id);

ALTER TABLE public.legal_case_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view legal_case_updates"
  ON public.legal_case_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.legal_cases lc
      WHERE lc.id = legal_case_updates.case_id
        AND (
          has_role(auth.uid(), 'superadmin'::app_role)
          OR (lc.company_id = ANY (get_user_companies(auth.uid()))
              AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)))
        )
    )
  );

CREATE POLICY "Juridico can view assigned legal_case_updates"
  ON public.legal_case_updates FOR SELECT
  USING (
    has_role(auth.uid(), 'juridico'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.legal_cases lc
      WHERE lc.id = legal_case_updates.case_id
        AND lc.company_id IN (SELECT company_id FROM public.legal_company_access WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Staff can insert legal_case_updates"
  ON public.legal_case_updates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.legal_cases lc
      WHERE lc.id = legal_case_updates.case_id
        AND (
          has_role(auth.uid(), 'superadmin'::app_role)
          OR (lc.company_id = ANY (get_user_companies(auth.uid()))
              AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)))
        )
    )
  );

CREATE POLICY "Juridico can insert assigned legal_case_updates"
  ON public.legal_case_updates FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'juridico'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.legal_cases lc
      WHERE lc.id = legal_case_updates.case_id
        AND lc.company_id IN (SELECT company_id FROM public.legal_company_access WHERE user_id = auth.uid())
    )
  );
