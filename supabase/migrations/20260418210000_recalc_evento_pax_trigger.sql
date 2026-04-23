-- Trigger que recalcula eventos.pax automáticamente:
-- pax = personas(pasadias_org) [sin Impuesto Muelle ni STAFF]
--     + Σ reservas.pax vinculadas al grupo (sin las cortesías duplicadas)

-- ─── Función de recálculo ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recalc_evento_pax(p_evento_id text) RETURNS void AS $$
DECLARE
  v_pax_org int := 0;
  v_pax_res int := 0;
  v_pasadias jsonb;
BEGIN
  IF p_evento_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(pasadias_org, '[]'::jsonb) INTO v_pasadias FROM eventos WHERE id = p_evento_id;

  -- Pax de pasadias_org (sin Impuesto Muelle ni STAFF)
  SELECT COALESCE(SUM((p->>'personas')::int), 0)
    INTO v_pax_org
    FROM jsonb_array_elements(v_pasadias) p
   WHERE p->>'tipo' NOT IN ('Impuesto Muelle','STAFF')
     AND (p->>'personas') ~ '^[0-9]+$';

  -- Pax de reservas vinculadas (excluyendo cortesías ya representadas en pasadias_org)
  SELECT COALESCE(SUM(r.pax), 0)
    INTO v_pax_res
    FROM reservas r
   WHERE r.grupo_id = p_evento_id
     AND r.estado <> 'cancelado'
     AND r.id NOT IN (
       SELECT p->>'reserva_id' FROM jsonb_array_elements(v_pasadias) p
       WHERE (p->>'cortesia')::boolean = true AND p->>'reserva_id' IS NOT NULL
     );

  UPDATE eventos
     SET pax = v_pax_org + v_pax_res,
         updated_at = now()
   WHERE id = p_evento_id
     AND pax IS DISTINCT FROM v_pax_org + v_pax_res;
END;
$$ LANGUAGE plpgsql;

-- ─── Trigger sobre reservas ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_recalc_evento_pax_reservas() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_evento_pax(OLD.grupo_id);
    RETURN OLD;
  END IF;
  -- INSERT o UPDATE: si grupo_id cambió, recalcular ambos
  IF TG_OP = 'UPDATE' AND (OLD.grupo_id IS DISTINCT FROM NEW.grupo_id) THEN
    PERFORM recalc_evento_pax(OLD.grupo_id);
  END IF;
  PERFORM recalc_evento_pax(NEW.grupo_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reservas_recalc_evento_pax ON reservas;
CREATE TRIGGER trg_reservas_recalc_evento_pax
AFTER INSERT OR UPDATE OR DELETE ON reservas
FOR EACH ROW EXECUTE FUNCTION trg_recalc_evento_pax_reservas();

-- ─── Trigger sobre eventos (cuando cambia pasadias_org) ────────────────────
CREATE OR REPLACE FUNCTION trg_recalc_evento_pax_eventos() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.pasadias_org IS DISTINCT FROM NEW.pasadias_org) THEN
    PERFORM recalc_evento_pax(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eventos_recalc_pax ON eventos;
CREATE TRIGGER trg_eventos_recalc_pax
AFTER INSERT OR UPDATE OF pasadias_org ON eventos
FOR EACH ROW EXECUTE FUNCTION trg_recalc_evento_pax_eventos();

-- ─── Recalcular todos los eventos existentes una vez ───────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM eventos WHERE categoria = 'grupo' OR aliado_id IS NOT NULL LOOP
    PERFORM recalc_evento_pax(r.id);
  END LOOP;
END $$;
