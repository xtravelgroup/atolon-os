-- Multi-locación para inventario: Almacén (principal) + Bar + extensible.
-- Loggro da inventario global; la distribución interna se gestiona aquí.

-- ── Tabla de locaciones ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.items_locaciones (
  id           text PRIMARY KEY,
  nombre       text UNIQUE NOT NULL,
  descripcion  text,
  es_principal boolean DEFAULT false,   -- destino default de compras nuevas
  es_ventas    boolean DEFAULT false,   -- de aquí sale lo vendido en Loggro
  activa       boolean DEFAULT true,
  icono        text DEFAULT '📦',
  orden        int  DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

INSERT INTO public.items_locaciones (id, nombre, es_principal, es_ventas, icono, orden)
VALUES
  ('LOC-ALMACEN', 'Almacén', true,  false, '📦', 1),
  ('LOC-BAR',     'Bar',     false, true,  '🍸', 2)
ON CONFLICT (id) DO NOTHING;

-- ── Stock por locación (reemplaza el campo único stock_actual para detalle) ──
CREATE TABLE IF NOT EXISTS public.items_stock_locacion (
  item_id     text NOT NULL REFERENCES public.items_catalogo(id) ON DELETE CASCADE,
  locacion_id text NOT NULL REFERENCES public.items_locaciones(id) ON DELETE CASCADE,
  cantidad    numeric NOT NULL DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (item_id, locacion_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_loc_item ON public.items_stock_locacion(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_loc_loc  ON public.items_stock_locacion(locacion_id);

-- ── Transferencias (audit trail) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.items_transferencias (
  id               text PRIMARY KEY,
  item_id          text REFERENCES public.items_catalogo(id),
  from_locacion_id text REFERENCES public.items_locaciones(id),
  to_locacion_id   text REFERENCES public.items_locaciones(id),
  cantidad         numeric NOT NULL,
  motivo           text,
  usuario_email    text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transf_item ON public.items_transferencias(item_id);
CREATE INDEX IF NOT EXISTS idx_transf_date ON public.items_transferencias(created_at DESC);

-- ── RLS: autenticados pueden leer/escribir ───────────────────────────────────
ALTER TABLE public.items_locaciones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_stock_locacion   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_transferencias   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_items_locaciones"     ON public.items_locaciones;
DROP POLICY IF EXISTS "auth_all_items_stock_locacion" ON public.items_stock_locacion;
DROP POLICY IF EXISTS "auth_all_items_transferencias" ON public.items_transferencias;

CREATE POLICY "auth_all_items_locaciones"     ON public.items_locaciones     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_items_stock_locacion" ON public.items_stock_locacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_items_transferencias" ON public.items_transferencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seed inicial: todo el stock actual de items_catalogo va a Almacén ────────
-- (solo los items con stock > 0 y solo si aún no hay filas en items_stock_locacion)
INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad, updated_at)
SELECT i.id, 'LOC-ALMACEN', COALESCE(i.stock_actual, 0), now()
FROM public.items_catalogo i
WHERE NOT EXISTS (
  SELECT 1 FROM public.items_stock_locacion s
  WHERE s.item_id = i.id AND s.locacion_id = 'LOC-ALMACEN'
);
