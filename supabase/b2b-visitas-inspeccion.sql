-- Agregar columnas de inspección a b2b_visitas
ALTER TABLE b2b_visitas ADD COLUMN IF NOT EXISTS reserva_id   text REFERENCES reservas(id) ON DELETE SET NULL;
ALTER TABLE b2b_visitas ADD COLUMN IF NOT EXISTS num_personas  int DEFAULT 1;
ALTER TABLE b2b_visitas ADD COLUMN IF NOT EXISTS coordinador   text;
