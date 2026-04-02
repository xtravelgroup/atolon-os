-- ============================================================
-- EJECUTAR UNA SOLA VEZ en el SQL Editor de Supabase
-- Cancela automáticamente reservas pendiente_pago > 30 min
-- sin necesidad de abrir ningún módulo de la app.
-- ============================================================

-- 1. Habilitar extensión pg_cron (si no está activa)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Función que hace el cancelamiento
CREATE OR REPLACE FUNCTION auto_cancelar_pendiente_pago()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE reservas
  SET    estado = 'cancelado'
  WHERE  estado = 'pendiente_pago'
    AND  created_at < NOW() - INTERVAL '30 minutes';
END;
$$;

-- 3. Job: corre cada 5 minutos
SELECT cron.schedule(
  'auto-cancel-pendiente-pago',   -- nombre del job (único)
  '*/5 * * * *',                  -- cada 5 minutos
  'SELECT auto_cancelar_pendiente_pago()'
);

-- Para verificar que quedó activo:
-- SELECT * FROM cron.job WHERE jobname = 'auto-cancel-pendiente-pago';

-- Para eliminarlo si algún día quieres cambiarlo:
-- SELECT cron.unschedule('auto-cancel-pendiente-pago');
