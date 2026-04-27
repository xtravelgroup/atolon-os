-- RPC para encontrar el mejor match en items_catalogo dado:
--   codigo_barras (preferido), codigo (fallback), nombre (similarity)
-- Devuelve el item match (si existe) con un score de confianza.

CREATE OR REPLACE FUNCTION public.find_item_match(
  p_codigo_barras text DEFAULT NULL,
  p_codigo        text DEFAULT NULL,
  p_nombre        text DEFAULT NULL
)
RETURNS TABLE (
  id              text,
  nombre          text,
  categoria       text,
  loggro_id       text,
  match_method    text,
  match_score     numeric
) AS $$
BEGIN
  -- 1) Match exacto por codigo_barras
  IF p_codigo_barras IS NOT NULL AND p_codigo_barras <> '' THEN
    RETURN QUERY
      SELECT c.id, c.nombre, c.categoria, c.loggro_id, 'codigo_barras'::text, 1.0::numeric
        FROM public.items_catalogo c
       WHERE c.activo = true
         AND c.codigo_barras = p_codigo_barras
       LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2) Match exacto por codigo (legacy field)
  IF p_codigo_barras IS NOT NULL AND p_codigo_barras <> '' THEN
    RETURN QUERY
      SELECT c.id, c.nombre, c.categoria, c.loggro_id, 'codigo'::text, 0.95::numeric
        FROM public.items_catalogo c
       WHERE c.activo = true
         AND c.codigo = p_codigo_barras
       LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_codigo IS NOT NULL AND p_codigo <> '' THEN
    RETURN QUERY
      SELECT c.id, c.nombre, c.categoria, c.loggro_id, 'codigo'::text, 0.95::numeric
        FROM public.items_catalogo c
       WHERE c.activo = true
         AND (c.codigo = p_codigo OR c.codigo_barras = p_codigo)
       LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 3) Match fuzzy por nombre (pg_trgm)
  IF p_nombre IS NOT NULL AND p_nombre <> '' THEN
    RETURN QUERY
      SELECT c.id, c.nombre, c.categoria, c.loggro_id, 'nombre_similar'::text,
             similarity(LOWER(c.nombre), LOWER(p_nombre))::numeric AS sim
        FROM public.items_catalogo c
       WHERE c.activo = true
         AND similarity(LOWER(c.nombre), LOWER(p_nombre)) > 0.45
       ORDER BY sim DESC
       LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Sin match
  RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.find_item_match(text, text, text) TO anon, authenticated;
