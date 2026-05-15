-- Add OS fields to maintenance table
ALTER TABLE public.maintenance
  ADD COLUMN IF NOT EXISTS numero_os TEXT,
  ADD COLUMN IF NOT EXISTS natureza TEXT NOT NULL DEFAULT 'corretiva',
  ADD COLUMN IF NOT EXISTS oficina TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS itens JSONB NOT NULL DEFAULT '[]'::jsonb;
