-- Em 11/06/2026 a auto-materialização de recorrências (FinanceiroPage) gerou o lote de
-- 24 meses futuros de "Seguro" em duplicidade para 4 motos (NVP1J82, NLF3H27, PQG6D29,
-- PRV3D91, RBX4D53) — provável corrida entre duas abas/sessões computando a mesma lacuna
-- de ocorrências antes de uma ver o resultado da outra. Resultado: 125 lançamentos
-- duplicados, todos futuros e não pagos (nenhum valor já realizado foi afetado).
--
-- Mantém uma ocorrência por (placa, data_prevista, valor) e soft-deleta o restante.
UPDATE public.financial_entries
SET deleted_at = now()
WHERE categoria = 'seguro'
  AND tipo = 'despesa'
  AND deleted_at IS NULL
  AND id IN (
    SELECT unnest(ids[2:]) FROM (
      SELECT array_agg(id ORDER BY id) AS ids
      FROM public.financial_entries
      WHERE categoria = 'seguro' AND tipo = 'despesa' AND deleted_at IS NULL
      GROUP BY placa, data_prevista, valor
      HAVING count(*) > 1
    ) sub
  );
