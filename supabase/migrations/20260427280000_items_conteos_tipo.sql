-- Tipo de conteo: distingue inventario inicial (baseline) de conteos regulares.
-- El inventario inicial NO tiene "diferencias" reales — establece el punto cero.
ALTER TABLE public.items_conteos
  ADD COLUMN IF NOT EXISTS tipo_conteo text DEFAULT 'regular';

COMMENT ON COLUMN public.items_conteos.tipo_conteo IS
  'inicial = baseline / inventario 0; regular = conteo de control. Los iniciales NO muestran diferencias en reportes.';

-- Marcar el primer inventario de Almacén Cocina (Meris, 27 abril 2026) como inicial
UPDATE public.items_conteos
   SET tipo_conteo = 'inicial'
 WHERE id = 'CNT-1777304649615';

-- Marcar también los otros conteos del 27 abril como iniciales (Andrea Bar)
UPDATE public.items_conteos
   SET tipo_conteo = 'inicial'
 WHERE created_at::date = '2026-04-27'
   AND tipo_conteo != 'inicial';

CREATE INDEX IF NOT EXISTS idx_items_conteos_tipo
  ON public.items_conteos(tipo_conteo, fecha);
