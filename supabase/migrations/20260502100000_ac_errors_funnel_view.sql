-- Carrito Abandonado: tabla de errores para diagnóstico server-side y vista
-- agregada del funnel últimos 30 días.
-- ──────────────────────────────────────────────────────────────────
-- Antes el upsert del BookingPopup hacía console.warn y los errores se
-- perdían en la consola del navegador del usuario. Ahora cualquier
-- fallo de cliente se registra en ac_errors para que podamos diagnosticar.

CREATE TABLE IF NOT EXISTS ac_errors (
  id           text PRIMARY KEY,
  cart_id      text,
  email        text,
  fase         text NOT NULL, -- "lookup" | "upsert" | "recovery_load" | etc.
  mensaje      text NOT NULL,
  contexto     jsonb,
  user_agent   text,
  url          text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ac_errors_created ON ac_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ac_errors_email   ON ac_errors(email);

ALTER TABLE ac_errors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'ac_errors'::regclass AND polname = 'ac_errors_anon_insert') THEN
    EXECUTE 'CREATE POLICY ac_errors_anon_insert ON ac_errors FOR INSERT TO anon WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'ac_errors'::regclass AND polname = 'ac_errors_auth_all') THEN
    EXECUTE 'CREATE POLICY ac_errors_auth_all ON ac_errors FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Vista: funnel últimos 30 días para dashboards
CREATE OR REPLACE VIEW ac_funnel_30d AS
WITH carts AS (
  SELECT
    estado,
    valor_total,
    emails_enviados,
    EXTRACT(EPOCH FROM (COALESCE(recovered_at, abandoned_at, ultimo_email_at, NOW()) - checkout_started_at)) / 60 AS minutos_proceso
  FROM ac_carts
  WHERE created_at > NOW() - INTERVAL '30 days'
),
clicks AS (
  SELECT COUNT(*) FILTER (WHERE tipo = 'sent')    AS sent,
         COUNT(*) FILTER (WHERE tipo = 'opened')  AS opened,
         COUNT(*) FILTER (WHERE tipo = 'clicked') AS clicked
  FROM ac_email_events
  WHERE created_at > NOW() - INTERVAL '30 days'
)
SELECT
  -- Volumen
  (SELECT COUNT(*) FROM carts) AS carts_total,
  (SELECT COUNT(*) FROM carts WHERE estado = 'checkout_started') AS en_curso,
  (SELECT COUNT(*) FROM carts WHERE estado IN ('abandoned','email_1_sent','email_2_sent','email_3_sent','email_4_sent')) AS abandonados,
  (SELECT COUNT(*) FROM carts WHERE estado = 'recovered') AS recuperados,
  (SELECT COUNT(*) FROM carts WHERE estado = 'expired')   AS expirados,
  (SELECT COUNT(*) FROM carts WHERE estado = 'unsubscribed') AS unsubs,
  -- Conversion ratios
  ROUND(100.0 * (SELECT COUNT(*) FROM carts WHERE estado = 'recovered')::numeric
        / NULLIF((SELECT COUNT(*) FROM carts WHERE estado IN ('recovered','expired','abandoned','email_1_sent','email_2_sent','email_3_sent','email_4_sent')), 0)
       , 1) AS recuperacion_pct,
  -- Plata
  COALESCE((SELECT SUM(valor_total) FROM carts WHERE estado = 'recovered'), 0)::bigint AS plata_recuperada,
  COALESCE((SELECT SUM(valor_total) FROM carts WHERE estado = 'expired'),   0)::bigint AS plata_perdida,
  COALESCE((SELECT SUM(valor_total) FROM carts WHERE estado IN ('abandoned','email_1_sent','email_2_sent','email_3_sent','email_4_sent')), 0)::bigint AS plata_en_proceso,
  -- Email funnel
  (SELECT sent FROM clicks)    AS emails_enviados,
  (SELECT opened FROM clicks)  AS emails_abiertos,
  (SELECT clicked FROM clicks) AS emails_clickeados,
  ROUND(100.0 * (SELECT clicked FROM clicks)::numeric / NULLIF((SELECT sent FROM clicks), 0), 1) AS ctr_pct,
  ROUND(100.0 * (SELECT opened FROM clicks)::numeric / NULLIF((SELECT sent FROM clicks), 0), 1) AS open_rate_pct,
  -- Tiempo
  ROUND(AVG(minutos_proceso) FILTER (WHERE estado = 'recovered')::numeric, 1) AS minutos_promedio_recuperacion,
  -- Errores client-side
  (SELECT COUNT(*) FROM ac_errors WHERE created_at > NOW() - INTERVAL '30 days') AS errores_clientside
FROM carts;

GRANT SELECT ON ac_funnel_30d TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
