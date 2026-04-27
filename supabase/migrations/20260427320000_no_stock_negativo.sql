-- Garantiza que items_stock_locacion.cantidad NUNCA baje de 0.
-- Si un proceso (sync Loggro, producción, recepción mal) intenta dejar
-- el stock negativo, el trigger lo capa a 0 y registra el "consumo
-- fantasma" en una tabla de auditoría.

-- 1. Tabla de auditoría: consumos sin stock disponible
CREATE TABLE IF NOT EXISTS public.items_consumo_fantasma (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         text NOT NULL,
  locacion_id     text NOT NULL,
  cantidad_intentada numeric NOT NULL,  -- cuánto se quería dejar (negativo)
  cantidad_capada    numeric NOT NULL,  -- siempre 0 o el valor que sí se permitió
  delta_perdido      numeric NOT NULL,  -- diferencia (lo que no se pudo descontar)
  origen           text,                -- "trigger" | "sync_loggro" | etc.
  notas            text,
  detected_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consumo_fantasma_fecha ON public.items_consumo_fantasma(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumo_fantasma_item ON public.items_consumo_fantasma(item_id, locacion_id);

ALTER TABLE public.items_consumo_fantasma ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consumo_fantasma_all" ON public.items_consumo_fantasma;
CREATE POLICY "consumo_fantasma_all" ON public.items_consumo_fantasma
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.items_consumo_fantasma TO anon, authenticated;

-- 2. Trigger BEFORE INSERT/UPDATE que capa cantidad a 0
CREATE OR REPLACE FUNCTION public.fn_no_stock_negativo()
RETURNS trigger AS $$
BEGIN
  IF NEW.cantidad < 0 THEN
    -- Registrar el consumo fantasma para auditoría
    INSERT INTO public.items_consumo_fantasma (
      item_id, locacion_id, cantidad_intentada, cantidad_capada, delta_perdido, origen
    ) VALUES (
      NEW.item_id, NEW.locacion_id, NEW.cantidad, 0, ABS(NEW.cantidad), 'trigger_auto_capa'
    );
    NEW.cantidad := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_stock_negativo ON public.items_stock_locacion;
CREATE TRIGGER trg_no_stock_negativo
  BEFORE INSERT OR UPDATE OF cantidad ON public.items_stock_locacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_no_stock_negativo();

-- 3. Defensa adicional con CHECK constraint (DEFERRED por si trigger se desactiva)
ALTER TABLE public.items_stock_locacion
  DROP CONSTRAINT IF EXISTS chk_stock_no_negativo;
ALTER TABLE public.items_stock_locacion
  ADD CONSTRAINT chk_stock_no_negativo CHECK (cantidad >= 0);
