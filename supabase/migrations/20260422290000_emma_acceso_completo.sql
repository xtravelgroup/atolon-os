-- Emma: acceso completo a Comercial, Operaciones, Hotel, Marketing, RRHH

UPDATE public.usuarios
SET modulos = ARRAY[
  -- Comercial
  'pasadias', 'reservas', 'clientes', 'b2b', 'eventos', 'upsells',
  'actividades', 'comercial', 'metas', 'comisiones',
  -- Operaciones
  'checkin', 'zarpes_log', 'muelle', 'salidas_isla', 'lancha',
  'cierre_caja', 'contratistas_muelle',
  -- Hotel
  'hotel_reservas', 'hotel_habitaciones', 'hotel_huespedes', 'hotel_checkin',
  'hotel_folios', 'hotel_housekeeping', 'hotel_roomservice', 'hotel_tarifas',
  -- Marketing
  'analitica', 'contenido', 'vip', 'carrito_abandonado',
  -- RRHH
  'rrhh', 'horarios', 'nomina', 'nomina_dia', 'contratistas_admin', 'briefings'
]::text[]
WHERE email = 'direccion@atoloncartagena.com';
