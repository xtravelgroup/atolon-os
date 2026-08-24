-- ═══════════════════════════════════════════════════════════════════════
-- v_ltv_cliente_digital — LTV real por cliente adquirido en canales digitales
-- ═══════════════════════════════════════════════════════════════════════
-- Scope: solo Web + WhatsApp (id LIKE 'WEB-%' o canal en aliases WA/tatiana/
-- concierge_ai). Excluye reservas de grupo (grupo_id) y B2B (aliado_id).
--
-- Agrupa por cliente_key con prioridad tel > email > nombre normalizados.
-- Suma abono (dinero realmente recibido). Segmenta en 4 buckets por count.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_ltv_cliente_digital AS
WITH r_digital AS (
  SELECT
    id,
    fecha,
    fecha_pago,
    created_at,
    canal,
    tipo,
    estado,
    COALESCE(abono, 0)::bigint AS pagado,
    COALESCE(total, 0)::bigint AS contratado,
    LOWER(TRIM(COALESCE(email, ''))) AS email_norm,
    REGEXP_REPLACE(COALESCE(telefono, ''), '[^0-9]', '', 'g') AS tel_norm,
    LOWER(TRIM(COALESCE(NULLIF(nombre, ''), contacto, ''))) AS nombre_norm,
    CASE
      WHEN id LIKE 'WEB-%' AND LOWER(COALESCE(canal, '')) NOT IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa') THEN 'web'
      WHEN LOWER(COALESCE(canal, '')) IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa') THEN 'whatsapp'
      ELSE 'otro'
    END AS canal_digital
  FROM reservas
  WHERE COALESCE(estado, '') NOT IN ('cancelado', 'anulado', 'no_show', 'reembolsado')
    AND grupo_id IS NULL
    AND aliado_id IS NULL
    AND COALESCE(abono, 0) > 0
    AND (
      id LIKE 'WEB-%'
      OR LOWER(COALESCE(canal, '')) IN ('tatiana', 'concierge_ai', 'whatsapp', 'wa')
    )
),
con_key AS (
  SELECT
    *,
    CASE
      WHEN tel_norm != '' AND LENGTH(tel_norm) >= 7 THEN 'tel:' || RIGHT(tel_norm, 10)
      WHEN email_norm LIKE '%@%.%' THEN 'email:' || email_norm
      WHEN nombre_norm != '' THEN 'nombre:' || nombre_norm
      ELSE 'id:' || id
    END AS cliente_key
  FROM r_digital
),
primera_por_cliente AS (
  SELECT DISTINCT ON (cliente_key)
    cliente_key,
    fecha AS primera_fecha,
    canal_digital AS canal_adquisicion,
    nombre_norm AS nombre_primera,
    email_norm AS email_primera,
    tel_norm AS tel_primera
  FROM con_key
  ORDER BY cliente_key, fecha ASC, created_at ASC
)
SELECT
  c.cliente_key,
  p.nombre_primera AS nombre,
  p.email_primera AS email,
  p.tel_primera AS telefono,
  p.canal_adquisicion,
  COUNT(*)::int AS visitas,
  SUM(c.pagado)::bigint AS ltv,
  SUM(c.contratado)::bigint AS contratado_total,
  ROUND(AVG(c.pagado))::bigint AS ticket_promedio,
  MIN(c.fecha) AS primera_visita,
  MAX(c.fecha) AS ultima_visita,
  (MAX(c.fecha) - MIN(c.fecha))::int AS dias_activo,
  CASE
    WHEN COUNT(*) >= 10 THEN 'champion'
    WHEN COUNT(*) >= 4 THEN 'vip'
    WHEN COUNT(*) >= 2 THEN 'retorno'
    ELSE 'nuevo'
  END AS segmento
FROM con_key c
JOIN primera_por_cliente p USING (cliente_key)
GROUP BY c.cliente_key, p.nombre_primera, p.email_primera, p.tel_primera, p.canal_adquisicion;

COMMENT ON VIEW v_ltv_cliente_digital IS
  'LTV real por cliente adquirido vía Web o WhatsApp. Agrupa por tel/email/nombre normalizados. Excluye grupos, B2B y reservas canceladas o sin pago. Fase 1 mejora AtolonTrack.';
