-- Floor Plan — Piscina (Pool Area)
-- Estructura: zonas + spots (camas y pool-seats) + asignaciones diarias.
-- Nomenclatura oficial (del plano):
--   PISCINA DERECHA  → C11–C15 (camas) + PS11–PS14 (pool seats)
--   PISCINA IZQUIERDA → C21–C25 (camas) + PS21–PS24 (pool seats)
--   PISCINA CENTRAL  → PS31–PS34 (pool seats)
-- Total: 10 camas + 12 pool seats = 22 spots.

-- ── Tabla catálogo de spots ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.floorplan_spots (
  id          text PRIMARY KEY,                  -- 'C11', 'PS31', etc.
  zona        text NOT NULL,                     -- 'piscina_derecha' | 'piscina_izquierda' | 'piscina_central'
  area        text NOT NULL DEFAULT 'piscina',   -- 'piscina' | 'playa' | 'restaurante' | ...
  tipo        text NOT NULL,                     -- 'cama' | 'ps' (pool seat / sofa)
  fila        integer NOT NULL,                  -- 1..5 (cama posicion vertical) o 1..4 (ps)
  orden       integer NOT NULL,
  capacidad   integer NOT NULL DEFAULT 2,        -- pax que aguanta el spot
  activo      boolean NOT NULL DEFAULT true,
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Asignaciones diarias (estado por día) ────────────────────────────────
-- Una fila por (spot_id, fecha). El estado se actualiza durante el día.
CREATE TABLE IF NOT EXISTS public.floorplan_asignaciones (
  id           text PRIMARY KEY,
  spot_id      text NOT NULL REFERENCES public.floorplan_spots(id),
  fecha        date NOT NULL,
  reserva_id   text REFERENCES public.reservas(id) ON DELETE SET NULL,
  evento_id    text REFERENCES public.eventos(id) ON DELETE SET NULL,
  estado       text NOT NULL DEFAULT 'libre',
                 -- 'libre' | 'reservado' | 'ocupado' | 'limpieza' | 'bloqueado'
  huesped      text,                              -- nombre del huésped (cache para UI rápida)
  pax          integer DEFAULT 0,
  notas        text,
  asignado_por text,                              -- email del operador que lo asignó
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

-- ── Insert de los 22 spots de Piscina ─────────────────────────────────────

-- PISCINA DERECHA: 5 camas (C11-C15) + 4 pool seats (PS11-PS14)
INSERT INTO public.floorplan_spots (id, zona, tipo, fila, orden, capacidad) VALUES
  ('C11',  'piscina_derecha', 'cama', 1, 1, 2),
  ('C12',  'piscina_derecha', 'cama', 2, 2, 2),
  ('C13',  'piscina_derecha', 'cama', 3, 3, 2),
  ('C14',  'piscina_derecha', 'cama', 4, 4, 2),
  ('C15',  'piscina_derecha', 'cama', 5, 5, 2),
  ('PS11', 'piscina_derecha', 'ps',   1, 1, 4),
  ('PS12', 'piscina_derecha', 'ps',   2, 2, 4),
  ('PS13', 'piscina_derecha', 'ps',   3, 3, 4),
  ('PS14', 'piscina_derecha', 'ps',   4, 4, 4)
ON CONFLICT (id) DO NOTHING;

-- PISCINA IZQUIERDA: 4 pool seats (PS21-PS24) + 5 camas (C21-C25)
INSERT INTO public.floorplan_spots (id, zona, tipo, fila, orden, capacidad) VALUES
  ('PS21', 'piscina_izquierda', 'ps',   1, 1, 4),
  ('PS22', 'piscina_izquierda', 'ps',   2, 2, 4),
  ('PS23', 'piscina_izquierda', 'ps',   3, 3, 4),
  ('PS24', 'piscina_izquierda', 'ps',   4, 4, 4),
  ('C21',  'piscina_izquierda', 'cama', 1, 1, 2),
  ('C22',  'piscina_izquierda', 'cama', 2, 2, 2),
  ('C23',  'piscina_izquierda', 'cama', 3, 3, 2),
  ('C24',  'piscina_izquierda', 'cama', 4, 4, 2),
  ('C25',  'piscina_izquierda', 'cama', 5, 5, 2)
ON CONFLICT (id) DO NOTHING;

-- PISCINA CENTRAL: 4 pool seats (PS31-PS34)
INSERT INTO public.floorplan_spots (id, zona, tipo, fila, orden, capacidad) VALUES
  ('PS31', 'piscina_central', 'ps', 1, 1, 4),
  ('PS32', 'piscina_central', 'ps', 1, 2, 4),
  ('PS33', 'piscina_central', 'ps', 1, 3, 4),
  ('PS34', 'piscina_central', 'ps', 1, 4, 4)
ON CONFLICT (id) DO NOTHING;
