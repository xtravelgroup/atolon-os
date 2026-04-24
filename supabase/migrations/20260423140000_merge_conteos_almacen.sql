-- Consolidar los 3 conteos de Almacén en uno solo
-- Estrategia: merge de ítems por item_id quedándose con la lectura MÁS RECIENTE
-- del ítem (según created_at del conteo). Mantiene el created_at del primer
-- conteo como inicio del inventario, actualiza con lo contado.

DO $$
DECLARE
  v_merged jsonb := '[]'::jsonb;
  v_item_map jsonb := '{}'::jsonb;
  r record;
  it jsonb;
  key text;
  total int;
  diffs int;
  primer_id text;
  primer_created timestamptz;
  usuario text;
BEGIN
  -- Iterar conteos de almacén por created_at ASC (viejos primero)
  -- y acumular items en v_item_map (el último save sobrescribe el anterior)
  FOR r IN
    SELECT * FROM public.items_conteos
    WHERE locacion_id = 'LOC-ALMACEN'
    ORDER BY created_at ASC
  LOOP
    IF primer_id IS NULL THEN
      primer_id := r.id;
      primer_created := r.created_at;
    END IF;
    usuario := r.usuario_email;
    FOR it IN SELECT jsonb_array_elements(r.items) LOOP
      key := it->>'item_id';
      v_item_map := jsonb_set(v_item_map, ARRAY[key], it);
    END LOOP;
  END LOOP;

  -- Convertir el map en array
  SELECT jsonb_agg(value) INTO v_merged FROM jsonb_each(v_item_map);

  total := jsonb_array_length(v_merged);
  SELECT count(*) INTO diffs FROM jsonb_array_elements(v_merged) AS x(elem) WHERE (x.elem->>'diferencia')::numeric <> 0;

  -- Insertar el conteo consolidado (con created_at del primero, fecha de hoy)
  INSERT INTO public.items_conteos (id, locacion_id, fecha, usuario_email, notas, items, total_items, diferencias, created_at)
  VALUES (
    'CNT-' || extract(epoch from primer_created)::bigint || '-merged',
    'LOC-ALMACEN',
    primer_created::date,
    usuario,
    'Consolidación automática de 3 conteos (ítems mergeados con la lectura más reciente por producto)',
    v_merged,
    total,
    diffs,
    primer_created
  );

  -- Eliminar los 3 conteos originales
  DELETE FROM public.items_conteos WHERE locacion_id = 'LOC-ALMACEN' AND id <> 'CNT-' || extract(epoch from primer_created)::bigint || '-merged';

  RAISE NOTICE '✓ Consolidado: % ítems (% con diferencias)', total, diffs;
END $$;
