-- ═══════════════════════════════════════════════════════════════════════
-- embarcacion_solicitudes — Solicitudes de servicios de embarcación
-- ═══════════════════════════════════════════════════════════════════════
-- Módulo transaccional. Cualquier área (comercial, hotel, RH, compras) puede
-- solicitar un servicio de embarcación (rentada externa o de flota propia).
-- Operaciones ve la cola, asigna embarcación + capitán + costo, y avanza el
-- estado hasta completado. Standalone: no integrado aún con eventos/reservas
-- (queda como fase 2).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS embarcacion_solicitudes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           text UNIQUE,                -- SES-YYYYMMDD-NNN autogen en trigger
  solicitante_id   uuid,                       -- auth.uid() del creador
  solicitante_nombre text,
  area             text,                       -- "comercial" / "hotel" / "operaciones" / "rh" / "compras" / "otro"

  -- Servicio solicitado
  fecha_servicio   date NOT NULL,
  hora_servicio    time,
  tipo_uso         text NOT NULL DEFAULT 'otro',
    -- pasadias · huespedes · venta_cliente · staff · compras · evento · otro
  ruta             text,                       -- libre o key de embarcaciones.RUTAS
  origen           text,                       -- opcional detalle "Muelle Castillete"
  destino          text,                       -- opcional detalle
  pax              int,                        -- pasajeros
  carga_desc       text,                       -- si es transporte de mercancía
  prioridad        text DEFAULT 'normal',      -- baja · normal · alta · urgente

  -- Referencias opcionales (link a otros módulos)
  referencia_evento_id     text,
  referencia_reserva_id    text,
  referencia_requisicion_id text,
  cliente_nombre   text,                       -- si aplica

  notas            text,

  -- Asignación (llenado por operaciones)
  estado           text NOT NULL DEFAULT 'solicitada',
    -- solicitada · asignada · en_curso · completada · cancelada
  embarcacion_id   text,                       -- fk suave a embarcaciones.id
  embarcacion_nombre text,                     -- snapshot para no perder si se borra
  proveedor_externo text,                      -- si es rentada de terceros
  capitan          text,
  capitan_tel      text,
  costo_estimado   bigint,
  costo_real       bigint,
  cobrado_a        text,                       -- "cliente" · "hotel" · "operaciones" · "compras" · "cortesia"

  asignado_por     uuid,
  asignado_por_nombre text,
  asignado_at      timestamptz,
  iniciado_at      timestamptz,
  completada_at    timestamptz,
  cancelada_at     timestamptz,
  motivo_cancelacion text,

  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),

  CONSTRAINT es_tipo_uso_valido CHECK (tipo_uso IN ('pasadias','huespedes','venta_cliente','staff','compras','evento','otro')),
  CONSTRAINT es_estado_valido   CHECK (estado IN ('solicitada','asignada','en_curso','completada','cancelada')),
  CONSTRAINT es_prioridad_valida CHECK (prioridad IN ('baja','normal','alta','urgente')),
  CONSTRAINT es_pax_positivo    CHECK (pax IS NULL OR pax >= 0),
  CONSTRAINT es_costos_positivos CHECK (
    (costo_estimado IS NULL OR costo_estimado >= 0) AND
    (costo_real IS NULL OR costo_real >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_es_fecha    ON embarcacion_solicitudes(fecha_servicio DESC);
CREATE INDEX IF NOT EXISTS idx_es_estado   ON embarcacion_solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_es_tipo     ON embarcacion_solicitudes(tipo_uso);
CREATE INDEX IF NOT EXISTS idx_es_solicit  ON embarcacion_solicitudes(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_es_evento   ON embarcacion_solicitudes(referencia_evento_id) WHERE referencia_evento_id IS NOT NULL;

-- Auto-código SES-YYYYMMDD-NNN
CREATE OR REPLACE FUNCTION es_generar_codigo() RETURNS trigger AS $$
DECLARE
  fecha_txt text;
  n int;
BEGIN
  IF NEW.codigo IS NOT NULL AND NEW.codigo != '' THEN RETURN NEW; END IF;
  fecha_txt := to_char(NEW.fecha_servicio, 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO n FROM embarcacion_solicitudes
    WHERE fecha_servicio = NEW.fecha_servicio;
  NEW.codigo := 'SES-' || fecha_txt || '-' || LPAD(n::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_es_codigo ON embarcacion_solicitudes;
CREATE TRIGGER trg_es_codigo BEFORE INSERT ON embarcacion_solicitudes
  FOR EACH ROW EXECUTE FUNCTION es_generar_codigo();

-- Auto updated_at
CREATE OR REPLACE FUNCTION es_touch_updated() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_es_updated ON embarcacion_solicitudes;
CREATE TRIGGER trg_es_updated BEFORE UPDATE ON embarcacion_solicitudes
  FOR EACH ROW EXECUTE FUNCTION es_touch_updated();

ALTER TABLE embarcacion_solicitudes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "es_auth_all" ON embarcacion_solicitudes;
CREATE POLICY "es_auth_all" ON embarcacion_solicitudes FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE embarcacion_solicitudes IS
  'Solicitudes de servicios de embarcación (pasadías, huéspedes, venta a cliente, staff, compras, evento). Flujo: solicitada → asignada → en_curso → completada/cancelada. Sin aprobación.';
