
-- 1. Add soft-delete column to all critical tables
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.rentals ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.motorcycles ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.maintenance ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Create indexes for efficient filtering on deleted_at
CREATE INDEX IF NOT EXISTS idx_financial_entries_not_deleted ON public.financial_entries (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rentals_not_deleted ON public.rentals (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_not_deleted ON public.clients (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_motorcycles_not_deleted ON public.motorcycles (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_not_deleted ON public.maintenance (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fines_not_deleted ON public.fines (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_accounts_not_deleted ON public.bank_accounts (company_id) WHERE deleted_at IS NULL;

-- 3. Create audit_log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','soft_delete','restore')),
  payload jsonb DEFAULT '{}'::jsonb,
  user_id uuid DEFAULT auth.uid(),
  company_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert audit logs
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admins can read all audit logs
CREATE POLICY "Admins can read audit logs"
  ON public.audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for querying audit logs
CREATE INDEX idx_audit_log_table_record ON public.audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_company ON public.audit_log (company_id, created_at DESC);
