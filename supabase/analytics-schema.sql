-- AtolanTrack: Analytics Schema

-- Sesiones
CREATE TABLE IF NOT EXISTS track_sesiones (
  id text PRIMARY KEY,
  usuario_id text,
  dispositivo text,
  navegador text,
  os text,
  pantalla text,
  idioma text,
  utms jsonb DEFAULT '{}',
  canal text,
  referrer text,
  ip_hash text,
  entrada_url text,
  salida_url text,
  duracion_seg int,
  eventos_count int DEFAULT 0,
  convertida boolean DEFAULT false,
  ingreso numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Eventos
CREATE TABLE IF NOT EXISTS track_eventos (
  id text PRIMARY KEY,
  sesion_id text REFERENCES track_sesiones(id) ON DELETE CASCADE,
  usuario_id text,
  tipo text NOT NULL,
  categoria text,
  datos jsonb DEFAULT '{}',
  url text,
  ts timestamptz DEFAULT now(),
  idempotency_key text UNIQUE
);

-- Usuarios (stitching)
CREATE TABLE IF NOT EXISTS track_usuarios (
  id text PRIMARY KEY,
  email_hash text,
  primer_canal text,
  primer_utms jsonb DEFAULT '{}',
  sesiones_count int DEFAULT 0,
  conversiones_count int DEFAULT 0,
  ingreso_total numeric DEFAULT 0,
  ultimo_visto timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Embudos
CREATE TABLE IF NOT EXISTS track_embudos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sesion_id text,
  usuario_id text,
  paso_1_ts timestamptz,  -- vista página booking
  paso_2_ts timestamptz,  -- seleccionó fecha
  paso_3_ts timestamptz,  -- seleccionó paquete
  paso_4_ts timestamptz,  -- ingresó datos personales
  paso_5_ts timestamptz,  -- llegó a pago
  paso_6_ts timestamptz,  -- completó pago
  abandono_paso int,
  email_abandono text,
  email_enviado boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Ingresos
CREATE TABLE IF NOT EXISTS track_ingresos (
  id text PRIMARY KEY,
  sesion_id text,
  usuario_id text,
  reserva_id text,
  monto numeric NOT NULL,
  moneda text DEFAULT 'COP',
  canal text,
  utms jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Atribuciones
CREATE TABLE IF NOT EXISTS track_atribuciones (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ingreso_id text REFERENCES track_ingresos(id),
  modelo text NOT NULL, -- 'first_touch','last_touch','linear','time_decay'
  canal text,
  valor numeric,
  peso numeric,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE track_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_embudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_ingresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_atribuciones ENABLE ROW LEVEL SECURITY;

-- Public insert for tracking (anon users can write)
CREATE POLICY "track_sesiones_insert" ON track_sesiones FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "track_sesiones_select" ON track_sesiones FOR SELECT TO authenticated USING (true);
CREATE POLICY "track_sesiones_update" ON track_sesiones FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "track_eventos_insert" ON track_eventos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "track_eventos_select" ON track_eventos FOR SELECT TO authenticated USING (true);

CREATE POLICY "track_usuarios_insert" ON track_usuarios FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "track_usuarios_select" ON track_usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "track_usuarios_update" ON track_usuarios FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "track_embudos_insert" ON track_embudos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "track_embudos_select" ON track_embudos FOR SELECT TO authenticated USING (true);
CREATE POLICY "track_embudos_update" ON track_embudos FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "track_ingresos_insert" ON track_ingresos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "track_ingresos_select" ON track_ingresos FOR SELECT TO authenticated USING (true);

CREATE POLICY "track_atribuciones_insert" ON track_atribuciones FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "track_atribuciones_select" ON track_atribuciones FOR SELECT TO authenticated USING (true);
