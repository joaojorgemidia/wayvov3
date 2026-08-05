ALTER TABLE public.motorcycles
  ADD COLUMN categoria_veiculo TEXT NOT NULL DEFAULT 'moto';

COMMENT ON COLUMN public.motorcycles.categoria_veiculo IS
  'Tipo de veículo: moto ou carro. Cadastro de carros é usado apenas pela locadora Loca2Rodas.';
