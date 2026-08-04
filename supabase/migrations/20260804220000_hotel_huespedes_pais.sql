-- Agrega columna 'pais' (país de residencia) a hotel_huespedes.
-- La edge function hotel-grupo-reservar la esperaba pero no existía → fallaba
-- el checkout público de habitaciones de grupo con:
--   "Could not find the 'pais' column of 'hotel_huespedes' in the schema cache"
ALTER TABLE hotel_huespedes
  ADD COLUMN IF NOT EXISTS pais text;
