-- ── Cotizaciones de proveedor (antes de emitir OC) ──────────────────────
-- Permite cargar varias cotizaciones de distintos proveedores contra una
-- misma requisición y comparar precios/condiciones.
CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id                   text PRIMARY KEY,
  requisicion_id       text REFERENCES public.requisiciones(id) ON DELETE CASCADE,
  proveedor_id         text REFERENCES public.proveedores(id) ON DELETE SET NULL,
  proveedor_nombre     text,
  proveedor_nit        text,
  proveedor_email      text,
  proveedor_telefono   text,
  cotizacion_numero    text,
  fecha_cotizacion     date,
  fecha_vencimiento    date,
  validez_dias         int,
  condiciones_pago     text,
  tiempo_entrega       text,
  items                jsonb DEFAULT '[]'::jsonb,
  subtotal             numeric DEFAULT 0,
  iva                  numeric DEFAULT 0,
  total                numeric DEFAULT 0,
  notas                text,
  archivo_url          text,                       -- PDF/imagen original
  parsed_data          jsonb,                      -- raw output del parser AI
  estado               text DEFAULT 'recibida',    -- recibida | seleccionada | descartada | vencida
  oc_id                uuid REFERENCES public.ordenes_compra(id) ON DELETE SET NULL,
  created_by           text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cot_req       ON public.cotizaciones(requisicion_id);
CREATE INDEX IF NOT EXISTS idx_cot_proveedor ON public.cotizaciones(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cot_estado    ON public.cotizaciones(estado);

ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cotizaciones_all" ON public.cotizaciones;
CREATE POLICY "cotizaciones_all" ON public.cotizaciones
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.cotizaciones TO anon, authenticated;

-- ── Cuentas por pagar: vencimientos + pagos contra factura aplicada ────
-- Cada OC con factura aplicada genera un registro de CXP. Si hay pagos
-- parciales, se registran en cxp_pagos. La OC se considera pagada cuando
-- saldo = 0.
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_pago date,
  ADD COLUMN IF NOT EXISTS dias_credito           int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_pagado           numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pagada_completa        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pagada_at              timestamptz;

CREATE TABLE IF NOT EXISTS public.cxp_pagos (
  id              text PRIMARY KEY,
  oc_id           uuid REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  oc_codigo       text,
  fecha_pago      date NOT NULL DEFAULT CURRENT_DATE,
  monto           numeric NOT NULL,
  metodo          text,                            -- transferencia | efectivo | cheque | tarjeta | otro
  cuenta_origen   text,                            -- banco/cuenta desde donde se pagó
  referencia      text,                            -- número de transferencia, cheque, etc.
  comprobante_url text,
  notas           text,
  created_by      text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cxp_oc          ON public.cxp_pagos(oc_id);
CREATE INDEX IF NOT EXISTS idx_cxp_fecha       ON public.cxp_pagos(fecha_pago);

ALTER TABLE public.cxp_pagos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cxp_pagos_all" ON public.cxp_pagos;
CREATE POLICY "cxp_pagos_all" ON public.cxp_pagos
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.cxp_pagos TO anon, authenticated;

-- ── Tracking de envíos por email al proveedor ──────────────────────────
CREATE TABLE IF NOT EXISTS public.oc_emails_enviados (
  id              text PRIMARY KEY,
  oc_id           uuid REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  oc_codigo       text,
  enviado_a       text[],
  cc              text[],
  asunto          text,
  cuerpo_custom   text,
  con_pdf         boolean DEFAULT false,
  resend_id       text,
  enviado_at      timestamptz DEFAULT now(),
  enviado_por     text
);
CREATE INDEX IF NOT EXISTS idx_oc_emails_oc ON public.oc_emails_enviados(oc_id);

ALTER TABLE public.oc_emails_enviados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oc_emails_all" ON public.oc_emails_enviados;
CREATE POLICY "oc_emails_all" ON public.oc_emails_enviados
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.oc_emails_enviados TO anon, authenticated;
