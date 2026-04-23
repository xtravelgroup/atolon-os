-- Landing: Despedidas de solteros/solteras en Atolón Beach Club
-- El organizador crea un grupo y sus invitados se unen con un link único.
-- Si el grupo llega a 11 (organizador + 10 invitados), el organizador entra gratis.

CREATE TABLE IF NOT EXISTS grupos_despedidas (
  id text PRIMARY KEY DEFAULT 'DSP-' || substr(md5(random()::text),1,8),
  codigo text UNIQUE NOT NULL,                 -- slug público, ej "alex-2026-05-15-abcdef"
  tipo text NOT NULL,                          -- "soltero" | "soltera"
  organizador_nombre text NOT NULL,
  organizador_email text,
  organizador_telefono text,
  fecha_evento date NOT NULL,
  pasadia_tipo text NOT NULL DEFAULT 'VIP Pass',
  precio_por_persona numeric NOT NULL DEFAULT 320000,
  modalidad_pago text NOT NULL DEFAULT 'individual',  -- "organizador" | "individual"
  pax_objetivo int DEFAULT 10,                 -- cuántos invitados se necesitan para que el organizador entre gratis
  mensaje_anfitrion text,                      -- mensaje personal del anfitrión a sus invitados
  estado text DEFAULT 'activo',                -- "activo" | "cerrado" | "cancelado"
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grupos_despedidas_miembros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id text REFERENCES grupos_despedidas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text,
  telefono text,
  es_organizador boolean DEFAULT false,
  estado text DEFAULT 'confirmado',            -- "confirmado" | "pagado" | "cancelado" | "cortesia"
  reserva_id text,                             -- link al reservas.id si ya pagó
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_gd_miembros_grupo ON grupos_despedidas_miembros(grupo_id);

-- RLS
ALTER TABLE grupos_despedidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupos_despedidas_miembros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gd_anon_read" ON grupos_despedidas FOR SELECT TO anon USING (true);
CREATE POLICY "gd_anon_insert" ON grupos_despedidas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "gd_auth_all" ON grupos_despedidas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "gdm_anon_read" ON grupos_despedidas_miembros FOR SELECT TO anon USING (true);
CREATE POLICY "gdm_anon_insert" ON grupos_despedidas_miembros FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "gdm_auth_all" ON grupos_despedidas_miembros FOR ALL TO authenticated USING (true) WITH CHECK (true);
