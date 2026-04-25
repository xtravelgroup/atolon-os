-- Marina/parqueo recurrente: cada lancha tiene un costo mensual fijo
-- de marina. Se auto-genera 1 registro en lancha_bitacora por lancha al
-- inicio de cada mes (idempotente: id determinístico MARINA-{id}-{YYYY-MM}).

ALTER TABLE public.lanchas
  ADD COLUMN IF NOT EXISTS marina_costo_mensual numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marina_proveedor     text,
  ADD COLUMN IF NOT EXISTS marina_activa        boolean DEFAULT false;

-- Función idempotente: genera el registro del mes para cada lancha con
-- marina_activa = true. Si ya existe el id MARINA-<lancha>-<YYYY-MM>, no hace nada.
CREATE OR REPLACE FUNCTION public.generar_marina_mes(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inicio_mes date := date_trunc('month', p_fecha)::date;
  v_ym text := to_char(v_inicio_mes, 'YYYY-MM');
  v_count int := 0;
  l record;
BEGIN
  FOR l IN
    SELECT id, nombre, marina_costo_mensual, marina_proveedor
    FROM public.lanchas
    WHERE activo = true
      AND marina_activa = true
      AND COALESCE(marina_costo_mensual, 0) > 0
  LOOP
    INSERT INTO public.lancha_bitacora (
      id, lancha_id, lancha_nombre, fecha, tipo, subtipo, descripcion,
      costo_total, proveedor, notas, updated_at
    )
    VALUES (
      'MARINA-' || l.id || '-' || v_ym,
      l.id, l.nombre, v_inicio_mes,
      'marina', v_ym, 'Cargo mensual marina/parqueo',
      l.marina_costo_mensual, l.marina_proveedor,
      'Generado automáticamente', now()
    )
    ON CONFLICT (id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generar_marina_mes(date) TO anon, authenticated;

-- Disparar generación del mes actual (en caso de que ya esté configurada
-- alguna marina activa)
SELECT public.generar_marina_mes();
