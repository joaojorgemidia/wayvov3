ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'banco',
  ADD COLUMN IF NOT EXISTS dia_fechamento integer,
  ADD COLUMN IF NOT EXISTS dia_vencimento integer,
  ADD COLUMN IF NOT EXISTS limite numeric NOT NULL DEFAULT 0;