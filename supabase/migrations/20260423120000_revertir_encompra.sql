-- Revertir todas las requisiciones "En Compra" a "Aprobada"
-- Elimina OCs asociadas, limpia oc_id de los ítems.

-- 1. Listar afectadas (para log en las notices)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, descripcion, total FROM public.requisiciones WHERE estado = 'En Compra' LOOP
    RAISE NOTICE 'Revertiendo → % | % | $%', r.id, r.descripcion, r.total;
  END LOOP;
END $$;

-- 2. Eliminar OCs que referencian estas requisiciones
DELETE FROM public.ordenes_compra
WHERE requisicion_id IN (SELECT id FROM public.requisiciones WHERE estado = 'En Compra')
   OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS it
     WHERE it->>'req_id' IN (SELECT id FROM public.requisiciones WHERE estado = 'En Compra')
        OR (
          it->'req_ids' ? ANY(ARRAY(SELECT id FROM public.requisiciones WHERE estado = 'En Compra'))
        )
   );

-- 3. Limpiar oc_id/oc_codigo de los ítems y volver a Aprobada
UPDATE public.requisiciones
SET items = (
    SELECT jsonb_agg(it - 'oc_id' - 'oc_codigo')
    FROM jsonb_array_elements(items) it
  ),
  estado = 'Aprobada',
  timeline = COALESCE(timeline, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'quien', 'Sistema',
      'accion', 'Revertida de En Compra a Aprobada',
      'fecha', to_char(now() AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS'),
      'comentario', 'OCs asociadas eliminadas, ítems liberados para re-asignar'
    )
  ),
  updated_at = now()
WHERE estado = 'En Compra';
