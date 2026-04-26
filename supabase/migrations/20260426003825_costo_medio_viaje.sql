-- Replanteo del costo de flota: cada evento (llegada O salida) en Atolón
-- cuenta como 1 medio viaje. 2 medios viajes consecutivos = 1 viaje
-- completo (Cartagena ↔ Atolón). El barco duerme en Cartagena, así que
-- en operación normal #llegadas = #salidas.

-- Costos correctos por medio viaje (1 llegada o 1 salida):
--   Naturalle: $1.100.000 / 8 medios viajes = $137.500
--   Castillete: $400.000 / 4 medios viajes  = $100.000

UPDATE public.lanchas
SET costo_viaje_sencillo = 137500
WHERE nombre = 'Naturalle';

UPDATE public.lanchas
SET costo_viaje_sencillo = 100000
WHERE nombre = 'Castillete';

-- Las llegadas también suman costo (antes solo lo hacían las salidas)
ALTER TABLE public.muelle_llegadas
  ADD COLUMN IF NOT EXISTS costo_operativo numeric DEFAULT 0;

-- Backfill: aplicar costo correcto a TODAS las salidas y llegadas históricas
-- de Castillete/Naturalle (se ajustan al nuevo $137.500 / $100.000)
UPDATE public.muelle_zarpes_flota z
SET costo_operativo = l.costo_viaje_sencillo
FROM public.lanchas l
WHERE z.embarcacion = l.nombre
  AND l.costo_viaje_sencillo > 0;

UPDATE public.muelle_llegadas m
SET costo_operativo = l.costo_viaje_sencillo
FROM public.lanchas l
WHERE m.embarcacion_nombre = l.nombre
  AND m.tipo IN ('lancha_atolon', 'lanchas_atolon')
  AND l.costo_viaje_sencillo > 0;
