-- Pasadías exclusivos para Travel House durante el Gran Fondo Nairo (9–12 Oct 2025).
-- Solo se muestran para agencias seleccionadas (no aparecen en la web pública ni en todas las agencias).

-- 1) Crear las 2 pasadías (solo visibles a agencias seleccionadas)
insert into public.pasadias (id, nombre, precio, precio_neto_agencia, precio_nino, precio_neto_nino, descripcion, activo, web_publica, visible_agencias_todas, visible_agencias_seleccionadas, sin_embarcacion, min_pax, orden)
values
  (
    'PAS-GFN-TRANSPORTE',
    'Gran Fondo Nairo · Solo Transporte',
    100000, 100000, 0, 0,
    'Exclusivo 9–12 Octubre 2025 · Transporte lancha ida y vuelta Castillete ↔ Atolón para participantes del Gran Fondo Nairo.',
    true, false, false, true, false, 1, 990
  ),
  (
    'PAS-GFN-VIP',
    'Gran Fondo Nairo · VIP Pass',
    200000, 200000, 0, 0,
    'Exclusivo 9–12 Octubre 2025 · VIP Pass para participantes del Gran Fondo Nairo (transporte + acceso VIP).',
    true, false, false, true, false, 1, 991
  )
on conflict (id) do update set
  nombre = excluded.nombre,
  precio = excluded.precio,
  precio_neto_agencia = excluded.precio_neto_agencia,
  descripcion = excluded.descripcion,
  visible_agencias_seleccionadas = true,
  activo = true;

-- 2) Agregar los convenios a Travel House (B2B-1775701256702)
insert into public.b2b_convenios (id, aliado_id, tipo_pasadia, tarifa_publica, tarifa_neta, tarifa_publica_nino, tarifa_neta_nino, comision_pct, activo)
values
  (
    'CONV-B2B-1775701256702-granfondonairosolotransporte',
    'B2B-1775701256702',
    'Gran Fondo Nairo · Solo Transporte',
    100000, 100000, 0, 0, 0, true
  ),
  (
    'CONV-B2B-1775701256702-granfondonairovippass',
    'B2B-1775701256702',
    'Gran Fondo Nairo · VIP Pass',
    200000, 200000, 0, 0, 0, true
  )
on conflict (id) do update set
  tarifa_publica = excluded.tarifa_publica,
  tarifa_neta = excluded.tarifa_neta,
  activo = true;
