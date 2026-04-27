-- Logística de OC: programar entrega en muelle (Cartagena) + transporte a
-- Atolón (asignar embarcación + zarpe). Cada OC pasa por:
--   emitida → enviada → confirmada → facturada → programada muelle →
--   entregada en muelle → en tránsito → recibida en Atolón

-- ── 1. Entrega en muelle de Bodeguita (Cartagena) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.oc_entregas_muelle (
  id                       text PRIMARY KEY,
  oc_id                    uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  oc_codigo                text,                          -- duplicado para queries rápidas
  fecha_programada         date,
  hora_programada          time,
  ubicacion                text DEFAULT 'Bodeguita',      -- Bodeguita | Marina Santa Cruz | Otro
  contacto_proveedor       text,                          -- nombre o teléfono de quien entrega
  notas                    text,
  -- Estado de la entrega
  estado                   text DEFAULT 'programada',     -- programada | en_camino | entregada | demorada | cancelada
  entregado_at             timestamptz,
  recibido_por             text,                          -- quien recibió en muelle
  foto_url                 text,
  firma_url                text,
  created_by               text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oc_entregas_oc      ON public.oc_entregas_muelle(oc_id);
CREATE INDEX IF NOT EXISTS idx_oc_entregas_fecha   ON public.oc_entregas_muelle(fecha_programada, estado);

-- ── 2. Transporte muelle → Atolón ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oc_transporte_atolon (
  id                       text PRIMARY KEY,
  oc_id                    uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  oc_codigo                text,
  entrega_muelle_id        text REFERENCES public.oc_entregas_muelle(id) ON DELETE SET NULL,
  -- Embarcación (puede ser propia o tercera)
  embarcacion_propia_id    text REFERENCES public.lanchas(id) ON DELETE SET NULL,
  embarcacion_nombre       text,                          -- guardar texto por si es tercera
  zarpe_flota_id           text REFERENCES public.muelle_zarpes_flota(id) ON DELETE SET NULL,
  -- Programación
  fecha_zarpe              date,
  hora_zarpe               time,
  fecha_llegada_atolon     date,
  hora_llegada_atolon      time,
  -- Estado
  estado                   text DEFAULT 'programado',     -- programado | zarpado | en_atolon | recibido | cancelado
  zarpado_at               timestamptz,
  recibido_atolon_at       timestamptz,
  recibido_por             text,
  bodega_destino           text REFERENCES public.items_locaciones(id) ON DELETE SET NULL,
  -- Costo / observaciones
  costo_transporte         numeric DEFAULT 0,             -- costo asignado a esta OC (proporcional)
  notas                    text,
  fotos_urls               text[],
  created_by               text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oc_transporte_oc          ON public.oc_transporte_atolon(oc_id);
CREATE INDEX IF NOT EXISTS idx_oc_transporte_zarpe       ON public.oc_transporte_atolon(zarpe_flota_id);
CREATE INDEX IF NOT EXISTS idx_oc_transporte_fecha       ON public.oc_transporte_atolon(fecha_zarpe, estado);

-- ── 3. RLS estándar Atolón OS ──────────────────────────────────────────────
ALTER TABLE public.oc_entregas_muelle    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oc_transporte_atolon  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_entregas_muelle_all"   ON public.oc_entregas_muelle;
DROP POLICY IF EXISTS "oc_transporte_atolon_all" ON public.oc_transporte_atolon;

CREATE POLICY "oc_entregas_muelle_all"   ON public.oc_entregas_muelle
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "oc_transporte_atolon_all" ON public.oc_transporte_atolon
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

GRANT ALL ON public.oc_entregas_muelle, public.oc_transporte_atolon TO anon, authenticated;

-- ── 4. Estados extendidos para OC ──────────────────────────────────────────
-- (no cambiamos schema, solo documentamos los nuevos estados aceptados:
--    programada_muelle, entregada_muelle, en_transito, recibida_atolon)
-- Los estados ya existentes (emitida, enviada, confirmada, recibida_parcial,
-- recibida) siguen funcionando.
