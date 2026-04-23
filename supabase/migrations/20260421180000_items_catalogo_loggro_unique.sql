-- Agrega unique constraint en loggro_id para que funcione el upsert del sync de ingredientes.
-- Sin esto, .upsert({onConflict: "loggro_id"}) falla con 42P10 y el sync no actualiza stock.

-- Primero limpiar posibles duplicados existentes (conservar el más reciente por loggro_id)
WITH dups AS (
  SELECT id, loggro_id,
         ROW_NUMBER() OVER (PARTITION BY loggro_id ORDER BY updated_at DESC NULLS LAST, id DESC) AS rn
  FROM public.items_catalogo
  WHERE loggro_id IS NOT NULL
)
DELETE FROM public.items_catalogo
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- Luego crear el unique index
CREATE UNIQUE INDEX IF NOT EXISTS items_catalogo_loggro_id_unique
  ON public.items_catalogo (loggro_id)
  WHERE loggro_id IS NOT NULL;
