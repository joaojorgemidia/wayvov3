-- Remove a conta "Caixa" criada por engano (apenas 1 lançamento com esse nome)
UPDATE public.bank_accounts SET deleted_at = now()
WHERE id = '93ec5592-5955-429e-9cc9-8a4c59085642';

-- Adicionar contas Dinheiro e Mercado Pago para motovia
INSERT INTO public.bank_accounts (company_id, nome, banco, saldo_inicial)
VALUES
  ('motovia-locadora-de-motos-000144', 'Dinheiro', 'Dinheiro', 0),
  ('motovia-locadora-de-motos-000144', 'Mercado Pago', 'Mercado Pago', 0);