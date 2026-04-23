-- Contratistas del evento: proveedores externos + personal propio asignado
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS contratistas jsonb DEFAULT '[]'::jsonb;
-- Estructura esperada:
-- [{
--   "id": "CTR-xxx",
--   "nombre": "DJ Ritmo",
--   "tipo": "externo" | "propio",     -- externo = proveedor; propio = empleado interno
--   "proveedor_id": "PROV-xxx",       -- si es externo y mapea a tabla proveedores
--   "empleado_id": "EMP-xxx",         -- si es propio y mapea a rh_empleados
--   "cargo": "DJ / Sonidista",
--   "funcion": "Pone música toda la tarde",   -- qué van a hacer
--   "costo": 500000,
--   "personas": [                     -- lista del personal que vendrá del contratista
--     { "nombre": "Juan Pérez", "cedula": "123", "rol": "DJ" }
--   ],
--   "contacto": "+57 300...",
--   "notas": "Llega 2h antes"
-- }]

COMMENT ON COLUMN eventos.contratistas IS 'Lista de contratistas (externos + propios) asignados al evento';
