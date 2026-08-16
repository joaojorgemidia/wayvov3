-- Corrige lançamentos de "Juros por Atraso" (categoria juros_atraso) corrompidos por um
-- bug no asaas-cron-sync: a rotina (rodando a cada 2h desde 15/06) reprocessava também
-- as próprias linhas derivadas de juros/taxas — que passaram a ter asaas_payment_id
-- preenchido a partir de 13/08 — em vez de processar só o aluguel original. Isso fazia o
-- asaas-sync-fees usar a linha de juros como se fosse a cobrança-fonte: o rótulo de
-- "Semana/Quinzena/Mês" ficava uma referência à frente do correto e, quando o Asaas não
-- reportava interestValue/fineValue diretamente (fallback por diferença de valor pago),
-- o "valor" do juros era recalculado usando o próprio valor (já correto) da rodada
-- anterior como base — inflando o valor registrado para perto do valor do aluguel
-- inteiro. O código-fonte do bug foi corrigido em asaas-cron-sync/asaas-sync-fees/
-- asaas-webhook (ambas passam a ignorar linhas derivadas). Esta migração restaura os
-- dados dos 67 lançamentos já afetados, usando o próprio texto salvo em "observacao":
-- o trecho antes do primeiro " | " ("Valor original R$ X + Multa R$ Y + Juros ... = R$ Z")
-- é estável desde a criação (nunca sobrescrito pelas rodadas seguintes, só reaproveitado
-- como prefixo), e o primeiro rótulo de período depois dele é sempre o correto — calculado
-- na primeira execução, antes de qualquer reprocessamento indevido.
with parsed as (
  select
    id,
    cliente_nome,
    split_part(observacao, ' | ', 1) as prefixo,
    trim(split_part(observacao, ' | ', 2)) as periodo_correto,
    coalesce((regexp_match(observacao, 'Multa R\$ ([\d.,]+)'))[1], '0') as multa_txt,
    coalesce(
      (regexp_match(observacao, 'Juros[^=|]*= R\$ ([\d.,]+)'))[1],
      (regexp_match(observacao, 'Juros R\$ ([\d.,]+)'))[1],
      '0'
    ) as juros_txt
  from financial_entries
  where categoria = 'juros_atraso'
    and deleted_at is null
    and observacao is not null
    and (length(observacao) - length(replace(observacao, '|', ''))) >= 2
)
update financial_entries f
set
  valor = round((replace(p.multa_txt, ',', '.')::numeric + replace(p.juros_txt, ',', '.')::numeric), 2),
  descricao = 'Juros/Multa - ' || coalesce(p.cliente_nome, '') || ' (' || p.periodo_correto || ')',
  observacao = p.prefixo || ' | ' || p.periodo_correto
from parsed p
where f.id = p.id
  and p.periodo_correto <> ''
  and (replace(p.multa_txt, ',', '.')::numeric + replace(p.juros_txt, ',', '.')::numeric) > 0;
