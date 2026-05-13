-- ============================================================================
-- Phase 1: Foundations for the new Asset Management architecture
-- ----------------------------------------------------------------------------
-- Crea 5 tablas nuevas (categorías, ubicaciones, movimientos, auditorías,
-- mantenimientos programados) y agrega ~20 columnas optativas a `activos`.
-- TODO es idempotente. NO toca columnas existentes ni rompe los 73 activos
-- que ya viven en producción.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) activos_categorias  (catalog of asset categories — 18 standard rows)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activos_categorias (
  id                       text PRIMARY KEY,
  nivel_1                  text NOT NULL,
  nivel_2                  text NOT NULL,
  depreciable              boolean NOT NULL,
  vida_util_anios_default  numeric,
  icono                    text,
  color                    text,
  orden                    int DEFAULT 0,
  activa                   boolean DEFAULT true,
  created_at               timestamptz DEFAULT now()
);

ALTER TABLE public.activos_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activos_categorias_all" ON public.activos_categorias;
CREATE POLICY "activos_categorias_all" ON public.activos_categorias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.activos_categorias TO anon, authenticated;

INSERT INTO public.activos_categorias
  (id, nivel_1, nivel_2, depreciable, vida_util_anios_default, icono, color, orden) VALUES
  ('FFE-MOB',   'FF&E',         'Mobiliario',    true,  10,   '🛋',   '#f59e0b',  10),
  ('FFE-FIX',   'FF&E',         'Fixtures',      true,  15,   '💡',   '#f59e0b',  20),
  ('FFE-EQU',   'FF&E',         'Equipos',       true,   7,   '⚙️',   '#f59e0b',  30),
  ('OSE-MEN',   'OS&E',         'Menaje',        false, NULL, '🍽️',   '#38bdf8',  40),
  ('OSE-BLA',   'OS&E',         'Blancos',       false, NULL, '🛏️',   '#38bdf8',  50),
  ('OSE-OPE',   'OS&E',         'Operación',     false, NULL, '📋',   '#38bdf8',  60),
  ('MACH-MAR',  'Maquinaria',   'Marina',        true,  15,   '⛵',   '#a78bfa',  70),
  ('MACH-PIS',  'Maquinaria',   'Piscina',       true,  12,   '🏊',   '#a78bfa',  80),
  ('MACH-ENE',  'Maquinaria',   'Energía',       true,  15,   '⚡',   '#a78bfa',  90),
  ('MACH-SEG',  'Maquinaria',   'Seguridad',     true,  10,   '🛡️',   '#a78bfa', 100),
  ('IT-HW',     'Tecnología',   'Hardware',      true,   5,   '💻',   '#22c55e', 110),
  ('IT-NET',    'Tecnología',   'Networking',    true,   7,   '📡',   '#22c55e', 120),
  ('IT-GUEST',  'Tecnología',   'Guest Tech',    true,   5,   '📱',   '#22c55e', 130),
  ('DEC-ARTE',  'Decoración',   'Arte',          false, NULL, '🎨',   '#ec4899', 140),
  ('DEC-PREM',  'Decoración',   'Decor premium', true,   8,   '✨',   '#ec4899', 150),
  ('CONS-REP',  'Consumibles',  'Reposición',    false, NULL, '📦',   '#94a3b8', 160),
  ('CONS-LIM',  'Consumibles',  'Limpieza',      false, NULL, '🧼',   '#94a3b8', 170),
  ('CONS-PAP',  'Consumibles',  'Papelería',     false, NULL, '📄',   '#94a3b8', 180)
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 2) activos_ubicaciones  (canonical physical locations)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activos_ubicaciones (
  id                       text PRIMARY KEY,
  area                     text NOT NULL,
  zona                     text,
  detalle                  text,
  responsable_default_id   uuid,
  activa                   boolean DEFAULT true,
  created_at               timestamptz DEFAULT now()
);

ALTER TABLE public.activos_ubicaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activos_ubicaciones_all" ON public.activos_ubicaciones;
CREATE POLICY "activos_ubicaciones_all" ON public.activos_ubicaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.activos_ubicaciones TO anon, authenticated;

