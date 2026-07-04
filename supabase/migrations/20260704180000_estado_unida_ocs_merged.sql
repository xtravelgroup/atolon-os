-- Nuevo estado "unida" para OCs consolidadas dentro de otra OC (merge).
-- Antes estas OCs quedaban como "cancelada" — pero no fueron canceladas
-- realmente: sus items siguen vivos dentro de la OC destino. Marcarlas
-- como "cancelada" confundía a operaciones (parecía que se anuló la compra).
--
-- Cambios:
--   1. Agregar columnas merged_into_oc_id, merged_into_codigo, merged_at
--   2. Backfill: OCs históricas con cambios_historial que muestren merged_into
--      → pasan de "cancelada" a "unida" con merged_into_* poblado
--   3. Los listados de trabajo (Compras.jsx, Requisiciones.jsx) filtran
--      estado NOT IN ('cancelada','unida'); solo el filtro "unidas"
--      (bitacora) las muestra.

ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS merged_into_oc_id text,
  ADD COLUMN IF NOT EXISTS merged_into_codigo text,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_oc_merged_into ON public.ordenes_compra(merged_into_oc_id)
  WHERE merged_into_oc_id IS NOT NULL;

-- Backfill: para cada OC "cancelada" con evento merged_into en cambios_historial,
-- restablecer merged_into_* y cambiar estado a "unida".
WITH mergeados AS (
  SELECT
    id,
    (jsonb_path_query_first(cambios_historial, '$[*] ? (@.evento == "merged_into")'))::jsonb AS ev
  FROM ordenes_compra
  WHERE estado = 'cancelada'
    AND cambios_historial IS NOT NULL
    AND jsonb_path_exists(cambios_historial, '$[*] ? (@.evento == "merged_into")')
)
UPDATE ordenes_compra o
SET
  estado = 'unida',
  merged_into_oc_id = m.ev->>'merged_into_oc_id',
  merged_into_codigo = m.ev->>'merged_into_codigo',
  merged_at = COALESCE((m.ev->>'at')::timestamptz, now())
FROM mergeados m
WHERE o.id = m.id;
