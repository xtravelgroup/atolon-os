-- Módulo Pagos: pagos recurrentes + gastos sueltos + conciliación bancaria

-- ── 1. Pagos recurrentes (arriendo, servicios, plataformas) ────────────
CREATE TABLE IF NOT EXISTS public.pagos_recurrentes (
  id                  text PRIMARY KEY,
  nombre              text NOT NULL,
  categoria           text NOT NULL,        -- arriendo | servicios | plataforma | sueldo_fijo | seguros | otro
  proveedor           text,
  proveedor_id        text REFERENCES public.proveedores(id) ON DELETE SET NULL,
  monto               numeric NOT NULL DEFAULT 0,
  moneda              text DEFAULT 'COP',
  frecuencia          text DEFAULT 'mensual', -- mensual | bimensual | trimestral | semestral | anual
  dia_pago            int DEFAULT 1,         -- 1-31
  siguiente_vencimiento date,
  metodo_pago_default text DEFAULT 'transferencia',
  cuenta_origen       text,
  notas               text,
  activo              boolean DEFAULT true,
  created_by          text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagos_rec_activo  ON public.pagos_recurrentes(activo, siguiente_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_rec_cat     ON public.pagos_recurrentes(categoria);

ALTER TABLE public.pagos_recurrentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagos_rec_all" ON public.pagos_recurrentes;
CREATE POLICY "pagos_rec_all" ON public.pagos_recurrentes
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.pagos_recurrentes TO anon, authenticated;

-- ── 2. Pagos otros / gastos sueltos (no asociados a OC ni nómina) ──────
-- Para todo gasto que no entra en compras, anticipos o nómina
-- (ej. taxis, propinas, reembolsos, gastos administrativos pequeños).
CREATE TABLE IF NOT EXISTS public.pagos_otros (
  id                  text PRIMARY KEY,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento   date,
  concepto            text NOT NULL,
  categoria           text,                  -- gasto_admin | reembolso | servicio_puntual | otro
  proveedor           text,
  monto               numeric NOT NULL DEFAULT 0,
  moneda              text DEFAULT 'COP',
  metodo_pago         text,                  -- transferencia | efectivo | cheque | tarjeta
  cuenta_origen       text,
  referencia          text,
  pagado              boolean DEFAULT false,
  pagado_at           timestamptz,
  pagado_por          text,
  comprobante_url     text,
  notas               text,
  pago_recurrente_id  text REFERENCES public.pagos_recurrentes(id) ON DELETE SET NULL,
  created_by          text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagos_otros_fecha     ON public.pagos_otros(fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_otros_pagado    ON public.pagos_otros(pagado, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_otros_recurrente ON public.pagos_otros(pago_recurrente_id);

ALTER TABLE public.pagos_otros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagos_otros_all" ON public.pagos_otros;
CREATE POLICY "pagos_otros_all" ON public.pagos_otros
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.pagos_otros TO anon, authenticated;

-- ── 3. Conciliación bancaria — extractos importados ─────────────────────
CREATE TABLE IF NOT EXISTS public.banco_extractos (
  id                  text PRIMARY KEY,
  banco               text NOT NULL,         -- Bancolombia | Davivienda | etc
  cuenta              text NOT NULL,
  fecha_inicio        date NOT NULL,
  fecha_fin           date NOT NULL,
  archivo_url         text,
  total_movimientos   int DEFAULT 0,
  saldo_inicial       numeric,
  saldo_final         numeric,
  importado_por       text,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banco_movimientos (
  id                  text PRIMARY KEY,
  extracto_id         text REFERENCES public.banco_extractos(id) ON DELETE CASCADE,
  fecha               date NOT NULL,
  descripcion         text,
  referencia          text,
  monto               numeric NOT NULL,      -- positivo = abono, negativo = cargo
  tipo                text,                  -- abono | cargo
  saldo_despues       numeric,
  -- Conciliación
  conciliado          boolean DEFAULT false,
  pago_oc_id          uuid REFERENCES public.ordenes_compra(id) ON DELETE SET NULL,
  pago_otros_id       text REFERENCES public.pagos_otros(id) ON DELETE SET NULL,
  cxp_pago_id         text REFERENCES public.cxp_pagos(id) ON DELETE SET NULL,
  conciliado_at       timestamptz,
  conciliado_por      text,
  notas               text
);
CREATE INDEX IF NOT EXISTS idx_mov_extracto    ON public.banco_movimientos(extracto_id);
CREATE INDEX IF NOT EXISTS idx_mov_conciliado  ON public.banco_movimientos(conciliado, fecha);
CREATE INDEX IF NOT EXISTS idx_mov_fecha       ON public.banco_movimientos(fecha);

ALTER TABLE public.banco_extractos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banco_movimientos  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "banco_ext_all" ON public.banco_extractos;
DROP POLICY IF EXISTS "banco_mov_all" ON public.banco_movimientos;
CREATE POLICY "banco_ext_all" ON public.banco_extractos
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "banco_mov_all" ON public.banco_movimientos
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.banco_extractos, public.banco_movimientos TO anon, authenticated;

-- ── 4. Helper: generar pagos otros desde recurrentes activos ────────────
-- Esta función se llama cada inicio de mes (manualmente o vía cron) para
-- crear los pagos pendientes del mes basados en pagos_recurrentes.
CREATE OR REPLACE FUNCTION public.generar_pagos_recurrentes_mes(target_month date DEFAULT date_trunc('month', CURRENT_DATE)::date)
RETURNS int AS $$
DECLARE
  v_count int := 0;
  rec record;
  v_fecha_venc date;
  v_id text;
BEGIN
  FOR rec IN
    SELECT * FROM public.pagos_recurrentes WHERE activo = true
  LOOP
    -- Calcular fecha de vencimiento del mes
    v_fecha_venc := (target_month + (rec.dia_pago - 1) * INTERVAL '1 day')::date;

    -- Solo crear si no existe ya para este mes
    IF NOT EXISTS (
      SELECT 1 FROM public.pagos_otros
       WHERE pago_recurrente_id = rec.id
         AND date_trunc('month', fecha_vencimiento) = target_month
    ) THEN
      v_id := 'PO_' || EXTRACT(epoch FROM now())::bigint || '_' || substr(md5(random()::text), 1, 6);
      INSERT INTO public.pagos_otros (
        id, fecha, fecha_vencimiento, concepto, categoria, proveedor,
        monto, moneda, metodo_pago, cuenta_origen, pago_recurrente_id, created_by
      ) VALUES (
        v_id, target_month, v_fecha_venc, rec.nombre, rec.categoria, rec.proveedor,
        rec.monto, rec.moneda, rec.metodo_pago_default, rec.cuenta_origen, rec.id, 'sistema'
      );
      v_count := v_count + 1;

      -- Actualizar siguiente_vencimiento del recurrente
      UPDATE public.pagos_recurrentes
         SET siguiente_vencimiento = (
               CASE rec.frecuencia
                 WHEN 'mensual'    THEN v_fecha_venc + INTERVAL '1 month'
                 WHEN 'bimensual'  THEN v_fecha_venc + INTERVAL '2 months'
                 WHEN 'trimestral' THEN v_fecha_venc + INTERVAL '3 months'
                 WHEN 'semestral'  THEN v_fecha_venc + INTERVAL '6 months'
                 WHEN 'anual'      THEN v_fecha_venc + INTERVAL '1 year'
                 ELSE v_fecha_venc + INTERVAL '1 month'
               END)::date,
             updated_at = now()
       WHERE id = rec.id;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
