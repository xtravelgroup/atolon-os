-- ═══════════════════════════════════════════════════════════════════════
-- Fase 3 AtolonTrack — Cohortes de retención + Churn + Atribución time-decay
-- ═══════════════════════════════════════════════════════════════════════

-- ── 3.1 Cohortes de retención mensuales por canal ──────────────────────────
-- Agrupa clientes por mes de PRIMERA visita (cohorte), calcula % que
-- volvieron en 30/60/90/365 días. Base: v_ltv_cliente_digital pero
-- expandido con detalle por reserva para poder medir el "vuelve en X días".
CREATE OR REPLACE VIEW v_cohortes_retencion_digital AS
WITH r_digital AS (
  SELECT
    id, fecha, canal, telefono, email, nombre,
    CASE
      WHEN LOWER(COALESCE(canal, '')) IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa') THEN 'whatsapp'
      ELSE 'web'
    END AS canal_digital,
    CASE
      WHEN REGEXP_REPLACE(COALESCE(telefono, ''), '[^0-9]', '', 'g') != ''
       AND LENGTH(REGEXP_REPLACE(COALESCE(telefono, ''), '[^0-9]', '', 'g')) >= 7
      THEN 'tel:' || RIGHT(REGEXP_REPLACE(telefono, '[^0-9]', '', 'g'), 10)
      WHEN LOWER(COALESCE(email, '')) LIKE '%@%.%' THEN 'email:' || LOWER(TRIM(email))
      WHEN LOWER(TRIM(COALESCE(NULLIF(nombre, ''), ''))) != '' THEN 'nombre:' || LOWER(TRIM(nombre))
      ELSE 'id:' || id
    END AS cliente_key
  FROM reservas
  WHERE COALESCE(estado, '') NOT IN ('cancelado', 'anulado', 'no_show', 'reembolsado')
    AND grupo_id IS NULL AND aliado_id IS NULL
    AND COALESCE(abono, 0) > 0
    AND (id LIKE 'WEB-%' OR LOWER(COALESCE(canal, '')) IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa'))
),
primera AS (
  SELECT cliente_key, MIN(fecha) AS primera_fecha,
    (array_agg(canal_digital ORDER BY fecha ASC))[1] AS canal_adquisicion
  FROM r_digital GROUP BY cliente_key
),
cliente_con_retornos AS (
  SELECT
    p.cliente_key,
    p.primera_fecha,
    p.canal_adquisicion,
    DATE_TRUNC('month', p.primera_fecha)::date AS cohorte_mes,
    BOOL_OR(r.fecha > p.primera_fecha AND r.fecha <= p.primera_fecha + INTERVAL '30 days')  AS retorno_30d,
    BOOL_OR(r.fecha > p.primera_fecha AND r.fecha <= p.primera_fecha + INTERVAL '60 days')  AS retorno_60d,
    BOOL_OR(r.fecha > p.primera_fecha AND r.fecha <= p.primera_fecha + INTERVAL '90 days')  AS retorno_90d,
    BOOL_OR(r.fecha > p.primera_fecha AND r.fecha <= p.primera_fecha + INTERVAL '365 days') AS retorno_365d
  FROM primera p
  JOIN r_digital r USING (cliente_key)
  GROUP BY p.cliente_key, p.primera_fecha, p.canal_adquisicion
)
SELECT
  cohorte_mes,
  canal_adquisicion,
  COUNT(*)::int AS tamano_cohorte,
  COUNT(*) FILTER (WHERE retorno_30d)::int  AS ret_30d,
  COUNT(*) FILTER (WHERE retorno_60d)::int  AS ret_60d,
  COUNT(*) FILTER (WHERE retorno_90d)::int  AS ret_90d,
  COUNT(*) FILTER (WHERE retorno_365d)::int AS ret_365d,
  ROUND(100.0 * COUNT(*) FILTER (WHERE retorno_30d)  / GREATEST(COUNT(*), 1), 1) AS ret_30d_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE retorno_60d)  / GREATEST(COUNT(*), 1), 1) AS ret_60d_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE retorno_90d)  / GREATEST(COUNT(*), 1), 1) AS ret_90d_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE retorno_365d) / GREATEST(COUNT(*), 1), 1) AS ret_365d_pct
