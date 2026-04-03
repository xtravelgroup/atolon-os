-- Staffing overrides (manual adjustments per role per day)
CREATE TABLE IF NOT EXISTS staffing_overrides (
  id          text PRIMARY KEY,   -- e.g. "2026-04-02-mesPlaya"
  date        date NOT NULL,
  role        text NOT NULL,
  qty         int  NOT NULL,
  reason      text,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE staffing_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all staffing_overrides" ON staffing_overrides FOR ALL USING (true) WITH CHECK (true);

-- Staffing projections (projected pax per day)
CREATE TABLE IF NOT EXISTS staffing_proyecciones (
  id              text PRIMARY KEY,   -- e.g. "PROY-2026-04-02"
  date            date NOT NULL,
  pax_proyectado  int  NOT NULL DEFAULT 0,
  notas           text,
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE staffing_proyecciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all staffing_proyecciones" ON staffing_proyecciones FOR ALL USING (true) WITH CHECK (true);
