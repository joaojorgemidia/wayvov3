-- Sync data_prevista with data for unpaid entries where they diverged
-- (legacy bug: editing the entry date didn't update data_prevista, so the
-- listing showed the stale due date while the edit dialog showed the correct one).
UPDATE public.financial_entries
SET data_prevista = data
WHERE pago = false
  AND data_prevista IS NOT NULL
  AND data_prevista <> data;
