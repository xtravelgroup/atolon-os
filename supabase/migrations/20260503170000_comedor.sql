-- Comedor: registro de comidas + costo del comedor.
-- ──────────────────────────────────────────────────────────────────
-- 3 comidas: desayuno · almuerzo · cena. Para staff (incluido según horario)
-- y contratistas (siempre se cobra). Cocina carga el menú del día y los
-- consumos de inventario (igual mecánica que Open Bar de Eventos).

-- ─── MENÚ DEL DÍA (lo que se sirve) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS comedor_menus (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha       date NOT NULL,
  comida      text NOT NULL CHECK (comida IN ('desayuno', 'almuerzo', 'cena')),
  plato       text NOT NULL,
  descripcion text,
  alergenos   text,
  foto_url    text,
  notas       text,
  creado_por  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (fecha, comida)
);
CREATE INDEX IF NOT EXISTS idx_comedor_menu_fecha ON comedor_menus(fecha DESC);

-- ─── REGISTRO DE COMIDAS (quién comió qué) ──────────────────────────
CREATE TABLE IF NOT EXISTS comedor_registros (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha         date NOT NULL,
  comida        text NOT NULL CHECK (comida IN ('desayuno', 'almuerzo', 'cena')),
  comensal_tipo text NOT NULL CHECK (comensal_tipo IN ('empleado', 'contratista', 'invitado')),
  comensal_id   text,                                -- empleado_id (uuid) o cedula contratista
  comensal_nombre text NOT NULL,                    -- snapshot del nombre
  cargo         text,
  -- Si el horario del empleado cubre esta comida → tipo='incluido' (sin cobro)
  -- Si come fuera de su jornada → tipo='extra' (cobro a folio/nómina)
  -- Contratistas SIEMPRE son tipo='cobrado'
  tipo          text NOT NULL DEFAULT 'incluido' CHECK (tipo IN ('incluido', 'extra', 'cobrado')),
  monto_cobro   numeric DEFAULT 0,                  -- precio si extra/cobrado
  cobrado       boolean DEFAULT false,              -- ya se descontó/facturó?
  notas         text,
  registrado_por text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comedor_registros_fecha ON comedor_registros(fecha DESC, comida);
CREATE INDEX IF NOT EXISTS idx_comedor_registros_comensal ON comedor_registros(comensal_id, fecha DESC);

-- ─── CONSUMO DE INVENTARIO (costo del comedor) ─────────────────────
-- Mismo patrón que eventos_consumo_openbar pero para ingredientes/insumos
-- usados en preparar las comidas del día. Se descuenta del stock + Loggro.
CREATE TABLE IF NOT EXISTS comedor_consumo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha           date NOT NULL,
  comida          text CHECK (comida IN ('desayuno', 'almuerzo', 'cena', 'general')),
  item_id         text NOT NULL REFERENCES items_catalogo(id),
  cantidad        numeric NOT NULL CHECK (cantidad > 0),
  unidad          text,
  locacion_id     text REFERENCES items_locaciones(id),
  precio_unitario numeric NOT NULL DEFAULT 0,
  costo_total     numeric NOT NULL DEFAULT 0,
  notas           text,
  registrado_por  text,
  anulado         boolean DEFAULT false,
  anulado_por     text,
  anulado_at      timestamptz,
  motivo_anulacion text,
  loggro_sync_status text DEFAULT 'pendiente',
  loggro_movement_id text,
  loggro_sync_error  text,
  loggro_sync_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comedor_consumo_fecha ON comedor_consumo(fecha DESC, comida) WHERE anulado = false;

-- Trigger para descontar stock al insertar/anular (mismo patrón que eventos)
CREATE OR REPLACE FUNCTION comedor_consumo_descontar_stock() RETURNS trigger AS $$
DECLARE delta numeric;
BEGIN
  IF TG_OP = 'INSERT' AND COALESCE(NEW.anulado, false) = false THEN
    delta := -NEW.cantidad;
  ELSIF TG_OP = 'UPDATE' AND OLD.anulado IS DISTINCT FROM NEW.anulado THEN
    IF NEW.anulado = true  THEN delta := NEW.cantidad;  END IF;
    IF NEW.anulado = false THEN delta := -NEW.cantidad; END IF;
  ELSE
    RETURN NEW;
  END IF;
  IF NEW.locacion_id IS NOT NULL THEN
    INSERT INTO items_stock_locacion (item_id, locacion_id, cantidad, updated_at)
    VALUES (NEW.item_id, NEW.locacion_id, delta, now())
    ON CONFLICT (item_id, locacion_id)
    DO UPDATE SET cantidad = items_stock_locacion.cantidad + delta, updated_at = now();
  END IF;
  UPDATE items_catalogo SET stock_actual = COALESCE(stock_actual, 0) + delta, updated_at = now() WHERE id = NEW.item_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_comedor_consumo_stock ON comedor_consumo;
CREATE TRIGGER trg_comedor_consumo_stock
  AFTER INSERT OR UPDATE ON comedor_consumo
  FOR EACH ROW EXECUTE FUNCTION comedor_consumo_descontar_stock();

CREATE OR REPLACE FUNCTION comedor_consumo_devolver_stock() RETURNS trigger AS $$
BEGIN
  IF COALESCE(OLD.anulado, false) = false THEN
    IF OLD.locacion_id IS NOT NULL THEN
      UPDATE items_stock_locacion SET cantidad = cantidad + OLD.cantidad, updated_at = now()
        WHERE item_id = OLD.item_id AND locacion_id = OLD.locacion_id;
    END IF;
    UPDATE items_catalogo SET stock_actual = COALESCE(stock_actual, 0) + OLD.cantidad, updated_at = now() WHERE id = OLD.item_id;
  END IF;
  RETURN OLD;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_comedor_consumo_delete ON comedor_consumo;
CREATE TRIGGER trg_comedor_consumo_delete BEFORE DELETE ON comedor_consumo
  FOR EACH ROW EXECUTE FUNCTION comedor_consumo_devolver_stock();

-- ─── PRECIOS DEL COMEDOR (cobro a contratistas / extra) ─────────────
CREATE TABLE IF NOT EXISTS comedor_precios (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comida  text NOT NULL UNIQUE CHECK (comida IN ('desayuno', 'almuerzo', 'cena')),
  precio  numeric NOT NULL DEFAULT 0,
  vigente_desde date DEFAULT CURRENT_DATE,
  updated_at timestamptz DEFAULT now()
);

-- Seed con precios placeholder (admin los ajusta luego)
INSERT INTO comedor_precios (comida, precio) VALUES
  ('desayuno', 10000),
  ('almuerzo', 15000),
  ('cena',     12000)
ON CONFLICT (comida) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE comedor_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE comedor_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE comedor_consumo ENABLE ROW LEVEL SECURITY;
ALTER TABLE comedor_precios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='comedor_menus'::regclass AND polname='comedor_menus_auth_all') THEN
    EXECUTE 'CREATE POLICY comedor_menus_auth_all ON comedor_menus FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='comedor_registros'::regclass AND polname='comedor_registros_auth_all') THEN
    EXECUTE 'CREATE POLICY comedor_registros_auth_all ON comedor_registros FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='comedor_consumo'::regclass AND polname='comedor_consumo_auth_all') THEN
    EXECUTE 'CREATE POLICY comedor_consumo_auth_all ON comedor_consumo FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='comedor_precios'::regclass AND polname='comedor_precios_auth_all') THEN
    EXECUTE 'CREATE POLICY comedor_precios_auth_all ON comedor_precios FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─── FUNCIÓN: lista de comensales esperados según horarios del día ──
