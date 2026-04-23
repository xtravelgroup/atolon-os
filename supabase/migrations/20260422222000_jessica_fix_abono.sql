-- Fix abono de Jessica Landeta: quedó en 960k por un intento previo. Debe ser 900k.
-- total=900k - abono=900k = saldo 0 ; descuento_agencia=60k (ya está).

UPDATE public.reservas
SET abono = 900000,
    saldo = 0,
    updated_at = now()
WHERE id = 'R-1776893146061';
