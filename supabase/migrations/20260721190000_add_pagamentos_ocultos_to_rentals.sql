-- Permite ocultar manualmente, por contrato, as cobranças em aberto de locações já
-- encerradas da fila principal de Pagamentos — sem deixar de contabilizá-las como
-- dívida (continuam visíveis no detalhe do cliente e em Locações).
alter table public.rentals add column if not exists pagamentos_ocultos boolean not null default false;
