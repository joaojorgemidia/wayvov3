-- Restaura políticas de RLS que estavam ausentes no banco remoto (tabelas ficaram
-- com RLS habilitado mas zero políticas, bloqueando qualquer INSERT/UPDATE/DELETE).
-- Aplicado diretamente no banco em 2026-08-06; este arquivo apenas versiona a mudança.

DROP POLICY IF EXISTS "Users can view own company inspections" ON public.inspections;
DROP POLICY IF EXISTS "Users can insert own company inspections" ON public.inspections;
DROP POLICY IF EXISTS "Users can update own company inspections" ON public.inspections;
DROP POLICY IF EXISTS "Users can delete own company inspections" ON public.inspections;

CREATE POLICY "Users can view own company inspections"
ON public.inspections FOR SELECT
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company inspections"
ON public.inspections FOR INSERT
WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company inspections"
ON public.inspections FOR UPDATE
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company inspections"
ON public.inspections FOR DELETE
USING (company_id = ANY (get_user_companies(auth.uid())));

DROP POLICY IF EXISTS "Users can view own company inspection_settings" ON public.inspection_settings;
DROP POLICY IF EXISTS "Users can insert own company inspection_settings" ON public.inspection_settings;
DROP POLICY IF EXISTS "Users can update own company inspection_settings" ON public.inspection_settings;

CREATE POLICY "Users can view own company inspection_settings"
ON public.inspection_settings FOR SELECT
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company inspection_settings"
ON public.inspection_settings FOR INSERT
WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company inspection_settings"
ON public.inspection_settings FOR UPDATE
USING (company_id = ANY (get_user_companies(auth.uid())));

DROP POLICY IF EXISTS "Users can view own company vistoria media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own company vistoria media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own company vistoria media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own company vistoria media" ON storage.objects;

CREATE POLICY "Users can view own company vistoria media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'vistoria-media'
  AND (storage.foldername(name))[1] = ANY (get_user_companies(auth.uid()))
);

CREATE POLICY "Users can upload own company vistoria media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vistoria-media'
  AND (storage.foldername(name))[1] = ANY (get_user_companies(auth.uid()))
);

CREATE POLICY "Users can update own company vistoria media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'vistoria-media'
  AND (storage.foldername(name))[1] = ANY (get_user_companies(auth.uid()))
);

CREATE POLICY "Users can delete own company vistoria media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'vistoria-media'
  AND (storage.foldername(name))[1] = ANY (get_user_companies(auth.uid()))
);

DROP POLICY IF EXISTS "Users can view own company action_history" ON public.action_history;
DROP POLICY IF EXISTS "Users can insert action_history for own company" ON public.action_history;
DROP POLICY IF EXISTS "Author or admin can update action_history" ON public.action_history;
DROP POLICY IF EXISTS "Admins can delete action_history" ON public.action_history;

CREATE POLICY "Users can view own company action_history"
ON public.action_history
FOR SELECT
TO authenticated
USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert action_history for own company"
ON public.action_history
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = ANY (get_user_companies(auth.uid()))
  AND (user_id = auth.uid() OR user_id IS NULL)
);

CREATE POLICY "Author or admin can update action_history"
ON public.action_history
FOR UPDATE
TO authenticated
USING (
  company_id = ANY (get_user_companies(auth.uid()))
  AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Admins can delete action_history"
ON public.action_history
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view own company collection_rules" ON public.collection_rules;
DROP POLICY IF EXISTS "Users can insert own company collection_rules" ON public.collection_rules;
DROP POLICY IF EXISTS "Users can update own company collection_rules" ON public.collection_rules;
DROP POLICY IF EXISTS "Users can delete own company collection_rules" ON public.collection_rules;

CREATE POLICY "Users can view own company collection_rules"
  ON public.collection_rules FOR SELECT
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company collection_rules"
  ON public.collection_rules FOR INSERT
  WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company collection_rules"
  ON public.collection_rules FOR UPDATE
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company collection_rules"
  ON public.collection_rules FOR DELETE
  USING (company_id = ANY (get_user_companies(auth.uid())));

DROP POLICY IF EXISTS "Users can view own company collection_followups" ON public.collection_followups;
DROP POLICY IF EXISTS "Users can insert own company collection_followups" ON public.collection_followups;
DROP POLICY IF EXISTS "Users can update own company collection_followups" ON public.collection_followups;
DROP POLICY IF EXISTS "Users can delete own company collection_followups" ON public.collection_followups;

CREATE POLICY "Users can view own company collection_followups"
  ON public.collection_followups FOR SELECT
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can insert own company collection_followups"
  ON public.collection_followups FOR INSERT
  WITH CHECK (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can update own company collection_followups"
  ON public.collection_followups FOR UPDATE
  USING (company_id = ANY (get_user_companies(auth.uid())));

CREATE POLICY "Users can delete own company collection_followups"
  ON public.collection_followups FOR DELETE
  USING (company_id = ANY (get_user_companies(auth.uid())));
