-- Evento puede compartir lancha con salida de pasadías (consume cupos)
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS comparte_lancha_pasadias boolean DEFAULT false;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS salida_compartida_id text;
