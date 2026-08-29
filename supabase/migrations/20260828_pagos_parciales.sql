-- ═══════════════════════════════════════════════════════════════════════
-- Pagos parciales — tracking de monto_pagado acumulado por ítem
-- ═══════════════════════════════════════════════════════════════════════
-- Antes: cada marcado como "pagado" en Por Pagar marcaba el 100% del ítem
-- (pagado=true). Ahora permitimos pagos parciales: se acumula monto_pagado
-- y solo se marca pagado=true cuando llega o supera el monto total.
--
-- Ya existía en ordenes_compra.monto_pagado (facturas OC vía cxp_pagos).
-- Falta en: pagos_otros (gastos/embarcaciones), comisiones_semanas,
-- nomina_por_dia, ordenes_compra.anticipo_monto_pagado (para anticipos).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE pagos_otros
  ADD COLUMN IF NOT EXISTS monto_pagado numeric DEFAULT 0;

ALTER TABLE comisiones_semanas
  ADD COLUMN IF NOT EXISTS monto_pagado numeric DEFAULT 0;

ALTER TABLE nomina_por_dia
  ADD COLUMN IF NOT EXISTS monto_pagado numeric DEFAULT 0;

ALTER TABLE ordenes_compra
  ADD COLUMN IF NOT EXISTS anticipo_monto_pagado numeric DEFAULT 0;

-- Historial de pagos parciales unificado (para todos los tipos excepto
-- factura OC que ya tiene su propia cxp_pagos)
CREATE TABLE IF NOT EXISTS pagos_parciales_log (
  id           text PRIMARY KEY,
  tipo         text NOT NULL,  -- 'gasto' | 'embarcacion' | 'anticipo' | 'comision' | 'nomina_dia'
  registro_id  text NOT NULL,  -- ID del ítem pagado en su tabla
  fecha_pago   date NOT NULL,
  monto        numeric NOT NULL,
  metodo       text,
  cuenta_origen text,
  referencia   text,
  comprobante_url text,
  pagado_por   text,
  notas        text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppl_registro ON pagos_parciales_log(tipo, registro_id);
CREATE INDEX IF NOT EXISTS idx_ppl_fecha    ON pagos_parciales_log(fecha_pago DESC);

ALTER TABLE pagos_parciales_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ppl_auth_all" ON pagos_parciales_log;
CREATE POLICY "ppl_auth_all" ON pagos_parciales_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
