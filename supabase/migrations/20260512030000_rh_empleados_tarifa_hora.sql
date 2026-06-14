-- Tarifa hora para cálculo de nómina del módulo "Procesar Nómina".
-- Se calcula automáticamente como salario_base / 240 (8h × 30 días promedio)
-- para empleados existentes, ajustable manualmente desde RH.

ALTER TABLE public.rh_empleados
  ADD COLUMN IF NOT EXISTS tarifa_hora NUMERIC,
  ADD COLUMN IF NOT EXISTS modalidad_calculo TEXT DEFAULT 'horas_reales'
    CHECK (modalidad_calculo IN ('horas_reales','salario_fijo'));

COMMENT ON COLUMN public.rh_empleados.tarifa_hora IS
  'Valor de la hora ordinaria diurna. Default: salario_base/240. Base para recargos noct (+35%), dom/festivo (+75%), extras (+25%).';

COMMENT ON COLUMN public.rh_empleados.modalidad_calculo IS
  'horas_reales: nómina = horas marcadas × tarifa + recargos. salario_fijo: descuenta solo ausencias del salario_base mensual.';

-- Backfill desde salario_base
UPDATE public.rh_empleados
SET tarifa_hora = ROUND(salario_base::numeric / 240, 2)
WHERE tarifa_hora IS NULL AND salario_base > 0;
