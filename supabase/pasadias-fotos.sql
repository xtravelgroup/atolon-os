-- ══════════════════════════════════════════════════════
-- Fotos de pasadias para el widget web
-- ══════════════════════════════════════════════════════

ALTER TABLE pasadias ADD COLUMN IF NOT EXISTS foto_principal_url text;
ALTER TABLE pasadias ADD COLUMN IF NOT EXISTS fotos_adicionales text[] DEFAULT '{}';
