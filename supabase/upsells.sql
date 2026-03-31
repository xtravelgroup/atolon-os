-- ══════════════════════════════════════════════════════════
-- Upsells — Ofertas adicionales en el widget de reservas
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS upsells (
  id              text PRIMARY KEY,
  nombre          text NOT NULL,
  descripcion     text,
  precio          integer DEFAULT 0,        -- precio por persona (si por_persona=true) o flat
  por_persona     boolean DEFAULT true,     -- true = precio × pax, false = precio fijo
  tipo            text DEFAULT 'addon'
                  CHECK (tipo IN ('upgrade', 'addon')),
  upgrade_slug    text,                     -- slug del producto al que hace upgrade
  aplica_a        text[] DEFAULT '{}',      -- slugs de productos base ('{}' = todos)
  condicion_no_ninos boolean DEFAULT false, -- solo mostrar si paxN = 0
  emoji           text DEFAULT '🎁',
  activo          boolean DEFAULT true,
  orden           integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE upsells ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON upsells;
CREATE POLICY "allow_all" ON upsells FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed: upgrade a Exclusive Pass
INSERT INTO upsells (id, nombre, descripcion, precio, por_persona, tipo, upgrade_slug, aplica_a, condicion_no_ninos, emoji, activo, orden)
VALUES
  ('UP-EXC', 'Upgrade a Exclusive Pass',
   'Suma zona privada, open bar premium y atención personalizada durante toda la experiencia.',
   270000, true, 'upgrade', 'exclusive-pass', '{vip-pass}', true, '⭐', true, 1)
ON CONFLICT (id) DO NOTHING;
