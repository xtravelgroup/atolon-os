-- ══════════════════════════════════════════════════════════════
-- b2b_premios_canjes — registro de uso de premios de acumulación
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS b2b_premios_canjes (
  id              text PRIMARY KEY,
  aliado_id       text REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  incentivo_id    text REFERENCES b2b_incentivos(id) ON DELETE SET NULL,
  reserva_id      text,
  pasadias_usadas integer NOT NULL DEFAULT 1,
  nota            text,
  fecha           date DEFAULT CURRENT_DATE,
  created_at      timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE b2b_premios_canjes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON b2b_premios_canjes;
CREATE POLICY "allow_all" ON b2b_premios_canjes
  FOR ALL TO anon USING (true) WITH CHECK (true);
