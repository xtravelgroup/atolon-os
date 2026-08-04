-- =====================================================================
-- Link de pago para balance de Grupos/Eventos
-- Reutiliza la infra de 'reservas' (checkout Wompi/Stripe/Zoho, PagoCliente)
-- creando una reserva-espejo con evento_id_balance.
-- Trigger copia el pago al evento cuando se confirma.
-- =====================================================================

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS evento_id_balance text REFERENCES eventos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_reservas_evento_balance
  ON reservas(evento_id_balance) WHERE evento_id_balance IS NOT NULL;

-- Trigger: cuando la reserva-balance recibe abono/queda confirmada, copiar
-- el pago al array evento.pagos[] y marcar la reserva como cerrada.
CREATE OR REPLACE FUNCTION reserva_balance_to_evento_pago()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ev eventos%ROWTYPE;
  v_pago jsonb;
  v_ya boolean;
BEGIN
  IF NEW.evento_id_balance IS NULL THEN RETURN NEW; END IF;
  -- Trigger sólo cuando el abono aumenta y el estado ya es confirmado/pagado
  IF COALESCE(NEW.abono,0) <= COALESCE(OLD.abono,0) THEN RETURN NEW; END IF;
  IF NEW.estado NOT IN ('confirmado','pagado') THEN RETURN NEW; END IF;

  SELECT * INTO v_ev FROM eventos WHERE id = NEW.evento_id_balance;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Dedup por reference (id de la reserva-balance) para idempotencia
  v_ya := EXISTS(
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_ev.pagos, '[]'::jsonb)) p
    WHERE p->>'reference' = NEW.id
  );
  IF v_ya THEN RETURN NEW; END IF;

  v_pago := jsonb_build_object(
    'id',              'PAG-' || extract(epoch from now())::bigint,
    'monto',           NEW.abono,
    'forma_pago',      COALESCE(NEW.forma_pago, 'Wompi'),
    'fecha',           to_char(now() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD'),
    'notas',           'Pago recibido via link (' || NEW.id || ')',
    'registrado_por',  'Sistema · link de pago',
    'reference',       NEW.id,
    'comprobante_url', NEW.comprobante_url
  );

  UPDATE eventos
     SET pagos = COALESCE(pagos, '[]'::jsonb) || v_pago
   WHERE id = NEW.evento_id_balance;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reserva_balance_to_evento ON reservas;
CREATE TRIGGER trg_reserva_balance_to_evento
  AFTER UPDATE OF abono, estado ON reservas
  FOR EACH ROW EXECUTE FUNCTION reserva_balance_to_evento_pago();
