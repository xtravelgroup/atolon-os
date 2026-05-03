-- Eventos: extender consumo a 3 tipos: open bar, buffet (cocina), paquete incluido.
-- ──────────────────────────────────────────────────────────────────
-- El servicio carga lo del open bar; cocina carga lo del buffet y de los
-- paquetes incluidos. Misma mecánica de descuento de stock + costo
-- snapshot, separados por tipo para reportes y auditoría.

ALTER TABLE eventos_consumo_openbar
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'openbar';

-- Check constraint flexible (permite agregar tipos a futuro sin migración)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'eventos_consumo_openbar'::regclass AND conname = 'consumo_tipo_chk'
  ) THEN
    EXECUTE 'ALTER TABLE eventos_consumo_openbar ADD CONSTRAINT consumo_tipo_chk
             CHECK (tipo IN (''openbar'', ''cocina_buffet'', ''cocina_paquete''))';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_consumo_evento_tipo ON eventos_consumo_openbar(evento_id, tipo, anulado);

NOTIFY pgrst, 'reload schema';
