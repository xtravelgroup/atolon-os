-- Items Catálogo: productos de compra + relación con proveedores
-- Sin stock (se maneja en Loggro)

CREATE TABLE IF NOT EXISTS items_catalogo (
  id text PRIMARY KEY DEFAULT 'ITEM-' || substr(md5(random()::text),1,8),
  codigo text,
  nombre text NOT NULL,
  descripcion text,
  categoria text NOT NULL DEFAULT 'Otros',
  unidad text DEFAULT 'Unidades',
  foto_url text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL REFERENCES items_catalogo(id) ON DELETE CASCADE,
  proveedor_id text REFERENCES proveedores(id),
  proveedor_nombre text,
  precio numeric NOT NULL DEFAULT 0,
  es_principal boolean DEFAULT false,
  notas text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(item_id, proveedor_id)
);

-- RLS
ALTER TABLE items_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_catalogo_anon_read" ON items_catalogo FOR SELECT TO anon USING (true);
CREATE POLICY "items_catalogo_auth_all"  ON items_catalogo FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "items_proveedores_anon_read" ON items_proveedores FOR SELECT TO anon USING (true);
CREATE POLICY "items_proveedores_auth_all"  ON items_proveedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_items_catalogo_categoria ON items_catalogo(categoria);
CREATE INDEX IF NOT EXISTS idx_items_catalogo_activo ON items_catalogo(activo);
CREATE INDEX IF NOT EXISTS idx_items_proveedores_item ON items_proveedores(item_id);
CREATE INDEX IF NOT EXISTS idx_items_proveedores_proveedor ON items_proveedores(proveedor_id);
