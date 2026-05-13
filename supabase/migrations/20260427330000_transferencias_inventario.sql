-- Transferencias de inventario entre bodegas
-- Mueve cantidades de un origen a un destino sin afectar Loggro
-- (porque Loggro maneja un stock total, no por bodega).

CREATE TABLE IF NOT EXISTS public.items_transferencias (
  id              text PRIMARY KEY,
  fecha           date NOT NULL DEFAULT CURRENT_DATE,
  origen_id       text NOT NULL REFERENCES public.items_locaciones(id),
  destino_id      text NOT NULL REFERENCES public.items_locaciones(id),
  usuario_email   text,
  total_items     int NOT NULL,
  total_unidades  numeric NOT NULL,
  -- items: [{item_id, nombre, cantidad, unidad}]
  items           jsonb NOT NULL,
  notas           text,
  estado          text DEFAULT 'completada',  -- pendiente | completada | cancelada
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transf_origen  ON public.items_transferencias(origen_id);
CREATE INDEX IF NOT EXISTS idx_transf_destino ON public.items_transferencias(destino_id);
CREATE INDEX IF NOT EXISTS idx_transf_fecha   ON public.items_transferencias(fecha);

ALTER TABLE public.items_transferencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transferencias_all" ON public.items_transferencias;
CREATE POLICY "transferencias_all" ON public.items_transferencias
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.items_transferencias TO anon, authenticated;
