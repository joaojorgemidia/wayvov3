-- Add recurring_group_id to financial_entries.
-- All entries belonging to the same recurrence batch (fixed, recurring or
-- rental instalment series) share one UUID. Standalone entries stay NULL.

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS recurring_group_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_recurring_group_id
  ON public.financial_entries (company_id, recurring_group_id)
  WHERE recurring_group_id IS NOT NULL;
