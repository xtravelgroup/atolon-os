-- Permisos extra: array de strings para dar permisos granulares por usuario
-- sin tener que cambiar de rol. Útil para casos puntuales (ej: un operador
-- que necesita ver el comparativo Loggro en cierre de caja sin ser gerente).
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS permisos_extra text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_usuarios_permisos_extra ON public.usuarios USING gin(permisos_extra);

-- Andrea Florez: ver_loggro_caja
UPDATE public.usuarios
SET permisos_extra = array_append(COALESCE(permisos_extra, '{}'), 'ver_loggro_caja')
WHERE email = 'florezandrea6@gmail.com'
  AND NOT (COALESCE(permisos_extra, '{}') @> ARRAY['ver_loggro_caja']);
