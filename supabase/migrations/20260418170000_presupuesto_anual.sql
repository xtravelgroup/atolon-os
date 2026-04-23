-- Presupuesto anual editable por categoría
CREATE TABLE IF NOT EXISTS presupuesto_anual (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year        int NOT NULL,
  categoria   text NOT NULL,
  es_ingreso  boolean DEFAULT true,
  orden       int DEFAULT 0,
  budget      jsonb DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
  actual      jsonb DEFAULT '[null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(year, categoria)
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_year ON presupuesto_anual(year);

ALTER TABLE presupuesto_anual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presup_auth_all" ON presupuesto_anual;
CREATE POLICY "presup_auth_all" ON presupuesto_anual FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed con las categorías actuales
INSERT INTO presupuesto_anual (year, categoria, es_ingreso, orden, budget) VALUES
  (2026, 'Pasadías',      true,  1, '[150,130,145,120,100,85,70,75,90,110,130,155]'::jsonb),
  (2026, 'Eventos',       true,  2, '[45,35,42,38,30,25,20,22,30,35,40,50]'::jsonb),
  (2026, 'B2B',           true,  3, '[18,15,17,14,12,10,8,9,12,15,17,20]'::jsonb),
  (2026, 'F&B',           true,  4, '[30,26,30,25,22,18,15,16,20,25,28,35]'::jsonb),
  (2026, 'Nómina',        false, 5, '[48,48,48,48,48,48,48,48,48,48,48,52]'::jsonb),
  (2026, 'Combustible',   false, 6, '[12,11,12,10,9,8,7,7,9,10,11,13]'::jsonb),
  (2026, 'Mantenimiento', false, 7, '[8,8,8,8,8,8,8,8,8,8,8,8]'::jsonb),
  (2026, 'Marketing',     false, 8, '[6,5,6,5,4,4,3,4,5,6,7,8]'::jsonb)
ON CONFLICT (year, categoria) DO NOTHING;
