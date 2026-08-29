-- ═══════════════════════════════════════════════════════════════════════
-- Muelle Llegadas — Comisión al comisionista cuando llegada tipo "a_consumo"
-- ═══════════════════════════════════════════════════════════════════════
-- Cuando se registra una llegada "A Consumo" con comisionista, hay dos
-- métodos de comisión:
--   1) fijo_por_pax: se paga $X (default $10.000) por cada persona
--   2) pct_consumo:  se paga X% (default 8%) del consumo real, previa
--      adjunción de la factura del cliente.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE muelle_llegadas
  ADD COLUMN IF NOT EXISTS comision_metodo    text,       -- 'fijo_por_pax' | 'pct_consumo'
  ADD COLUMN IF NOT EXISTS comision_monto_fijo numeric,   -- $ por persona (si fijo_por_pax)
  ADD COLUMN IF NOT EXISTS comision_pct       numeric,    -- % del consumo (si pct_consumo), default 8
  ADD COLUMN IF NOT EXISTS factura_url        text,       -- adjunto factura cliente (si pct_consumo)
  ADD COLUMN IF NOT EXISTS factura_monto      numeric,    -- monto total consumido según factura
  ADD COLUMN IF NOT EXISTS comision_calculada numeric,    -- pax*fijo o factura_monto*pct/100
  ADD COLUMN IF NOT EXISTS factura_registrada_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_muelle_llegadas_comisionista
  ON muelle_llegadas(aliado_id, fecha) WHERE aliado_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_muelle_llegadas_comision_pendiente
  ON muelle_llegadas(fecha) WHERE comision_calculada IS NOT NULL AND comision_calculada > 0;

COMMENT ON COLUMN muelle_llegadas.comision_metodo IS
  'fijo_por_pax = $X por persona (default $10k); pct_consumo = X% del monto de factura (default 8%).';
COMMENT ON COLUMN muelle_llegadas.factura_url IS
  'URL a factura/comprobante cliente (bucket muelle-facturas). Requerido cuando comision_metodo=pct_consumo antes de calcular la comisión.';

-- Storage bucket para facturas cliente A Consumo
INSERT INTO storage.buckets (id, name, public)
  VALUES ('muelle-facturas', 'muelle-facturas', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mf_read"   ON storage.objects;
DROP POLICY IF EXISTS "mf_write"  ON storage.objects;
DROP POLICY IF EXISTS "mf_update" ON storage.objects;
DROP POLICY IF EXISTS "mf_delete" ON storage.objects;
CREATE POLICY "mf_read"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'muelle-facturas');
CREATE POLICY "mf_write"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'muelle-facturas');
CREATE POLICY "mf_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'muelle-facturas');
CREATE POLICY "mf_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'muelle-facturas');