-- Determina qué empleados deberían comer hoy basado en su horario.
-- Reglas (configurables después):
--   • Empleado con horario que incluye 06:00-10:00 → desayuno incluido
--   • Empleado con horario que incluye 12:00-14:00 → almuerzo incluido
--   • Empleado con horario que incluye 18:00-21:00 → cena incluida
CREATE OR REPLACE VIEW comedor_comensales_esperados AS
SELECT
  h.empleado_id,
  e.nombres || ' ' || e.apellidos AS nombre,
  e.cargo,
  h.fecha,
  h.hora_ini,
  h.hora_fin,
  -- Lógica simple: si el horario del empleado abarca la franja, le toca esa comida
  (h.hora_ini <= TIME '10:00' AND h.hora_fin >= TIME '06:00') AS incluye_desayuno,
  (h.hora_ini <= TIME '14:00' AND h.hora_fin >= TIME '12:00') AS incluye_almuerzo,
  (h.hora_ini <= TIME '21:00' AND h.hora_fin >= TIME '18:00') AS incluye_cena
FROM rh_horarios h
JOIN rh_empleados e ON e.id = h.empleado_id
WHERE h.tipo = 'turno' AND h.hora_ini IS NOT NULL AND h.hora_fin IS NOT NULL;

GRANT SELECT ON comedor_comensales_esperados TO authenticated;

NOTIFY pgrst, 'reload schema';
