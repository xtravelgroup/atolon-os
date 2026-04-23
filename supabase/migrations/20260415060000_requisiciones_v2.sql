-- ─── REQUISICIONES v2 — Bien elaborado ──────────────────────────────────────

-- 1) Extender tabla existente
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS solicitante_id text;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS aprobador_id text;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS aprobador_nombre text;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS proveedor_id text REFERENCES proveedores(id) ON DELETE SET NULL;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS proveedor_nombre text;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS adjuntos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS recibidos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS notas_recibo text;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS regla_aprobacion_id uuid;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS aprobada_at timestamptz;
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS rechazada_motivo text;

-- 2) Reglas de aprobación configurables
CREATE TABLE IF NOT EXISTS req_reglas_aprobacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,
  monto_min       numeric DEFAULT 0,
  monto_max       numeric,
  area            text,
  rol_aprobador   text NOT NULL,
  orden           int DEFAULT 0,
  activo          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE req_reglas_aprobacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "req_reglas_all" ON req_reglas_aprobacion;
CREATE POLICY "req_reglas_all" ON req_reglas_aprobacion FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON req_reglas_aprobacion TO anon, authenticated;

-- Reglas default
INSERT INTO req_reglas_aprobacion (nombre, monto_min, monto_max, rol_aprobador, orden) VALUES
  ('Auto-aprobado (≤ $200k)',           0,         200000,    'auto',          1),
  ('Gerente de área ($200k – $2M)',     200000,    2000000,   'gerente_general_op', 2),
  ('Gerencia general ($2M – $10M)',     2000000,   10000000,  'gerente_general_op', 3),
  ('Super admin (> $10M)',              10000000,  NULL,      'super_admin',   4)
ON CONFLICT DO NOTHING;

-- 3) Órdenes de compra (generadas a partir de requisiciones aprobadas)
CREATE TABLE IF NOT EXISTS ordenes_compra (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text UNIQUE NOT NULL,
  requisicion_id  text REFERENCES requisiciones(id) ON DELETE SET NULL,
  proveedor_id    text REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre text,
  proveedor_nit   text,
  proveedor_email text,
  proveedor_telefono text,
  fecha_emision   date DEFAULT CURRENT_DATE,
  fecha_entrega   date,
  items           jsonb NOT NULL,
  subtotal        numeric DEFAULT 0,
  iva             numeric DEFAULT 0,
  total           numeric DEFAULT 0,
  moneda          text DEFAULT 'COP',
  estado          text DEFAULT 'emitida',  -- emitida | enviada | confirmada | recibida_parcial | recibida | cancelada
  notas           text DEFAULT '',
  emitida_por     text,
  enviada_at      timestamptz,
  recibida_at     timestamptz,
  pdf_url         text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oc_codigo ON ordenes_compra(codigo);
CREATE INDEX IF NOT EXISTS idx_oc_requisicion ON ordenes_compra(requisicion_id);
CREATE INDEX IF NOT EXISTS idx_oc_proveedor ON ordenes_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_oc_estado ON ordenes_compra(estado);

ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ordenes_compra_all" ON ordenes_compra;
CREATE POLICY "ordenes_compra_all" ON ordenes_compra FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON ordenes_compra TO anon, authenticated;

-- 4) Storage bucket para adjuntos de requisiciones
INSERT INTO storage.buckets (id, name, public)
VALUES ('requisiciones', 'requisiciones', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "req_adjuntos_read" ON storage.objects;
CREATE POLICY "req_adjuntos_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'requisiciones');

DROP POLICY IF EXISTS "req_adjuntos_insert" ON storage.objects;
CREATE POLICY "req_adjuntos_insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'requisiciones');

DROP POLICY IF EXISTS "req_adjuntos_update" ON storage.objects;
CREATE POLICY "req_adjuntos_update" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'requisiciones');

DROP POLICY IF EXISTS "req_adjuntos_delete" ON storage.objects;
CREATE POLICY "req_adjuntos_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'requisiciones');
