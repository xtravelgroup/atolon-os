-- Floor Plan — Piscina (Pool Area) + integración con Pool Service / Loggro
-- Estructura:
--   floorplan_spots          → catálogo de spots (todas son camas en piscina)
--   floorplan_asignaciones   → estado por día (libre/reservado/ocupado/etc)
--   pool_service_pedidos.spot_id → FK al spot del pedido
--   floorplan_spots.loggro_mesa_id → mapeo a mesa de Loggro
--
-- Nomenclatura oficial (del plano físico):
--   PISCINA DERECHA   → C11–C15 (camas exteriores) + PS11–PS14 (camas pool side)
--   PISCINA IZQUIERDA → PS21–PS24 (camas pool side) + C21–C25 (camas exteriores)
--   PISCINA CENTRAL   → PS31–PS34 (camas detrás de la piscina)
-- Total: 22 camas. C/PS solo indica POSICIÓN, todas son camas.

-- ── Tabla catálogo de spots ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.floorplan_spots (
  id          text PRIMARY KEY,                  -- 'C11', 'PS31', etc.
  zona        text NOT NULL,                     -- 'piscina_derecha' | 'piscina_izquierda' | 'piscina_central'
  area        text NOT NULL DEFAULT 'piscina',   -- 'piscina' | 'playa' | etc (futuro)
  tipo        text NOT NULL,                     -- 'cama' (todas en piscina)
  fila        integer NOT NULL,
  orden       integer NOT NULL,
  capacidad   integer NOT NULL DEFAULT 2,
  activo      boolean NOT NULL DEFAULT true,
  notas       text,
  loggro_mesa_id text,                           -- mapeo a mesa de Loggro Restobar
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.floorplan_spots.loggro_mesa_id IS
  'ID de mesa en Loggro Restobar al que se envían pedidos hechos desde este spot.';

-- ── Asignaciones diarias (estado por día) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.floorplan_asignaciones (
  id           text PRIMARY KEY,
  spot_id      text NOT NULL REFERENCES public.floorplan_spots(id),
  fecha        date NOT NULL,
  reserva_id   text REFERENCES public.reservas(id) ON DELETE SET NULL,
  evento_id    text REFERENCES public.eventos(id) ON DELETE SET NULL,
  estado       text NOT NULL DEFAULT 'libre',
                 -- libre | reservado | ocupado | limpieza | bloqueado
  huesped      text,
  pax          integer DEFAULT 0,
  notas        text,
  asignado_por text,
  hora_check_in   timestamptz,
  hora_check_out  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (spot_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_floorplan_asignaciones_fecha
  ON public.floorplan_asignaciones (fecha);
CREATE INDEX IF NOT EXISTS idx_floorplan_asignaciones_reserva
  ON public.floorplan_asignaciones (reserva_id) WHERE reserva_id IS NOT NULL;

-- ── Pool Service: vínculo al spot del floor plan ──────────────────────────
ALTER TABLE public.pool_service_pedidos
  ADD COLUMN IF NOT EXISTS spot_id text REFERENCES public.floorplan_spots(id),
  ADD COLUMN IF NOT EXISTS loggro_order_id text,
  ADD COLUMN IF NOT EXISTS loggro_group_id text,
  ADD COLUMN IF NOT EXISTS loggro_response jsonb;

CREATE INDEX IF NOT EXISTS idx_pool_service_pedidos_spot
  ON public.pool_service_pedidos (spot_id, created_at DESC)
  WHERE spot_id IS NOT NULL;

-- Backfill legacy column → new column si aplica
UPDATE public.pool_service_pedidos
   SET loggro_order_id = loggro_orden_id
 WHERE loggro_order_id IS NULL AND loggro_orden_id IS NOT NULL;

-- ── Insert de los 22 spots de Piscina (todas camas, capacidad 2) ──────────

-- PISCINA DERECHA: camas exteriores (C11-C15) + camas pool side (PS11-PS14)
INSERT INTO public.floorplan_spots (id, zona, tipo, fila, orden, capacidad) VALUES
  ('C11',  'piscina_derecha', 'cama', 1, 1, 2),
  ('C12',  'piscina_derecha', 'cama', 2, 2, 2),
  ('C13',  'piscina_derecha', 'cama', 3, 3, 2),
  ('C14',  'piscina_derecha', 'cama', 4, 4, 2),
  ('C15',  'piscina_derecha', 'cama', 5, 5, 2),
  ('PS11', 'piscina_derecha', 'cama', 1, 1, 2),
  ('PS12', 'piscina_derecha', 'cama', 2, 2, 2),
  ('PS13', 'piscina_derecha', 'cama', 3, 3, 2),
  ('PS14', 'piscina_derecha', 'cama', 4, 4, 2)
ON CONFLICT (id) DO NOTHING;

-- PISCINA IZQUIERDA: camas pool side (PS21-PS24) + camas exteriores (C21-C25)
INSERT INTO public.floorplan_spots (id, zona, tipo, fila, orden, capacidad) VALUES
  ('PS21', 'piscina_izquierda', 'cama', 1, 1, 2),
  ('PS22', 'piscina_izquierda', 'cama', 2, 2, 2),
  ('PS23', 'piscina_izquierda', 'cama', 3, 3, 2),
  ('PS24', 'piscina_izquierda', 'cama', 4, 4, 2),
  ('C21',  'piscina_izquierda', 'cama', 1, 1, 2),
  ('C22',  'piscina_izquierda', 'cama', 2, 2, 2),
  ('C23',  'piscina_izquierda', 'cama', 3, 3, 2),
  ('C24',  'piscina_izquierda', 'cama', 4, 4, 2),
  ('C25',  'piscina_izquierda', 'cama', 5, 5, 2)
ON CONFLICT (id) DO NOTHING;

-- PISCINA CENTRAL: camas detrás de la piscina (PS31-PS34)
INSERT INTO public.floorplan_spots (id, zona, tipo, fila, orden, capacidad) VALUES
  ('PS31', 'piscina_central', 'cama', 1, 1, 2),
  ('PS32', 'piscina_central', 'cama', 1, 2, 2),
  ('PS33', 'piscina_central', 'cama', 1, 3, 2),
  ('PS34', 'piscina_central', 'cama', 1, 4, 2)
ON CONFLICT (id) DO NOTHING;
