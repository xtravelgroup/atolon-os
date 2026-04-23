-- Tabla de conteos físicos de inventario (audit trail de "Hacer Inventario")
CREATE TABLE IF NOT EXISTS public.items_conteos (
  id             text PRIMARY KEY,
  locacion_id    text NOT NULL REFERENCES public.items_locaciones(id),
  fecha          date DEFAULT CURRENT_DATE,
  usuario_email  text,
  notas          text,
  items          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- items = [{ item_id, nombre, sistema: X, contado: Y, diferencia: Y-X }, ...]
  total_items    int DEFAULT 0,
  diferencias    int DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conteos_loc ON public.items_conteos(locacion_id);
CREATE INDEX IF NOT EXISTS idx_conteos_fecha ON public.items_conteos(fecha DESC);

ALTER TABLE public.items_conteos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_items_conteos" ON public.items_conteos;
CREATE POLICY "auth_all_items_conteos" ON public.items_conteos FOR ALL TO authenticated USING (true) WITH CHECK (true);
