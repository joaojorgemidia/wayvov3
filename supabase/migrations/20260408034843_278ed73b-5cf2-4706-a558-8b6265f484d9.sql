
-- Fix legacy moto_id references in rentals
UPDATE rentals SET moto_id = '02f249dd-efab-4dfb-815c-1ef691a785ea' WHERE moto_id = 'motovia-1' AND company_id = 'motovia';
UPDATE rentals SET moto_id = '9235a69c-fcf4-4463-984c-3f2170a9f1a4' WHERE moto_id = 'motovia-2' AND company_id = 'motovia';
UPDATE rentals SET moto_id = '766a6157-618d-4f57-ab25-6dfaa4d89070' WHERE moto_id = 'motovia-3' AND company_id = 'motovia';
UPDATE rentals SET moto_id = '1ca994b1-2698-4306-93c0-90b9cd5cfa00' WHERE moto_id = 'motovia-4' AND company_id = 'motovia';
UPDATE rentals SET moto_id = 'b1b9060e-f284-4d91-822d-cad8c5200f8e' WHERE moto_id = 'motovia-5' AND company_id = 'motovia';
UPDATE rentals SET moto_id = 'c3ebb04f-30e0-479a-a787-4b2894c9361c' WHERE moto_id = 'motovia-6' AND company_id = 'motovia';
UPDATE rentals SET moto_id = '42fe8265-4641-4d05-af30-3dfd515a8354' WHERE moto_id = 'motovia-7' AND company_id = 'motovia';
UPDATE rentals SET moto_id = 'bfaaab9f-31e6-4047-9855-11e753be7e2b' WHERE moto_id = 'motovia-8' AND company_id = 'motovia';
UPDATE rentals SET moto_id = 'a989b74b-5cfd-4031-a2b0-d99b30f9c35e' WHERE moto_id = 'motovia-9' AND company_id = 'motovia';

-- Fix legacy cliente_id references in rentals
UPDATE rentals SET cliente_id = 'c55a6a4d-b833-4acd-9393-3f9b34b547eb' WHERE cliente_id = 'mv-cli-1' AND company_id = 'motovia';
UPDATE rentals SET cliente_id = '19215922-de4d-49c8-8b5f-52ebd7a777f4' WHERE cliente_id = 'mv-cli-2' AND company_id = 'motovia';
UPDATE rentals SET cliente_id = '2ccb9395-1674-450a-a6a3-46336dcf0f33' WHERE cliente_id = 'mv-cli-3' AND company_id = 'motovia';
UPDATE rentals SET cliente_id = 'b72d2964-31ae-4fb4-a6f2-ee8a496174a0' WHERE cliente_id = 'mv-cli-4' AND company_id = 'motovia';
UPDATE rentals SET cliente_id = 'a654c285-fb0c-4610-ab5c-56dc947e37e9' WHERE cliente_id = 'mv-cli-5' AND company_id = 'motovia';
UPDATE rentals SET cliente_id = '3da8b6da-49c3-479b-9ab7-24170580842a' WHERE cliente_id = 'mv-cli-6' AND company_id = 'motovia';
UPDATE rentals SET cliente_id = 'e00ec4c5-e19c-495f-a1bf-b2bb51539ffa' WHERE cliente_id = 'mv-cli-7' AND company_id = 'motovia';
UPDATE rentals SET cliente_id = 'ae423522-338f-4663-b224-7af7f0b75c9a' WHERE cliente_id = 'mv-cli-8' AND company_id = 'motovia';

