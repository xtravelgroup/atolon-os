-- menu_items: agregar precio_botella para bebidas vendidas por botella entera.
-- ──────────────────────────────────────────────────────────────────
-- Algunas bebidas (whisky, ron, aguardiente, vino, etc.) se venden tanto
-- por copa/trago como por botella. Hasta ahora solo había `precio` (que
-- por convención era el precio de la copa). Ahora agregamos `precio_botella`
-- opcional para que el bartender / cliente vea ambas opciones.
--
-- NULL = el producto no se vende por botella (solo copa).

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS precio_botella numeric;

COMMENT ON COLUMN menu_items.precio_botella IS
  'Precio de la botella entera. NULL si solo se vende por copa/trago. Solo aplica a menu_tipo=bebidas.';

NOTIFY pgrst, 'reload schema';
