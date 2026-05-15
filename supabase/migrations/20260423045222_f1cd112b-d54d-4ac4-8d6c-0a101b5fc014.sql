-- Remove duplicatas Asaas e C6 (mantém as mais antigas) e Caixa
UPDATE public.bank_accounts SET deleted_at = now()
WHERE id IN (
  'c4ec8d1d-0c1e-4a53-a130-43fa5fa7a731', -- Asaas duplicada
  '9cb998a9-a4cd-4ea6-815e-f800325c90a2', -- C6 duplicada
  '032e072d-6462-4b90-a992-d8ac9a29c06e'  -- Caixa
);

-- Limpa a referência "Caixa" do financeiro (1 entrada apenas) para que não recrie a conta
UPDATE public.financial_entries SET conta = NULL
WHERE company_id = 'motovia-locadora-de-motos-000144' AND conta = 'Caixa';

-- Índice único para impedir duplicatas futuras (case-insensitive, ignora soft-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_company_nome_unique
ON public.bank_accounts (company_id, lower(nome))
WHERE deleted_at IS NULL;