-- Fase 0 · Vincular cierres con su evento origen via evento_id
-- =====================================================================
-- Hallazgo (audit rank 9): al editar buy-out confirmado, el codigo borra
-- cierres con .ilike('motivo', '%${nombreAnterior}%'). Esto tumba
-- cierres de OTROS buy-outs con nombre prefijo similar:
--   "Boda Garcia" borra cierres de "Boda Garcia Familia".
-- La fecha queda vendible y se aceptan reservas en isla bloqueada
-- → doble venta.
--
-- Fix: agregar columna evento_id y borrar por eso (match exacto).
-- =====================================================================

ALTER TABLE public.cierres
  ADD COLUMN IF NOT EXISTS evento_id text;

CREATE INDEX IF NOT EXISTS idx_cierres_evento_id
  ON public.cierres (evento_id)
  WHERE evento_id IS NOT NULL;

-- Backfill: vincular cierres existentes a su evento por matching exacto
-- del motivo (Buy-Out: <nombre del evento>).
UPDATE public.cierres c
SET evento_id = e.id
FROM public.eventos e
WHERE c.evento_id IS NULL
  AND c.creado_por = 'Eventos'
  AND c.motivo = ('Buy-Out: ' || e.nombre);

-- Verificar cuantos quedan sin evento_id (deberian ser pocos / cero):
DO $$
DECLARE
  total_eventos int;
  con_evento_id int;
  sin_evento_id int;
BEGIN
  SELECT COUNT(*) INTO total_eventos
    FROM public.cierres WHERE creado_por = 'Eventos';
  SELECT COUNT(*) INTO con_evento_id
    FROM public.cierres WHERE creado_por = 'Eventos' AND evento_id IS NOT NULL;
  sin_evento_id := total_eventos - con_evento_id;
  RAISE NOTICE 'Cierres creados por Eventos: %. Vinculados a evento_id: %. Sin vincular: %.',
    total_eventos, con_evento_id, sin_evento_id;
END $$;

COMMENT ON COLUMN public.cierres.evento_id IS
  'FK logica a eventos.id. Se usa para borrar cierres asociados a un evento al editarlo, sin riesgo de borrar cierres de otros eventos con nombre similar.';
