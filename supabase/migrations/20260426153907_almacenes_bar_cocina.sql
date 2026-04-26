-- Reorganización de bodegas: separar Almacén Bar y Almacén Cocina.
-- Toda mercancía nueva entra a una de las dos. Mini Bar y Bar (POS) son
-- locaciones secundarias. Loggro se compara contra la SUMA de todas.

BEGIN;

-- 1. Renombrar LOC-ALMACEN → LOC-ALMACEN-BAR (mantiene el inventario actual,
--    porque es el almacén que ya se inventarió como "Bar")
INSERT INTO public.items_locaciones (id, nombre, descripcion, es_principal, es_ventas, activa, icono, orden)
VALUES ('LOC-ALMACEN-BAR', 'Almacén Bar',
        'Almacén principal de bebidas y suministros del bar (recepción de compras)',
        true, false, true, '🥃', 1)
ON CONFLICT (id) DO NOTHING;

-- Migrar todas las FKs apuntando a LOC-ALMACEN
UPDATE public.items_stock_locacion  SET locacion_id      = 'LOC-ALMACEN-BAR' WHERE locacion_id      = 'LOC-ALMACEN';
UPDATE public.items_conteos         SET locacion_id      = 'LOC-ALMACEN-BAR' WHERE locacion_id      = 'LOC-ALMACEN';
UPDATE public.items_transferencias  SET from_locacion_id = 'LOC-ALMACEN-BAR' WHERE from_locacion_id = 'LOC-ALMACEN';
UPDATE public.items_transferencias  SET to_locacion_id   = 'LOC-ALMACEN-BAR' WHERE to_locacion_id   = 'LOC-ALMACEN';

-- Eliminar la locación antigua
DELETE FROM public.items_locaciones WHERE id = 'LOC-ALMACEN';

-- 2. Crear Almacén Cocina (nuevo, vacío)
INSERT INTO public.items_locaciones (id, nombre, descripcion, es_principal, es_ventas, activa, icono, orden)
VALUES ('LOC-ALMACEN-COCINA', 'Almacén Cocina',
        'Almacén principal de insumos de cocina (recepción de compras)',
        false, false, true, '🍳', 2)
ON CONFLICT (id) DO NOTHING;

-- 3. Marcar bodegas de recepción de mercancía nueva
ALTER TABLE public.items_locaciones
  ADD COLUMN IF NOT EXISTS es_recepcion boolean DEFAULT false;

UPDATE public.items_locaciones
SET es_recepcion = true
WHERE id IN ('LOC-ALMACEN-BAR', 'LOC-ALMACEN-COCINA');

-- 4. Reordenar las locaciones existentes para que el orden refleje el flujo
--    Almacenes (recepción) → puntos de venta/uso → mini bars
UPDATE public.items_locaciones SET orden = 10 WHERE id = 'LOC-BAR';
UPDATE public.items_locaciones SET orden = 20 WHERE id = 'LOC-MINIBAR';

COMMIT;
