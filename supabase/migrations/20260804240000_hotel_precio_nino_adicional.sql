-- Precio para niño adicional (menor de 12) separado del precio de adulto adicional
ALTER TABLE hotel_categorias
  ADD COLUMN IF NOT EXISTS precio_nino_adicional numeric DEFAULT 0;

NOTIFY pgrst, 'reload schema';
