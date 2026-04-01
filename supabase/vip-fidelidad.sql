CREATE TABLE IF NOT EXISTS vip_miembros (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  email text UNIQUE NOT NULL,
  telefono text,
  cedula text,
  nivel text NOT NULL DEFAULT 'coral' CHECK (nivel IN ('coral','reef','ocean')),
  puntos_disponibles numeric DEFAULT 0,
  puntos_totales numeric DEFAULT 0,
  clave text,
  activo boolean DEFAULT true,
  foto_url text,
  numero_membresia text UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vip_transacciones (
  id text PRIMARY KEY,
  miembro_id text REFERENCES vip_miembros(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ganados','canjeados','ajuste')),
  puntos numeric NOT NULL,
  descripcion text,
  recibo_url text,
  monto_consumo numeric,
  validado boolean DEFAULT false,
  validado_por text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vip_reservas (
  id text PRIMARY KEY,
  miembro_id text REFERENCES vip_miembros(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('restaurante','cama_playa')),
  fecha date NOT NULL,
  hora time,
  personas int DEFAULT 1,
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmada','cancelada','completada')),
  notas text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vip_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vip_miembros_all" ON vip_miembros FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vip_transacciones_all" ON vip_transacciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vip_reservas_all" ON vip_reservas FOR ALL TO authenticated USING (true) WITH CHECK (true);
