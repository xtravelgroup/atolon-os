-- Workflow ampliado de OC:
--   emitida → enviada → cotizacion_recibida → cotizacion_aprobada →
--   anticipo_solicitado → anticipo_pagado → confirmada → recibida → facturada
--
-- Después de emitir la OC y enviarla, el proveedor responde con SU cotización
-- (puede tener cambios en precio o items). El equipo de compras la sube,
-- la revisa con AI, ajusta y aprueba. Eso pasa a contabilidad como anticipo
-- pendiente. Cuando contabilidad paga el anticipo, el proveedor empaca y envía.

ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS cotizacion_resp_url            text,
  ADD COLUMN IF NOT EXISTS cotizacion_resp_data           jsonb,
  ADD COLUMN IF NOT EXISTS cotizacion_resp_subida_at      timestamptz,
  ADD COLUMN IF NOT EXISTS cotizacion_resp_subida_por     text,
  ADD COLUMN IF NOT EXISTS cotizacion_resp_aprobada       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cotizacion_resp_aprobada_at    timestamptz,
  ADD COLUMN IF NOT EXISTS cotizacion_resp_aprobada_por   text,
  ADD COLUMN IF NOT EXISTS cotizacion_resp_notas          text,

  -- Anticipo
  ADD COLUMN IF NOT EXISTS anticipo_requerido             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS anticipo_porcentaje            int DEFAULT 50,    -- % del total
  ADD COLUMN IF NOT EXISTS anticipo_monto                 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anticipo_solicitado_at         timestamptz,
  ADD COLUMN IF NOT EXISTS anticipo_pagado                boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS anticipo_pagado_at             timestamptz,
  ADD COLUMN IF NOT EXISTS anticipo_pagado_por            text,
  ADD COLUMN IF NOT EXISTS anticipo_referencia_pago       text,
  ADD COLUMN IF NOT EXISTS anticipo_comprobante_url       text;

-- Índice para que CXP pueda filtrar rápido los anticipos pendientes
CREATE INDEX IF NOT EXISTS idx_oc_anticipo_pendiente
  ON public.ordenes_compra (anticipo_requerido, anticipo_pagado)
  WHERE anticipo_requerido = true AND anticipo_pagado = false;