FROM cliente_con_retornos
GROUP BY cohorte_mes, canal_adquisicion
ORDER BY cohorte_mes DESC, canal_adquisicion;

COMMENT ON VIEW v_cohortes_retencion_digital IS 'Fase 3.1: cohortes mensuales de retención por canal digital.';


-- ── 3.3 Churn / re-engagement predictor ────────────────────────────────────
-- Para cada cliente con 2+ visitas calcula la mediana de días entre visitas
-- y flagea "debería haber vuelto" cuando última_visita + mediana*1.5 < hoy.
CREATE OR REPLACE VIEW v_churn_riesgo_digital AS
WITH r_digital AS (
  SELECT
    id, fecha, telefono, email, nombre, canal, abono,
    CASE
      WHEN REGEXP_REPLACE(COALESCE(telefono, ''), '[^0-9]', '', 'g') != ''
       AND LENGTH(REGEXP_REPLACE(COALESCE(telefono, ''), '[^0-9]', '', 'g')) >= 7
      THEN 'tel:' || RIGHT(REGEXP_REPLACE(telefono, '[^0-9]', '', 'g'), 10)
      WHEN LOWER(COALESCE(email, '')) LIKE '%@%.%' THEN 'email:' || LOWER(TRIM(email))
      ELSE 'nombre:' || LOWER(TRIM(COALESCE(nombre, '')))
    END AS cliente_key
  FROM reservas
  WHERE COALESCE(estado, '') NOT IN ('cancelado', 'anulado', 'no_show', 'reembolsado')
    AND grupo_id IS NULL AND aliado_id IS NULL
    AND COALESCE(abono, 0) > 0
    AND (id LIKE 'WEB-%' OR LOWER(COALESCE(canal, '')) IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa'))
    AND (telefono IS NOT NULL OR email IS NOT NULL)
),
gaps AS (
  SELECT
    cliente_key,
    fecha,
    (fecha - LAG(fecha) OVER (PARTITION BY cliente_key ORDER BY fecha))::int AS gap_dias
  FROM r_digital
),
stats AS (
  SELECT
    cliente_key,
    COUNT(*)::int AS visitas,
    MIN(fecha) AS primera_visita,
    MAX(fecha) AS ultima_visita,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_dias) FILTER (WHERE gap_dias IS NOT NULL) AS mediana_gap
  FROM gaps
  GROUP BY cliente_key
  HAVING COUNT(*) >= 2
),
enriched AS (
  SELECT
    s.*,
    (CURRENT_DATE - s.ultima_visita)::int AS dias_desde_ultima,
    ROUND(s.mediana_gap * 1.5) AS umbral_dias
  FROM stats s
)
SELECT
  e.cliente_key,
  MAX(r.nombre) AS nombre,
  MAX(r.email)  AS email,
  MAX(r.telefono) AS telefono,
  MAX(r.canal) AS canal,
  e.visitas,
  e.primera_visita,
  e.ultima_visita,
  e.mediana_gap::int AS mediana_dias_entre_visitas,
  e.dias_desde_ultima,
  e.umbral_dias::int,
  (e.dias_desde_ultima > e.umbral_dias) AS en_riesgo,
  CASE
    WHEN e.dias_desde_ultima > e.mediana_gap * 3 THEN 'churn'
    WHEN e.dias_desde_ultima > e.mediana_gap * 1.5 THEN 'riesgo'
    ELSE 'ok'
  END AS estado_engagement,
  SUM(COALESCE(r.abono, 0))::bigint AS ltv
