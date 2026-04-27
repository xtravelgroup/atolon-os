-- Permite identificar productos por código de barras (EAN) y la referencia
-- interna del proveedor (ej. DISLICORES usa "370080" para Corona 6pack).
-- El campo `codigo` ya existe pero suele estar vacío o tener el código Loggro.
-- Agregamos campos específicos para que el parser AI matchee por barcode primero.
ALTER TABLE public.items_catalogo
  ADD COLUMN IF NOT EXISTS codigo_barras       text,
  ADD COLUMN IF NOT EXISTS referencia_proveedor text,
  ADD COLUMN IF NOT EXISTS proveedor_principal_id text REFERENCES public.proveedores(id) ON DELETE SET NULL;

-- Índice único por código de barras (cuando esté presente)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_items_catalogo_codigo_barras
  ON public.items_catalogo(codigo_barras)
  WHERE codigo_barras IS NOT NULL AND codigo_barras <> '';

CREATE INDEX IF NOT EXISTS idx_items_catalogo_ref_prov
  ON public.items_catalogo(proveedor_principal_id, referencia_proveedor);
