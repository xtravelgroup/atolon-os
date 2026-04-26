-- Fase 1B: Bodegas adicionales + mini-bar por habitación + tabla de ajustes
-- 1. 25 mini-bars (uno por habitación) — coexisten con minibar_stock_habitacion
-- 2. 5 bodegas funcionales: Lavandería, Mantenimiento, Hotel, Beach Club, Eventos
-- 3. Tabla items_ajustes para auditoría de ajustes manuales (Atolón ↔ Loggro)

-- ── 1. Mini-bars: 1 bodega por habitación activa ───────────────────────────
-- Vincular cada locación con la habitación vía habitacion_id (FK)
ALTER TABLE public.items_locaciones
  ADD COLUMN IF NOT EXISTS habitacion_id uuid REFERENCES public.hotel_habitaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_items_locaciones_habitacion ON public.items_locaciones(habitacion_id);

-- Insertar 1 locación por habitación (idempotente: ON CONFLICT)
INSERT INTO public.items_locaciones (id, nombre, descripcion, es_principal, es_ventas, es_recepcion, activa, icono, orden, habitacion_id)
SELECT
  'LOC-MINIBAR-' || numero,
  'Mini Bar ' || numero,
  'Mini bar de habitación ' || numero || ' (' || categoria || ')',
  false, false, false, true,
  '🛏️',
  100 + ROW_NUMBER() OVER (ORDER BY numero),
  id
FROM public.hotel_habitaciones
WHERE estado IS NULL OR estado != 'inactiva'
ON CONFLICT (id) DO NOTHING;

-- ── 2. Bodegas funcionales adicionales ─────────────────────────────────────
INSERT INTO public.items_locaciones (id, nombre, descripcion, es_principal, es_ventas, es_recepcion, activa, icono, orden)
VALUES
  ('LOC-LAVANDERIA',    'Lavandería',    'Insumos de lavandería (jabón, suavizante, blanqueador)',  false, false, false, true, '🧺', 30),
  ('LOC-MANTENIMIENTO', 'Mantenimiento', 'Insumos y repuestos de mantenimiento',                    false, false, false, true, '🔧', 31),
  ('LOC-HOTEL',         'Hotel',         'Amenities y suministros generales del hotel',             false, false, false, true, '🏨', 32),
  ('LOC-BEACHCLUB',     'Beach Club',    'Bodega exterior del beach club (toallas, hamacas, etc)',  false, false, false, true, '🏖️', 33),
  ('LOC-EVENTOS',       'Eventos',       'Bodega de eventos / decoración',                          false, false, false, true, '🎉', 34)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Tabla de ajustes (auditoría de cambios manuales con justificación) ──
CREATE TABLE IF NOT EXISTS public.items_ajustes (
  id              text PRIMARY KEY,
  item_id         text NOT NULL REFERENCES public.items_catalogo(id) ON DELETE CASCADE,
  locacion_id     text REFERENCES public.items_locaciones(id) ON DELETE SET NULL,
  tipo            text NOT NULL,           -- "atolon_a_loggro" | "loggro_a_atolon" | "manual" | "merma" | "transferencia"
  cantidad_antes  numeric NOT NULL DEFAULT 0,
  cantidad_despues numeric NOT NULL DEFAULT 0,
  diferencia      numeric NOT NULL DEFAULT 0,
  motivo          text NOT NULL,           -- justificación obligatoria
  usuario_email   text,
  loggro_response jsonb,                   -- respuesta de Loggro si aplicó
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ajustes_item       ON public.items_ajustes(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ajustes_tipo_fecha ON public.items_ajustes(tipo, created_at DESC);

ALTER TABLE public.items_ajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "items_ajustes_all" ON public.items_ajustes;
CREATE POLICY "items_ajustes_all" ON public.items_ajustes
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.items_ajustes TO anon, authenticated;
