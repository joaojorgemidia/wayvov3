-- Snapshot das cobranças originais reunidas quando várias pendências de um contrato
-- encerrado são consolidadas em uma única cobrança nova (LocacoesPage — encerramento
-- de locação). As cobranças originais são soft-deletadas (deleted_at) e somem do app,
-- então esse snapshot é o único jeito de a tela mostrar depois do que a cobrança
-- consolidada é composta.
ALTER TABLE public.financial_entries
  ADD COLUMN consolidated_items JSONB DEFAULT NULL;

COMMENT ON COLUMN public.financial_entries.consolidated_items IS
  'Snapshot das cobranças originais reunidas nesta cobrança consolidada (gerada ao encerrar contrato). Array de {originalEntryId, descricao, categoria, valor, dataPrevista}. NULL para cobranças normais.';
