-- 'agua_cafe' es SOLO para comedor_consumo (insumos). No aplica a comensales.
-- Elimina fila de precios y restringe los otros checks.

DELETE FROM comedor_precios WHERE comida = 'agua_cafe';

ALTER TABLE comedor_precios DROP CONSTRAINT IF EXISTS comedor_precios_comida_check;
ALTER TABLE comedor_precios
  ADD CONSTRAINT comedor_precios_comida_check
  CHECK (comida IN ('desayuno','almuerzo','cena'));

ALTER TABLE comedor_registros DROP CONSTRAINT IF EXISTS comedor_registros_comida_check;
ALTER TABLE comedor_registros
  ADD CONSTRAINT comedor_registros_comida_check
  CHECK (comida IN ('desayuno','almuerzo','cena'));

ALTER TABLE comedor_menus DROP CONSTRAINT IF EXISTS comedor_menus_comida_check;
ALTER TABLE comedor_menus
  ADD CONSTRAINT comedor_menus_comida_check
  CHECK (comida IN ('desayuno','almuerzo','cena'));

-- comedor_consumo se mantiene con agua_cafe permitido
