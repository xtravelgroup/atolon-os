-- Control interno H-9 · Proveedores deben tener NIT antes de generar OC
-- =====================================================================
-- Hallazgo: 1 proveedor activo (GLOBAL WINE) tenía NIT vacío. Con 4 OCs
-- emitidas. Esto impide facturación electrónica DIAN — el documento
-- soporte requiere NIT del receptor para deducción tributaria.
--
-- Defensa en BD: trigger que bloquea INSERT/UPDATE de OC a estado
-- 'enviada' o posterior si el proveedor no tiene NIT válido.
-- =====================================================================

-- Función validadora — exige proveedor_nit O proveedor_id con NIT en tabla
CREATE OR REPLACE FUNCTION public.oc_proveedor_nit_check()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  proveedor_nit_actual text;
BEGIN
  -- Solo controlar al pasar a 'enviada' o estados posteriores
  IF NEW.estado NOT IN ('enviada','confirmada','recibida','recibida_parcial','pagada','anticipo_pendiente','cerrada') THEN
    RETURN NEW;
  END IF;

  -- Si NEW.proveedor_nit ya tiene un NIT no vacío, ok
  IF NEW.proveedor_nit IS NOT NULL AND length(trim(NEW.proveedor_nit)) > 0 AND NEW.proveedor_nit != '0' THEN
    RETURN NEW;
  END IF;

  -- Si no, intentar resolverlo desde el proveedor vinculado
  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT nit INTO proveedor_nit_actual
    FROM public.proveedores
    WHERE id = NEW.proveedor_id;

    IF proveedor_nit_actual IS NOT NULL AND length(trim(proveedor_nit_actual)) > 0 AND proveedor_nit_actual != '0' THEN
      -- Auto-poblar el NIT en la OC desde el proveedor
      NEW.proveedor_nit := proveedor_nit_actual;
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION
    'Control interno H-9: el proveedor "%" no tiene NIT registrado. Sin NIT no se puede emitir factura electrónica DIAN (Decreto 358/2020). Completá el NIT en el módulo Proveedores antes de enviar esta OC.',
    COALESCE(NEW.proveedor_nombre, 'sin nombre')
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS trg_oc_proveedor_nit_check ON public.ordenes_compra;
CREATE TRIGGER trg_oc_proveedor_nit_check
  BEFORE INSERT OR UPDATE OF estado, proveedor_id, proveedor_nit
  ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.oc_proveedor_nit_check();

COMMENT ON FUNCTION public.oc_proveedor_nit_check IS
  'Control interno H-9: impide enviar OCs a proveedores sin NIT. NIT obligatorio para facturación electrónica DIAN.';

-- ── Vista de proveedores incompletos ────────────────────────────────
CREATE OR REPLACE VIEW public.proveedores_incompletos AS
SELECT
  p.id, p.nombre, p.nit, p.email, p.telefono,
  p.activo,
  (SELECT COUNT(*) FROM public.ordenes_compra o WHERE o.proveedor_id = p.id) AS oc_count,
  (SELECT COALESCE(SUM(total),0) FROM public.ordenes_compra o WHERE o.proveedor_id = p.id)::bigint AS monto_oc,
  p.created_at,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN p.nit IS NULL OR length(trim(p.nit)) = 0 OR p.nit = '0' THEN 'sin_nit' END,
    CASE WHEN p.email IS NULL OR length(trim(p.email)) = 0 THEN 'sin_email' END,
    CASE WHEN p.telefono IS NULL OR length(trim(p.telefono)) = 0 THEN 'sin_telefono' END
  ], NULL) AS problemas
FROM public.proveedores p
WHERE p.activo = true
  AND (
    p.nit IS NULL OR length(trim(p.nit)) = 0 OR p.nit = '0'
    OR p.email IS NULL OR length(trim(p.email)) = 0
    OR p.telefono IS NULL OR length(trim(p.telefono)) = 0
  );

GRANT SELECT ON public.proveedores_incompletos TO authenticated;

COMMENT ON VIEW public.proveedores_incompletos IS
  'Control interno H-9: proveedores activos con datos faltantes (NIT, email o teléfono). Mostrar en módulo Proveedores como alerta.';
