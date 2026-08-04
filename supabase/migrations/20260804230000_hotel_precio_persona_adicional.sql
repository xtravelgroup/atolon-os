-- Precio por persona adicional (cuando pax > capacidad_incluida y <= capacidad_maxima)
ALTER TABLE hotel_categorias
  ADD COLUMN IF NOT EXISTS precio_persona_adicional numeric DEFAULT 0;

NOTIFY pgrst, 'reload schema';
