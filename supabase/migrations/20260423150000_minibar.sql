-- Módulo Mini Bar de Habitaciones
-- Define stock estándar por habitación y registra consumos/ventas.

-- ── Stock estándar por habitación (qué debe haber en cada mini bar) ─────────
CREATE TABLE IF NOT EXISTS public.minibar_stock_habitacion (
  habitacion_id     text NOT NULL,
  item_id           text NOT NULL REFERENCES public.items_catalogo(id) ON DELETE CASCADE,
  cantidad_esperada numeric NOT NULL DEFAULT 0,
  precio_venta      numeric NOT NULL DEFAULT 0,  -- precio al huésped
  updated_at        timestamptz DEFAULT now(),
  PRIMARY KEY (habitacion_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_minibar_stock_hab ON public.minibar_stock_habitacion(habitacion_id);

-- ── Ventas / consumos registrados ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.minibar_ventas (
  id              text PRIMARY KEY,
  habitacion_id   text NOT NULL,
  item_id         text REFERENCES public.items_catalogo(id),
  item_nombre     text,
  cantidad        numeric NOT NULL,
  precio_unit     numeric NOT NULL DEFAULT 0,
  subtotal        numeric NOT NULL DEFAULT 0,
  fecha           date DEFAULT CURRENT_DATE,
  huesped_nombre  text,
  folio_id        text,
  reservation_id  text,
  cobrado         boolean DEFAULT false,
  registrado_por  text,
  notas           text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minibar_ventas_hab   ON public.minibar_ventas(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_minibar_ventas_fecha ON public.minibar_ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_minibar_ventas_folio ON public.minibar_ventas(folio_id);

-- ── Locación Mini Bar en items_locaciones ──────────────────────────────────
-- Para descontar inventario del Bar o crear una locación específica.
INSERT INTO public.items_locaciones (id, nombre, es_principal, es_ventas, icono, orden)
VALUES ('LOC-MINIBAR', 'Mini Bar', false, false, '🏨', 3)
ON CONFLICT (id) DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.minibar_stock_habitacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minibar_ventas           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_minibar_stock"   ON public.minibar_stock_habitacion;
DROP POLICY IF EXISTS "auth_all_minibar_ventas"  ON public.minibar_ventas;

CREATE POLICY "auth_all_minibar_stock"  ON public.minibar_stock_habitacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_minibar_ventas" ON public.minibar_ventas           FOR ALL TO authenticated USING (true) WITH CHECK (true);
