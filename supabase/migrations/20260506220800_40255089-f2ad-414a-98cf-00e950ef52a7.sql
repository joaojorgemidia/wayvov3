ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS bandeira text,
  ADD COLUMN IF NOT EXISTS descricao text;