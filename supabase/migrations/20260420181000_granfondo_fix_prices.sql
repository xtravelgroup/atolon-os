-- Corrección de precios Gran Fondo Nairo
-- Solo Transporte: público 150.000, neto 100.000
-- VIP Pass: público 250.000, neto 200.000

update public.pasadias
  set precio = 150000, precio_neto_agencia = 100000
  where id = 'PAS-GFN-TRANSPORTE';

update public.pasadias
  set precio = 250000, precio_neto_agencia = 200000
  where id = 'PAS-GFN-VIP';

update public.b2b_convenios
  set tarifa_publica = 150000, tarifa_neta = 100000
  where id = 'CONV-B2B-1775701256702-granfondonairosolotransporte';

update public.b2b_convenios
  set tarifa_publica = 250000, tarifa_neta = 200000
  where id = 'CONV-B2B-1775701256702-granfondonairovippass';
