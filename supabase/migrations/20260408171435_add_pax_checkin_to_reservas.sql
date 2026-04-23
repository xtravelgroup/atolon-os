-- Actual pax that showed up at check-in (may differ from reserved pax)
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS pax_checkin integer;
