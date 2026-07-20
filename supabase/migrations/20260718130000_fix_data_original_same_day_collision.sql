-- Corrige 2 lançamentos de "taxas" que o backfill anterior (20260718120000) atribuiu à
-- semana errada. Quando o mesmo locatário paga 2 boletos de aluguel atrasados NO MESMO
-- DIA, as taxas de ambos os boletos ficam com a mesma data de crédito — e a heurística
-- do backfill (pegar o aluguel pago mais próximo por data) não consegue distinguir qual
-- taxa pertence a qual boleto, atribuindo as duas ao mesmo (o mais recente).
--
-- Caso real: locação RCJ8F85 (Luiz Felipe Bueno de Souza) pagou Semana 17 (venc. 25/06) e
-- Semana 18 (venc. 01/07) no mesmo dia (07/07). As 4 taxas ficaram todas com
-- data_original = 2026-07-01 (Semana 18), quando 2 delas (fatura nr. 840225808) são da
-- Semana 17. Confirmado via invoiceNumber do pagamento na API do Asaas (não é heurística).
UPDATE public.financial_entries
SET data_original = '2026-06-25'
WHERE id IN (
  'eac9eaf7-6c2d-58d3-9934-7fe3e9c06d66', -- Taxa de mensageria - fatura nr. 840225808
  '30346006-4a7c-5122-946d-02f2cdbf7357'  -- Taxa de boleto - fatura nr. 840225808
);
