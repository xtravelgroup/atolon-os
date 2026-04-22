-- Agregar acceso a Actividades, Zarpes y Metas a Violeta Simancas
-- Solicitado: 22-abr-2026

UPDATE public.usuarios
SET modulos = (
  SELECT array_agg(DISTINCT m)
  FROM unnest(COALESCE(modulos, ARRAY[]::text[]) || ARRAY['actividades', 'zarpes_log', 'metas']) AS m
)
WHERE email = 'vsimancas@atoloncartagena.com';
