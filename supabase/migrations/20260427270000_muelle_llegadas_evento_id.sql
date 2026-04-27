-- Permite vincular llegadas de muelle a un evento/grupo (cuando un grupo
-- llega en su propio catamarán, esos pax NO deben contar como pasadías
-- individuales — ya cuentan dentro del grupo).
ALTER TABLE public.muelle_llegadas
  ADD COLUMN IF NOT EXISTS evento_id text REFERENCES public.eventos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_muelle_llegadas_evento ON public.muelle_llegadas(evento_id);

-- También extender el trigger para auto-marcar excluir_kpis=true cuando
-- las notas tengan keyword "grupo".
CREATE OR REPLACE FUNCTION public.fn_auto_excluir_kpis_llegada()
RETURNS trigger AS $$
DECLARE
  v_notas text := LOWER(COALESCE(NEW.notas, ''));
BEGIN
  -- Si está vinculado a un evento → automáticamente excluir
  IF NEW.evento_id IS NOT NULL THEN
    NEW.excluir_kpis := true;
    RETURN NEW;
  END IF;
  -- Por keywords en notas
  IF v_notas LIKE '%staff%' OR v_notas LIKE '%tripulaci%' OR v_notas LIKE '%tripulac%'
     OR v_notas LIKE '%empleado%' OR v_notas LIKE '%cortes%'
     OR v_notas LIKE '%mecan%'    OR v_notas LIKE '%proveedor%'
     OR v_notas LIKE '%grupo%'
  THEN
    NEW.excluir_kpis := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Marcar manualmente la llegada del Catamaran Big Bucks 25 pax (del grupo
-- del 26 abril que ya cuenta en eventos).
UPDATE public.muelle_llegadas
   SET excluir_kpis = true,
       notas = COALESCE(NULLIF(TRIM(notas), ''), '') || ' [del grupo]'
 WHERE id = 'ML-1777300171062' AND excluir_kpis IS NOT TRUE;
