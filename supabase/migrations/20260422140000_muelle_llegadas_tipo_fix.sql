-- El CHECK constraint de muelle_llegadas.tipo no incluía varios tipos que el modal envía.
-- Causaba: new row violates check constraint "muelle_llegadas_tipo_check"
-- para manual entries de after_island/otras/walkin/caminando, etc.

ALTER TABLE public.muelle_llegadas
  DROP CONSTRAINT IF EXISTS muelle_llegadas_tipo_check;

ALTER TABLE public.muelle_llegadas
  ADD CONSTRAINT muelle_llegadas_tipo_check CHECK (tipo IN (
    'lancha_atolon',
    'after_island',
    'restaurante',
    'a_consumo',
    'huespedes',
    'inspeccion',
    'empleados',
    'otros',
    'otras',
    'walkin',
    'caminando'
  ));
