-- Add numero column to rentals
ALTER TABLE public.rentals ADD COLUMN numero serial NOT NULL;

-- Create a unique index on numero per company
CREATE UNIQUE INDEX idx_rentals_numero_company ON public.rentals (company_id, numero);