-- Trigger: cuando se inserta/actualiza una reserva SIN lead_id, buscar un
-- lead existente por email/telefono y auto-vincular. Solo se asigna cuando
-- hay UN unico match para no cross-linkear leads distintos.

CREATE OR REPLACE FUNCTION public.reservas_auto_link_lead()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id text;
  v_count int;
  v_email text := LOWER(TRIM(COALESCE(NEW.email, NEW.contacto, '')));
  v_tel   text := REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9]', '', 'g');
BEGIN
  -- Solo actuar si el nuevo registro NO tiene lead_id y hay dato de contacto.
  IF NEW.lead_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF v_email = '' AND length(v_tel) < 7 THEN
    RETURN NEW;
  END IF;

  -- Contar candidatos (para evitar cross-link en caso de multiples matches)
  SELECT count(*), MIN(l.id) INTO v_count, v_lead_id
  FROM leads l
  WHERE (v_email <> '' AND LOWER(TRIM(COALESCE(l.email, l.contacto, ''))) = v_email)
     OR (length(v_tel) >= 7 AND REGEXP_REPLACE(COALESCE(l.tel, ''), '[^0-9]', '', 'g') = v_tel);

  IF v_count = 1 AND v_lead_id IS NOT NULL THEN
    NEW.lead_id := v_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservas_auto_link_lead ON public.reservas;
CREATE TRIGGER trg_reservas_auto_link_lead
BEFORE INSERT OR UPDATE OF email, contacto, telefono ON public.reservas
FOR EACH ROW
EXECUTE FUNCTION public.reservas_auto_link_lead();

-- Test: contar cuantas reservas tienen lead_id ahora
SELECT count(*) FILTER (WHERE lead_id IS NOT NULL) AS con_lead,
       count(*) FILTER (WHERE lead_id IS NULL) AS sin_lead
FROM reservas WHERE created_at >= NOW() - INTERVAL '90 days';
-- Trigger inverso: cuando se crea/actualiza un lead con email/tel, buscar
-- reservas huerfanas con ese contacto y auto-vincularlas.

CREATE OR REPLACE FUNCTION public.leads_auto_link_reservas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_email text := LOWER(TRIM(COALESCE(NEW.email, NEW.contacto, '')));
  v_tel   text := REGEXP_REPLACE(COALESCE(NEW.tel, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_email = '' AND length(v_tel) < 7 THEN
    RETURN NEW;
  END IF;

  -- Enlazar solo reservas SIN lead_id (evitar sobreescribir vinculos existentes)
  UPDATE reservas r
  SET lead_id = NEW.id,
      updated_at = NOW()
  WHERE r.lead_id IS NULL
    AND (
      (v_email <> '' AND LOWER(TRIM(COALESCE(r.email, r.contacto, ''))) = v_email)
      OR (length(v_tel) >= 7 AND REGEXP_REPLACE(COALESCE(r.telefono, ''), '[^0-9]', '', 'g') = v_tel)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_auto_link_reservas ON public.leads;
CREATE TRIGGER trg_leads_auto_link_reservas
AFTER INSERT OR UPDATE OF email, contacto, tel ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.leads_auto_link_reservas();
