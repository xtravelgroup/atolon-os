-- Módulo RRHH — Manuales / Documentos internos

CREATE TABLE IF NOT EXISTS public.rh_manuales (
  id             text PRIMARY KEY,
  titulo         text NOT NULL,
  descripcion    text,
  categoria      text,          -- Seguridad, Servicio, Operaciones, Onboarding, etc.
  departamento_id text,         -- opcional — si es específico a un depto
  url            text,          -- archivo en Storage (PDF, doc)
  url_nombre     text,          -- nombre original del archivo
  tipo_archivo   text,          -- pdf, docx, img, video, link
  version        text DEFAULT '1.0',
  requerido      boolean DEFAULT false,  -- si todos los empleados deben leerlo
  activo         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  created_by     text,
  notas          text
);

CREATE INDEX IF NOT EXISTS idx_rh_manuales_cat ON public.rh_manuales(categoria);
CREATE INDEX IF NOT EXISTS idx_rh_manuales_activo ON public.rh_manuales(activo);

-- Acuses: tracking de quién ha leído/confirmado cada manual
CREATE TABLE IF NOT EXISTS public.rh_manual_acuses (
  id           text PRIMARY KEY,
  manual_id    text NOT NULL REFERENCES public.rh_manuales(id) ON DELETE CASCADE,
  empleado_id  text NOT NULL,
  empleado_nombre text,
  fecha_acuse  timestamptz DEFAULT now(),
  firma_ip     text,
  notas        text,
  UNIQUE (manual_id, empleado_id)
);

CREATE INDEX IF NOT EXISTS idx_rh_manual_acuses_manual ON public.rh_manual_acuses(manual_id);
CREATE INDEX IF NOT EXISTS idx_rh_manual_acuses_emp ON public.rh_manual_acuses(empleado_id);

-- RLS
ALTER TABLE public.rh_manuales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_manual_acuses  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_rh_manuales"      ON public.rh_manuales;
DROP POLICY IF EXISTS "auth_all_rh_manual_acuses" ON public.rh_manual_acuses;

CREATE POLICY "auth_all_rh_manuales"      ON public.rh_manuales      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_rh_manual_acuses" ON public.rh_manual_acuses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket de storage para manuales (público para lectura)
INSERT INTO storage.buckets (id, name, public)
VALUES ('rh-manuales', 'rh-manuales', true)
ON CONFLICT (id) DO NOTHING;
