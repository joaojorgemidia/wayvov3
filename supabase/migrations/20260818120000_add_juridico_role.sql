-- Novo papel para o módulo Jurídico: advogado externo, com login próprio e acesso
-- restrito (ver 20260818120100_add_legal_module.sql para as tabelas/policies que
-- realmente usam esse papel). Precisa estar em migração separada porque um valor de
-- enum novo não pode ser usado em policies na mesma transação em que foi criado.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'juridico';
