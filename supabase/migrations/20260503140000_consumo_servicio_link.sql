-- Vincular cada registro de consumo con el servicio (de cotización o extras)
-- al que pertenece. Permite reportar costo por servicio del evento y entender
-- la rentabilidad línea por línea (ej: cuánto costó el "Open Bar Premium").
--
-- Como los servicios viven en JSONB anidado dentro de la tabla `eventos`
-- (cotizacion_data, servicios_contratados, extras_data), guardamos:
--   servicio_id          → id del item dentro del array (ej: "sv-licor")
--   servicio_origen      → de qué array viene: contratado | espacio | hospedaje
--                          | alimento | otro_cotizado | extra_transporte
--                          | extra_alimento | extra_servicio
--   servicio_descripcion → snapshot del concepto al momento del registro,
--                          así si después se renombra/elimina el servicio
--                          conservamos el contexto histórico.

ALTER TABLE eventos_consumo_openbar
  ADD COLUMN IF NOT EXISTS servicio_id text,
  ADD COLUMN IF NOT EXISTS servicio_origen text,
  ADD COLUMN IF NOT EXISTS servicio_descripcion text;

CREATE INDEX IF NOT EXISTS idx_consumo_servicio
  ON eventos_consumo_openbar(evento_id, servicio_origen, servicio_id)
  WHERE anulado = false;

NOTIFY pgrst, 'reload schema';
