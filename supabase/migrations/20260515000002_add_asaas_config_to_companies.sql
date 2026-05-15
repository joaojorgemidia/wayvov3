-- Adiciona coluna de configuração Asaas na tabela companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.companies.asaas_config IS
  'Configurações do Asaas: { enabled, multaAtraso, jurosAtrasoMes, descontoEnabled, descontoValor, descontoDias, notifyDaysBefore, notifyOnDueDate, notifyDaysAfterDelay }';
