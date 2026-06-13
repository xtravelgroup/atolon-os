-- Monitor de Edge Functions y endpoints serverless
-- =====================================================================
-- Tres componentes:
--   1. edge_function_log — registros de invocación (llenado conforme
--      las edge functions o el cliente JS reporten)
--   2. edge_function_catalog — inventario con metadata
--   3. edge_function_health — vista que agrega fallas conocidas
--      (loggro sync errors, OCs huérfanas, etc.) además de los logs
-- =====================================================================

-- ── 1) Log de invocaciones ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edge_function_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name   text NOT NULL,
  invoked_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  duration_ms     int,
  status          text NOT NULL CHECK (status IN ('ok','error','timeout','pending')),
  http_status     int,
  error_message   text,
  payload         jsonb,
  result          jsonb,
  caller          text,
  correlation_id  text
);

CREATE INDEX IF NOT EXISTS idx_efl_function_invoked
  ON public.edge_function_log (function_name, invoked_at DESC);
CREATE INDEX IF NOT EXISTS idx_efl_status_invoked
  ON public.edge_function_log (status, invoked_at DESC)
  WHERE status IN ('error','timeout');

GRANT INSERT, SELECT ON public.edge_function_log TO authenticated;
GRANT INSERT, SELECT ON public.edge_function_log TO service_role;

COMMENT ON TABLE public.edge_function_log IS
  'Registro de invocaciones de edge functions y endpoints serverless. Append-only en producción.';

