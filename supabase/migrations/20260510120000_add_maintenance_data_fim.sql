-- Add data_fim column to maintenance table
-- Represents the date the motorcycle left the shop (saída da oficina)
ALTER TABLE public.maintenance
  ADD COLUMN IF NOT EXISTS data_fim DATE;
