
-- Drop old policies
DROP POLICY IF EXISTS "Owner read CRLV" ON storage.objects;
DROP POLICY IF EXISTS "Owner upload CRLV" ON storage.objects;
DROP POLICY IF EXISTS "Auth read client docs" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload client docs" ON storage.objects;

-- CRLV bucket: company-scoped (path layout: {company_id}/{moto_id}/{filename})
CREATE POLICY "Company members read CRLV"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'crlv-documents'
  AND (storage.foldername(name))[1] = ANY (public.get_user_companies(auth.uid()))
);

CREATE POLICY "Company members upload CRLV"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'crlv-documents'
  AND (storage.foldername(name))[1] = ANY (public.get_user_companies(auth.uid()))
);

CREATE POLICY "Company members update CRLV"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'crlv-documents'
  AND (storage.foldername(name))[1] = ANY (public.get_user_companies(auth.uid()))
);

CREATE POLICY "Company members delete CRLV"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'crlv-documents'
  AND (storage.foldername(name))[1] = ANY (public.get_user_companies(auth.uid()))
);

-- Client documents bucket: company-scoped (path: {company_id}/{client_id}/{kind}-{filename})
CREATE POLICY "Company members read client docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-documents'
  AND (storage.foldername(name))[1] = ANY (public.get_user_companies(auth.uid()))
);

CREATE POLICY "Company members upload client docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client-documents'
  AND (storage.foldername(name))[1] = ANY (public.get_user_companies(auth.uid()))
);

CREATE POLICY "Company members update client docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'client-documents'
  AND (storage.foldername(name))[1] = ANY (public.get_user_companies(auth.uid()))
);

CREATE POLICY "Company members delete client docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'client-documents'
  AND (storage.foldername(name))[1] = ANY (public.get_user_companies(auth.uid()))
);
