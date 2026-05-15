-- Tabela compartilhada de locadoras
CREATE TABLE IF NOT EXISTS public.companies (
  id text PRIMARY KEY,
  nome text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado vinculado pode ver a locadora
CREATE POLICY "Users can view linked companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (id = ANY (public.get_user_companies(auth.uid())) OR public.has_role(auth.uid(), 'admin'));

-- Admins podem criar
CREATE POLICY "Admins can insert companies"
  ON public.companies FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins podem editar
CREATE POLICY "Admins can update companies"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins podem excluir
CREATE POLICY "Admins can delete companies"
  ON public.companies FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();