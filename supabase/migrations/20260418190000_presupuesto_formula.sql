-- Agregar soporte de fórmulas a presupuesto_anual
-- Ej: Costo A&B = 30% × Budget de "Alimentos y Bebidas"

ALTER TABLE presupuesto_anual ADD COLUMN IF NOT EXISTS formula_pct numeric;
ALTER TABLE presupuesto_anual ADD COLUMN IF NOT EXISTS formula_source text;  -- referencia a otra categoria.nombre

-- Configurar Costo A&B = 30% de Alimentos y Bebidas
UPDATE presupuesto_anual SET
  formula_pct = 30,
  formula_source = 'Alimentos y Bebidas',
  updated_at = now()
WHERE year = 2026 AND categoria = 'Costo A&B';
