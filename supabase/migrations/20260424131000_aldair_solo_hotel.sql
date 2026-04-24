-- Aldair: SOLO módulos de Hotel
-- Setea el array directamente (reemplaza todo lo que tenía).

UPDATE public.usuarios
SET modulos = ARRAY[
  'hotel_reservas',
  'hotel_habitaciones',
  'hotel_huespedes',
  'hotel_checkin',
  'hotel_folios',
  'hotel_housekeeping',
  'hotel_roomservice',
  'hotel_minibar',
  'hotel_tarifas'
]::text[]
WHERE lower(nombre) LIKE '%aldair%' OR lower(email) LIKE '%aldair%';
