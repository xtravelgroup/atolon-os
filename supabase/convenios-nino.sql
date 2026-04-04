ALTER TABLE b2b_convenios
  ADD COLUMN IF NOT EXISTS tarifa_publica_nino integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_neta_nino    integer DEFAULT 0;
