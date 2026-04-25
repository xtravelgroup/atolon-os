-- Costos operativos de flota (Castillete, Naturalle, ...)
-- · costo_viaje_sencillo      → costo de un viaje 1-way Cartagena↔Atolón
-- · tarifa_alquiler_ida_vuelta → precio comercial del alquiler completo ida+vuelta
--
-- Referencia dada por operaciones:
--   Castillete: $400.000 = 2 viajes (ida+vuelta)       → sencillo = $200.000
--   Naturalle:  $1.100.000 = 4 viajes (2 ida+vueltas)  → sencillo = $275.000

ALTER TABLE public.lanchas
  ADD COLUMN IF NOT EXISTS costo_viaje_sencillo      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_alquiler_ida_vuelta numeric DEFAULT 0;

UPDATE public.lanchas
SET costo_viaje_sencillo = 200000,
    tarifa_alquiler_ida_vuelta = 400000
WHERE nombre = 'Castillete';

UPDATE public.lanchas
SET costo_viaje_sencillo = 275000,
    tarifa_alquiler_ida_vuelta = 1100000
WHERE nombre = 'Naturalle';

-- Cada zarpe de flota registra el costo operativo del viaje (auto-calculado
-- al insertar desde Salidas → toma costo_viaje_sencillo de la lancha).
ALTER TABLE public.muelle_zarpes_flota
  ADD COLUMN IF NOT EXISTS costo_operativo numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_zarpes_flota_fecha_embarcacion
  ON public.muelle_zarpes_flota(fecha, embarcacion);

-- Backfill: aplicar costo a zarpes ya registrados
UPDATE public.muelle_zarpes_flota z
SET costo_operativo = l.costo_viaje_sencillo
FROM public.lanchas l
WHERE z.embarcacion = l.nombre
  AND COALESCE(z.costo_operativo, 0) = 0
  AND COALESCE(l.costo_viaje_sencillo, 0) > 0;
