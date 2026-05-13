-- ZKTeco MB10-T/VC: integración de asistencia para staff vía ADMS PUSH.
-- ──────────────────────────────────────────────────────────────────
-- El terminal envía POSTs al endpoint /iclock/cdata cada vez que
-- alguien marca con huella, face o tarjeta. Acá guardamos cada punch
-- crudo + matcheado al empleado para reportes de RH/nómina.

-- Mapping: el aparato identifica al empleado por un "PIN" interno
-- (string corto, 1-9 chars). En enrollment hay que enrolar usando
-- la cédula del empleado como PIN, así matcheamos directo.
-- Si por algún motivo no coincide, podemos guardar el zk_user_id
-- aparte y matchear manualmente desde la UI.
ALTER TABLE rh_empleados
  ADD COLUMN IF NOT EXISTS zk_user_id text;
COMMENT ON COLUMN rh_empleados.zk_user_id IS
  'PIN/User ID en el terminal ZKTeco. Default: cédula. Se llena al enrolar.';
CREATE INDEX IF NOT EXISTS idx_rh_empleados_zk_user_id
  ON rh_empleados(zk_user_id) WHERE zk_user_id IS NOT NULL;

-- Tabla principal: cada punch del terminal
CREATE TABLE IF NOT EXISTS asistencia_zk (
  id              text PRIMARY KEY,                    -- ZK-{terminal_sn}-{ts}-{user_id}
  empleado_id     uuid REFERENCES rh_empleados(id),    -- match si existe; null si zk_user_id no está mapeado
  zk_user_id      text NOT NULL,                       -- el PIN del terminal
  cedula          text,                                -- redundante para audit (snapshot)
  nombre_snapshot text,                                -- nombre del empleado en el momento

  terminal_sn     text NOT NULL,                       -- ej: UDP3234600028
  timestamp       timestamptz NOT NULL,                -- momento del punch (zona Bogotá)
  fecha           date NOT NULL,                       -- denormalizado para queries por día
  hora            time NOT NULL,                       -- denormalizado

  tipo_marca      text DEFAULT 'auto',                 -- entrada/salida/break_inicio/break_fin/auto
  metodo          text,                                -- huella/face/tarjeta/pin
  workcode        text,                                -- código de trabajo (proyecto/locación) si aplica

  raw             jsonb,                               -- payload original por si algo falla parsing
  created_at      timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asistencia_zk_empleado_fecha
  ON asistencia_zk(empleado_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_zk_fecha
  ON asistencia_zk(fecha DESC, hora);
CREATE INDEX IF NOT EXISTS idx_asistencia_zk_terminal_ts
  ON asistencia_zk(terminal_sn, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_zk_zkuserid
  ON asistencia_zk(zk_user_id);

-- RLS permisivo (mismo patrón del resto de la app — control en UI)
ALTER TABLE asistencia_zk ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'asistencia_zk'::regclass AND polname = 'asistencia_zk_all_anon') THEN
    EXECUTE 'CREATE POLICY asistencia_zk_all_anon ON asistencia_zk FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'asistencia_zk'::regclass AND polname = 'asistencia_zk_all_auth') THEN
    EXECUTE 'CREATE POLICY asistencia_zk_all_auth ON asistencia_zk FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Tabla de log: registra TODA comunicación con el terminal para
-- debug y auditoría (handshakes, pulls, errores). Se rota o purga
-- periódicamente.
CREATE TABLE IF NOT EXISTS zk_terminal_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_sn text,
  operation   text,                                    -- cdata/getrequest/fdata/ping/etc
  method      text,                                    -- GET / POST
  query       jsonb,
  body_text   text,
  response    text,
  status_code int,
  created_at  timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zk_log_created
  ON zk_terminal_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zk_log_sn
  ON zk_terminal_log(terminal_sn, created_at DESC);

ALTER TABLE zk_terminal_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zk_terminal_log'::regclass AND polname = 'zk_log_all_anon') THEN
    EXECUTE 'CREATE POLICY zk_log_all_anon ON zk_terminal_log FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zk_terminal_log'::regclass AND polname = 'zk_log_all_auth') THEN
    EXECUTE 'CREATE POLICY zk_log_all_auth ON zk_terminal_log FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Tabla de comandos pendientes (server → terminal). El aparato hace
-- polling al endpoint /iclock/getrequest periódicamente para chequear
-- comandos. Los más comunes: enrolar usuario, borrar usuario, reboot,
-- restart, force sync. Por ahora la creamos vacía pero queda lista.
CREATE TABLE IF NOT EXISTS zk_terminal_commands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_sn  text NOT NULL,
  command      text NOT NULL,                          -- ej: "DATA UPDATE USERINFO PIN=123\tName=Juan"
  status       text DEFAULT 'pending',                 -- pending/sent/done/failed
  sent_at      timestamptz,
  ack_at       timestamptz,
  result       text,
  created_at   timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zk_cmd_pending
  ON zk_terminal_commands(terminal_sn, status) WHERE status = 'pending';

ALTER TABLE zk_terminal_commands ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zk_terminal_commands'::regclass AND polname = 'zk_cmd_all_anon') THEN
    EXECUTE 'CREATE POLICY zk_cmd_all_anon ON zk_terminal_commands FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zk_terminal_commands'::regclass AND polname = 'zk_cmd_all_auth') THEN
    EXECUTE 'CREATE POLICY zk_cmd_all_auth ON zk_terminal_commands FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
