-- OC puede consolidar múltiples requisiciones (auto-merge por proveedor).
-- Antes solo guardábamos `requisicion_id` (single text), perdiendo trazabilidad
-- de las reqs originales cuando 2+ se mergeaban en una sola OC.
-- requisicion_ids es la fuente de verdad multi-req; requisicion_id se mantiene
-- por compatibilidad (= primer req del array).

ALTER TABLE ordenes_compra
  ADD COLUMN IF NOT EXISTS requisicion_ids jsonb DEFAULT '[]'::jsonb;

-- Backfill: para OCs existentes con requisicion_id, sembramos el array.
UPDATE ordenes_compra
   SET requisicion_ids = jsonb_build_array(requisicion_id)
 WHERE requisicion_id IS NOT NULL
   AND (requisicion_ids IS NULL OR requisicion_ids = '[]'::jsonb);

NOTIFY pgrst, 'reload schema';
