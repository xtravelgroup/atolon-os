-- Distinguir origen del registro de ingreso de contratistas.
-- 'muelle_castillete' = verificación al salir del muelle (antes de abordar la lancha)
-- 'atolon_isla' = llegada/registro en la isla (puede que no haya pasado por muelle, ej: lancha privada)

ALTER TABLE public.contratistas_ingresos_muelle
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'muelle_castillete';

CREATE INDEX IF NOT EXISTS idx_contratistas_ingresos_origen
  ON public.contratistas_ingresos_muelle(origen);

-- Los registros existentes quedan como muelle_castillete por default (es el único origen previo).
