-- Las llegadas de muelle pueden contener pax que NO son clientes (staff,
-- tripulación, llegadas de cortesía). El reporte diario y el dashboard
-- los estaban contando como pasadías, inflando los números.
--
-- Esta columna permite marcar llegadas que NO deben contar en KPIs.

ALTER TABLE public.muelle_llegadas
  ADD COLUMN IF NOT EXISTS excluir_kpis boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_muelle_llegadas_excluir
  ON public.muelle_llegadas(excluir_kpis, fecha);

-- Backfill: auto-marcar como excluir_kpis=true las llegadas cuyas notas
-- contengan keywords de staff/tripulación/empleados/cortesía.
UPDATE public.muelle_llegadas
   SET excluir_kpis = true
 WHERE excluir_kpis IS NOT TRUE
   AND (
     LOWER(COALESCE(notas, '')) LIKE '%staff%' OR
     LOWER(COALESCE(notas, '')) LIKE '%tripulaci%' OR
     LOWER(COALESCE(notas, '')) LIKE '%tripulac%' OR
     LOWER(COALESCE(notas, '')) LIKE '%empleado%' OR
     LOWER(COALESCE(notas, '')) LIKE '%cortes%' OR
     LOWER(COALESCE(notas, '')) LIKE '%mecan%' OR
     LOWER(COALESCE(notas, '')) LIKE '%proveedor%'
   );

-- Trigger: auto-marcar al insertar/actualizar si las notas tienen keywords
CREATE OR REPLACE FUNCTION public.fn_auto_excluir_kpis_llegada()
RETURNS trigger AS $$
DECLARE
  v_notas text := LOWER(COALESCE(NEW.notas, ''));
BEGIN
  IF v_notas LIKE '%staff%' OR v_notas LIKE '%tripulaci%' OR v_notas LIKE '%tripulac%'
     OR v_notas LIKE '%empleado%' OR v_notas LIKE '%cortes%'
     OR v_notas LIKE '%mecan%'    OR v_notas LIKE '%proveedor%'
  THEN
    NEW.excluir_kpis := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_excluir_kpis ON public.muelle_llegadas;
CREATE TRIGGER trg_auto_excluir_kpis
  BEFORE INSERT OR UPDATE OF notas ON public.muelle_llegadas
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_excluir_kpis_llegada();
