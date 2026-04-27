SELECT
  email,
  rol_id,
  array_length(modulos, 1) as cant_modulos,
  ('compras' = ANY(modulos)) as tiene_compras,
  modulos
FROM public.usuarios
WHERE email = 'erickern1@gmail.com';
