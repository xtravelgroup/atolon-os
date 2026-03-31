-- ══════════════════════════════════════════════════════════════════════════
-- PREFERENCIAS DE PRECIOS POR AGENCIA
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- Agregar columnas de preferencia de vista de precios a aliados_b2b
-- Valores posibles: 'ambos' | 'solo_publico' | 'solo_neto'
ALTER TABLE aliados_b2b
  ADD COLUMN IF NOT EXISTS precio_vista_admin    text DEFAULT 'ambos',
  ADD COLUMN IF NOT EXISTS precio_vista_vendedor text DEFAULT 'ambos';

-- Restricciones de valor válido
ALTER TABLE aliados_b2b
  DROP CONSTRAINT IF EXISTS check_precio_vista_admin,
  ADD CONSTRAINT check_precio_vista_admin
    CHECK (precio_vista_admin IN ('ambos', 'solo_publico', 'solo_neto'));

ALTER TABLE aliados_b2b
  DROP CONSTRAINT IF EXISTS check_precio_vista_vendedor,
  ADD CONSTRAINT check_precio_vista_vendedor
    CHECK (precio_vista_vendedor IN ('ambos', 'solo_publico', 'solo_neto'));
