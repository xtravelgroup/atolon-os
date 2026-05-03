-- Eventos: registro de consumo de open bar.
-- ──────────────────────────────────────────────────────────────────
-- Durante un evento (open bar), el servicio carga lo que se va usando
-- (botellas, mixers, snacks). Cada registro descuenta del stock de la
-- locación correspondiente y captura el precio_compra del momento como
-- snapshot, así el costo del evento queda fijo aunque después suba el
-- precio de compra.

CREATE TABLE IF NOT EXISTS eventos_consumo_openbar (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id       text NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  item_id         text NOT NULL REFERENCES items_catalogo(id),
  cantidad        numeric NOT NULL CHECK (cantidad > 0),
  unidad          text,                           -- snapshot al momento ('botella','copa','unidad',etc)
  locacion_id     text REFERENCES items_locaciones(id),  -- de dónde se descontó
  precio_unitario numeric NOT NULL DEFAULT 0,     -- snapshot del precio_compra
  costo_total     numeric NOT NULL DEFAULT 0,     -- cantidad × precio_unitario
  notas           text,
  registrado_por  text,                           -- email
  anulado         boolean DEFAULT false,
  anulado_por     text,
  anulado_at      timestamptz,
  motivo_anulacion text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consumo_evento ON eventos_consumo_openbar(evento_id, anulado);
CREATE INDEX IF NOT EXISTS idx_consumo_item ON eventos_consumo_openbar(item_id, created_at DESC);

-- Trigger: descontar stock automáticamente al insert/update.
-- Si la locación viene seteada → descuenta de items_stock_locacion.
-- Siempre actualiza items_catalogo.stock_actual (totalizador global).
CREATE OR REPLACE FUNCTION evento_consumo_descontar_stock() RETURNS trigger AS $$
DECLARE
  delta numeric;
BEGIN
  -- INSERT nuevo no anulado → restar
  IF TG_OP = 'INSERT' AND COALESCE(NEW.anulado, false) = false THEN
    delta := -NEW.cantidad;
  -- UPDATE: cambio de anulado → ajustar (devolver o volver a sacar)
  ELSIF TG_OP = 'UPDATE' AND OLD.anulado IS DISTINCT FROM NEW.anulado THEN
    -- anulado=true → devolver al inventario (delta positivo)
    -- anulado=false (reactivar) → volver a descontar
    IF NEW.anulado = true  THEN delta := NEW.cantidad;  END IF;
    IF NEW.anulado = false THEN delta := -NEW.cantidad; END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Stock por locación (si está seteada)
  IF NEW.locacion_id IS NOT NULL THEN
    INSERT INTO items_stock_locacion (item_id, locacion_id, cantidad, updated_at)
    VALUES (NEW.item_id, NEW.locacion_id, delta, now())
    ON CONFLICT (item_id, locacion_id)
    DO UPDATE SET cantidad = items_stock_locacion.cantidad + delta, updated_at = now();
  END IF;

  -- Stock global
  UPDATE items_catalogo
  SET stock_actual = COALESCE(stock_actual, 0) + delta, updated_at = now()
  WHERE id = NEW.item_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consumo_descontar ON eventos_consumo_openbar;
CREATE TRIGGER trg_consumo_descontar
  AFTER INSERT OR UPDATE ON eventos_consumo_openbar
  FOR EACH ROW EXECUTE FUNCTION evento_consumo_descontar_stock();

-- DELETE: devolver al stock (por si alguien borra en vez de anular)
CREATE OR REPLACE FUNCTION evento_consumo_devolver_stock() RETURNS trigger AS $$
BEGIN
  IF COALESCE(OLD.anulado, false) = false THEN
    IF OLD.locacion_id IS NOT NULL THEN
      UPDATE items_stock_locacion
      SET cantidad = cantidad + OLD.cantidad, updated_at = now()
      WHERE item_id = OLD.item_id AND locacion_id = OLD.locacion_id;
    END IF;
    UPDATE items_catalogo
    SET stock_actual = COALESCE(stock_actual, 0) + OLD.cantidad, updated_at = now()
    WHERE id = OLD.item_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumo_delete ON eventos_consumo_openbar;
CREATE TRIGGER trg_consumo_delete
  BEFORE DELETE ON eventos_consumo_openbar
  FOR EACH ROW EXECUTE FUNCTION evento_consumo_devolver_stock();

-- RLS
ALTER TABLE eventos_consumo_openbar ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='eventos_consumo_openbar'::regclass AND polname='consumo_auth_all') THEN
    EXECUTE 'CREATE POLICY consumo_auth_all ON eventos_consumo_openbar FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='eventos_consumo_openbar'::regclass AND polname='consumo_anon_all') THEN
    -- anon también para que el portal/POS de servicio pueda registrar sin auth
    EXECUTE 'CREATE POLICY consumo_anon_all ON eventos_consumo_openbar FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Asegurar PK compuesto en items_stock_locacion (para el ON CONFLICT del trigger)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'items_stock_locacion'::regclass
      AND contype = 'p'
  ) THEN
    EXECUTE 'ALTER TABLE items_stock_locacion ADD PRIMARY KEY (item_id, locacion_id)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
