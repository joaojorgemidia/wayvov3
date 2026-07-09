create index if not exists idx_motorcycles_company_active on motorcycles (company_id, created_at, id) where deleted_at is null;
create index if not exists idx_clients_company_active on clients (company_id, created_at, id) where deleted_at is null;
create index if not exists idx_rentals_company_active on rentals (company_id, created_at, id) where deleted_at is null;
create index if not exists idx_fines_company_active on fines (company_id, created_at, id) where deleted_at is null;
create index if not exists idx_maintenance_company_active on maintenance (company_id, created_at, id) where deleted_at is null;
create index if not exists idx_financial_entries_company_active on financial_entries (company_id, created_at, id) where deleted_at is null;
create index if not exists idx_bank_accounts_company_active on bank_accounts (company_id, created_at, id) where deleted_at is null;
