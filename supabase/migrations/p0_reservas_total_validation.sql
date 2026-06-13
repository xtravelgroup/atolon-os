-- Fase 0 · Validacion server-side del total de reservas WEB
-- =====================================================================
-- Hallazgo (audit rank 8): BookingPopup calcula grandTotal client-side
-- desde product.precio (state React). Atacante muta product.precio en
-- devtools, paga $1K en Wompi (con integrity key expuesta en bundle Vite),
-- el webhook valida monto >= reserva.total = $1K, queda confirmada.
--
-- Defensa server-side: trigger BEFORE INSERT que para canal='WEB',
-- recalcula el MINIMO esperado desde pasadias.precio y rechaza si
-- reserva.total esta por debajo. Permite upsells subir el total
-- (validamos minimo, no exacto).
--
-- Casos exentos del trigger:
--   - canal != 'WEB' (eventos, B2B, grupo — sus precios son negociados)
--   - aliado_id IS NOT NULL (precio neto agencia, no publico)
--   - grupo_id IS NOT NULL (precio del evento padre, no de pasadias)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reservas_validate_total_web()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  pasadia_precio       int;
  pasadia_precio_nino  int;
  expected_min         int;
  paxA                 int := COALESCE(NEW.pax_a, 0);
  paxN                 int := COALESCE(NEW.pax_n, 0);
BEGIN
  -- Solo aplicar a reservas WEB publicas sin grupo/aliado
  IF NEW.canal != 'WEB' OR NEW.aliado_id IS NOT NULL OR NEW.grupo_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Resolver precio de la pasadia por nombre (= reserva.tipo)
  SELECT precio, COALESCE(precio_nino, 0)
    INTO pasadia_precio, pasadia_precio_nino
  FROM public.pasadias
  WHERE upper(trim(nombre)) = upper(trim(NEW.tipo))
    AND activo = true
    AND web_publica = true
  LIMIT 1;

  IF pasadia_precio IS NULL THEN
    -- Tipo no matchea con pasadias publicas activas — bloquear
    RAISE EXCEPTION
      'Tipo de pasadia desconocida o no publica: %. Total no validable.',
      NEW.tipo USING ERRCODE = '42501';
  END IF;

  expected_min := pasadia_precio * paxA + pasadia_precio_nino * paxN;

  IF NEW.total < expected_min THEN
    RAISE EXCEPTION
      'Total reserva ($%) menor al minimo esperado ($%) para % con %a + %n. Posible tampering client-side.',
      NEW.total, expected_min, NEW.tipo, paxA, paxN
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reservas_validate_total_web ON public.reservas;
CREATE TRIGGER trg_reservas_validate_total_web
  BEFORE INSERT ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.reservas_validate_total_web();

COMMENT ON FUNCTION public.reservas_validate_total_web IS
  'Control interno: para reservas canal=WEB sin grupo/aliado, valida que reserva.total >= pasadias.precio * pax_a + pasadias.precio_nino * pax_n. Bloquea tampering client-side del precio antes del pago.';
