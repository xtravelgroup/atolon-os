-- Postulaciones: permitir CVs sin vacante específica (inbox de oportunidades).
-- ──────────────────────────────────────────────────────────────────
-- Hasta ahora rh_postulaciones requería vacante_id (FK NOT NULL). Ahora
-- permitimos NULL para CVs que llegan sin vacante asignada — vienen del
-- email oportunidades@atolon.co o del formulario "trabajá con nosotros".
-- En la UI aparecen en un tab "Inbox" hasta que un admin las asigna a
-- una vacante específica o las descarta.

-- 1. Hacer vacante_id nullable
ALTER TABLE rh_postulaciones
  ALTER COLUMN vacante_id DROP NOT NULL;

-- 2. Nuevos campos para CVs llegados por email
ALTER TABLE rh_postulaciones
  ADD COLUMN IF NOT EXISTS email_subject     text,
  ADD COLUMN IF NOT EXISTS email_body_text   text,
  ADD COLUMN IF NOT EXISTS email_body_html   text,
  ADD COLUMN IF NOT EXISTS email_message_id  text UNIQUE,  -- evitar duplicados
  ADD COLUMN IF NOT EXISTS email_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_raw         jsonb,        -- payload completo del proveedor
  ADD COLUMN IF NOT EXISTS adjuntos          jsonb DEFAULT '[]'::jsonb;  -- [{nombre, url, mime, size}]

-- 3. Asegurar que `fuente` cubra los nuevos casos
-- valores: portal | email | linkedin | referido | inbox_general | otro
COMMENT ON COLUMN rh_postulaciones.fuente IS
  'Origen: portal (form vacante) · inbox_general (form genérico) · email (oportunidades@atolon.co) · linkedin · referido · otro';

-- 4. Índice para listar el inbox rápido
CREATE INDEX IF NOT EXISTS idx_postulaciones_inbox
  ON rh_postulaciones(created_at DESC)
  WHERE vacante_id IS NULL;

-- 5. Anular trigger anti-spam para inbox (no aplica si vacante_id es null)
CREATE OR REPLACE FUNCTION check_postulacion_spam() RETURNS trigger AS $$
DECLARE recientes integer;
BEGIN
  IF NEW.vacante_id IS NULL THEN RETURN NEW; END IF;  -- inbox no aplica
  SELECT COUNT(*) INTO recientes FROM rh_postulaciones
  WHERE email = NEW.email AND vacante_id = NEW.vacante_id
    AND created_at > now() - interval '24 hours';
  IF recientes >= 3 THEN
    RAISE EXCEPTION 'Demasiadas postulaciones recientes a esta vacante. Espera 24 horas.';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
