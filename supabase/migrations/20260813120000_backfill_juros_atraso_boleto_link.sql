-- Lançamentos de "Juros por Atraso" (categoria juros_atraso) são criados pelo
-- asaas-sync-fees como uma entrada separada da cobrança de aluguel que gerou o mesmo
-- boleto/pagamento no Asaas, mas nunca receberam o asaas_payment_id/link do boleto —
-- por isso a coluna "Cobrança" do Financeiro ficava sem o ícone de link nessas linhas.
-- Este backfill copia o link do boleto do lançamento de aluguel irmão (mesma locação e
-- mesmo vencimento original, guardado em data_original) para os juros/multa já existentes.
-- A função asaas-sync-fees já foi corrigida para salvar isso em novos lançamentos.

update financial_entries j
set
  asaas_payment_id = a.asaas_payment_id,
  asaas_boleto_url = a.asaas_boleto_url,
  asaas_invoice_url = a.asaas_invoice_url
from financial_entries a
where j.categoria = 'juros_atraso'
  and j.asaas_payment_id is null
  and j.rental_id is not null
  and j.data_original is not null
  and a.categoria = 'aluguel'
  and a.rental_id = j.rental_id
  and a.data_prevista = j.data_original
  and a.asaas_payment_id is not null
  and j.deleted_at is null
  and a.deleted_at is null;