INSERT INTO public.activos_ubicaciones (id, area, zona, detalle) VALUES
  ('HOTEL-LOBBY',         'Hotel',           'Lobby',           'Lobby principal'),
  ('HOTEL-RECEPCION',     'Hotel',           'Recepción',       'Counter de recepción'),
  ('HOTEL-PASILLO',       'Hotel',           'Pasillos',        'Pasillos comunes'),
  ('HAB-201',             'Habitaciones',    'Piso 2',          'Habitación 201'),
  ('HAB-202',             'Habitaciones',    'Piso 2',          'Habitación 202'),
  ('HAB-301',             'Habitaciones',    'Piso 3',          'Habitación 301'),
  ('HAB-302',             'Habitaciones',    'Piso 3',          'Habitación 302'),
  ('HAB-401',             'Habitaciones',    'Piso 4',          'Habitación 401'),
  ('HAB-402',             'Habitaciones',    'Piso 4',          'Habitación 402'),
  ('HAB-SUITE-1',         'Habitaciones',    'Suite',           'Suite principal'),
  ('BC-PISCINA',          'Beach Club',      'Piscina',         'Área de piscina'),
  ('BC-ASOLEADORAS',      'Beach Club',      'Asoleadoras',     'Zona de asoleadoras'),
  ('BC-ROOFTOP',          'Beach Club',      'Rooftop',         'Terraza rooftop'),
  ('BC-CABANA',           'Beach Club',      'Cabañas',         'Cabañas de playa'),
  ('COCINA-CALIENTE',     'Cocina',          'Caliente',        'Línea caliente'),
  ('COCINA-FRIA',         'Cocina',          'Fría',            'Línea fría'),
  ('COCINA-PASTELERIA',   'Cocina',          'Pastelería',      'Pastelería'),
  ('COCINA-ALMACEN',      'Cocina',          'Almacén',         'Almacén de cocina'),
  ('BAR-PRINCIPAL',       'Bar',             'Principal',       'Bar principal'),
  ('BAR-ALMACEN',         'Bar',             'Almacén',         'Almacén de bar'),
  ('BAR-MINIBAR',         'Bar',             'Minibar',         'Minibares de habitaciones'),
  ('SPA-CABINA-1',        'Spa',             'Cabina 1',        'Cabina de tratamientos 1'),
  ('SPA-CABINA-2',        'Spa',             'Cabina 2',        'Cabina de tratamientos 2'),
  ('SPA-RECEPCION',       'Spa',             'Recepción',       'Recepción del spa'),
  ('MUELLE-PRINCIPAL',    'Muelle',          'Principal',       'Muelle principal'),
  ('LANCHA-NATURALLE',    'Lancha',          'Naturalle',       'Lancha Naturalle'),
  ('LANCHA-CASTILLETE',   'Lancha',          'Castillete',      'Lancha Castillete'),
  ('ADMIN-OFICINAS',      'Administración',  'Oficinas',        'Oficinas administrativas'),
  ('ADMIN-SALA-JUNTAS',   'Administración',  'Sala de juntas',  'Sala de juntas'),
  ('MANTTO-TALLER',       'Mantenimiento',   'Taller',          'Taller de mantenimiento'),
  ('MANTTO-ALMACEN',      'Mantenimiento',   'Almacén',         'Almacén de mantenimiento'),
  ('BODEGA-CENTRAL',      'Bodega Central',  'General',         'Bodega central'),
  ('STAFF-COMEDOR',       'RRHH/Staff',      'Comedor',         'Comedor de personal'),
  ('STAFF-LOCKERS',       'RRHH/Staff',      'Lockers',         'Vestidores y lockers')
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 3) activos_movimientos  (full audit trail of every event on an asset)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activos_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activo_id           text NOT NULL,
  tipo                text NOT NULL,
  fecha               timestamptz DEFAULT now(),
  usuario_id          uuid,
  usuario_nombre      text,
  ubicacion_anterior  text,
  ubicacion_nueva     text,
  estado_anterior     text,
  estado_nuevo        text,
  costo               numeric(14,2),
  proveedor           text,
  factura_url         text,
  observaciones       text,
  fotos_urls          text[],
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activos_movimientos_activo ON public.activos_movimientos(activo_id);
CREATE INDEX IF NOT EXISTS idx_activos_movimientos_fecha  ON public.activos_movimientos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_activos_movimientos_tipo   ON public.activos_movimientos(tipo);

