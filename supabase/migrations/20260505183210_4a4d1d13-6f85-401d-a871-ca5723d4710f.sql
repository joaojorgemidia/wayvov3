DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'motorcycles','clients','rentals','fines','maintenance',
    'financial_entries','bank_accounts','companies','action_history',
    'collection_followups','collection_rules'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- already in publication, ignore
      NULL;
    END;
  END LOOP;
END $$;