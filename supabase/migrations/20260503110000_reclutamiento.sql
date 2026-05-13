-- Reclutamiento: vacantes públicas + portal de postulaciones.
-- ──────────────────────────────────────────────────────────────────
-- rh_vacantes ya existía como tabla de solicitudes internas. La extendemos
-- con campos para hacerla publicable al portal /carreras. Si publicada=true,
-- la vacante aparece en el portal público y los candidatos pueden postular.

-- ─── EXTENDER rh_vacantes ───────────────────────────────────────────
ALTER TABLE rh_vacantes
  ADD COLUMN IF NOT EXISTS codigo            text,
  ADD COLUMN IF NOT EXISTS slug              text,
  ADD COLUMN IF NOT EXISTS responsabilidades text,
  ADD COLUMN IF NOT EXISTS beneficios        text,
  ADD COLUMN IF NOT EXISTS salario_min       numeric,
  ADD COLUMN IF NOT EXISTS salario_max       numeric,
  ADD COLUMN IF NOT EXISTS salario_visible   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS modalidad         text DEFAULT 'presencial',
  ADD COLUMN IF NOT EXISTS ubicacion         text DEFAULT 'Cartagena',
  ADD COLUMN IF NOT EXISTS vacantes_qty      integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS publicada         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_apertura    date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS fecha_cierre      date,
  ADD COLUMN IF NOT EXISTS responsable_id    uuid,
  ADD COLUMN IF NOT EXISTS creado_por        text,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

-- Unicidad para los slugs y códigos (cuando se generen)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vacantes_slug   ON rh_vacantes(slug)   WHERE slug   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vacantes_codigo ON rh_vacantes(codigo) WHERE codigo IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_vacantes_pub     ON rh_vacantes(publicada, estado);

-- ─── POSTULACIONES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_postulaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text UNIQUE,                      -- POS-YYMMDD-XXXX
  vacante_id      uuid NOT NULL REFERENCES rh_vacantes(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  email           text NOT NULL,
  telefono        text,
  cedula          text,
  ciudad          text,
  pais            text DEFAULT 'Colombia',
  fecha_nacimiento date,
  experiencia_anos numeric,
  educacion       text,
  cv_url          text,
  cv_nombre       text,
  carta_motivacion text,
  linkedin_url    text,
  portfolio_url   text,
  fuente          text DEFAULT 'portal',
  estado          text DEFAULT 'recibida',
  motivo_descarte text,
  calificacion    integer,
  responsable_id  uuid,
  notas_internas  text,
  fecha_entrevista timestamptz,
  contratado_at   timestamptz,
  empleado_id     uuid,
  ip              inet,
  user_agent      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_postulaciones_vacante ON rh_postulaciones(vacante_id, estado);
CREATE INDEX IF NOT EXISTS idx_postulaciones_email   ON rh_postulaciones(email);
CREATE INDEX IF NOT EXISTS idx_postulaciones_estado  ON rh_postulaciones(estado, created_at DESC);

-- Anti-spam: máximo 3 postulaciones del mismo email a la misma vacante en 24h
CREATE OR REPLACE FUNCTION check_postulacion_spam() RETURNS trigger AS $$
DECLARE recientes integer;
BEGIN
  SELECT COUNT(*) INTO recientes FROM rh_postulaciones
  WHERE email = NEW.email AND vacante_id = NEW.vacante_id
    AND created_at > now() - interval '24 hours';
  IF recientes >= 3 THEN
    RAISE EXCEPTION 'Demasiadas postulaciones recientes a esta vacante. Espera 24 horas.';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_postulacion_spam ON rh_postulaciones;
CREATE TRIGGER trg_postulacion_spam BEFORE INSERT ON rh_postulaciones
  FOR EACH ROW EXECUTE FUNCTION check_postulacion_spam();

-- ─── EVENTOS / BITÁCORA ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rh_postulaciones_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postulacion_id  uuid NOT NULL REFERENCES rh_postulaciones(id) ON DELETE CASCADE,
  tipo            text NOT NULL,
  estado_anterior text,
  estado_nuevo    text,
  descripcion     text,
  metadata        jsonb,
  autor           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_postulacion_eventos ON rh_postulaciones_eventos(postulacion_id, created_at DESC);

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE rh_vacantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_postulaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_postulaciones_eventos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='rh_vacantes'::regclass AND polname='vacantes_anon_select_publicas') THEN
    EXECUTE 'CREATE POLICY vacantes_anon_select_publicas ON rh_vacantes FOR SELECT TO anon USING (publicada = true AND estado = ''abierta'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='rh_vacantes'::regclass AND polname='vacantes_auth_all') THEN
    EXECUTE 'CREATE POLICY vacantes_auth_all ON rh_vacantes FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='rh_postulaciones'::regclass AND polname='postulaciones_anon_insert') THEN
    EXECUTE 'CREATE POLICY postulaciones_anon_insert ON rh_postulaciones FOR INSERT TO anon WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='rh_postulaciones'::regclass AND polname='postulaciones_auth_all') THEN
    EXECUTE 'CREATE POLICY postulaciones_auth_all ON rh_postulaciones FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='rh_postulaciones_eventos'::regclass AND polname='eventos_auth_all') THEN
    EXECUTE 'CREATE POLICY eventos_auth_all ON rh_postulaciones_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─── BUCKET DE STORAGE PARA CVs ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cv-postulaciones', 'cv-postulaciones', false, 10485760,
        ARRAY['application/pdf','application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='cv_anon_upload') THEN
    EXECUTE 'CREATE POLICY cv_anon_upload ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = ''cv-postulaciones'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='cv_auth_all') THEN
    EXECUTE 'CREATE POLICY cv_auth_all ON storage.objects FOR ALL TO authenticated USING (bucket_id = ''cv-postulaciones'') WITH CHECK (bucket_id = ''cv-postulaciones'')';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
