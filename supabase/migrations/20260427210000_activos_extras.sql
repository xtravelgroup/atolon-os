-- Extras para activos: ubicación física + áreas dinámicas + fotos
ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS ubicacion text;

-- Tabla de áreas (gestionable desde la UI)
CREATE TABLE IF NOT EXISTS public.activos_areas (
  id          text PRIMARY KEY,
  nombre      text UNIQUE NOT NULL,
  color       text DEFAULT '#8ECAE6',
  icono       text,
  orden       int DEFAULT 0,
  activa      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.activos_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activos_areas_all" ON public.activos_areas;
CREATE POLICY "activos_areas_all" ON public.activos_areas
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.activos_areas TO anon, authenticated;

-- Áreas iniciales (idempotente)
INSERT INTO public.activos_areas (id, nombre, color, icono, orden) VALUES
  ('AREA-BEACH-CLUB',     'Beach Club',     '#8ECAE6', '🏖',  10),
  ('AREA-HOTEL',          'Hotel',          '#a78bfa', '🏨',  20),
  ('AREA-COCINA',         'Cocina',         '#f59e0b', '🍳',  30),
  ('AREA-BAR',            'Bar',            '#ec4899', '🍸',  40),
  ('AREA-EVENTOS',        'Eventos',        '#C8B99A', '🎉',  50),
  ('AREA-LAVANDERIA',     'Lavandería',     '#22c55e', '🧺',  60),
  ('AREA-MANTENIMIENTO',  'Mantenimiento',  '#64748b', '🔧',  70),
  ('AREA-MUELLE',         'Muelle',         '#0ea5e9', '⚓',  80),
  ('AREA-OFICINA',        'Oficina',        '#94a3b8', '🖥',  90),
  ('AREA-FLOTA',          'Flota',          '#3b82f6', '🛥', 100)
ON CONFLICT (id) DO NOTHING;

-- Bucket de storage para fotos de activos (idempotente)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('activos', 'activos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy permisiva para el bucket
DROP POLICY IF EXISTS "activos_storage_all" ON storage.objects;
CREATE POLICY "activos_storage_all" ON storage.objects
  FOR ALL TO authenticated, anon
  USING (bucket_id = 'activos')
  WITH CHECK (bucket_id = 'activos');
