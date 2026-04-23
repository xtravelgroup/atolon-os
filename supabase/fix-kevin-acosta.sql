UPDATE reservas SET
  abono      = 640000,
  saldo      = 0,
  estado     = 'confirmado',
  forma_pago = 'wompi',
  updated_at  = now()
WHERE id = 'WEB-1775341365674';

INSERT INTO reservas_historial (id, reserva_id, accion, descripcion, valor_anterior, valor_nuevo, usuario)
VALUES (
  'H-KEVIN-WOMPI-FIX',
  'WEB-1775341365674',
  'pago_registrado',
  'Pago confirmado manualmente — $640.000 vía Wompi (pago registrado en Wompi pero webhook no actualizó el sistema) · Reserva confirmada ✓',
  '{"estado": "pendiente_pago", "abono": 0}',
  '{"estado": "confirmado", "abono": 640000}',
  'admin'
) ON CONFLICT (id) DO NOTHING;
