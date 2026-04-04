INSERT INTO reservas_historial (id, reserva_id, accion, descripcion, valor_anterior, valor_nuevo, usuario)
VALUES (
  'H-JG-DESCUENTO',
  'R-1775250812568',
  'descuento_agencia',
  '🏷️ Descuento agencia: $400.000 — Ajuste agencia. Pago Wompi $5.360.000 + Descuento $400.000 = Total $5.760.000 · Comisión neta ajustada',
  '{"descuento_agencia": 0}',
  '{"descuento_agencia": 400000}',
  'admin'
)
ON CONFLICT (id) DO NOTHING;
