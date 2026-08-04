-- Añade categoría 'agua_cafe' al comedor (después de cena)
-- 1) Ampliar el check constraint de comedor_precios
ALTER TABLE comedor_precios DROP CONSTRAINT IF EXISTS comedor_precios_comida_check;
ALTER TABLE comedor_precios
  ADD CONSTRAINT comedor_precios_comida_check
  CHECK (comida IN ('desayuno','almuerzo','cena','agua_cafe'));

-- 2) Ampliar check en comedor_registros (si existe)
ALTER TABLE comedor_registros DROP CONSTRAINT IF EXISTS comedor_registros_comida_check;
ALTER TABLE comedor_registros
  ADD CONSTRAINT comedor_registros_comida_check
  CHECK (comida IN ('desayuno','almuerzo','cena','agua_cafe'));

-- 3) Ampliar check en comedor_menus (si existe)
ALTER TABLE comedor_menus DROP CONSTRAINT IF EXISTS comedor_menus_comida_check;
ALTER TABLE comedor_menus
  ADD CONSTRAINT comedor_menus_comida_check
  CHECK (comida IN ('desayuno','almuerzo','cena','agua_cafe'));

-- 4) Ampliar check en comedor_consumo (incluye 'general' que ya existía)
ALTER TABLE comedor_consumo DROP CONSTRAINT IF EXISTS comedor_consumo_comida_check;
ALTER TABLE comedor_consumo
  ADD CONSTRAINT comedor_consumo_comida_check
  CHECK (comida IN ('desayuno','almuerzo','cena','agua_cafe','general'));

-- 5) Fila inicial de precio en $0
INSERT INTO comedor_precios (comida, precio, updated_at)
VALUES ('agua_cafe', 0, now())
ON CONFLICT (comida) DO NOTHING;
