-- Fusiona inventarios duplicados:
--   Almacén Bar: CNT-1777305669902 (81) + CNT-1777306802189 (7) → uno solo
--   Bar:         CNT-1777312512056 (87) + CNT-1777312713049 (2) → uno solo
--
-- Estrategia: el conteo más reciente conserva todos los items, sumando los
-- únicos del más viejo. Si hay item_id duplicado entre ambos, el conteo
-- más nuevo gana (típicamente es la versión corregida).

DO $$
DECLARE
  v_pares record;
  v_items_combinados jsonb;
  v_total int;
BEGIN
  FOR v_pares IN
    SELECT
      'CNT-1777305669902'::text AS viejo, 'CNT-1777306802189'::text AS nuevo
    UNION ALL
    SELECT 'CNT-1777312512056', 'CNT-1777312713049'
  LOOP
    -- Items únicos por item_id, prefiriendo el conteo más nuevo
    WITH viejo_items AS (
      SELECT jsonb_array_elements(items) AS it FROM public.items_conteos WHERE id = v_pares.viejo
    ), nuevo_items AS (
      SELECT jsonb_array_elements(items) AS it FROM public.items_conteos WHERE id = v_pares.nuevo
    ), all_items AS (
      SELECT (it->>'item_id') AS item_id, it, 'nuevo' AS fuente FROM nuevo_items
      UNION ALL
      SELECT (it->>'item_id') AS item_id, it, 'viejo' AS fuente FROM viejo_items
    ), dedup AS (
      SELECT DISTINCT ON (item_id) it FROM all_items
       ORDER BY item_id, fuente DESC  -- 'viejo' < 'nuevo' alfabéticamente, así que DESC pone nuevo primero
    )
    SELECT jsonb_agg(it), COUNT(*) INTO v_items_combinados, v_total FROM dedup;

    -- Update el conteo más nuevo con la lista combinada
    UPDATE public.items_conteos
       SET items = v_items_combinados,
           total_items = v_total,
           notas = COALESCE(notas, '') || ' [Fusionado con ' || v_pares.viejo || ']'
     WHERE id = v_pares.nuevo;

    -- Borrar el viejo
    DELETE FROM public.items_conteos WHERE id = v_pares.viejo;

    RAISE NOTICE 'Fusionado: % items en %', v_total, v_pares.nuevo;
  END LOOP;
END $$;

-- Verificar
SELECT id, locacion_id, total_items, jsonb_array_length(items) AS items_real, notas
  FROM public.items_conteos
 WHERE locacion_id IN ('LOC-BAR','LOC-ALMACEN-BAR')
   AND created_at::date = '2026-04-27'
 ORDER BY locacion_id, created_at;
