-- Audit: prevenir double-booking en hotel_estancias a nivel DB.
-- Fecha: 2026-06-14 · Autorizado por usuario.
--
-- Pre-condicion validada: 0 overlaps activos despues del merge HTL-MPVNVY4O27T
-- → HTL-MPVNRR1S9SQ (eran reservas duplicadas por doble-submit).
--
-- La extension btree_gist permite combinar tipos discretos (=) con rangos (&&)
-- en una EXCLUDE constraint. Es el patron canonico para "ningun par de filas
-- puede tener (mismo X) AND (rangos solapados)".

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Borrar constraint previa si existiera (re-run safe).
ALTER TABLE hotel_estancias DROP CONSTRAINT IF EXISTS hotel_estancias_no_overlap;

-- Prevenir overlaps SOLO entre estancias ACTIVAS (reservada o in_house). Las
-- canceladas, no-show, y checked_out NO bloquean nuevas reservas en la misma
-- habitacion/fecha.
ALTER TABLE hotel_estancias
ADD CONSTRAINT hotel_estancias_no_overlap
EXCLUDE USING gist (
  habitacion_id WITH =,
  tstzrange(check_in_at, check_out_at, '[)') WITH &&
) WHERE (estado IN ('reservada', 'in_house') AND habitacion_id IS NOT NULL);
