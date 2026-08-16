-- Corrige a data de lançamentos "taxas"/"juros_atraso" que ficaram 1 ou 3 dias à
-- frente do "aluguel" que gerou o mesmo pagamento Asaas. Causa: asaas-sync-fees e
-- asaas-webhook usavam creditDate (data de compensação bancária, D+1 útil pro boleto)
-- para gravar "data"/"data_prevista" dessas linhas derivadas, enquanto o aluguel (marcado
-- pago por asaas-sync-status/asaas-webhook) usa a data de recebimento (confirmedDate/
-- paymentDate) — o mesmo recebimento aparecia em dois dias diferentes no Financeiro.
-- O código-fonte já foi corrigido para gravar taxa/juros na mesma data do aluguel
-- (asaas-sync-fees e asaas-webhook agora usam "displayDate"/"paymentDate" em vez de
-- creditDate para esses campos). Esta migração alinha os lançamentos já existentes.
update financial_entries d
set data = a.data, data_prevista = a.data
from financial_entries a
where a.categoria = 'aluguel'
  and a.deleted_at is null
  and a.asaas_payment_id is not null
  and d.asaas_payment_id = a.asaas_payment_id
  and d.categoria in ('juros_atraso', 'taxas')
  and d.deleted_at is null
  and (d.data - a.data) in (1, 3);
