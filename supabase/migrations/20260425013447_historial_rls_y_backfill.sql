-- Fix: historial_acciones y reservas_historial — RLS policies + backfill
-- Bug: historial_acciones tenía policy solo TO {anon}, usuarios autenticados (staff)
-- bloqueados al insertar logs. Reservas WEB sin logAccion en BookingPopup.
-- Wompi webhook escribía en reservas_historial (tabla equivocada — el tab Historial
-- lee de historial_acciones).

-- ── Fix 1a: historial_acciones — agregar policy para authenticated ───────────
DROP POLICY IF EXISTS "allow_all" ON historial_acciones;
DROP POLICY IF EXISTS "historial_acciones_all" ON historial_acciones;
CREATE POLICY "historial_acciones_all" ON historial_acciones
  FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- ── Fix 1b: reservas_historial (usado por B2B y antes por webhook) ───────────
DROP POLICY IF EXISTS "reservas_historial_all" ON reservas_historial;
CREATE POLICY "reservas_historial_all" ON reservas_historial
  FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- ── Fix 4: Backfill historial_acciones para reservas sin logs ────────────────
-- Reconstruimos eventos básicos: creación + pago confirmado (cuando aplica).

-- Evento 1: reserva creada
INSERT INTO historial_acciones (id, usuario_email, modulo, accion, tabla, registro_id, datos_despues, notas, created_at)
SELECT
  'LOG-BF-CREATE-' || r.id,
  CASE
    WHEN r.canal = 'WEB' THEN 'cliente@web.atolon.co'
    WHEN r.canal = 'B2B' OR r.aliado_id IS NOT NULL THEN COALESCE(r.vendedor, 'admin@atolon.co')
    WHEN r.canal = 'Cortesía' THEN 'admin@atolon.co'
    ELSE 'sistema'
  END,
  'reservas',
  'crear_reserva',
  'reservas',
  r.id,
  jsonb_build_object(
    'canal',  r.canal,
    'tipo',   r.tipo,
    'fecha',  r.fecha,
    'pax',    r.pax,
    'total',  r.total,
    'nombre', r.nombre,
    'email',  r.email
  ),
  CONCAT(
    '📅 Reserva creada (backfill)',
    ' · Canal: ', COALESCE(r.canal, 's/d'),
    ' · ', COALESCE(r.tipo, 's/d'),
    ' · ', COALESCE(r.pax::text, '0'), ' pax',
    ' · Total ', TO_CHAR(COALESCE(r.total, 0), 'FM$999G999G999')
  ),
  COALESCE(r.created_at, NOW())
FROM reservas r
WHERE NOT EXISTS (
  SELECT 1 FROM historial_acciones h
  WHERE h.registro_id = r.id AND h.accion IN ('crear_reserva', 'crear_reserva_b2b')
);

-- Evento 2: pago confirmado (si la reserva quedó confirmada con abono > 0)
INSERT INTO historial_acciones (id, usuario_email, modulo, accion, tabla, registro_id, datos_antes, datos_despues, notas, created_at)
SELECT
  'LOG-BF-PAGO-' || r.id,
  CASE
    WHEN r.forma_pago = 'wompi' THEN 'wompi@webhook'
    WHEN r.forma_pago IS NULL THEN 'sistema'
    ELSE 'admin@atolon.co'
  END,
  'reservas',
  'registrar_pago',
  'reservas',
  r.id,
  jsonb_build_object('estado', 'pendiente_pago', 'abono', 0),
  jsonb_build_object(
    'estado',     'confirmado',
    'abono',      r.abono,
    'forma_pago', r.forma_pago,
    'fecha_pago', r.fecha_pago
  ),
  CONCAT(
    '✅ Pago confirmado (backfill)',
    ' · ', TO_CHAR(COALESCE(r.abono, 0), 'FM$999G999G999'),
    ' · ', COALESCE(r.forma_pago, 's/d'),
    CASE WHEN r.fecha_pago IS NOT NULL THEN ' · ' || r.fecha_pago::text ELSE '' END
  ),
  COALESCE(
    CASE
      WHEN r.fecha_pago IS NOT NULL
      THEN (r.fecha_pago::timestamp + INTERVAL '12 hours')::timestamptz
      ELSE r.created_at + INTERVAL '5 minutes'
    END,
    NOW()
  )
FROM reservas r
WHERE r.estado = 'confirmado'
  AND COALESCE(r.abono, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM historial_acciones h
    WHERE h.registro_id = r.id AND h.accion IN ('registrar_pago', 'pago_registrado')
  );

-- Evento 3: cancelación (si la reserva quedó cancelada)
INSERT INTO historial_acciones (id, usuario_email, modulo, accion, tabla, registro_id, datos_antes, datos_despues, notas, created_at)
SELECT
  'LOG-BF-CANCEL-' || r.id,
  'sistema',
  'reservas',
  'cancelar_reserva',
  'reservas',
  r.id,
  jsonb_build_object('estado', 'pendiente_pago'),
  jsonb_build_object('estado', 'cancelado'),
  '❌ Reserva cancelada (backfill)',
  COALESCE(r.updated_at, r.created_at + INTERVAL '1 hour', NOW())
FROM reservas r
WHERE r.estado = 'cancelado'
  AND NOT EXISTS (
    SELECT 1 FROM historial_acciones h
    WHERE h.registro_id = r.id AND h.accion = 'cancelar_reserva'
  );
