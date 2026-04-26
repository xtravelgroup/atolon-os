-- Fase 2 motores: repuestos vinculados a inventario, bucket de fotos,
-- categoría de repuestos motores, columnas adicionales.

-- 1. Categoría "Repuestos Motores" (si no existe)
INSERT INTO public.items_categorias (id, nombre, color, icon, orden, activo)
VALUES ('CAT-REPUESTOS-MOTOR', 'Repuestos Motores', '#fb923c', '🔧', 99, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Vincular repuestos en órdenes a items del catálogo (formato extendido):
--    repuestos jsonb ahora soporta:
--      [{ item_id, nombre, cantidad, costo_unit, costo_total,
--         locacion_id, descontado (bool), proveedor, factura }]
-- (no requiere cambio de schema, solo del consumer)

-- 3. Storage bucket para fotos de motores (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('motores', 'motores', true)
ON CONFLICT (id) DO NOTHING;

-- Política para que cualquiera autenticado o anon pueda subir/leer
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'motores_all') THEN
    CREATE POLICY "motores_all" ON storage.objects
      FOR ALL TO authenticated, anon
      USING (bucket_id = 'motores')
      WITH CHECK (bucket_id = 'motores');
  END IF;
END $$;

-- 4. Bloqueo operativo: nueva columna en lanchas para flag de operación
ALTER TABLE public.lanchas
  ADD COLUMN IF NOT EXISTS bloqueada_por_motor boolean DEFAULT false;

-- 5. Función helper: verifica si una lancha tiene motor crítico vencido sin
-- autorización vigente. Usada antes de asignar la lancha a una salida.
CREATE OR REPLACE FUNCTION public.lancha_puede_operar(p_lancha_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  motores_critico int := 0;
  motores_total int := 0;
  motivos jsonb := '[]'::jsonb;
  m RECORD;
  ult_aut RECORD;
BEGIN
  FOR m IN
    SELECT * FROM public.lancha_motores
    WHERE lancha_id = p_lancha_id AND activo = true
  LOOP
    motores_total := motores_total + 1;
    IF m.estado = 'vencido_critico' THEN
      -- Verificar si hay autorización vigente
      SELECT * INTO ult_aut
      FROM public.motor_autorizaciones
      WHERE motor_id = m.id AND NOT usada
      ORDER BY created_at DESC
      LIMIT 1;
      IF NOT FOUND OR (ult_aut.horas_al_autorizar + ult_aut.vigencia_horas < m.horas_actuales) THEN
        motores_critico := motores_critico + 1;
        motivos := motivos || jsonb_build_object(
          'motor_id', m.id, 'codigo', m.codigo, 'estado', m.estado,
          'horas_actuales', m.horas_actuales,
          'requiere_autorizacion', true
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'puede_operar', motores_critico = 0,
    'motores_total', motores_total,
    'motores_critico', motores_critico,
    'motivos', motivos
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.lancha_puede_operar(text) TO anon, authenticated;

-- 6. Trigger: al cerrar OT (estado=finalizada), descontar repuestos marcados
--    con descontado=false del inventario.
CREATE OR REPLACE FUNCTION public.descontar_repuestos_ot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rep jsonb;
  reps_actualizados jsonb := '[]'::jsonb;
  current_stock numeric;
BEGIN
  IF NEW.estado <> 'finalizada' OR (OLD.estado = 'finalizada') THEN
    RETURN NEW;
  END IF;

  FOR rep IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.repuestos, '[]'::jsonb))
  LOOP
    -- Solo descontar repuestos que tienen item_id, locacion_id, y no están
    -- ya descontados
    IF rep->>'item_id' IS NOT NULL
       AND rep->>'locacion_id' IS NOT NULL
       AND COALESCE((rep->>'descontado')::boolean, false) = false
       AND COALESCE((rep->>'cantidad')::numeric, 0) > 0
    THEN
      -- Leer stock actual
      SELECT cantidad INTO current_stock
      FROM public.items_stock_locacion
      WHERE item_id = rep->>'item_id' AND locacion_id = rep->>'locacion_id';
      current_stock := COALESCE(current_stock, 0);

      -- Descontar (puede quedar negativo, advertimos en el motivo)
      INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad, updated_at)
      VALUES (
        rep->>'item_id',
        rep->>'locacion_id',
        current_stock - (rep->>'cantidad')::numeric,
        now()
      )
      ON CONFLICT (item_id, locacion_id)
      DO UPDATE SET
        cantidad = items_stock_locacion.cantidad - (rep->>'cantidad')::numeric,
        updated_at = now();

      -- Registrar en items_ajustes para auditoría
      INSERT INTO public.items_ajustes (
        id, item_id, locacion_id, tipo,
        cantidad_antes, cantidad_despues, diferencia,
        motivo, usuario_email
      )
      VALUES (
        'AJ-OT-' || NEW.id || '-' || (rep->>'item_id'),
        rep->>'item_id',
        rep->>'locacion_id',
        'manual',
        current_stock,
        current_stock - (rep->>'cantidad')::numeric,
        -(rep->>'cantidad')::numeric,
        'Repuesto consumido OT ' || COALESCE(NEW.numero, NEW.id) || ' motor ' || NEW.motor_id,
        COALESCE(NEW.created_by, 'sistema')
      )
      ON CONFLICT (id) DO NOTHING;

      -- Marcar como descontado
      reps_actualizados := reps_actualizados || (rep || jsonb_build_object('descontado', true));
    ELSE
      reps_actualizados := reps_actualizados || rep;
    END IF;
  END LOOP;

  -- Actualizar el array de repuestos con flags descontado=true
  NEW.repuestos := reps_actualizados;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_descontar_repuestos_ot ON public.motor_mantenimientos;
CREATE TRIGGER tr_descontar_repuestos_ot
BEFORE UPDATE OF estado ON public.motor_mantenimientos
FOR EACH ROW EXECUTE FUNCTION public.descontar_repuestos_ot();
