-- ═══════════════════════════════════════════════
-- b2b_contenido — Publicaciones educativas, promociones, newsletters
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS b2b_contenido (
  id              text PRIMARY KEY,
  tipo            text NOT NULL DEFAULT 'articulo', -- 'articulo' | 'promocion' | 'newsletter'
  titulo          text NOT NULL,
  descripcion     text,
  cuerpo          text,           -- rich text / HTML / markdown
  imagen_url      text,
  link_externo    text,
  label_link      text,           -- label del botón de link
  activo          boolean DEFAULT true,
  destacado       boolean DEFAULT false,
  fecha_publica   date DEFAULT CURRENT_DATE,
  fecha_expira    date,           -- solo para promociones
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE b2b_contenido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON b2b_contenido FOR ALL TO anon USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════
-- b2b_media_kit — Material descargable para redes sociales
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS b2b_media_kit (
  id              text PRIMARY KEY,
  categoria       text NOT NULL DEFAULT 'foto',  -- 'foto' | 'video' | 'story' | 'banner' | 'logo'
  titulo          text NOT NULL,
  descripcion     text,
  archivo_url     text NOT NULL,
  thumbnail_url   text,
  tipo_archivo    text,           -- 'image/jpeg', 'video/mp4', etc.
  tamano_kb       integer,
  dimensiones     text,           -- '1080x1080', '1920x1080', etc.
  activo          boolean DEFAULT true,
  orden           integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE b2b_media_kit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON b2b_media_kit FOR ALL TO anon USING (true) WITH CHECK (true);
