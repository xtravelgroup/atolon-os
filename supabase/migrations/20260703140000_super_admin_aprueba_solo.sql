-- Permitir que super_admin y admin aprueben cualquier monto solos, sin
-- requerir doble firma. Antes la matriz H-6 exigía doble firma obligatoria
-- (gerente + super_admin) para reqs >= $10M — pero la dirección/super_admin
-- ya tienen la máxima autoridad y no necesitan validación externa.
--
-- Reportado por Eric 2026-07-03: "Yo doy dirección y debo poder aprobar
-- cualquier cosa".
--
-- El cambio se hace en el trigger req_aprobador_check: si el aprobador
-- principal (NEW.aprobador_id) resuelve a rol super_admin o admin, salta
-- la validación de doble firma y aprueba directamente.
-- gerente_general_* SÍ sigue necesitando la firma de super_admin/admin
-- cuando el monto es >= $10M (control interno de la matriz).

CREATE OR REPLACE FUNCTION public.req_aprobador_check() RETURNS trigger AS $$
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

  -- Excepción: super_admin y admin tienen autoridad máxima y aprueban
  -- cualquier monto SIN necesitar doble firma. La firma de dirección es
  -- self-suficiente.
  IF rol_actual IN ('super_admin', 'admin') THEN
    RETURN NEW;
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

  -- Branch B: monto >= $10M por aprobador NO super_admin → doble firma
  IF NEW.aprobaciones IS NULL OR jsonb_array_length(NEW.aprobaciones) = 0 THEN
    RAISE EXCEPTION
      'Control interno H-6: requisiciones >= $10M requieren doble firma (gerente + super_admin/admin). El array aprobaciones está vacío.'
      USING ERRCODE = '42501';
  END IF;

  FOR a IN SELECT jsonb_array_elements(NEW.aprobaciones) LOOP
    IF (a->>'accion') = 'aprobada' THEN
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
END
$$ LANGUAGE plpgsql;
