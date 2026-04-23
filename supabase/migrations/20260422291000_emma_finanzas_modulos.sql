-- Emma: agregar módulos específicos de Finanzas
-- (no incluye Financiero ni P&L/estado_resultados)

UPDATE public.usuarios
SET modulos = (
  SELECT array_agg(DISTINCT m)
  FROM unnest(COALESCE(modulos, ARRAY[]::text[]) || ARRAY[
    'resultados', 'reportes', 'cxc', 'presupuesto', 'activos',
    'requisiciones', 'items', 'mantenimiento', 'proveedores'
  ]) AS m
)
WHERE email = 'direccion@atoloncartagena.com';
