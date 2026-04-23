-- Agregar campos de control para Room Service
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS room_service boolean DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS loggro_categoria text;
CREATE INDEX IF NOT EXISTS idx_menu_items_room_service ON menu_items(room_service) WHERE room_service = true;
