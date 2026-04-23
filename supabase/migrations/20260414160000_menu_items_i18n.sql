-- Traducciones al inglés para menu_items (guest portal bilingüe)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS nombre_en text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS descripcion_en text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS categoria_en text;
