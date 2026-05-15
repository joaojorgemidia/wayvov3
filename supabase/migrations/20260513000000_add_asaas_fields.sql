-- Asaas integration fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS asaas_status TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS asaas_boleto_url TEXT;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS asaas_invoice_url TEXT;

CREATE INDEX IF NOT EXISTS idx_financial_entries_asaas_payment_id ON financial_entries(asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_asaas_customer_id ON clients(asaas_customer_id) WHERE asaas_customer_id IS NOT NULL;
