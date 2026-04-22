-- Quitar acceso a Check-in/out de Hotel a Violeta Simancas
-- Solicitado: 22-abr-2026

UPDATE public.usuarios
SET modulos = array_remove(COALESCE(modulos, ARRAY[]::text[]), 'hotel_checkin')
WHERE email = 'vsimancas@atoloncartagena.com';
