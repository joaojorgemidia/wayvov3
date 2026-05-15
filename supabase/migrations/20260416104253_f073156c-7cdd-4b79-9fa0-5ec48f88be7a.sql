
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_log;

-- Replace with company-scoped policy
CREATE POLICY "Users can insert audit logs for own companies"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));
