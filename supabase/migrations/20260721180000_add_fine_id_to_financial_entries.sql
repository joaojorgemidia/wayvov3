-- Liga lançamentos financeiros (receita de repasse / despesa da multa) à multa de
-- origem, permitindo marcar a despesa como paga automaticamente ao quitar a multa.
alter table public.financial_entries add column if not exists fine_id text;

create index if not exists idx_financial_entries_fine_id
  on public.financial_entries (fine_id)
  where fine_id is not null;
