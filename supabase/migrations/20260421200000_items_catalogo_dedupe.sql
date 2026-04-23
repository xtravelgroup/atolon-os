-- Limpia duplicados en items_catalogo: hay filas creadas manualmente el 16-abr
-- sin loggro_id que se duplicaron con las filas sincronizadas el 21-abr.
-- Conservamos SIEMPRE la versión con loggro_id (tiene el stock real de Loggro).

DELETE FROM public.items_catalogo old
WHERE old.loggro_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.items_catalogo new
    WHERE new.loggro_id IS NOT NULL
      AND LOWER(TRIM(new.nombre)) = LOWER(TRIM(old.nombre))
  );

-- Por si quedaran duplicados entre dos filas con loggro_id (caso raro), eliminar el más viejo
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM(nombre))
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.items_catalogo
  WHERE loggro_id IS NOT NULL
)
DELETE FROM public.items_catalogo
WHERE id IN (SELECT id FROM dups WHERE rn > 1);
