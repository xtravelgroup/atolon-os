-- ══════════════════════════════════════════════════════════════
-- Actividades — Catálogo de actividades y ventas
-- ══════════════════════════════════════════════════════════════

-- ── Table: actividades ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS actividades (
  id           text PRIMARY KEY,
  nombre       text NOT NULL,
  categoria    text,
  descripcion  text,
  precio       integer DEFAULT 0,
  precio_nino  integer DEFAULT 0,     -- 0 = sin precio niño
  duracion     text,                  -- e.g. "1 hora", "2 horas"
  cupo_max     integer,               -- NULL = sin límite
  proveedor    text,
  activo       boolean DEFAULT true,
  orden        integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS actividades_activo_idx ON actividades (activo);
CREATE INDEX IF NOT EXISTS actividades_orden_idx  ON actividades (orden);

ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON actividades;
CREATE POLICY "allow_all" ON actividades FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Table: actividades_ventas ─────────────────────────────────
CREATE TABLE IF NOT EXISTS actividades_ventas (
  id                 text PRIMARY KEY,
  actividad_id       text,
  actividad_nombre   text,            -- snapshot del nombre
  cliente_nombre     text,
  cliente_tel        text,
  adultos            integer DEFAULT 1,
  ninos              integer DEFAULT 0,
  precio_unitario    integer DEFAULT 0,
  precio_nino_unit   integer DEFAULT 0,
  total              integer DEFAULT 0,
  forma_pago         text CHECK (forma_pago IN ('efectivo','datafono','transferencia','cxc','habitacion','link')),
  estado             text DEFAULT 'pagado' CHECK (estado IN ('pagado','pendiente','cancelado')),
  fecha              date,
  hora               text,
  notas              text,
  items              jsonb,           -- [{actividad_id, nombre, adultos, ninos, precio_unit, precio_nino_unit, subtotal}]
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS actividades_ventas_fecha_idx      ON actividades_ventas (fecha);
CREATE INDEX IF NOT EXISTS actividades_ventas_actividad_idx  ON actividades_ventas (actividad_id);
CREATE INDEX IF NOT EXISTS actividades_ventas_created_at_idx ON actividades_ventas (created_at DESC);

ALTER TABLE actividades_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON actividades_ventas;
CREATE POLICY "allow_all" ON actividades_ventas FOR ALL TO anon USING (true) WITH CHECK (true);
