-- Soft-delete contas bancárias duplicadas (mesmo company_id + nome) que estão zeradas,
-- preservando a conta principal (a que tiver maior saldo_inicial absoluto, ou a mais antiga).
-- Também adiciona índice único parcial para impedir novas duplicatas no futuro.

WITH ranked AS (
  SELECT id, company_id, nome,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, nome
      ORDER BY ABS(COALESCE(saldo_inicial, 0)) DESC, created_at ASC
    ) AS rn
  FROM public.bank_accounts
  WHERE deleted_at IS NULL
)
UPDATE public.bank_accounts ba
SET deleted_at = now()
FROM ranked r
WHERE ba.id = r.id AND r.rn > 1;

-- Impede futuras duplicatas (nome + company_id) entre contas ativas
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_company_nome_unique
  ON public.bank_accounts (company_id, lower(nome))
  WHERE deleted_at IS NULL;
