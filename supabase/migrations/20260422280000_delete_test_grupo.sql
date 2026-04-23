-- Borrar grupo de prueba "Test"
DELETE FROM public.reservas WHERE grupo_id = 'EVT-1776898405962';
DELETE FROM public.eventos  WHERE id       = 'EVT-1776898405962';
