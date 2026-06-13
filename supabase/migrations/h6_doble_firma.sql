-- Control interno H-6 · Doble firma para requisiciones > $10M
-- =====================================================================
-- Política: monto >= $10M requiere aprobación de DOS roles distintos:
--   1. Un gerente_general_* (la firma operativa de primera línea)
--   2. Un super_admin o admin (la firma de gobierno/dirección)
--
-- Implementación:
--   - aprobaciones jsonb[] mantiene el registro completo (ya existía
--     en el código). Cada entry: {quien, usuario_id, rol, accion, fecha}
--   - El trigger valida la composición del array antes de permitir
--     que estado pase a 'Aprobada' cuando monto >= $10M.
-- =====================================================================

-- Reemplaza la función previa (req_aprobador_check) con lógica extendida
CREATE OR REPLACE FUNCTION public.req_aprobador_check()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rol_actual text;
  doble_firma_umbral numeric := 10000000;
  tiene_gerente boolean := false;
  tiene_super  boolean := false;
  a jsonb;
BEGIN
  -- Solo aplica al pasar a 'Aprobada'
  IF NEW.estado != 'Aprobada' OR (OLD.estado = NEW.estado AND OLD.aprobador_id = NEW.aprobador_id) THEN
    RETURN NEW;
  END IF;

  -- Petty approval <$200K: sin trigger
  IF NEW.total IS NOT NULL AND NEW.total < 200000 THEN
    RETURN NEW;
  END IF;

  -- Resolver rol del aprobador principal
  SELECT rol_id INTO rol_actual FROM public.usuarios WHERE id = NEW.aprobador_id;
  IF rol_actual IS NULL THEN
    RAISE EXCEPTION
      'Control interno H-6: aprobador % no existe en la tabla usuarios.',
      NEW.aprobador_id USING ERRCODE = '42501';
  END IF;

  -- Branch A: monto < umbral de doble firma → validación simple por matriz
  IF NEW.total < doble_firma_umbral THEN
    IF NOT public.req_rol_satisface_regla(rol_actual, NEW.total) THEN
      RAISE EXCEPTION
        'Control interno H-6: el rol "%" no tiene autoridad para aprobar requisiciones de $%. Consultá la matriz de aprobación.',
        rol_actual, NEW.total::bigint USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Branch B: monto >= $10M → doble firma obligatoria
  -- Revisar el array aprobaciones para confirmar que están las 2 firmas.
  IF NEW.aprobaciones IS NULL OR jsonb_array_length(NEW.aprobaciones) = 0 THEN
    RAISE EXCEPTION
      'Control interno H-6: requisiciones >= $10M requieren doble firma. El array aprobaciones está vacío.'
      USING ERRCODE = '42501';
  END IF;

  -- Recorrer aprobaciones de tipo "aprobada" y verificar roles presentes
  FOR a IN SELECT jsonb_array_elements(NEW.aprobaciones) LOOP
    IF (a->>'accion') = 'aprobada' THEN
      -- Resolver rol por usuario_id si está, sino usar el campo 'rol'
      DECLARE
        usr_id text := a->>'usuario_id';
        rol_entry text;
      BEGIN
        IF usr_id IS NOT NULL THEN
          SELECT rol_id INTO rol_entry FROM public.usuarios WHERE id = usr_id;
        ELSE
          rol_entry := a->>'rol';
        END IF;
        IF rol_entry IS NULL THEN CONTINUE; END IF;
        IF rol_entry LIKE 'gerente_general_%' OR rol_entry = 'gerente_general' THEN
          tiene_gerente := true;
        END IF;
        IF rol_entry IN ('super_admin','admin') THEN
          tiene_super := true;
        END IF;
      END;
    END IF;
  END LOOP;

  IF NOT tiene_gerente THEN
    RAISE EXCEPTION
      'Control interno H-6: requisición >= $10M sin firma de gerente_general. Aprobaciones registradas: %.',
      jsonb_array_length(NEW.aprobaciones) USING ERRCODE = '42501';
  END IF;
  IF NOT tiene_super THEN
    RAISE EXCEPTION
      'Control interno H-6: requisición >= $10M sin firma de super_admin/admin. Aprobaciones registradas: %.',
      jsonb_array_length(NEW.aprobaciones) USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.req_aprobador_check IS
  'Control interno H-6: matriz simple para <$10M; doble firma (gerente_general_* + super_admin/admin) obligatoria para >=$10M.';
