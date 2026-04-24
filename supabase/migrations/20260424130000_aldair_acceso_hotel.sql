-- Aldair: acceso completo al menú de Hotel (todos los módulos)
-- Agrega a sus módulos existentes sin sobrescribir otros accesos.

UPDATE public.usuarios
SET modulos = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(modulos, ARRAY[]::text[]) ||
      ARRAY[
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
    )
  )
)
WHERE lower(nombre) LIKE '%aldair%' OR lower(email) LIKE '%aldair%';