ALTER TABLE public.activos_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activos_movimientos_all" ON public.activos_movimientos;
CREATE POLICY "activos_movimientos_all" ON public.activos_movimientos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.activos_movimientos TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4) activos_auditorias  (programmed physical audits)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activos_auditorias (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                   text UNIQUE,
  fecha_programada         date,
  fecha_realizada          timestamptz,
  realizada_por            uuid,
  realizada_por_nombre     text,
  area                     text,
  total_esperados          int,
  total_encontrados        int,
  faltantes                jsonb,
  encontrados_extra        jsonb,
  observaciones            text,
  estado                   text DEFAULT 'programada',
  created_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activos_auditorias_estado ON public.activos_auditorias(estado);
CREATE INDEX IF NOT EXISTS idx_activos_auditorias_fecha  ON public.activos_auditorias(fecha_programada);

ALTER TABLE public.activos_auditorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activos_auditorias_all" ON public.activos_auditorias;
CREATE POLICY "activos_auditorias_all" ON public.activos_auditorias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.activos_auditorias TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5) activos_mantenimientos_prog  (preventive-maintenance schedule)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activos_mantenimientos_prog (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activo_id                text NOT NULL,
  proxima_fecha            date,
  intervalo_dias           int,
  proveedor_default        text,
  costo_estimado           numeric,
  notificar_dias_antes     int DEFAULT 7,
  ultimo_realizado         date,
  activa                   boolean DEFAULT true,
  created_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activos_mant_prog_activo ON public.activos_mantenimientos_prog(activo_id);
CREATE INDEX IF NOT EXISTS idx_activos_mant_prog_proxima ON public.activos_mantenimientos_prog(proxima_fecha);

ALTER TABLE public.activos_mantenimientos_prog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activos_mantenimientos_prog_all" ON public.activos_mantenimientos_prog;
CREATE POLICY "activos_mantenimientos_prog_all" ON public.activos_mantenimientos_prog
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.activos_mantenimientos_prog TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6) ALTER public.activos — add new optional columns (NULL allowed,
--    permissive defaults). DOES NOT touch existing columns or data.
-- ----------------------------------------------------------------------------
ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS codigo                text,
  ADD COLUMN IF NOT EXISTS categoria_id          text,
  ADD COLUMN IF NOT EXISTS ubicacion_id          text,
  ADD COLUMN IF NOT EXISTS responsable_id        uuid,
  ADD COLUMN IF NOT EXISTS qr_code               text,
  ADD COLUMN IF NOT EXISTS proveedor_id          uuid,
  ADD COLUMN IF NOT EXISTS factura_numero        text,
  ADD COLUMN IF NOT EXISTS factura_url           text,
  ADD COLUMN IF NOT EXISTS costo_adquisicion     numeric(14,2),
  ADD COLUMN IF NOT EXISTS metodo_depreciacion   text,
  ADD COLUMN IF NOT EXISTS vida_util_anios       numeric(4,1),
  ADD COLUMN IF NOT EXISTS valor_residual        numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_libros_actual   numeric(14,2),
  ADD COLUMN IF NOT EXISTS fecha_baja_contable   date,
  ADD COLUMN IF NOT EXISTS garantia_proveedor    text,
  ADD COLUMN IF NOT EXISTS ultima_auditoria_at   timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_auditoria_por  uuid,
  ADD COLUMN IF NOT EXISTS proxima_auditoria_at  date,
  ADD COLUMN IF NOT EXISTS mant_tipo             text,
  ADD COLUMN IF NOT EXISTS mant_intervalo_dias   int,
  ADD COLUMN IF NOT EXISTS mant_ultimo_at        date,
  ADD COLUMN IF NOT EXISTS mant_proximo_at       date;

