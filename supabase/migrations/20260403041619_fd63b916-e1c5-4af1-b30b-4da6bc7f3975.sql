
-- Remove insecure anon policies
DROP POLICY IF EXISTS "Anon read CRLV" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload CRLV" ON storage.objects;

-- Remove overly permissive authenticated policies
DROP POLICY IF EXISTS "Auth read CRLV" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload CRLV" ON storage.objects;

-- Create owner-scoped authenticated policies
CREATE POLICY "Owner read CRLV"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'crlv-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner upload CRLV"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'crlv-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