-- ── 2) Catálogo de funciones conocidas ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.edge_function_catalog (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name  text UNIQUE NOT NULL,
  categoria      text NOT NULL,          -- payments | sync | comms | tracking | ops | ai | ext_api
  criticidad     text NOT NULL CHECK (criticidad IN ('alta','media','baja')),
  descripcion    text NOT NULL,
  trigger_tipo   text,                   -- webhook | cron | manual | event
  proveedor      text,                   -- stripe | wompi | zoho | loggro | meta | anthropic
  runbook        text,
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.edge_function_catalog TO authenticated;

-- Pre-seed con las funciones detectadas en supabase/functions/
INSERT INTO public.edge_function_catalog (function_name, categoria, criticidad, descripcion, trigger_tipo, proveedor) VALUES
  -- Payments (crítico — afectan ingresos)
  ('create-stripe-session',   'payments',  'alta',  'Genera checkout session de Stripe para reservas USD',                'manual',  'stripe'),
  ('stripe-webhook',          'payments',  'alta',  'Recibe eventos de Stripe (pagos, refunds)',                            'webhook', 'stripe'),
  ('wompi-webhook',           'payments',  'alta',  'Recibe eventos de Wompi (pagos COP)',                                  'webhook', 'wompi'),
  ('zoho-payments',           'payments',  'alta',  'Procesa pagos vía Zoho (USD alternativa)',                             'manual',  'zoho'),

  -- Sync a Loggro (crítico para facturación electrónica)
  ('loggro-sync',             'sync',      'alta',  'Sincroniza consumo eventos / pool service a Loggro Restrobar',         'event',   'loggro'),
  ('loggro-pymes-sync',       'sync',      'alta',  'Sincroniza OCs y movimientos a Loggro Pyme',                           'event',   'loggro'),
  ('loggro-nomina-sync',      'sync',      'alta',  'Sincroniza nómina a Loggro Nómina',                                    'event',   'loggro'),

  -- Comms (alta — comunicación con clientes)
  ('send-whatsapp',           'comms',     'alta',  'Envía mensajes de WhatsApp via Meta Cloud API',                        'manual',  'meta'),
  ('whatsapp-webhook',        'comms',     'alta',  'Recibe webhooks de WhatsApp (mensajes entrantes, status)',             'webhook', 'meta'),
  ('whatsapp-ai',             'comms',     'media', 'Procesa mensajes de WhatsApp con AI (Tatiana)',                        'event',   'anthropic'),
  ('whatsapp-recordatorios',  'comms',     'media', 'Cron recordatorios pre-reserva',                                       'cron',    'meta'),
  ('send-confirmation',       'comms',     'alta',  'Envía email de confirmación de reserva',                                'manual',  NULL),
  ('send-generic-email',      'comms',     'media', 'Envío genérico de email',                                              'manual',  NULL),
  ('send-oc-proveedor',       'comms',     'alta',  'Envía OC por email al proveedor',                                       'manual',  NULL),
  ('notify-b2b-user',         'comms',     'media', 'Notifica usuario B2B',                                                  'manual',  NULL),
  ('vip-bienvenida',          'comms',     'baja',  'Email bienvenida VIP',                                                  'event',   NULL),

  -- Carrito abandonado
  ('abandoned-cart-detector', 'comms',     'media', 'Cron detecta carritos abandonados',                                    'cron',    NULL),
  ('abandoned-cart-sender',   'comms',     'media', 'Envía email a carrito abandonado',                                     'cron',    NULL),
  ('ac-click-track',          'tracking',  'baja',  'Tracking de clicks en emails de carrito',                              'webhook', NULL),
  ('ac-open-pixel',           'tracking',  'baja',  'Tracking pixel apertura email',                                        'webhook', NULL),
  ('ac-recover',              'comms',     'media', 'Endpoint de recuperación de carrito',                                  'webhook', NULL),
  ('ac-unsubscribe',          'comms',     'media', 'Endpoint unsubscribe email',                                           'webhook', NULL),

  -- Contratistas
  ('contratistas-submit-registro',          'ops', 'alta',  'Registro inicial de contratista',                              'webhook', NULL),
  ('contratistas-submit-curso',             'ops', 'media', 'Submit del curso de inducción',                                'webhook', NULL),
  ('contratistas-change-state',             'ops', 'alta',  'Aprobación/rechazo de contratista',                            'manual',  NULL),
  ('contratistas-daily-check',              'ops', 'media', 'Cron diario: vencimiento RUT/ARL',                              'cron',    NULL),
  ('contratistas-generate-certificate-pdf', 'ops', 'media', 'Genera PDF certificado SST',                                    'manual',  NULL),
  ('contratistas-send-notification',        'comms','media','Notificación al contratista',                                   'event',   NULL),

  -- Operación
  ('admin-users',             'ops',       'alta',  'CRUD de usuarios — auth.users + public.usuarios',                       'manual',  NULL),
  ('auto-cancel-reservas',    'ops',       'media', 'Cron cancela reservas sin pago vencidas',                              'cron',    NULL),
  ('update-tasa-usd',         'ops',       'media', 'Cron actualiza tasa USD/COP',                                          'cron',    NULL),
  ('motor-alertas',           'ops',       'alta',  'Motor de alertas (cierres atrasados, saldos, etc.)',                    'cron',    NULL),
  ('oportunidades-inbox',     'ops',       'media', 'Inbox de oportunidades comerciales',                                   'webhook', NULL),

  -- AI
  ('tatiana-chat',            'ai',        'media', 'Chat conserje virtual (Anthropic Claude)',                              'manual',  'anthropic'),
  ('analyze-briefing',        'ai',        'baja',  'Análisis de briefings de eventos con AI',                              'manual',  'anthropic'),
  ('analyze-recibo',          'ai',        'media', 'OCR/análisis de recibos con AI',                                       'manual',  'anthropic'),
  ('parse-comprobante',       'ai',        'media', 'Parse de comprobante de pago',                                         'manual',  'anthropic'),
  ('parse-cotizacion',        'ai',        'media', 'Parse de PDF de cotización',                                           'manual',  'anthropic'),
  ('parse-factura',           'ai',        'media', 'Parse de factura de proveedor',                                        'manual',  'anthropic'),
  ('scan-productos',          'ai',        'baja',  'OCR scan de productos',                                                'manual',  'anthropic'),

  -- External APIs
  ('partners-api',            'ext_api',   'media', 'API pública para partners/agencias',                                   'webhook', NULL),
  ('gyg-api',                 'ext_api',   'media', 'Integración GetYourGuide',                                              'webhook', NULL),
  ('barcode-search',          'ops',       'baja',  'Busca producto por código de barras',                                  'manual',  NULL),
  ('track-event',             'tracking',  'baja',  'Captura eventos de tracking server-side',                              'webhook', NULL)
ON CONFLICT (function_name) DO NOTHING;

COMMENT ON TABLE public.edge_function_catalog IS
  'Inventario de edge functions con metadata: categoría, criticidad, proveedor externo, runbook.';

-- ── 3) Vista de salud agregada ──────────────────────────────────────
-- Cruza el catálogo con los logs y con indicadores indirectos de falla
-- (loggro_sync_status='error' en eventos_consumo_openbar, etc.)
CREATE OR REPLACE VIEW public.edge_function_health AS
WITH ult_log AS (
  SELECT
    function_name,
    MAX(invoked_at)                                                      AS ultima_invocacion,
    COUNT(*) FILTER (WHERE invoked_at > now() - interval '7 days')       AS invs_7d,
    COUNT(*) FILTER (WHERE status = 'error' AND invoked_at > now() - interval '7 days') AS errors_7d,
    COUNT(*) FILTER (WHERE status = 'timeout' AND invoked_at > now() - interval '7 days') AS timeouts_7d,
    AVG(duration_ms) FILTER (WHERE status = 'ok' AND invoked_at > now() - interval '7 days') AS avg_ms_7d
  FROM public.edge_function_log
  GROUP BY function_name
), indicadores AS (
  -- loggro-sync (Restrobar): consumo openbar + pool service
  SELECT 'loggro-sync' AS function_name,
    (SELECT COUNT(*) FROM public.eventos_consumo_openbar
       WHERE loggro_sync_status = 'error'
       AND created_at > now() - interval '7 days') AS errors_indirectos_7d,
    (SELECT COUNT(*) FROM public.pool_service_pedidos
       WHERE (loggro_orden_id IS NULL AND loggro_order_id IS NULL)
       AND created_at > now() - interval '7 days') AS huerfanos_indirectos_7d

  UNION ALL

  SELECT 'loggro-pymes-sync',
    (SELECT COUNT(*) FROM public.ordenes_compra
       WHERE loggro_movement_id IS NULL
       AND estado IN ('recibida','pagada','cerrada')
       AND created_at > now() - interval '7 days')::int,
    0::int
)
SELECT
  c.function_name,
  c.categoria,
  c.criticidad,
  c.descripcion,
  c.trigger_tipo,
  c.proveedor,
  c.activo,
  COALESCE(ul.invs_7d, 0)             AS invs_7d,
  COALESCE(ul.errors_7d, 0)           AS errors_7d,
  COALESCE(ul.timeouts_7d, 0)         AS timeouts_7d,
  COALESCE(ind.errors_indirectos_7d, 0)   AS errors_indirectos_7d,
  COALESCE(ind.huerfanos_indirectos_7d, 0) AS huerfanos_indirectos_7d,
  ROUND(ul.avg_ms_7d)::int            AS avg_ms_7d,
  ul.ultima_invocacion,
  CASE
    WHEN COALESCE(ul.errors_7d,0) + COALESCE(ul.timeouts_7d,0) + COALESCE(ind.errors_indirectos_7d,0) >= 5 THEN 'critico'
    WHEN COALESCE(ul.errors_7d,0) + COALESCE(ul.timeouts_7d,0) + COALESCE(ind.errors_indirectos_7d,0) >= 1 THEN 'warning'
    WHEN ul.ultima_invocacion IS NULL AND c.trigger_tipo = 'cron' THEN 'sin_datos'
    ELSE 'ok'
  END AS salud
FROM public.edge_function_catalog c
LEFT JOIN ult_log ul          ON ul.function_name = c.function_name
LEFT JOIN indicadores ind     ON ind.function_name = c.function_name
WHERE c.activo = true;

GRANT SELECT ON public.edge_function_health TO authenticated;

COMMENT ON VIEW public.edge_function_health IS
  'Salud actual de cada edge function: errores 7d, timeouts, latencia, indicadores indirectos (loggro sync errors) y un campo salud calculado.';
