ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS nao_gerar_saida boolean NOT NULL DEFAULT false;
