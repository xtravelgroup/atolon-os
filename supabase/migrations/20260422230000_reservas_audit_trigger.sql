-- Trigger automático: loguea toda creación/modificación de reservas en historial_acciones.
-- Captura cambios desde cualquier origen: web, Wompi, portales B2B, edge functions, UI, etc.

-- ── Función ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_reserva_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
  v_accion text;
  v_antes jsonb := NULL;
  v_despues jsonb := NULL;
  v_notas text := NULL;
  v_id text;
  v_cambios text[] := ARRAY[]::text[];
BEGIN
  -- Email del usuario autenticado (o 'sistema' si no hay sesión)
  BEGIN
    v_email := COALESCE(
      lower(nullif(auth.jwt() ->> 'email', '')),
      'sistema'
    );
  EXCEPTION WHEN OTHERS THEN
    v_email := 'sistema';
  END;

  v_id := 'LOG-' || extract(epoch from clock_timestamp())::bigint
               || '-' || substr(md5(random()::text), 1, 5);

  IF TG_OP = 'INSERT' THEN
    v_accion := 'crear_reserva';
    v_despues := to_jsonb(NEW);
    v_notas := 'Creada vía ' || COALESCE(NEW.source, NEW.canal, 'sistema');

  ELSIF TG_OP = 'UPDATE' THEN
    -- Detectar cambios campo por campo (solo campos relevantes)
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      v_cambios := array_append(v_cambios, 'Estado: ' || COALESCE(OLD.estado, '—') || ' → ' || COALESCE(NEW.estado, '—'));
    END IF;
    IF NEW.fecha IS DISTINCT FROM OLD.fecha THEN
      v_cambios := array_append(v_cambios, 'Fecha: ' || COALESCE(OLD.fecha::text, '—') || ' → ' || COALESCE(NEW.fecha::text, '—'));
    END IF;
    IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
      v_cambios := array_append(v_cambios, 'Tipo: ' || COALESCE(OLD.tipo, '—') || ' → ' || COALESCE(NEW.tipo, '—'));
    END IF;
    IF NEW.pax_a IS DISTINCT FROM OLD.pax_a OR NEW.pax_n IS DISTINCT FROM OLD.pax_n THEN
      v_cambios := array_append(v_cambios, 'Pax: ' || COALESCE(OLD.pax_a::text,'0') || 'A ' || COALESCE(OLD.pax_n::text,'0') || 'N → ' || COALESCE(NEW.pax_a::text,'0') || 'A ' || COALESCE(NEW.pax_n::text,'0') || 'N');
    END IF;
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      v_cambios := array_append(v_cambios, 'Total: $' || COALESCE(OLD.total,0) || ' → $' || COALESCE(NEW.total,0));
    END IF;
    IF NEW.abono IS DISTINCT FROM OLD.abono THEN
      v_cambios := array_append(v_cambios, 'Abono: $' || COALESCE(OLD.abono,0) || ' → $' || COALESCE(NEW.abono,0));
    END IF;
    IF NEW.forma_pago IS DISTINCT FROM OLD.forma_pago THEN
      v_cambios := array_append(v_cambios, 'Forma pago: ' || COALESCE(OLD.forma_pago, '—') || ' → ' || COALESCE(NEW.forma_pago, '—'));
    END IF;
    IF NEW.vendedor IS DISTINCT FROM OLD.vendedor THEN
      v_cambios := array_append(v_cambios, 'Vendedor: ' || COALESCE(OLD.vendedor, '—') || ' → ' || COALESCE(NEW.vendedor, '—'));
    END IF;
    IF NEW.aliado_id IS DISTINCT FROM OLD.aliado_id THEN
      v_cambios := array_append(v_cambios, 'Agencia: ' || COALESCE(OLD.aliado_id, '—') || ' → ' || COALESCE(NEW.aliado_id, '—'));
    END IF;
    IF NEW.descuento_agencia IS DISTINCT FROM OLD.descuento_agencia THEN
      v_cambios := array_append(v_cambios, 'Descuento agencia: $' || COALESCE(OLD.descuento_agencia,0) || ' → $' || COALESCE(NEW.descuento_agencia,0));
    END IF;
    IF jsonb_array_length(COALESCE(NEW.pagos, '[]'::jsonb)) IS DISTINCT FROM jsonb_array_length(COALESCE(OLD.pagos, '[]'::jsonb)) THEN
      v_cambios := array_append(v_cambios, 'Pagos: ' || jsonb_array_length(COALESCE(OLD.pagos, '[]'::jsonb)) || ' → ' || jsonb_array_length(COALESCE(NEW.pagos, '[]'::jsonb)));
    END IF;

    -- Si nada relevante cambió, no logear
    IF array_length(v_cambios, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    -- Clasificar la acción
    IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado = 'cancelado' THEN
      v_accion := 'cancelar_reserva';
    ELSIF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado = 'check_in' THEN
      v_accion := 'check_in';
    ELSIF NEW.fecha IS DISTINCT FROM OLD.fecha THEN
      v_accion := 'cambiar_fecha';
    ELSIF NEW.abono IS DISTINCT FROM OLD.abono OR
          jsonb_array_length(COALESCE(NEW.pagos,'[]'::jsonb)) IS DISTINCT FROM jsonb_array_length(COALESCE(OLD.pagos,'[]'::jsonb)) THEN
      v_accion := 'registrar_pago';
    ELSE
      v_accion := 'editar_reserva';
    END IF;

    v_antes   := to_jsonb(OLD);
    v_despues := to_jsonb(NEW);
    v_notas   := array_to_string(v_cambios, ' | ');
  END IF;

  INSERT INTO public.historial_acciones (id, usuario_email, modulo, accion, tabla, registro_id, datos_antes, datos_despues, notas)
  VALUES (v_id, v_email, 'reservas', v_accion, 'reservas', NEW.id, v_antes, v_despues, v_notas);

  RETURN NEW;
END;
$$;

-- ── Triggers ──────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reservas_audit_insert ON public.reservas;
DROP TRIGGER IF EXISTS trg_reservas_audit_update ON public.reservas;

CREATE TRIGGER trg_reservas_audit_insert
  AFTER INSERT ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.log_reserva_change();

CREATE TRIGGER trg_reservas_audit_update
  AFTER UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.log_reserva_change();
