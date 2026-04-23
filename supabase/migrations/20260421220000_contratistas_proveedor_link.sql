-- Vincular cada contratista con un proveedor (para contabilidad/pagos).
-- Al aprobar un contratista, si no existe aún un proveedor con el mismo NIT,
-- se crea automáticamente uno a partir de los datos del contratista.

ALTER TABLE public.contratistas
  ADD COLUMN IF NOT EXISTS proveedor_id text REFERENCES public.proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contratistas_proveedor_id
  ON public.contratistas(proveedor_id)
  WHERE proveedor_id IS NOT NULL;

-- Auto-match: intentar vincular contratistas existentes (tipo empresa) con proveedores por NIT coincidente
UPDATE public.contratistas c
SET proveedor_id = p.id
FROM public.proveedores p
WHERE c.proveedor_id IS NULL
  AND c.emp_nit IS NOT NULL
  AND c.emp_nit <> ''
  AND p.nit IS NOT NULL
  AND REGEXP_REPLACE(c.emp_nit, '[^0-9]', '', 'g') = REGEXP_REPLACE(p.nit, '[^0-9]', '', 'g');

-- Para personas natural, match por cédula
UPDATE public.contratistas c
SET proveedor_id = p.id
FROM public.proveedores p
WHERE c.proveedor_id IS NULL
  AND c.tipo = 'natural'
  AND c.nat_cedula IS NOT NULL
  AND c.nat_cedula <> ''
  AND p.nit IS NOT NULL
  AND REGEXP_REPLACE(c.nat_cedula, '[^0-9]', '', 'g') = REGEXP_REPLACE(p.nit, '[^0-9]', '', 'g');