-- Fix legacy moto_id references in financial_entries
UPDATE financial_entries SET moto_id = '02f249dd-efab-4dfb-815c-1ef691a785ea' WHERE moto_id = 'motovia-1' AND company_id = 'motovia';
UPDATE financial_entries SET moto_id = '9235a69c-fcf4-4463-984c-3f2170a9f1a4' WHERE moto_id = 'motovia-2' AND company_id = 'motovia';
UPDATE financial_entries SET moto_id = '766a6157-618d-4f57-ab25-6dfaa4d89070' WHERE moto_id = 'motovia-3' AND company_id = 'motovia';
UPDATE financial_entries SET moto_id = '1ca994b1-2698-4306-93c0-90b9cd5cfa00' WHERE moto_id = 'motovia-4' AND company_id = 'motovia';
UPDATE financial_entries SET moto_id = 'b1b9060e-f284-4d91-822d-cad8c5200f8e' WHERE moto_id = 'motovia-5' AND company_id = 'motovia';
UPDATE financial_entries SET moto_id = 'c3ebb04f-30e0-479a-a787-4b2894c9361c' WHERE moto_id = 'motovia-6' AND company_id = 'motovia';
UPDATE financial_entries SET moto_id = '42fe8265-4641-4d05-af30-3dfd515a8354' WHERE moto_id = 'motovia-7' AND company_id = 'motovia';
UPDATE financial_entries SET moto_id = 'bfaaab9f-31e6-4047-9855-11e753be7e2b' WHERE moto_id = 'motovia-8' AND company_id = 'motovia';
UPDATE financial_entries SET moto_id = 'a989b74b-5cfd-4031-a2b0-d99b30f9c35e' WHERE moto_id = 'motovia-9' AND company_id = 'motovia';

-- Fix legacy cliente_id references in financial_entries
UPDATE financial_entries SET cliente_id = 'c55a6a4d-b833-4acd-9393-3f9b34b547eb' WHERE cliente_id = 'mv-cli-1' AND company_id = 'motovia';
UPDATE financial_entries SET cliente_id = '19215922-de4d-49c8-8b5f-52ebd7a777f4' WHERE cliente_id = 'mv-cli-2' AND company_id = 'motovia';
UPDATE financial_entries SET cliente_id = '2ccb9395-1674-450a-a6a3-46336dcf0f33' WHERE cliente_id = 'mv-cli-3' AND company_id = 'motovia';
UPDATE financial_entries SET cliente_id = 'b72d2964-31ae-4fb4-a6f2-ee8a496174a0' WHERE cliente_id = 'mv-cli-4' AND company_id = 'motovia';
UPDATE financial_entries SET cliente_id = 'a654c285-fb0c-4610-ab5c-56dc947e37e9' WHERE cliente_id = 'mv-cli-5' AND company_id = 'motovia';
UPDATE financial_entries SET cliente_id = '3da8b6da-49c3-479b-9ab7-24170580842a' WHERE cliente_id = 'mv-cli-6' AND company_id = 'motovia';
UPDATE financial_entries SET cliente_id = 'e00ec4c5-e19c-495f-a1bf-b2bb51539ffa' WHERE cliente_id = 'mv-cli-7' AND company_id = 'motovia';
UPDATE financial_entries SET cliente_id = 'ae423522-338f-4663-b224-7af7f0b75c9a' WHERE cliente_id = 'mv-cli-8' AND company_id = 'motovia';

-- Fix legacy moto_id in fines
UPDATE fines SET moto_id = '02f249dd-efab-4dfb-815c-1ef691a785ea' WHERE moto_id = 'motovia-1' AND company_id = 'motovia';
UPDATE fines SET moto_id = '9235a69c-fcf4-4463-984c-3f2170a9f1a4' WHERE moto_id = 'motovia-2' AND company_id = 'motovia';
UPDATE fines SET moto_id = '766a6157-618d-4f57-ab25-6dfaa4d89070' WHERE moto_id = 'motovia-3' AND company_id = 'motovia';
UPDATE fines SET moto_id = '1ca994b1-2698-4306-93c0-90b9cd5cfa00' WHERE moto_id = 'motovia-4' AND company_id = 'motovia';
UPDATE fines SET moto_id = 'b1b9060e-f284-4d91-822d-cad8c5200f8e' WHERE moto_id = 'motovia-5' AND company_id = 'motovia';
UPDATE fines SET moto_id = 'c3ebb04f-30e0-479a-a787-4b2894c9361c' WHERE moto_id = 'motovia-6' AND company_id = 'motovia';
UPDATE fines SET moto_id = '42fe8265-4641-4d05-af30-3dfd515a8354' WHERE moto_id = 'motovia-7' AND company_id = 'motovia';
UPDATE fines SET moto_id = 'bfaaab9f-31e6-4047-9855-11e753be7e2b' WHERE moto_id = 'motovia-8' AND company_id = 'motovia';
UPDATE fines SET moto_id = 'a989b74b-5cfd-4031-a2b0-d99b30f9c35e' WHERE moto_id = 'motovia-9' AND company_id = 'motovia';