-- Unique constraints on the new columns (idempotent — only add if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activos_codigo_key' AND conrelid = 'public.activos'::regclass
  ) THEN
    ALTER TABLE public.activos ADD CONSTRAINT activos_codigo_key UNIQUE (codigo);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activos_qr_code_key' AND conrelid = 'public.activos'::regclass
  ) THEN
    ALTER TABLE public.activos ADD CONSTRAINT activos_qr_code_key UNIQUE (qr_code);
  END IF;

  -- FK to activos_categorias (NULL allowed)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activos_categoria_id_fkey' AND conrelid = 'public.activos'::regclass
  ) THEN
    ALTER TABLE public.activos
      ADD CONSTRAINT activos_categoria_id_fkey
      FOREIGN KEY (categoria_id) REFERENCES public.activos_categorias(id) ON DELETE SET NULL;
  END IF;

  -- FK to activos_ubicaciones (NULL allowed)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activos_ubicacion_id_fkey' AND conrelid = 'public.activos'::regclass
  ) THEN
    ALTER TABLE public.activos
      ADD CONSTRAINT activos_ubicacion_id_fkey
      FOREIGN KEY (ubicacion_id) REFERENCES public.activos_ubicaciones(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 7) Trigger to auto-generate `codigo` when NULL on insert
--    Format: <CATEGORIA_ID>-<AREA_PREFIX>-<####>   (e.g. FFE-MOB-BAR-0001)
--    Fallback when categoria_id is NULL: LEGACY-<####>
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activos_generar_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_area_prefix text;
  v_area_src    text;
  v_seq         int;
  v_prefix      text;
BEGIN
  IF NEW.codigo IS NOT NULL AND length(trim(NEW.codigo)) > 0 THEN
    RETURN NEW;
  END IF;

  -- Derive area prefix from ubicacion_id (preferred) or area (fallback)
  IF NEW.ubicacion_id IS NOT NULL THEN
    SELECT area INTO v_area_src
      FROM public.activos_ubicaciones
     WHERE id = NEW.ubicacion_id;
  END IF;

  IF v_area_src IS NULL OR length(trim(v_area_src)) = 0 THEN
    v_area_src := NEW.area;
  END IF;

  IF v_area_src IS NULL OR length(trim(v_area_src)) = 0 THEN
    v_area_prefix := 'GEN';
  ELSE
    -- Take first 3 letters, uppercase, A–Z only
    v_area_prefix := upper(regexp_replace(v_area_src, '[^A-Za-z]', '', 'g'));
    IF length(v_area_prefix) > 3 THEN
      v_area_prefix := substr(v_area_prefix, 1, 3);
    ELSIF length(v_area_prefix) = 0 THEN
      v_area_prefix := 'GEN';
    END IF;
  END IF;

  -- Build prefix
  IF NEW.categoria_id IS NOT NULL AND length(trim(NEW.categoria_id)) > 0 THEN
    v_prefix := NEW.categoria_id || '-' || v_area_prefix;
  ELSE
    v_prefix := 'LEGACY';
  END IF;

  -- Next sequence: count of existing codigos that share the same prefix
  SELECT COALESCE(MAX(
           NULLIF(regexp_replace(codigo, '^.*-([0-9]{1,})$', '\1'), '')::int
         ), 0) + 1
    INTO v_seq
    FROM public.activos
   WHERE codigo LIKE v_prefix || '-%';

  NEW.codigo := v_prefix || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activos_generar_codigo ON public.activos;
CREATE TRIGGER trg_activos_generar_codigo
  BEFORE INSERT ON public.activos
  FOR EACH ROW
  EXECUTE FUNCTION public.activos_generar_codigo();


-- ----------------------------------------------------------------------------
-- Done.
-- ----------------------------------------------------------------------------
