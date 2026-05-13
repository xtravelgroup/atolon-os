-- Performance: índices en columnas filtradas frecuentemente.
-- ──────────────────────────────────────────────────────────────────────
-- Auditoría detectó queries con .eq("fecha"), .gte/.lte, joins por
-- foreign-key (aliado_id, salida_id, etc) y order-by-fecha como hot paths.
-- Con tablas en crecimiento (reservas, eventos, llegadas) esto degrada
-- al usuario al cambiar de módulo. Estos índices son IF NOT EXISTS para
-- ser idempotentes y B-tree por defecto (suficiente para igualdad+rango).

-- ── reservas (la tabla más caliente) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reservas_fecha
  ON reservas(fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_estado_fecha
  ON reservas(estado, fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_aliado_fecha
  ON reservas(aliado_id, fecha DESC)
  WHERE aliado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservas_fecha_pago
  ON reservas(fecha_pago)
  WHERE fecha_pago IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservas_created_at
  ON reservas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservas_grupo_id
  ON reservas(grupo_id)
  WHERE grupo_id IS NOT NULL;

-- ── eventos ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eventos_fecha_stage
  ON eventos(fecha, stage);
CREATE INDEX IF NOT EXISTS idx_eventos_aliado
  ON eventos(aliado_id)
  WHERE aliado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eventos_fecha
  ON eventos(fecha DESC);

-- ── muelle / despachos ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_muelle_llegadas_fecha
  ON muelle_llegadas(fecha, tipo);
CREATE INDEX IF NOT EXISTS idx_salida_despachos_fecha
  ON salida_despachos(fecha, salida_id);
CREATE INDEX IF NOT EXISTS idx_salidas_override_fecha
  ON salidas_override(fecha);
CREATE INDEX IF NOT EXISTS idx_muelle_zarpes_flota_fecha
  ON muelle_zarpes_flota(fecha DESC);

-- ── cierres de caja / financiero ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cierres_fecha_activo
  ON cierres(fecha, activo)
  WHERE activo = true;

-- ── B2B ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_b2b_convenios_aliado
  ON b2b_convenios(aliado_id, activo);
CREATE INDEX IF NOT EXISTS idx_b2b_visitas_aliado_fecha
  ON b2b_visitas(aliado_id, fecha DESC);

-- ── Auditoría / histórico ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_historial_acciones_created
  ON historial_acciones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservas_historial_reserva
  ON reservas_historial(reserva_id, created_at DESC);

-- ── usuarios ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_usuarios_email_lower
  ON usuarios(lower(email));

-- ── lancha / flota ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lancha_bitacora_fecha
  ON lancha_bitacora(fecha DESC, hora DESC);

-- ── ordenes de compra ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_estado
  ON ordenes_compra(estado, created_at DESC)
  WHERE estado != 'cancelada';
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_proveedor
  ON ordenes_compra(proveedor_id, created_at DESC)
  WHERE proveedor_id IS NOT NULL;

-- Análisis: refrescar estadísticas para que el planner use los nuevos
-- índices inmediatamente.
ANALYZE reservas;
ANALYZE eventos;
ANALYZE muelle_llegadas;
ANALYZE muelle_zarpes_flota;
ANALYZE salida_despachos;
ANALYZE b2b_visitas;
ANALYZE b2b_convenios;
ANALYZE historial_acciones;
ANALYZE ordenes_compra;
