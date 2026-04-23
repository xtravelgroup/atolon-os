-- Revertir REQ-878308 "Pedido Boda" de En Compra → Aprobada
-- Elimina las OCs generadas desde esta requisición, limpia oc_id de los ítems
-- y cambia el estado.

-- 1. Eliminar OCs que referencian esta requisición (ya sea por requisicion_id directo o por items[].req_id)
DELETE FROM public.ordenes_compra
WHERE requisicion_id = 'REQ-878308'
   OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS it
     WHERE it->>'req_id' = 'REQ-878308'
   );

-- 2. Limpiar oc_id/oc_codigo de los ítems y volver a Aprobada
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
WHERE id = 'REQ-878308';
