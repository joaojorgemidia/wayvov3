ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS pagamento_direto boolean NOT NULL DEFAULT false;
