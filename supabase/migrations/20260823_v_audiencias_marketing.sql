-- ═══════════════════════════════════════════════════════════════════════
-- Vistas de audiencia para exportar a Meta Custom Audiences / Google Customer Match
-- Fase 2.2 AtolonTrack
-- ═══════════════════════════════════════════════════════════════════════

-- 1) VIPs digitales: clientes con LTV >= $500k, seed de lookalike
CREATE OR REPLACE VIEW v_aud_vips_digital AS
SELECT nombre, email, telefono, ltv, visitas, canal_adquisicion, primera_visita, ultima_visita, segmento
FROM v_ltv_cliente_digital
WHERE ltv >= 500000
ORDER BY ltv DESC;

-- 2) Recurrentes (2+ visitas). Audiencia CORE alto match rate para lookalike.
CREATE OR REPLACE VIEW v_aud_recurrentes_digital AS
SELECT nombre, email, telefono, ltv, visitas, canal_adquisicion, primera_visita, ultima_visita, segmento
FROM v_ltv_cliente_digital
WHERE visitas >= 2
ORDER BY ltv DESC;

-- 3) Reservas iniciadas sin pagar en 30d (proxy de abandono con contacto).
--    Cliente empezó reserva WEB/WA (dio email/tel) pero no completó pago.
--    NOTA: track_abandonment solo tiene email_hash — inútil para retargeting
--    directo. Esta vista mira reservas.estado='cancelado' o abono=0 recientes.
CREATE OR REPLACE VIEW v_aud_reservas_sin_pago_30d AS
SELECT DISTINCT ON (COALESCE(NULLIF(LOWER(email), ''), REGEXP_REPLACE(COALESCE(telefono, ''), '[^0-9]', '', 'g')))
  nombre, email, telefono, canal, tipo, fecha, created_at, estado, total AS monto_intentado
FROM reservas
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND (COALESCE(abono, 0) = 0 OR estado IN ('cancelado', 'anulado', 'no_show'))
  AND (email IS NOT NULL OR telefono IS NOT NULL)
  AND grupo_id IS NULL
  AND aliado_id IS NULL
  AND (id LIKE 'WEB-%' OR LOWER(COALESCE(canal, '')) IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa'))
ORDER BY COALESCE(NULLIF(LOWER(email), ''), REGEXP_REPLACE(COALESCE(telefono, ''), '[^0-9]', '', 'g')), created_at DESC;

-- 4) Leads WhatsApp sin conversión — hablaron con el bot pero nunca compraron
CREATE OR REPLACE VIEW v_aud_leads_wa_sin_conv AS
SELECT DISTINCT ON (REGEXP_REPLACE(ac.contact_id, '[^0-9]', '', 'g'))
  ac.contact_nombre AS nombre,
  NULL::text AS email,
  ac.contact_id AS telefono,
  ac.created_at AS primera_conversacion,
  ac.updated_at AS ultima_actividad,
  ac.fuente
FROM ai_conversations ac
WHERE ac.channel_tipo IN ('whatsapp', 'wa')
  AND ac.updated_at >= NOW() - INTERVAL '90 days'
  AND ac.contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM reservas r
    WHERE COALESCE(r.abono, 0) > 0
      AND REGEXP_REPLACE(COALESCE(r.telefono, ''), '[^0-9]', '', 'g') = REGEXP_REPLACE(ac.contact_id, '[^0-9]', '', 'g')
  )
ORDER BY REGEXP_REPLACE(ac.contact_id, '[^0-9]', '', 'g'), ac.updated_at DESC;

-- 5) Turistas extranjeros que ya vinieron (tel no empieza por 57 y no vacío).
CREATE OR REPLACE VIEW v_aud_extranjeros AS
WITH r AS (
  SELECT
    nombre, email, telefono, fecha, abono, estado, id, canal, grupo_id, aliado_id,
    REGEXP_REPLACE(COALESCE(telefono, ''), '[^0-9+]', '', 'g') AS tel_clean
  FROM reservas
  WHERE COALESCE(abono, 0) > 0
    AND estado NOT IN ('cancelado', 'anulado', 'reembolsado')
    AND grupo_id IS NULL
    AND aliado_id IS NULL
    AND (id LIKE 'WEB-%' OR LOWER(COALESCE(canal, '')) IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa'))
)
SELECT DISTINCT ON (COALESCE(NULLIF(LOWER(email), ''), tel_clean))
  nombre, email, telefono, fecha AS ultima_visita
FROM r
WHERE tel_clean != ''
  AND LENGTH(tel_clean) >= 10
  -- Excluir teléfonos Colombia (+57, 57, 3XX de celular Col)
  AND NOT (tel_clean ~ '^\+?57' OR tel_clean ~ '^3[0-9]{9}$' OR tel_clean ~ '^57[0-9]{10}$')
ORDER BY COALESCE(NULLIF(LOWER(email), ''), tel_clean), fecha DESC;

COMMENT ON VIEW v_aud_vips_digital IS 'Audiencia VIPs LTV≥500k. Base lookalike Meta / retargeting premium.';
COMMENT ON VIEW v_aud_recurrentes_digital IS 'Clientes con 2+ reservas. Audiencia CORE alto match rate para lookalike.';
COMMENT ON VIEW v_aud_reservas_sin_pago_30d IS 'Reservas iniciadas sin pago en últimos 30d. Retargeting con oferta.';
COMMENT ON VIEW v_aud_leads_wa_sin_conv IS 'Leads WA que hablaron con bot y no compraron. Re-engagement.';
COMMENT ON VIEW v_aud_extranjeros IS 'Turistas extranjeros que ya visitaron. Segmentación internacional en Meta.';
