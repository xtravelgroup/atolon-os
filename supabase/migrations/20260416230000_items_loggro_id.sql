-- Agregar loggro_id a items_catalogo para sync
ALTER TABLE items_catalogo ADD COLUMN IF NOT EXISTS loggro_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_catalogo_loggro_id ON items_catalogo(loggro_id) WHERE loggro_id IS NOT NULL;
ALTER TABLE items_catalogo ADD COLUMN IF NOT EXISTS precio_compra numeric DEFAULT 0;
ALTER TABLE items_catalogo ADD COLUMN IF NOT EXISTS stock_actual numeric DEFAULT 0;
ALTER TABLE items_catalogo ADD COLUMN IF NOT EXISTS stock_minimo numeric DEFAULT 0;
ALTER TABLE items_catalogo ADD COLUMN IF NOT EXISTS raw jsonb;
