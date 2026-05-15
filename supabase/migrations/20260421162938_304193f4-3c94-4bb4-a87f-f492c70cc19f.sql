
UPDATE public.financial_entries SET categoria = 'caucao'                 WHERE categoria = 'caução'             AND tipo = 'receita';
UPDATE public.financial_entries SET categoria = 'manutencao_receita'     WHERE categoria = 'manutenção'         AND tipo = 'receita';
UPDATE public.financial_entries SET categoria = 'multa_transito_receita' WHERE categoria = 'multa de trânsito'  AND tipo = 'receita';
UPDATE public.financial_entries SET categoria = 'venda_moto'             WHERE categoria = 'venda de moto'      AND tipo = 'receita';
UPDATE public.financial_entries SET categoria = 'pecas_receita'          WHERE categoria = 'peças'              AND tipo = 'receita';
UPDATE public.financial_entries SET categoria = 'juros_atraso'           WHERE categoria = 'juros por atraso'   AND tipo = 'receita';
UPDATE public.financial_entries SET categoria = 'outro_receita'          WHERE categoria = 'outros'             AND tipo = 'receita';

UPDATE public.financial_entries SET categoria = 'compra_moto'            WHERE categoria = 'compra de moto'     AND tipo = 'despesa';
UPDATE public.financial_entries SET categoria = 'manutencao_despesa'     WHERE categoria = 'manutenção'         AND tipo = 'despesa';
UPDATE public.financial_entries SET categoria = 'multa_transito'         WHERE categoria = 'multa de trânsito'  AND tipo = 'despesa';
UPDATE public.financial_entries SET categoria = 'lava_jato'              WHERE categoria = 'lava-jato'          AND tipo = 'despesa';
UPDATE public.financial_entries SET categoria = 'outro_despesa'          WHERE categoria = 'outros'             AND tipo = 'despesa';

UPDATE public.financial_entries SET categoria = 'ajuste_saldo'           WHERE categoria = 'ajuste de saldo';

UPDATE public.financial_entries SET subcategoria = 'Administradora de Cobranças' WHERE subcategoria = 'administradora de cobranças';
UPDATE public.financial_entries SET subcategoria = 'Alimentação'                 WHERE subcategoria = 'alimentação';
UPDATE public.financial_entries SET subcategoria = 'Corretiva'                   WHERE subcategoria = 'corretiva';
UPDATE public.financial_entries SET subcategoria = 'Financiamento'               WHERE subcategoria = 'financiamento';
UPDATE public.financial_entries SET subcategoria = 'Folha de Pagamento'          WHERE subcategoria = 'folha de pagamento';
UPDATE public.financial_entries SET subcategoria = 'IPVA'                        WHERE subcategoria = 'ipva';
UPDATE public.financial_entries SET subcategoria = 'Licenciamento'               WHERE subcategoria = 'licenciamento';
UPDATE public.financial_entries SET subcategoria = 'MEI'                         WHERE subcategoria = 'mei';
UPDATE public.financial_entries SET subcategoria = 'Parcelamento'                WHERE subcategoria = 'parcelamento';
UPDATE public.financial_entries SET subcategoria = 'Peças/Serviços'              WHERE subcategoria = 'peças/serviços';
UPDATE public.financial_entries SET subcategoria = 'Preventiva'                  WHERE subcategoria = 'preventiva';
UPDATE public.financial_entries SET subcategoria = 'Sinistro Seguro'             WHERE subcategoria = 'sinistro seguro';
UPDATE public.financial_entries SET subcategoria = 'Tráfego Pago'                WHERE subcategoria = 'tráfego pago';
UPDATE public.financial_entries SET subcategoria = 'Transporte'                  WHERE subcategoria = 'transporte';
