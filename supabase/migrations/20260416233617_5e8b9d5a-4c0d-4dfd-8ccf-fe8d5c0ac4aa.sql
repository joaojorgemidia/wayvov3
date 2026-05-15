-- Garantir role admin para contatojoaojorge@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('5b0dc648-5dd1-4d1c-8010-0150a63b24b5', 'admin')
ON CONFLICT DO NOTHING;

-- Vincular o usuário às empresas existentes
INSERT INTO public.user_companies (user_id, company_id)
SELECT '5b0dc648-5dd1-4d1c-8010-0150a63b24b5', company_id
FROM (VALUES ('pratas-do-jorge-111111'), ('loca2rodas')) AS t(company_id)
ON CONFLICT DO NOTHING;