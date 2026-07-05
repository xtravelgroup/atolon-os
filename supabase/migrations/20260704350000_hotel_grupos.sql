-- Grupos de reserva con tarifas contratadas — dirección 2026-07-04.
-- Uso: se crea un grupo (empresa/evento) con tarifas negociadas y un rango
-- de fechas disponibles. Se genera un slug único y se comparte el link
-- público. Cada miembro del grupo entra al link, elige fechas dentro del
-- rango, y reserva pagando con la tarifa contratada.

CREATE TABLE IF NOT EXISTS public.hotel_grupos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text UNIQUE NOT NULL,          -- token para el link público
  nombre               text NOT NULL,                 -- empresa / evento
  descripcion          text,
  contacto_nombre      text,
  contacto_email       text,
  contacto_telefono    text,
  fecha_desde          date NOT NULL,                 -- rango de fechas permitidas
  fecha_hasta          date NOT NULL,
  cupo_habitaciones    int  DEFAULT 0,                -- 0 = sin límite; N = tope de reservas del grupo
  habitaciones_reservadas int DEFAULT 0,              -- contador (se actualiza al confirmar reservas)
  link_expira_at       timestamptz,                   -- opcional: fecha en que el link deja de funcionar
  estado               text DEFAULT 'activo',         -- activo | agotado | vencido | cerrado
  moneda               text DEFAULT 'COP',
  incluye              text,                          -- ej. "desayuno incluido, wifi"
  notas                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  created_by           text,
  CONSTRAINT hotel_grupos_fechas_ok CHECK (fecha_hasta >= fecha_desde),
  CONSTRAINT hotel_grupos_estado_ok CHECK (estado IN ('activo','agotado','vencido','cerrado'))
);

CREATE INDEX IF NOT EXISTS idx_hotel_grupos_slug   ON public.hotel_grupos(slug);
CREATE INDEX IF NOT EXISTS idx_hotel_grupos_estado ON public.hotel_grupos(estado);
CREATE INDEX IF NOT EXISTS idx_hotel_grupos_fechas ON public.hotel_grupos(fecha_desde, fecha_hasta);

-- Tarifas por categoría de habitación dentro del grupo.
CREATE TABLE IF NOT EXISTS public.hotel_grupos_tarifas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id       uuid NOT NULL REFERENCES public.hotel_grupos(id) ON DELETE CASCADE,
  categoria_id   uuid NOT NULL REFERENCES public.hotel_categorias(id) ON DELETE CASCADE,
  precio_noche   numeric NOT NULL DEFAULT 0,
  disponible     boolean DEFAULT true,               -- desactivar categoría específica sin borrar la fila
  notas          text,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (grupo_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_grupos_tarifas_grupo ON public.hotel_grupos_tarifas(grupo_id);

-- Trackear qué estancias vienen de un grupo (para reportes y ocupación).
ALTER TABLE public.hotel_estancias
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.hotel_grupos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_estancias_grupo ON public.hotel_estancias(grupo_id);

-- RLS: authenticated puede all en admin. anon puede SELECT solo por slug
-- válido (la página pública consultará por slug).
ALTER TABLE public.hotel_grupos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_hotel_grupos" ON public.hotel_grupos;
CREATE POLICY "auth_all_hotel_grupos" ON public.hotel_grupos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select_hotel_grupos_by_slug" ON public.hotel_grupos;
CREATE POLICY "anon_select_hotel_grupos_by_slug" ON public.hotel_grupos
  FOR SELECT TO anon USING (estado = 'activo');

ALTER TABLE public.hotel_grupos_tarifas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_hotel_grupos_tarifas" ON public.hotel_grupos_tarifas;
CREATE POLICY "auth_all_hotel_grupos_tarifas" ON public.hotel_grupos_tarifas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select_hotel_grupos_tarifas" ON public.hotel_grupos_tarifas;
CREATE POLICY "anon_select_hotel_grupos_tarifas" ON public.hotel_grupos_tarifas
  FOR SELECT TO anon USING (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_hotel_grupos_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hotel_grupos_updated_at ON public.hotel_grupos;
CREATE TRIGGER hotel_grupos_updated_at
  BEFORE UPDATE ON public.hotel_grupos
  FOR EACH ROW EXECUTE FUNCTION update_hotel_grupos_updated_at();
