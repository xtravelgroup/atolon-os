-- ═══════════════════════════════════════════════════════════════════════
-- Extender maestro `embarcaciones` con datos legales y bancarios
-- Reemplaza el enfoque previo de tabla paralela embarcacion_proveedores.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE embarcaciones
  ADD COLUMN IF NOT EXISTS propietario_nombre    text,
  ADD COLUMN IF NOT EXISTS propietario_documento text,
  ADD COLUMN IF NOT EXISTS propietario_telefono  text,
  ADD COLUMN IF NOT EXISTS propietario_email     text,
  ADD COLUMN IF NOT EXISTS banco                 text,
  ADD COLUMN IF NOT EXISTS cuenta_tipo           text,
  ADD COLUMN IF NOT EXISTS cuenta_numero         text,
  ADD COLUMN IF NOT EXISTS cuenta_titular        text,
  ADD COLUMN IF NOT EXISTS rut_url               text,
  ADD COLUMN IF NOT EXISTS certificacion_bancaria_url text;

-- Storage bucket (rehusar el mismo)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('embarcacion-docs', 'embarcacion-docs', true)
  ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Quitar dependencia obsoleta y limpiar tabla previa (estaba vacía)
ALTER TABLE embarcacion_solicitudes DROP COLUMN IF EXISTS embarcacion_proveedor_id;
DROP TABLE IF EXISTS embarcacion_proveedores;
