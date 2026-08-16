-- Reagenda o cron job de geração automática de boletos (asaas-auto-boleto) de
-- 08:00 (BRT) para 08:37 (BRT) — "0 11 * * *" → "37 11 * * *" (UTC = BRT+3).
-- A própria edge function também foi atualizada nesta mesma leva: antes só uma
-- lista fixa de categorias (aluguel, caução, outro_receita/Parcelamento) entrava
-- na rotina automática — cobranças consolidadas de encerramento (categoria
-- outro_receita, subcategoria "Consolidação encerramento") ficavam de fora e
-- nunca geravam boleto sozinhas. Agora a rotina considera qualquer lançamento
-- tipo "receita" sem boleto (exceto multa, que já tem sua própria janela de
-- vencimento tratada à parte).
select cron.alter_job(2, schedule => '37 11 * * *');
