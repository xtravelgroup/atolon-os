-- Bitácora de zarpes generados desde el check-in
CREATE TABLE IF NOT EXISTS zarpes_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha               date NOT NULL,
  salida_id           text,
  salida_hora         text,
  salida_nombre       text,
  embarcacion_id      text,
  embarcacion_nombre  text,
  zarpe_codigo        text,
  pax_total           int DEFAULT 0,
  colaboradores_count int DEFAULT 0,
  pasajeros           jsonb DEFAULT '[]'::jsonb,   -- nombre, identificacion, nacionalidad
  colaboradores       jsonb DEFAULT '[]'::jsonb,   -- nombre, cedula, rol
  despacho_id         text,
  generado_por_email  text,
  generado_por_nombre text,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zarpes_log_fecha ON zarpes_log(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_zarpes_log_salida ON zarpes_log(salida_id);
CREATE INDEX IF NOT EXISTS idx_zarpes_log_emb ON zarpes_log(embarcacion_nombre);

ALTER TABLE zarpes_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "zarpes_log_auth_all" ON zarpes_log;
CREATE POLICY "zarpes_log_auth_all" ON zarpes_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
