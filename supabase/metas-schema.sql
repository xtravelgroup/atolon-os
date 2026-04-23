-- ═══════════════════════════════════════════════════════════════════
-- METAS COMERCIALES — Tabla de objetivos por período
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS metas (
  id                  text PRIMARY KEY,
  tipo                text NOT NULL CHECK (tipo IN ('departamento', 'vendedor')),
  vendedor_nombre     text NOT NULL DEFAULT '',   -- '' para departamento
  periodo             text NOT NULL,              -- 'YYYY-MM'
  meta_leads          integer NOT NULL DEFAULT 0,
  meta_cotizaciones   integer NOT NULL DEFAULT 0,
  meta_cierres        integer NOT NULL DEFAULT 0,
  meta_ingresos       bigint  NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(tipo, vendedor_nombre, periodo)
);

ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

-- Autenticados pueden leer y escribir
CREATE POLICY "auth_select_metas" ON metas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_metas" ON metas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_metas" ON metas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
