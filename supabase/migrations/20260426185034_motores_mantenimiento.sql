-- Sistema de mantenimiento preventivo de motores (Yamaha 350 HP línea roja
-- u otros). Cada lancha puede tener varios motores, cada uno con su propio
-- horómetro y alertas. Intervalos: diario, 50h, 100h, 300h, 500h, 1000h.

-- ── 1. Motores ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lancha_motores (
  id                          text PRIMARY KEY,
  lancha_id                   text NOT NULL REFERENCES public.lanchas(id) ON DELETE CASCADE,
  codigo                      text,                    -- ej. "M1", "Estribor", "Babor"
  marca                       text DEFAULT 'Yamaha',
  modelo                      text DEFAULT 'F350 / 350 HP línea roja',
  numero_serie                text,
  fecha_instalacion           date,
  -- Horómetro
  horas_iniciales             numeric DEFAULT 0,        -- horas con las que se instaló
  horas_actuales              numeric DEFAULT 0,        -- horómetro actual (calculado/actualizado por uso diario)
  -- Última horas con cada tipo de mantenimiento (para calcular próximo)
  horas_ult_mant_50           numeric DEFAULT 0,
  horas_ult_mant_100          numeric DEFAULT 0,
  horas_ult_mant_300          numeric DEFAULT 0,
  horas_ult_mant_500          numeric DEFAULT 0,
  horas_ult_mant_1000         numeric DEFAULT 0,
  fecha_ult_mant              date,
  -- Estado: operativo | proximo | vencido | vencido_critico | mantenimiento | fuera_servicio
  estado                      text DEFAULT 'operativo',
  notas                       text,
  activo                      boolean DEFAULT true,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_motores_lancha ON public.lancha_motores(lancha_id);
CREATE INDEX IF NOT EXISTS idx_motores_estado ON public.lancha_motores(estado, activo);

-- ── 2. Registro diario de uso (hora trabajada por motor) ───────────────────
CREATE TABLE IF NOT EXISTS public.motor_uso_diario (
  id                  text PRIMARY KEY,
  motor_id            text NOT NULL REFERENCES public.lancha_motores(id) ON DELETE CASCADE,
  lancha_id           text REFERENCES public.lanchas(id) ON DELETE SET NULL,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  horometro_inicio    numeric NOT NULL,
  horometro_fin       numeric NOT NULL,
  horas_trabajadas    numeric GENERATED ALWAYS AS (horometro_fin - horometro_inicio) STORED,
  ruta                text,
  capitan_id          uuid REFERENCES public.rh_empleados(id) ON DELETE SET NULL,
  capitan_nombre      text,
  observaciones       text,
  fotos_urls          text[],
  firma_url           text,
  justificacion       text,                  -- si hay diferencia anormal de horas
  created_by          text,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uso_diario_motor ON public.motor_uso_diario(motor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_uso_diario_lancha_fecha ON public.motor_uso_diario(lancha_id, fecha DESC);

-- ── 3. Checklist diario (revisión post-uso) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.motor_checklist_diario (
  id                  text PRIMARY KEY,
  motor_id            text NOT NULL REFERENCES public.lancha_motores(id) ON DELETE CASCADE,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  capitan_id          uuid REFERENCES public.rh_empleados(id) ON DELETE SET NULL,
  capitan_nombre      text,
  -- Checklist de revisión post-uso (cada item: { ok: bool, nota: text })
  items               jsonb DEFAULT '{}'::jsonb,
  observaciones       text,
  fotos_urls          text[],
  completado          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_motor_fecha ON public.motor_checklist_diario(motor_id, fecha DESC);

-- ── 4. Órdenes de mantenimiento ────────────────────────────────────────────
-- tipo: diario | 50h | 100h | 300h | 500h | 1000h | correctivo
-- estado: abierta | en_proceso | pendiente_repuesto | finalizada | cancelada
CREATE TABLE IF NOT EXISTS public.motor_mantenimientos (
  id                  text PRIMARY KEY,
  numero              text UNIQUE,                     -- ej. OT-2026-0001
  motor_id            text NOT NULL REFERENCES public.lancha_motores(id) ON DELETE CASCADE,
  lancha_id           text REFERENCES public.lanchas(id) ON DELETE SET NULL,
  tipo                text NOT NULL,                   -- diario|50h|100h|300h|500h|1000h|correctivo
  estado              text DEFAULT 'abierta',
  fecha_apertura      date NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre        date,
  horas_motor_apertura numeric,                        -- horas del motor al abrir la OT
  horas_motor_cierre  numeric,
  responsable         text,                            -- supervisor que abrió
  tecnico_id          uuid REFERENCES public.rh_empleados(id) ON DELETE SET NULL,
  tecnico_nombre      text,
  -- Checklist técnico (varía por tipo)
  checklist           jsonb DEFAULT '{}'::jsonb,
  -- Repuestos: [{ item_id, nombre, cantidad, costo_unit, costo_total, proveedor }]
  repuestos           jsonb DEFAULT '[]'::jsonb,
  costo_repuestos     numeric DEFAULT 0,
  costo_mano_obra     numeric DEFAULT 0,
  costo_total         numeric GENERATED ALWAYS AS (COALESCE(costo_repuestos, 0) + COALESCE(costo_mano_obra, 0)) STORED,
  observaciones       text,
  fotos_urls          text[],
  factura_url         text,
  factura_numero      text,
  factura_proveedor   text,
  firma_tecnico_url   text,
  firma_supervisor_url text,
  notas_cierre        text,
  created_by          text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_motor_mant_motor ON public.motor_mantenimientos(motor_id, fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS idx_motor_mant_estado ON public.motor_mantenimientos(estado);
CREATE INDEX IF NOT EXISTS idx_motor_mant_tipo ON public.motor_mantenimientos(tipo);

-- ── 5. Autorizaciones excepcionales para operar con mantenimiento vencido ──
CREATE TABLE IF NOT EXISTS public.motor_autorizaciones (
  id                  text PRIMARY KEY,
  motor_id            text NOT NULL REFERENCES public.lancha_motores(id) ON DELETE CASCADE,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  horas_al_autorizar  numeric,
  motivo              text NOT NULL,
  gerente_id          uuid REFERENCES public.rh_empleados(id) ON DELETE SET NULL,
  gerente_nombre      text,
  gerente_email       text,
  firma_url           text,
  vigencia_horas      numeric DEFAULT 10,              -- por cuántas horas adicionales aplica
  usada               boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_motor_autoriz_motor ON public.motor_autorizaciones(motor_id, created_at DESC);

-- ── 6. RLS (patrón estándar Atolón OS) ─────────────────────────────────────
ALTER TABLE public.lancha_motores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_uso_diario           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_checklist_diario     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_mantenimientos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motor_autorizaciones       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lancha_motores_all"           ON public.lancha_motores;
DROP POLICY IF EXISTS "motor_uso_diario_all"         ON public.motor_uso_diario;
DROP POLICY IF EXISTS "motor_checklist_diario_all"   ON public.motor_checklist_diario;
DROP POLICY IF EXISTS "motor_mantenimientos_all"     ON public.motor_mantenimientos;
DROP POLICY IF EXISTS "motor_autorizaciones_all"     ON public.motor_autorizaciones;

CREATE POLICY "lancha_motores_all"           ON public.lancha_motores         FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "motor_uso_diario_all"         ON public.motor_uso_diario       FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "motor_checklist_diario_all"   ON public.motor_checklist_diario FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "motor_mantenimientos_all"     ON public.motor_mantenimientos   FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "motor_autorizaciones_all"     ON public.motor_autorizaciones   FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

GRANT ALL ON public.lancha_motores, public.motor_uso_diario, public.motor_checklist_diario,
             public.motor_mantenimientos, public.motor_autorizaciones
  TO anon, authenticated;

-- ── 7. Función: estado del motor según horas y mantenimientos ──────────────
-- Calcula próximos mantenimientos y devuelve el estado más crítico
-- (rojo > naranja > amarillo > verde). Considera el ciclo más cercano.
CREATE OR REPLACE FUNCTION public.calcular_estado_motor(p_motor_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  m RECORD;
  prox_50  numeric; prox_100 numeric; prox_300 numeric; prox_500 numeric; prox_1000 numeric;
  delta_50 numeric; delta_100 numeric; delta_300 numeric; delta_500 numeric; delta_1000 numeric;
  delta_min numeric;
BEGIN
  SELECT * INTO m FROM public.lancha_motores WHERE id = p_motor_id;
  IF NOT FOUND OR NOT m.activo THEN RETURN 'fuera_servicio'; END IF;
  IF m.estado = 'mantenimiento' OR m.estado = 'fuera_servicio' THEN RETURN m.estado; END IF;

  prox_50   := COALESCE(m.horas_ult_mant_50, 0)   + 50;
  prox_100  := COALESCE(m.horas_ult_mant_100, 0)  + 100;
  prox_300  := COALESCE(m.horas_ult_mant_300, 0)  + 300;
  prox_500  := COALESCE(m.horas_ult_mant_500, 0)  + 500;
  prox_1000 := COALESCE(m.horas_ult_mant_1000, 0) + 1000;

  delta_50   := prox_50   - m.horas_actuales;
  delta_100  := prox_100  - m.horas_actuales;
  delta_300  := prox_300  - m.horas_actuales;
  delta_500  := prox_500  - m.horas_actuales;
  delta_1000 := prox_1000 - m.horas_actuales;

  -- Crítico: 100h excedió en más de 10h (>110h después del último 100h)
  IF delta_100 < -10 THEN RETURN 'vencido_critico'; END IF;

  -- Vencido (rojo): cualquier mantenimiento ya pasó su umbral
  IF delta_50 < 0 OR delta_100 < 0 OR delta_300 < 0 OR delta_500 < 0 OR delta_1000 < 0 THEN
    RETURN 'vencido';
  END IF;

  -- Próximo (amarillo/naranja): faltan 10h o menos para el próximo
  delta_min := LEAST(delta_50, delta_100, delta_300, delta_500, delta_1000);
  IF delta_min <= 0 THEN RETURN 'vencido'; END IF;
  IF delta_min <= 10 THEN RETURN 'proximo'; END IF;

  RETURN 'operativo';
END;
$$;
GRANT EXECUTE ON FUNCTION public.calcular_estado_motor(text) TO anon, authenticated;

-- ── 8. Trigger: al insertar uso_diario, actualizar horas_actuales del motor ─
CREATE OR REPLACE FUNCTION public.actualizar_horas_motor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.horometro_fin < NEW.horometro_inicio THEN
    RAISE EXCEPTION 'Horómetro final (%) no puede ser menor al inicial (%)',
      NEW.horometro_fin, NEW.horometro_inicio;
  END IF;
  UPDATE public.lancha_motores
  SET horas_actuales = GREATEST(horas_actuales, NEW.horometro_fin),
      estado = public.calcular_estado_motor(NEW.motor_id),
      updated_at = now()
  WHERE id = NEW.motor_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_uso_diario_actualizar_horas ON public.motor_uso_diario;
CREATE TRIGGER tr_uso_diario_actualizar_horas
AFTER INSERT ON public.motor_uso_diario
FOR EACH ROW EXECUTE FUNCTION public.actualizar_horas_motor();

-- ── 9. Trigger: al cerrar mantenimiento, actualizar horas_ult_* del motor ──
-- Cuando se hace mantenimiento mayor (ej. 300h), también marca como cubiertos
-- los menores incluidos (50h y 100h se actualizan también).
CREATE OR REPLACE FUNCTION public.actualizar_motor_post_mantenimiento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  horas numeric;
BEGIN
  -- Solo aplicar al pasar a 'finalizada'
  IF NEW.estado <> 'finalizada' OR (OLD.estado = 'finalizada' AND NEW.estado = 'finalizada') THEN
    RETURN NEW;
  END IF;

  horas := COALESCE(NEW.horas_motor_cierre, NEW.horas_motor_apertura, 0);
  IF horas <= 0 THEN RETURN NEW; END IF;

  UPDATE public.lancha_motores SET
    horas_ult_mant_50   = CASE WHEN NEW.tipo IN ('50h', '100h', '300h', '500h', '1000h') THEN horas ELSE horas_ult_mant_50 END,
    horas_ult_mant_100  = CASE WHEN NEW.tipo IN ('100h', '300h', '500h', '1000h')        THEN horas ELSE horas_ult_mant_100 END,
    horas_ult_mant_300  = CASE WHEN NEW.tipo IN ('300h', '500h', '1000h')                THEN horas ELSE horas_ult_mant_300 END,
    horas_ult_mant_500  = CASE WHEN NEW.tipo IN ('500h', '1000h')                        THEN horas ELSE horas_ult_mant_500 END,
    horas_ult_mant_1000 = CASE WHEN NEW.tipo = '1000h'                                   THEN horas ELSE horas_ult_mant_1000 END,
    fecha_ult_mant      = COALESCE(NEW.fecha_cierre, CURRENT_DATE),
    estado              = public.calcular_estado_motor(NEW.motor_id),
    updated_at          = now()
  WHERE id = NEW.motor_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_mant_actualizar_motor ON public.motor_mantenimientos;
CREATE TRIGGER tr_mant_actualizar_motor
AFTER UPDATE OF estado ON public.motor_mantenimientos
FOR EACH ROW EXECUTE FUNCTION public.actualizar_motor_post_mantenimiento();

-- ── 10. Seed: motores de Naturalle (2 Yamaha 350 HP línea roja) ────────────
INSERT INTO public.lancha_motores (id, lancha_id, codigo, marca, modelo, numero_serie, fecha_instalacion, horas_iniciales, horas_actuales, horas_ult_mant_50, horas_ult_mant_100)
SELECT
  'MOT-NATURALLE-ESTRIBOR', id, 'Estribor', 'Yamaha', 'F350 / 350 HP línea roja', NULL, NULL, 0, 0, 0, 0
FROM public.lanchas WHERE nombre = 'Naturalle' AND activo = true
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lancha_motores (id, lancha_id, codigo, marca, modelo, numero_serie, fecha_instalacion, horas_iniciales, horas_actuales, horas_ult_mant_50, horas_ult_mant_100)
SELECT
  'MOT-NATURALLE-BABOR', id, 'Babor', 'Yamaha', 'F350 / 350 HP línea roja', NULL, NULL, 0, 0, 0, 0
FROM public.lanchas WHERE nombre = 'Naturalle' AND activo = true
ON CONFLICT (id) DO NOTHING;

-- También un motor para Castillete (default) — el usuario puede editar
INSERT INTO public.lancha_motores (id, lancha_id, codigo, marca, modelo, numero_serie, fecha_instalacion, horas_iniciales, horas_actuales)
SELECT
  'MOT-CASTILLETE-1', id, 'Motor 1', 'Yamaha', 'F350 / 350 HP línea roja', NULL, NULL, 0, 0
FROM public.lanchas WHERE nombre = 'Castillete' AND activo = true
ON CONFLICT (id) DO NOTHING;