FROM enriched e
JOIN reservas r ON (
  CASE
    WHEN REGEXP_REPLACE(COALESCE(r.telefono, ''), '[^0-9]', '', 'g') != ''
     AND LENGTH(REGEXP_REPLACE(COALESCE(r.telefono, ''), '[^0-9]', '', 'g')) >= 7
    THEN 'tel:' || RIGHT(REGEXP_REPLACE(r.telefono, '[^0-9]', '', 'g'), 10)
    WHEN LOWER(COALESCE(r.email, '')) LIKE '%@%.%' THEN 'email:' || LOWER(TRIM(r.email))
    ELSE 'nombre:' || LOWER(TRIM(COALESCE(r.nombre, '')))
  END = e.cliente_key
)
WHERE e.mediana_gap IS NOT NULL
GROUP BY e.cliente_key, e.visitas, e.primera_visita, e.ultima_visita, e.mediana_gap, e.dias_desde_ultima, e.umbral_dias
ORDER BY e.dias_desde_ultima - e.umbral_dias DESC;

COMMENT ON VIEW v_churn_riesgo_digital IS 'Fase 3.3: clientes con 2+ visitas cuya última visita ya superó el gap típico. Cola re-engagement WA.';


-- ── 3.2 Atribución multi-touch time-decay ──────────────────────────────────
-- Para cada reserva pagada digital, expande TODAS las sesiones previas del
-- mismo usuario_id/sesion_id/email_hash con canal+utm, y les asigna un peso
-- exponencial de decaimiento por recencia (half-life = 7 días).
CREATE OR REPLACE VIEW v_atribucion_multitouch AS
WITH reservas_dig AS (
  SELECT r.id, r.total, r.fecha_pago, r.created_at, r.canal, r.email, r.telefono,
    COALESCE(r.fecha_pago, r.created_at::date) AS fecha_venta
  FROM reservas r
  WHERE COALESCE(r.abono, 0) > 0
    AND r.grupo_id IS NULL AND r.aliado_id IS NULL
    AND r.estado NOT IN ('cancelado', 'anulado')
    AND (r.id LIKE 'WEB-%' OR LOWER(COALESCE(r.canal, '')) IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa'))
),
touchpoints AS (
  -- Para cada venta, buscar sus sesiones históricas por email_hash y por
  -- sesion_id del track_ingresos correspondiente.
  SELECT
    rd.id AS reserva_id,
    rd.total AS revenue,
    rd.fecha_venta,
    ts.id AS sesion_id,
    ts.canal AS touch_canal,
    (ts.utms->>'utm_source') AS touch_source,
    (ts.utms->>'utm_campaign') AS touch_campaign,
    ts.created_at AS touch_at,
    GREATEST(0, (rd.fecha_venta - ts.created_at::date)::int) AS dias_antes
  FROM reservas_dig rd
  JOIN track_ingresos ti ON ti.reserva_id = rd.id
  JOIN track_sesiones ts ON ts.id = ti.sesion_id
  WHERE ts.created_at <= rd.fecha_venta + INTERVAL '1 day'
    AND ts.created_at >= rd.fecha_venta - INTERVAL '30 days'
),
weighted AS (
  SELECT
    reserva_id, revenue, sesion_id,
    COALESCE(NULLIF(touch_source, ''), touch_canal, 'direct') AS fuente,
    dias_antes,
    -- Half-life 7 días: peso = 0.5 ^ (dias/7)
    POWER(0.5, dias_antes / 7.0) AS peso_raw
  FROM touchpoints
),
normalized AS (
  SELECT reserva_id, revenue, sesion_id, fuente, dias_antes, peso_raw,
    peso_raw / SUM(peso_raw) OVER (PARTITION BY reserva_id) AS peso
  FROM weighted
)
SELECT
  fuente,
  COUNT(DISTINCT reserva_id)::int AS ventas_touched,
  SUM(peso * revenue)::bigint AS revenue_atribuido_multitouch,
  SUM(revenue) FILTER (WHERE dias_antes = 0)::bigint AS revenue_last_touch,
  SUM(revenue) FILTER (WHERE dias_antes = (SELECT MAX(dias_antes) FROM normalized n2 WHERE n2.reserva_id = normalized.reserva_id))::bigint AS revenue_first_touch
FROM normalized
GROUP BY fuente
ORDER BY revenue_atribuido_multitouch DESC;

COMMENT ON VIEW v_atribucion_multitouch IS 'Fase 3.2: revenue atribuido por fuente vía time-decay 7-day half-life.';
