-- ══════════════════════════════════════════════════════════════════════════
-- SISTEMA DE PUNTOS B2B — AtoCoins
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- Tabla de configuración de reglas de puntos
CREATE TABLE IF NOT EXISTS b2b_puntos_config (
  id text PRIMARY KEY DEFAULT 'default',
  activo boolean DEFAULT true,
  nombre text DEFAULT 'AtoCoins',
  puntos_por_reserva integer DEFAULT 100,
  puntos_por_pax integer DEFAULT 10,
  puntos_por_millon integer DEFAULT 50,
  bonus_grupo_10_pax integer DEFAULT 150,
  bonus_fin_semana integer DEFAULT 75,
  bonus_primera_reserva_mes integer DEFAULT 200,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insertar config por defecto si no existe
INSERT INTO b2b_puntos_config (id, activo, nombre, puntos_por_reserva, puntos_por_pax, puntos_por_millon, bonus_grupo_10_pax, bonus_fin_semana, bonus_primera_reserva_mes)
VALUES ('default', true, 'AtoCoins', 100, 10, 50, 150, 75, 200)
ON CONFLICT (id) DO NOTHING;

-- Tabla historial de puntos (modelo transaccional)
CREATE TABLE IF NOT EXISTS b2b_puntos_historial (
  id text PRIMARY KEY,
  vendedor_id text REFERENCES b2b_usuarios(id) ON DELETE CASCADE,
  aliado_id text REFERENCES aliados_b2b(id) ON DELETE SET NULL,
  reserva_id text,
  puntos integer NOT NULL DEFAULT 0,
  concepto text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('credito', 'debito', 'bonus', 'ajuste')),
  created_at timestamptz DEFAULT now()
);

-- Índices para consultas de ranking y balance
CREATE INDEX IF NOT EXISTS idx_puntos_historial_vendedor ON b2b_puntos_historial (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_puntos_historial_aliado ON b2b_puntos_historial (aliado_id);

-- RLS
ALTER TABLE b2b_puntos_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_puntos_historial ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas (ajustar según necesidades de seguridad)
-- Nota: DROP + CREATE porque Supabase no soporta CREATE POLICY IF NOT EXISTS
DROP POLICY IF EXISTS "puntos_config_all" ON b2b_puntos_config;
CREATE POLICY "puntos_config_all" ON b2b_puntos_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "puntos_historial_all" ON b2b_puntos_historial;
CREATE POLICY "puntos_historial_all" ON b2b_puntos_historial FOR ALL USING (true) WITH CHECK (true);
