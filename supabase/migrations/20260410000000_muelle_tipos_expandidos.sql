-- Ampliar tipos permitidos en muelle_llegadas para soportar categorías adicionales
ALTER TABLE muelle_llegadas DROP CONSTRAINT IF EXISTS muelle_llegadas_tipo_check;
ALTER TABLE muelle_llegadas ADD CONSTRAINT muelle_llegadas_tipo_check
  CHECK (tipo IN ('lancha_atolon','after_island','restaurante','huespedes','inspeccion','empleados','otros'));