UPDATE fines SET cliente_id = 'c55a6a4d-b833-4acd-9393-3f9b34b547eb' WHERE cliente_id = 'mv-cli-1' AND company_id = 'motovia';
UPDATE fines SET cliente_id = '19215922-de4d-49c8-8b5f-52ebd7a777f4' WHERE cliente_id = 'mv-cli-2' AND company_id = 'motovia';
UPDATE fines SET cliente_id = '2ccb9395-1674-450a-a6a3-46336dcf0f33' WHERE cliente_id = 'mv-cli-3' AND company_id = 'motovia';
UPDATE fines SET cliente_id = 'b72d2964-31ae-4fb4-a6f2-ee8a496174a0' WHERE cliente_id = 'mv-cli-4' AND company_id = 'motovia';
UPDATE fines SET cliente_id = 'a654c285-fb0c-4610-ab5c-56dc947e37e9' WHERE cliente_id = 'mv-cli-5' AND company_id = 'motovia';
UPDATE fines SET cliente_id = '3da8b6da-49c3-479b-9ab7-24170580842a' WHERE cliente_id = 'mv-cli-6' AND company_id = 'motovia';
UPDATE fines SET cliente_id = 'e00ec4c5-e19c-495f-a1bf-b2bb51539ffa' WHERE cliente_id = 'mv-cli-7' AND company_id = 'motovia';
UPDATE fines SET cliente_id = 'ae423522-338f-4663-b224-7af7f0b75c9a' WHERE cliente_id = 'mv-cli-8' AND company_id = 'motovia';

-- Fix legacy moto_id in maintenance
UPDATE maintenance SET moto_id = '02f249dd-efab-4dfb-815c-1ef691a785ea' WHERE moto_id = 'motovia-1' AND company_id = 'motovia';
UPDATE maintenance SET moto_id = '9235a69c-fcf4-4463-984c-3f2170a9f1a4' WHERE moto_id = 'motovia-2' AND company_id = 'motovia';
UPDATE maintenance SET moto_id = '766a6157-618d-4f57-ab25-6dfaa4d89070' WHERE moto_id = 'motovia-3' AND company_id = 'motovia';
UPDATE maintenance SET moto_id = '1ca994b1-2698-4306-93c0-90b9cd5cfa00' WHERE moto_id = 'motovia-4' AND company_id = 'motovia';
UPDATE maintenance SET moto_id = 'b1b9060e-f284-4d91-822d-cad8c5200f8e' WHERE moto_id = 'motovia-5' AND company_id = 'motovia';
UPDATE maintenance SET moto_id = 'c3ebb04f-30e0-479a-a787-4b2894c9361c' WHERE moto_id = 'motovia-6' AND company_id = 'motovia';
UPDATE maintenance SET moto_id = '42fe8265-4641-4d05-af30-3dfd515a8354' WHERE moto_id = 'motovia-7' AND company_id = 'motovia';
UPDATE maintenance SET moto_id = 'bfaaab9f-31e6-4047-9855-11e753be7e2b' WHERE moto_id = 'motovia-8' AND company_id = 'motovia';
UPDATE maintenance SET moto_id = 'a989b74b-5cfd-4031-a2b0-d99b30f9c35e' WHERE moto_id = 'motovia-9' AND company_id = 'motovia';
