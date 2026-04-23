-- El partial index anterior no es válido para ON CONFLICT; reemplazarlo con un UNIQUE
-- constraint completo. PostgreSQL permite múltiples NULLs por defecto en UNIQUE.

DROP INDEX IF EXISTS items_catalogo_loggro_id_unique;

-- Por si hay duplicados (ya limpiamos en la migración anterior, pero por seguridad)
WITH dups AS (
  SELECT id, loggro_id,
         ROW_NUMBER() OVER (PARTITION BY loggro_id ORDER BY updated_at DESC NULLS LAST, id DESC) AS rn
  FROM public.items_catalogo
  WHERE loggro_id IS NOT NULL
)
DELETE FROM public.items_catalogo
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

ALTER TABLE public.items_catalogo
  ADD CONSTRAINT items_catalogo_loggro_id_key UNIQUE (loggro_id);
