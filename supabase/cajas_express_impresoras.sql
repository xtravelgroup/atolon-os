-- Cola de impresión remota para Cajas Express.
--
-- Arquitectura:
--   1. Cajero en celular abre /cajas → escoge su "impresora cercana"
--      (1..10) → queda guardada en localStorage del teléfono.
--   2. Al cerrar venta, en vez de window.print() local, la app INSERTA
--      un row en cajas_evento_impresion_queue con el HTML del ticket.
--   3. Cada computador del evento abre Chrome con --kiosk-printing en
--      https://www.atolon.co/cajas-imprimir?id=IMP-N. Esa pestaña se
--      suscribe a Supabase Realtime → al recibir un INSERT en su cola,
--      monta el HTML en un iframe oculto y dispara print() silencioso.
--
-- Por qué Supabase Realtime y no un servidor propio:
--   * No requiere instalar Node ni Puppeteer en los computadores del
--     evento — solo Chrome con --kiosk-printing.
--   * Latencia <1s gracias a postgres_changes.
--   * Reintentos automáticos: si un computador se desconecta, al
--     volver procesa los pendientes que tenga en cola.

CREATE TABLE IF NOT EXISTS cajas_evento_impresoras (
  id          text PRIMARY KEY,            -- 'IMP-1', 'IMP-2', ..., 'IMP-TEST'
  numero      int NOT NULL UNIQUE,         -- 1, 2, ..., 10 (0 para test)
  nombre      text NOT NULL,               -- 'Impresora 1', 'Cocina Barco', etc.
  ubicacion   text,                        -- texto libre que ayuda al cajero
  activa      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE cajas_evento_impresoras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cajas_imp_all_anon ON cajas_evento_impresoras;
DROP POLICY IF EXISTS cajas_imp_all_auth ON cajas_evento_impresoras;
CREATE POLICY cajas_imp_all_anon ON cajas_evento_impresoras FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY cajas_imp_all_auth ON cajas_evento_impresoras FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS cajas_evento_impresion_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impresora_id  text REFERENCES cajas_evento_impresoras(id) ON DELETE CASCADE,
  venta_id      text,
  caja_id       text,
  cajero_id     text,
  cajero_nombre text,
  ticket_html   text NOT NULL,
  items         jsonb DEFAULT '[]'::jsonb,
  status        text DEFAULT 'pending' CHECK (status IN ('pending','printing','printed','failed')),
  intentos      int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  printed_at    timestamptz,
  error         text
);
CREATE INDEX IF NOT EXISTS cajas_imp_queue_idx
  ON cajas_evento_impresion_queue (impresora_id, status, created_at);

ALTER TABLE cajas_evento_impresion_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cajas_imp_q_all_anon ON cajas_evento_impresion_queue;
DROP POLICY IF EXISTS cajas_imp_q_all_auth ON cajas_evento_impresion_queue;
CREATE POLICY cajas_imp_q_all_anon ON cajas_evento_impresion_queue FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY cajas_imp_q_all_auth ON cajas_evento_impresion_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Habilitar Realtime broadcast sobre la cola
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'cajas_evento_impresion_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cajas_evento_impresion_queue;
  END IF;
END $$;

-- Seed: 10 impresoras + 1 de prueba (numero=0)
INSERT INTO cajas_evento_impresoras (id, numero, nombre) VALUES
  ('IMP-TEST', 0,  'Impresora DE PRUEBA'),
  ('IMP-1',    1,  'Impresora 1'),
  ('IMP-2',    2,  'Impresora 2'),
  ('IMP-3',    3,  'Impresora 3'),
  ('IMP-4',    4,  'Impresora 4'),
  ('IMP-5',    5,  'Impresora 5'),
  ('IMP-6',    6,  'Impresora 6'),
  ('IMP-7',    7,  'Impresora 7'),
  ('IMP-8',    8,  'Impresora 8'),
  ('IMP-9',    9,  'Impresora 9'),
  ('IMP-10',  10,  'Impresora 10')
ON CONFLICT (id) DO NOTHING;
