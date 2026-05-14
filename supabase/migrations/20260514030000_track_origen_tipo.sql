-- Bucket de origen del cliente para reportes de marketing/operación.
-- 5 valores: grupo / whatsapp / marketing / staff / web
-- Calculado en cliente vía src/lib/origenClassifier.js y persistido por AtolanTrack.

ALTER TABLE public.track_sesiones
  ADD COLUMN IF NOT EXISTS origen_tipo TEXT
    CHECK (origen_tipo IS NULL OR origen_tipo IN ('grupo','whatsapp','marketing','staff','web'));

ALTER TABLE public.track_eventos
  ADD COLUMN IF NOT EXISTS origen_tipo TEXT
    CHECK (origen_tipo IS NULL OR origen_tipo IN ('grupo','whatsapp','marketing','staff','web'));

COMMENT ON COLUMN public.track_sesiones.origen_tipo IS
  'Roll-up de 5 buckets para reporte: grupo|whatsapp|marketing|staff|web. Calculado en cliente con clasificarOrigen().';

CREATE INDEX IF NOT EXISTS idx_track_sesiones_origen ON public.track_sesiones(origen_tipo);
CREATE INDEX IF NOT EXISTS idx_track_eventos_origen  ON public.track_eventos(origen_tipo);
