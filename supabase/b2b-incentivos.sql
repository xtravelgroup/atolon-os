-- ══════════════════════════════════════════════════════════════════════════
-- PROGRAMAS DE INCENTIVOS B2B
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS b2b_incentivos (
  id text PRIMARY KEY,
  -- NULL = aplica a todas las agencias, texto = solo a ese aliado_id
  aliado_id text REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  -- Tipo de meta a alcanzar
  tipo text NOT NULL CHECK (tipo IN ('meta_pax', 'meta_revenue', 'meta_reservas', 'especial')),
  meta_valor numeric DEFAULT 0,
  -- Qué gana la agencia al cumplir
  beneficio text,
  fecha_inicio date,
  fecha_fin date,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incentivos_aliado ON b2b_incentivos (aliado_id);

ALTER TABLE b2b_incentivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incentivos_all" ON b2b_incentivos;
CREATE POLICY "incentivos_all" ON b2b_incentivos FOR ALL USING (true) WITH CHECK (true);
