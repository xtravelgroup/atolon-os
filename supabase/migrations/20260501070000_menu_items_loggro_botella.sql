-- menu_items: agregar enlace de Loggro separado para la variante botella.
-- ──────────────────────────────────────────────────────────────────
-- En Loggro la copa y la botella son productos DIFERENTES (cada uno
-- con su propio _id), así que un menu_item de bebida vendido por copa
-- y botella necesita DOS enlaces de Loggro:
--   loggro_id           → producto copa (default, ya existía)
--   loggro_id_botella   → producto botella (nuevo)
--
-- NULL = no está enlazado a esa variante en Loggro.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS loggro_id_botella text,
  ADD COLUMN IF NOT EXISTS loggro_categoria_botella text;

COMMENT ON COLUMN menu_items.loggro_id_botella IS
  'Loggro _id del producto-botella. NULL si no se vende por botella o no está enlazado.';
COMMENT ON COLUMN menu_items.loggro_categoria_botella IS
  'Categoría Loggro del producto-botella (para mostrar en UI).';

NOTIFY pgrst, 'reload schema';
