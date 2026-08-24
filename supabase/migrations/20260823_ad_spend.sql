-- ═══════════════════════════════════════════════════════════════════════
-- ad_spend — Inversión de pauta por canal y semana
-- ═══════════════════════════════════════════════════════════════════════
-- Se llena a mano semanalmente. Permite calcular CAC (inversión /
-- clientes nuevos digitales) y ROAS (revenue digital / inversión) por
-- canal. Fase 2 AtolonTrack.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ad_spend (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal        text NOT NULL,
    -- meta_ads · google_ads · tiktok_ads · influencers · seo · otros
  semana_ini   date NOT NULL,
    -- lunes de la semana (siempre)
  monto        bigint NOT NULL DEFAULT 0,
    -- COP invertidos esa semana en ese canal
  campana      text,
    -- nombre libre — "prospecting-jul", "retargeting-vip", etc.
  nota         text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (canal, semana_ini, campana)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_semana ON ad_spend(semana_ini DESC);
CREATE INDEX IF NOT EXISTS idx_ad_spend_canal  ON ad_spend(canal);

ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_spend_auth_all" ON ad_spend;
CREATE POLICY "ad_spend_auth_all" ON ad_spend FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE ad_spend IS
  'Inversión de pauta digital por canal y semana. Base para CAC y ROAS en AtolonTrack (Fase 2).';
