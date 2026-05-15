
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false);

CREATE POLICY "Authenticated users can read client docs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'client-documents');

CREATE POLICY "Authenticated users can upload client docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-documents');
