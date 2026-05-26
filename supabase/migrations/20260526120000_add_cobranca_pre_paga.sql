-- Adiciona flag de cobrança pré-paga (locatário paga adiantado) vs pós-paga.
-- Padrão: false (pós-pago) para preservar comportamento existente.
alter table public.rentals
  add column if not exists cobranca_pre_paga boolean not null default false;
