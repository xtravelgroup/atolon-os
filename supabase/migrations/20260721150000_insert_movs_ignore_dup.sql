-- RPC para insertar movimientos_inventario_atolon en batch e ignorar los
-- que ya existen (loggro_ref UNIQUE parcial). Antes el edge function
-- hacía pre-check por URL `?loggro_ref=in.(...)` que se caía silenciosa
-- con >100 refs (URL demasiado larga o timeout PostgREST) → el batch
-- entero traía duplicados y fallaba con 23505.
--
-- Ahora el edge function llama esta RPC con el array de movimientos y
-- Postgres maneja los duplicados nativamente con `ON CONFLICT DO NOTHING`.
-- Retorna el array de loggro_ref REALMENTE insertados — el caller usa
-- eso para aplicar los deltas de stock sin doble descuento.

CREATE OR REPLACE FUNCTION public.insert_movs_ignorando_duplicados(p_movs jsonb)
RETURNS TABLE(loggro_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.movimientos_inventario_atolon (
    id, tipo, item_id, cantidad, unidad, precio_unit, almacen_id,
    origen_tipo, origen_id, loggro_ref, fecha, usuario_email, notas
  )
  SELECT
    (m->>'id')::text,
    (m->>'tipo')::text,
    (m->>'item_id')::text,
    (m->>'cantidad')::numeric,
    (m->>'unidad')::text,
    NULLIF((m->>'precio_unit'), '')::numeric,
    (m->>'almacen_id')::text,
    (m->>'origen_tipo')::text,
    (m->>'origen_id')::text,
    (m->>'loggro_ref')::text,
    (m->>'fecha')::timestamptz,
    (m->>'usuario_email')::text,
    (m->>'notas')::text
  FROM jsonb_array_elements(p_movs) AS m
  ON CONFLICT DO NOTHING
  RETURNING movimientos_inventario_atolon.loggro_ref;
END $$;

GRANT EXECUTE ON FUNCTION public.insert_movs_ignorando_duplicados(jsonb) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.insert_movs_ignorando_duplicados IS
  'Inserta batch de movimientos_inventario_atolon ignorando duplicados por loggro_ref. Retorna los refs insertados. Usado por /ventas-restobar-descontar y /cron nocturno.';
