-- Bitácora de lanchas: consumo de gasolina, mantenimiento, inspecciones, incidentes
-- Un registro por cada evento operativo de cada embarcación.

-- Catálogo maestro de lanchas (si no existe)
CREATE TABLE IF NOT EXISTS public.lanchas (
  id              text PRIMARY KEY,
  nombre          text NOT NULL UNIQUE,       -- Castillete, Naturalle
  matricula       text,
  capacidad_pax   int,
  capacidad_tanque_gal numeric,               -- capacidad tanque en galones
  motor           text,                        -- modelo/tipo de motor
  modelo          text,
  ano             int,
  capitan_default text,
  foto_url        text,
  activo          boolean DEFAULT true,
  notas           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.lanchas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lanchas_all" ON public.lanchas;
CREATE POLICY "lanchas_all" ON public.lanchas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.lanchas TO anon, authenticated;

-- Seed inicial
INSERT INTO public.lanchas (id, nombre, activo)
VALUES ('LCH-CASTILLETE', 'Castillete', true),
       ('LCH-NATURALLE',  'Naturalle',  true)
ON CONFLICT (id) DO NOTHING;

-- Bitácora: eventos operativos de cada lancha
CREATE TABLE IF NOT EXISTS public.lancha_bitacora (
  id              text PRIMARY KEY,
  lancha_id       text REFERENCES public.lanchas(id) ON DELETE CASCADE,
  lancha_nombre   text,              -- snapshot para query rápido
  fecha           date NOT NULL,
  hora            time,
  tipo            text NOT NULL,     -- combustible | mantenimiento | inspeccion | incidente | reparacion | limpieza | viaje | otro
  subtipo         text,              -- ej: 'cambio_aceite', 'filtro_combustible', 'motor_principal'
  descripcion     text,
  -- Combustible
  galones         numeric,
  precio_galon    numeric,
  costo_total     numeric,           -- computed si no se pasa; sirve también para otros tipos con costo
  kilometraje_h   numeric,           -- horas de motor al momento del evento
  -- Mantenimiento
  proveedor       text,
  taller          text,
  proximo_servicio_h numeric,        -- horas motor para próximo servicio
  proximo_servicio_fecha date,
  -- Incidentes / reparaciones
  severidad       text,              -- leve | moderada | grave | critica
  resuelto        boolean DEFAULT false,
  -- Meta
  foto_url        text,
  factura_url     text,
  capitan         text,
  registrado_por  text,
  notas           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_lancha      ON public.lancha_bitacora(lancha_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha       ON public.lancha_bitacora(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_tipo        ON public.lancha_bitacora(tipo);
CREATE INDEX IF NOT EXISTS idx_bitacora_lancha_fecha ON public.lancha_bitacora(lancha_id, fecha DESC);

ALTER TABLE public.lancha_bitacora ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lancha_bitacora_all" ON public.lancha_bitacora;
CREATE POLICY "lancha_bitacora_all" ON public.lancha_bitacora FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.lancha_bitacora TO anon, authenticated;

-- Bucket para fotos y facturas (público lectura)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lanchas', 'lanchas', true)
ON CONFLICT (id) DO NOTHING;
