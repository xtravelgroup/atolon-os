-- Capitanes de flota: maestro mixto (nómina propia + terceros)
-- · tipo=nomina  → su sueldo se paga vía RRHH/Nómina. NO se inserta en
--                  lancha_bitacora (evita doble registro). Su salario_mensual
--                  se usa solo como referencia en RentabilidadFlota.
-- · tipo=tercero → freelance/contratista. Si recurrente=true, se inserta
--                  automáticamente cargo mensual en lancha_bitacora.

CREATE TABLE IF NOT EXISTS public.capitanes_flota (
  id                text PRIMARY KEY,
  nombre            text NOT NULL,
  documento         text,
  telefono          text,
  email             text,
  tipo              text NOT NULL DEFAULT 'tercero',  -- nomina | tercero
  lancha_id         text REFERENCES public.lanchas(id) ON DELETE SET NULL,
  salario_mensual   numeric DEFAULT 0,
  recurrente        boolean DEFAULT false,            -- solo aplica para tercero
  activo            boolean DEFAULT true,
  fecha_inicio      date,
  fecha_fin         date,
  notas             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capitanes_lancha ON public.capitanes_flota(lancha_id);
CREATE INDEX IF NOT EXISTS idx_capitanes_tipo   ON public.capitanes_flota(tipo, activo);

ALTER TABLE public.capitanes_flota ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "capitanes_flota_all" ON public.capitanes_flota;
CREATE POLICY "capitanes_flota_all" ON public.capitanes_flota
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.capitanes_flota TO anon, authenticated;

-- Función: insertar cargo mensual en bitácora para capitanes terceros
-- recurrentes. Idempotente con id determinístico CAPI-{capitan_id}-{YYYY-MM}.
CREATE OR REPLACE FUNCTION public.generar_capitanes_mes(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inicio_mes date := date_trunc('month', p_fecha)::date;
  v_ym text := to_char(v_inicio_mes, 'YYYY-MM');
  v_count int := 0;
  c record;
  v_lancha_nombre text;
BEGIN
  FOR c IN
    SELECT cf.id, cf.nombre, cf.salario_mensual, cf.lancha_id, l.nombre AS lancha_nombre
    FROM public.capitanes_flota cf
    LEFT JOIN public.lanchas l ON l.id = cf.lancha_id
    WHERE cf.activo = true
      AND cf.recurrente = true
      AND cf.tipo = 'tercero'
      AND COALESCE(cf.salario_mensual, 0) > 0
      AND (cf.fecha_inicio IS NULL OR cf.fecha_inicio <= p_fecha)
      AND (cf.fecha_fin    IS NULL OR cf.fecha_fin    >= v_inicio_mes)
      AND cf.lancha_id IS NOT NULL
  LOOP
    INSERT INTO public.lancha_bitacora (
      id, lancha_id, lancha_nombre, fecha, tipo, subtipo, descripcion,
      costo_total, proveedor, notas, updated_at
    )
    VALUES (
      'CAPI-' || c.id || '-' || v_ym,
      c.lancha_id, c.lancha_nombre, v_inicio_mes,
      'capitanes', v_ym, 'Pago mensual capitán tercero',
      c.salario_mensual, c.nombre,
      'Generado automáticamente', now()
    )
    ON CONFLICT (id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generar_capitanes_mes(date) TO anon, authenticated;

-- Disparar generación del mes actual
SELECT public.generar_capitanes_mes();
