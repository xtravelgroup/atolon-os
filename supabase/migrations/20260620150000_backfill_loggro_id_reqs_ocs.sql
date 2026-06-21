-- Backfill: rellenar loggro_id en items[] de requisiciones y ordenes_compra
-- a partir del catálogo items_catalogo (por item_id directo, o por nombre).
-- Bug origen: cart→requisición y requisición→OC no copiaban loggro_id desde
-- items_catalogo. Resultado: 281 líneas de req en últimos 30 días con item_id
-- pero sin loggro_id, propagado a OCs y eventualmente a recepciones que no
-- registraban stock en Loggro Restobar.

BEGIN;

-- Función auxiliar: dado un item JSON, retorna el mismo JSON pero con loggro_id
-- resuelto via items_catalogo si está vacío. Resolución en cascada:
--   1. it.loggro_id existente
--   2. items_catalogo[it.item_id].loggro_id
--   3. items_catalogo[lower(it.item)].loggro_id (match por nombre)
CREATE OR REPLACE FUNCTION pg_temp.resolver_loggro_id(it jsonb) RETURNS jsonb AS $$
DECLARE
  cur_loggro text := it->>'loggro_id';
  cur_item_id text := it->>'item_id';
  cur_nombre text := COALESCE(it->>'item', it->>'nombre', '');
  resolved text;
BEGIN
  IF cur_loggro IS NOT NULL AND cur_loggro != '' THEN
    RETURN it;
  END IF;
  IF cur_item_id IS NOT NULL AND cur_item_id != '' THEN
    SELECT loggro_id INTO resolved FROM items_catalogo WHERE id = cur_item_id;
    IF resolved IS NOT NULL AND resolved != '' THEN
      RETURN it || jsonb_build_object('loggro_id', resolved);
    END IF;
  END IF;
  IF cur_nombre != '' THEN
    SELECT loggro_id INTO resolved FROM items_catalogo
    WHERE lower(trim(nombre)) = lower(trim(cur_nombre))
      AND loggro_id IS NOT NULL AND loggro_id != ''
    LIMIT 1;
    IF resolved IS NOT NULL THEN
      RETURN it || jsonb_build_object('loggro_id', resolved);
    END IF;
  END IF;
  RETURN it;
END;
$$ LANGUAGE plpgsql;

-- Backfill requisiciones (sin tocar las que ya tienen estado finalizado)
UPDATE requisiciones r
SET items = (
  SELECT jsonb_agg(pg_temp.resolver_loggro_id(it))
  FROM jsonb_array_elements(r.items) it
)
WHERE r.items IS NOT NULL
  AND jsonb_array_length(r.items) > 0
  AND r.estado NOT IN ('Rechazada','Cancelada');

-- Backfill ordenes_compra (incluso enviadas; no afecta el doc enviado al
-- proveedor — solo agrega metadata interna usada para recepción/Loggro).
UPDATE ordenes_compra o
SET items = (
  SELECT jsonb_agg(pg_temp.resolver_loggro_id(it))
  FROM jsonb_array_elements(o.items) it
)
WHERE o.items IS NOT NULL
  AND jsonb_array_length(o.items) > 0;

COMMIT;
