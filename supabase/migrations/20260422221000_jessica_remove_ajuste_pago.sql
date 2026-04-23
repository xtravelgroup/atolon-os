-- Remover el entry "Ajuste Agencia" de la lista de pagos de Jessica Landeta.
-- El ajuste es descuento, no pago. Se mantiene en descuento_agencia.

UPDATE public.reservas
SET pagos = COALESCE(
  (SELECT jsonb_agg(p) FROM jsonb_array_elements(pagos) p
   WHERE p->>'forma_pago' <> 'Ajuste Agencia'),
  '[]'::jsonb
)
WHERE id = 'R-1776893146061';
