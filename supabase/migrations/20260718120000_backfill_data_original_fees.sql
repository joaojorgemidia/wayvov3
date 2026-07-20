-- Backfill data_original em lançamentos de "taxas"/"juros_atraso" criados antes da
-- migração 20260708120000 (que adicionou a coluna). Sem data_original, o Financeiro
-- calcula a referência de semana usando a data de crédito da taxa (quando o Asaas
-- debitou a taxa) em vez do vencimento do aluguel que originou a cobrança — mostrando
-- "Semana NN" com o número certo mas o intervalo de datas errado.
--
-- Para cada taxa/juros sem data_original, busca o aluguel pago mais recente da mesma
-- locação com vencimento (data_prevista) até a data da taxa — que é o aluguel que
-- efetivamente gerou aquela cobrança.
UPDATE public.financial_entries fe
SET data_original = sub.data_prevista
FROM (
  SELECT DISTINCT ON (t.id) t.id AS fee_id, a.data_prevista
  FROM public.financial_entries t
  JOIN public.financial_entries a
    ON a.rental_id = t.rental_id
   AND a.categoria = 'aluguel'
   AND a.pago = true
   AND a.deleted_at IS NULL
   AND a.data_prevista IS NOT NULL
   AND a.data_prevista <= t.data
  WHERE t.categoria IN ('taxas', 'juros_atraso')
    AND t.data_original IS NULL
    AND t.rental_id IS NOT NULL
    AND t.deleted_at IS NULL
  ORDER BY t.id, a.data_prevista DESC
) sub
WHERE fe.id = sub.fee_id;
