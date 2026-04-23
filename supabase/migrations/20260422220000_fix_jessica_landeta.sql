-- Fix R-1776893146061 Jessica Landeta: pasar a precio público + ajuste agencia $60k
-- Antes: total 750k (neto), abono 900k, saldo -150k
-- Después: total 900k (960k público - 60k ajuste), abono 900k, saldo 0, descuento_agencia 60k
-- La comisión se reduce automáticamente al aprobar.

UPDATE public.reservas
SET
  precio_u         = 320000,
  precio_neto      = 250000,
  precio_publico   = 320000,
  total            = 900000,
  saldo            = 0,
  descuento_agencia = 60000,
  forma_pago       = 'Ajuste Agencia',
  pagos            = COALESCE(pagos, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', 'P-' || extract(epoch from now())::bigint,
      'monto', 60000,
      'forma_pago', 'Ajuste Agencia',
      'es_cortesia', false,
      'fecha', '2026-04-22',
      'timestamp', now()::text,
      'registrado_por', 'sistema (migration)',
      'nota', 'Ajuste de $60k aplicado por la agencia — se descuenta de su comisión'
    )
  ),
  notas            = COALESCE(notas || E'\n', '') || 'Ajuste Agencia $60.000 aplicado 22-abr-2026 (descuento de comisión).',
  updated_at       = now()
WHERE id = 'R-1776893146061';
