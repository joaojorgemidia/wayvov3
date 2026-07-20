-- Mesmo bug da migração 20260718140000 (Seguro), agora afetando "Rastreador": a
-- auto-materialização de despesa fixa (FinanceiroPage) gerou o lote de 24 meses futuros
-- em duplicidade para 4 motos (NLF3H27, TFO8G55, TFY4G05, TGN0E11), de 07/2026 a 06/2028.
-- Também havia 4 duplicatas históricas isoladas (16/02/2026, já pagas) de um lote de
-- importação anterior.
--
-- Mantém uma ocorrência por (placa, data, valor) — preferindo a paga quando o par tem
-- uma paga e uma pendente — e soft-deleta o restante.
UPDATE public.financial_entries fe
SET deleted_at = now()
WHERE categoria = 'rastreador' AND tipo = 'despesa' AND deleted_at IS NULL
  AND id IN (
    SELECT unnest(ids[2:]) FROM (
      SELECT array_agg(id ORDER BY pago DESC, id) AS ids
      FROM public.financial_entries
      WHERE categoria = 'rastreador' AND tipo = 'despesa' AND deleted_at IS NULL
      GROUP BY placa, data, valor
      HAVING count(*) > 1
    ) sub
  );
