-- Dar acceso a Check-in (pasadías) y Check-in/out (hotel) a Violeta Simancas
-- Solicitado: 22-abr-2026

UPDATE public.usuarios
SET modulos = (
  SELECT array_agg(DISTINCT m)
  FROM unnest(COALESCE(modulos, ARRAY[]::text[]) || ARRAY['checkin', 'hotel_checkin']) AS m
)
WHERE email = 'vsimancas@atoloncartagena.com';
