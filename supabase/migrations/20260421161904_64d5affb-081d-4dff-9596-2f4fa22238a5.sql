-- ============================================================
-- Action History (with revert support)
-- ============================================================

CREATE TABLE public.action_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id UUID,
  user_name TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL CHECK (action_type IN ('create','update','delete','bulk_import','revert')),
  entity_type TEXT NOT NULL,
  entity_ids TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  snapshot_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_after JSONB NOT NULL DEFAULT '[]'::jsonb,
  reverted BOOLEAN NOT NULL DEFAULT false,
  reverted_at TIMESTAMP WITH TIME ZONE,
  reverted_by UUID,
  reverts_action_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_history_company_created ON public.action_history (company_id, created_at DESC);
CREATE INDEX idx_action_history_user ON public.action_history (user_id, created_at DESC);
CREATE INDEX idx_action_history_entity ON public.action_history (company_id, entity_type, created_at DESC);

ALTER TABLE public.action_history ENABLE ROW LEVEL SECURITY;

-- Read: anyone in the same company can view their company's history
CREATE POLICY "Users can view own company action_history"
ON public.action_history
FOR SELECT
TO authenticated
USING (company_id = ANY (get_user_companies(auth.uid())));

-- Insert: any authenticated user can record actions for their own company
CREATE POLICY "Users can insert action_history for own company"
ON public.action_history
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = ANY (get_user_companies(auth.uid()))
  AND (user_id = auth.uid() OR user_id IS NULL)
);

-- Update: only the author OR an admin can mark an action as reverted
CREATE POLICY "Author or admin can update action_history"
ON public.action_history
FOR UPDATE
TO authenticated
USING (
  company_id = ANY (get_user_companies(auth.uid()))
  AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
);

-- Delete: only admins (used for manual cleanup)
CREATE POLICY "Admins can delete action_history"
ON public.action_history
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- Auto cleanup: drop entries older than 30 days
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_action_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.action_history
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$;