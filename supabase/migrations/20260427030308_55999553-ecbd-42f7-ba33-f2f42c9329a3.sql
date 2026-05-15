ALTER TABLE public.motorcycles
  ADD COLUMN IF NOT EXISTS forma_compra text NOT NULL DEFAULT 'vista',
  ADD COLUMN IF NOT EXISTS valor_entrada numeric,
  ADD COLUMN IF NOT EXISTS num_parcelas integer,
  ADD COLUMN IF NOT EXISTS valor_parcela numeric,
  ADD COLUMN IF NOT EXISTS parcelas_pagas integer;