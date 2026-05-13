-- Histórico de cambios en items de la OC: requisición → cotización → factura.
-- Cada vez que se aprueba una cotización o se aplica una factura, se snapshot
-- la diferencia vs el estado anterior para auditoría.
--
-- Estructura de cambios_historial[]:
-- {
--   evento: "cotizacion" | "factura",
--   at: ISO timestamp,
--   por: email/usuario,
--   archivo_url: string,
--   resumen: { agregados: N, eliminados: N, qty_cambios: N, precio_cambios: N, nombre_cambios: N, delta_total: number },
--   cambios: [
--     { tipo: "agregado"|"eliminado"|"modificado", item_id, nombre, antes:{cant,precioU,nombre}, despues:{cant,precioU,nombre} }
--   ]
-- }

ALTER TABLE ordenes_compra
  ADD COLUMN IF NOT EXISTS cambios_historial jsonb DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
