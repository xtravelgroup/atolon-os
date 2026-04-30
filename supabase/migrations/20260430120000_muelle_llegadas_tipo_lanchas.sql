-- muelle_llegadas: agregar 'lanchas_atolon' (plural) al check constraint.
-- El UI tiene dos categorías distintas:
--   · 'lancha_atolon'  (singular): pasadías llegando por lanchas Atolón
--   · 'lanchas_atolon' (plural):   lanchas Atolón sin pasadías (staff,
--                                   provisiones, viajes vacíos, etc.)
-- El constraint original solo permitía la singular → INSERT con plural
-- fallaba con: violates check constraint "muelle_llegadas_tipo_check"

ALTER TABLE muelle_llegadas
  DROP CONSTRAINT IF EXISTS muelle_llegadas_tipo_check;

ALTER TABLE muelle_llegadas
  ADD CONSTRAINT muelle_llegadas_tipo_check CHECK (tipo = ANY (ARRAY[
    'lancha_atolon'::text,
    'lanchas_atolon'::text,
    'after_island'::text,
    'restaurante'::text,
    'a_consumo'::text,
    'huespedes'::text,
    'inspeccion'::text,
    'empleados'::text,
    'otros'::text,
    'otras'::text,
    'walkin'::text,
    'caminando'::text
  ]));
