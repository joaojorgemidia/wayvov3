ALTER TABLE public.collection_rules
  DROP CONSTRAINT IF EXISTS collection_rules_module_check;

ALTER TABLE public.collection_rules
  ADD CONSTRAINT collection_rules_module_check
  CHECK (module IN ('pagamento','multa','outras_receitas','oleo','vistoria','manutencao'));

ALTER TABLE public.collection_followups
  DROP CONSTRAINT IF EXISTS collection_followups_module_check;

ALTER TABLE public.collection_followups
  ADD CONSTRAINT collection_followups_module_check
  CHECK (module IN ('pagamento','multa','outras_receitas','oleo','vistoria','manutencao'));