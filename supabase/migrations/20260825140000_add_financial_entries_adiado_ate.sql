-- Persiste o "Adiar" da fila de cobranças (Cobranças da Semana) no banco em vez de
-- localStorage. Antes disso, adiar uma cobrança só valia no navegador que fez a ação:
-- trocar de dispositivo/navegador, ou o navegador limpar dados do site, fazia a
-- cobrança "voltar" a aparecer como vencida.
--
-- Não altera data_prevista nem gera juros/multa — é só uma data até a qual a
-- cobrança fica oculta da lista de "em atraso".
alter table public.financial_entries
  add column if not exists adiado_ate date;
