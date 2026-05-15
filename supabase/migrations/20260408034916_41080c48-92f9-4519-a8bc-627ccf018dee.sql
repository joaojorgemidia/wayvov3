
DELETE FROM rentals 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY moto_id, cliente_id, status, company_id ORDER BY created_at ASC) as rn
    FROM rentals
    WHERE company_id = 'motovia' AND status = 'ativa'
  ) sub WHERE rn > 1
);
