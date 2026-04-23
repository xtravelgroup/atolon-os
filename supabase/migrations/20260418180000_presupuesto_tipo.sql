-- Reestructurar: 3 tipos (ingreso/costo/gasto) + categorías nuevas de ingresos

-- 1. Agregar columna tipo
ALTER TABLE presupuesto_anual ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'gasto'
  CHECK (tipo IN ('ingreso','costo','gasto'));

-- 2. Migrar data existente (boolean es_ingreso → text tipo)
UPDATE presupuesto_anual SET tipo = CASE WHEN es_ingreso THEN 'ingreso' ELSE 'gasto' END WHERE tipo = 'gasto' OR tipo IS NULL;

-- 3. Limpiar categorías viejas del 2026 para reseed
DELETE FROM presupuesto_anual WHERE year = 2026;

-- 4. Seed con estructura nueva
-- INGRESOS
INSERT INTO presupuesto_anual (year, categoria, tipo, es_ingreso, orden, budget) VALUES
  (2026, 'Pasadías',             'ingreso', true,  10, '[150,130,145,120,100,85,70,75,90,110,130,155]'::jsonb),
  (2026, 'Eventos y Grupos',     'ingreso', true,  20, '[45,35,42,38,30,25,20,22,30,35,40,50]'::jsonb),
  (2026, 'Alimentos y Bebidas',  'ingreso', true,  30, '[30,26,30,25,22,18,15,16,20,25,28,35]'::jsonb),
  (2026, 'Otros',                'ingreso', true,  40, '[18,15,17,14,12,10,8,9,12,15,17,20]'::jsonb),
-- COSTOS (costos directos operativos)
  (2026, 'Costo A&B',            'costo',   false, 110, '[10,8,10,8,6,5,4,5,6,8,10,12]'::jsonb),
  (2026, 'Combustible Lanchas',  'costo',   false, 120, '[12,11,12,10,9,8,7,7,9,10,11,13]'::jsonb),
  (2026, 'Operación Muelle/Isla','costo',   false, 130, '[8,7,8,7,6,5,4,5,6,7,8,9]'::jsonb),
-- GASTOS (administrativos y fijos)
  (2026, 'Nómina',               'gasto',   false, 210, '[48,48,48,48,48,48,48,48,48,48,48,52]'::jsonb),
  (2026, 'Mantenimiento',        'gasto',   false, 220, '[8,8,8,8,8,8,8,8,8,8,8,8]'::jsonb),
  (2026, 'Marketing',            'gasto',   false, 230, '[6,5,6,5,4,4,3,4,5,6,7,8]'::jsonb),
  (2026, 'Administrativos',      'gasto',   false, 240, '[5,5,5,5,5,5,5,5,5,5,5,5]'::jsonb)
ON CONFLICT (year, categoria) DO NOTHING;
