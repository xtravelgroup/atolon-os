-- ═══════════════════════════════════════════════════════════════════
-- HISTORIAL DE ACCIONES — Audit log para Atolon OS
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS historial_acciones (
  id            text PRIMARY KEY,
  usuario_email text NOT NULL,
  modulo        text NOT NULL,
  accion        text NOT NULL,
  tabla         text,
  registro_id   text,
  datos_antes   jsonb,
  datos_despues jsonb,
  notas         text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_usuario  ON historial_acciones(usuario_email);
CREATE INDEX IF NOT EXISTS idx_historial_modulo   ON historial_acciones(modulo);
CREATE INDEX IF NOT EXISTS idx_historial_tabla_id ON historial_acciones(tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_historial_created  ON historial_acciones(created_at DESC);

ALTER TABLE historial_acciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON historial_acciones;
CREATE POLICY "allow_all" ON historial_acciones FOR ALL TO anon USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- CIERRES DE CAJA — Registro diario de cajeros
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cierres_caja (
  id                  text PRIMARY KEY,           -- "CC-{timestamp}"
  fecha               date NOT NULL,
  usuario_email       text NOT NULL,
  efectivo_esperado   integer DEFAULT 0,          -- suma reservas forma_pago=Efectivo
  efectivo_contado    integer DEFAULT 0,          -- lo que contó el cajero
  diferencia          integer DEFAULT 0,          -- contado - esperado
  totales_por_forma   jsonb DEFAULT '{}'::jsonb,  -- { "Efectivo": 100000, "Wompi": 200000, ... }
  reservas_count      integer DEFAULT 0,
  total_general       integer DEFAULT 0,
  estado              text DEFAULT 'cerrado',
  notas               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cierres_caja_fecha   ON cierres_caja(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cierres_caja_usuario ON cierres_caja(usuario_email);

ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON cierres_caja;
CREATE POLICY "allow_all" ON cierres_caja FOR ALL TO anon USING (true) WITH CHECK (true);
