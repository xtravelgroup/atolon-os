-- ═══════════════════════════════════════════════
-- RNT HISTORIAL — tabla de versiones anteriores
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS b2b_rnt_historial (
  id          text PRIMARY KEY,
  aliado_id   text REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  rnt_url     text NOT NULL,
  subido_en   timestamptz DEFAULT now(),
  subido_por  text DEFAULT 'portal'   -- 'portal' | 'admin'
);
ALTER TABLE b2b_rnt_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON b2b_rnt_historial FOR ALL TO anon USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════
-- Columnas de cert bancaria pendiente (por si no existen)
-- ═══════════════════════════════════════════════
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS cert_bancaria_pendiente_url     text;
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS cert_bancaria_solicitud_fecha   timestamptz;
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS cert_bancaria_solicitud_nota    text;

-- ═══════════════════════════════════════════════
-- Columna rnt_pendiente_url (limpieza por si fue creada antes)
-- ═══════════════════════════════════════════════
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS rnt_pendiente_url text;
