-- salida_despachos: agregar columna embarcacion_nombre que el código del
-- módulo CheckIn lleva tiempo intentando escribir pero la columna no
-- existía. Resultado: los inserts insertaban embarcacion_nombre como
-- columna desconocida → Supabase REST PGRST204 → fallaba silenciosamente.
-- Por eso despachosDesal.find(d => d.embarcacion_nombre === ...) nunca
-- matcheaba y la UI no podía bloquear despachos repetidos.

ALTER TABLE salida_despachos
  ADD COLUMN IF NOT EXISTS embarcacion_nombre text,
  ADD COLUMN IF NOT EXISTS embarcacion_id     text;

CREATE INDEX IF NOT EXISTS idx_salida_despachos_emb
  ON salida_despachos(fecha, salida_id, embarcacion_nombre);

-- Para evitar duplicar despachos de la misma embarcación en la misma
-- salida del mismo día — único por (fecha, salida_id, embarcacion_nombre).
CREATE UNIQUE INDEX IF NOT EXISTS uq_salida_despachos_fecha_salida_emb
  ON salida_despachos(fecha, salida_id, COALESCE(embarcacion_nombre, ''));

COMMENT ON COLUMN salida_despachos.embarcacion_nombre IS
  'Nombre de la embarcación despachada en esta salida. NULL = despacho genérico de la salida (legacy o cuando solo hay 1 emb).';
