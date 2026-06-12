-- KPMG D-1 · Cumplimiento DIAN (Facturación Electrónica)
-- =====================================================================
-- La facturación electrónica NO ocurre en Atolón OS — está delegada
-- en dos ambientes Loggro:
--   - Loggro Restrobar : F&B (eventos_consumo, pool_service)
--   - Loggro Pyme      : Pasadías, hospedaje, eventos, compras (OC)
--
-- Este módulo agrega los controles que un auditor exige:
--   1. Registro de resoluciones DIAN vigentes en cada Loggro
--   2. Vista unificada del estado de sincronización (= ¿la
--      transacción cobrada en Atolón llegó a Loggro para facturarse?)
--   3. Resumen por periodo para reconciliación
-- =====================================================================

-- ── 1) Tabla de Resoluciones DIAN vigentes ────────────────────────────
CREATE TABLE IF NOT EXISTS public.dian_resoluciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loggro_environment  text NOT NULL CHECK (loggro_environment IN ('restrobar','pyme')),
  numero_resolucion   text NOT NULL,
  fecha_resolucion    date NOT NULL,
  prefijo             text NOT NULL,           -- ej. "FACT", "FE", "POS"
  consecutivo_desde   bigint NOT NULL,
  consecutivo_hasta   bigint NOT NULL,
  fecha_vigencia_desde date NOT NULL,
  fecha_vigencia_hasta date NOT NULL,
  tipo_documento      text NOT NULL DEFAULT 'factura_venta',  -- factura_venta | nota_credito | nota_debito | pos
  ambiente            text NOT NULL DEFAULT 'produccion',     -- produccion | habilitacion
  notas               text,
  activa              boolean NOT NULL DEFAULT true,
  registrada_por      text,
  registrada_at       timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (consecutivo_hasta > consecutivo_desde),
  CHECK (fecha_vigencia_hasta > fecha_vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_dian_res_env_activa
  ON public.dian_resoluciones (loggro_environment, activa, fecha_vigencia_hasta);

COMMENT ON TABLE public.dian_resoluciones IS
  'KPMG D-1: registro de resoluciones DIAN vigentes en cada ambiente Loggro. Una resolución por (environment, tipo_documento, prefijo).';

GRANT SELECT, INSERT, UPDATE ON public.dian_resoluciones TO authenticated;

-- ── 2) Vista unificada del estado de sync hacia Loggro ────────────────
CREATE OR REPLACE VIEW public.loggro_sync_unified AS
WITH eventos_consumo AS (
  SELECT
    'eventos_consumo_openbar'::text  AS fuente,
    'restrobar'::text                AS loggro_environment,
    id::text                          AS row_id,
    evento_id                         AS doc_padre_id,
    cantidad                          AS unidades,
    costo_total                       AS monto,
    created_at,
    CASE
      WHEN loggro_sync_status = 'ok'        THEN 'sincronizado'
      WHEN loggro_sync_status = 'pendiente' THEN 'pendiente'
      WHEN loggro_sync_status = 'error'     THEN 'error'
      WHEN loggro_movement_id IS NOT NULL   THEN 'sincronizado'
      ELSE 'huerfano'
    END                               AS estado_sync,
    loggro_movement_id                AS loggro_ref,
    loggro_sync_error                 AS sync_error
  FROM public.eventos_consumo_openbar
  WHERE NOT COALESCE(anulado, false)
), pool_service AS (
  SELECT
    'pool_service_pedidos'::text     AS fuente,
    'restrobar'::text                AS loggro_environment,
    id::text                          AS row_id,
    NULL::text                        AS doc_padre_id,
    NULL::int                         AS unidades,
    total                             AS monto,
    created_at,
    CASE
      WHEN loggro_orden_id IS NOT NULL OR loggro_order_id IS NOT NULL THEN 'sincronizado'
      ELSE 'huerfano'
    END                               AS estado_sync,
    COALESCE(loggro_orden_id, loggro_order_id) AS loggro_ref,
    NULL::text                        AS sync_error
  FROM public.pool_service_pedidos
), oc AS (
  SELECT
    'ordenes_compra'::text           AS fuente,
    'pyme'::text                     AS loggro_environment,
    id::text                          AS row_id,
    NULL::text                        AS doc_padre_id,
    NULL::int                         AS unidades,
    total::numeric                    AS monto,
    created_at,
    CASE
      WHEN loggro_movement_id IS NOT NULL THEN 'sincronizado'
      WHEN estado IN ('recibida','pagada','cerrada') THEN 'huerfano'
      ELSE 'no_aplica'
    END                               AS estado_sync,
    loggro_movement_id                AS loggro_ref,
    NULL::text                        AS sync_error
  FROM public.ordenes_compra
)
SELECT * FROM eventos_consumo
UNION ALL
SELECT * FROM pool_service
UNION ALL
SELECT * FROM oc;

GRANT SELECT ON public.loggro_sync_unified TO authenticated;

COMMENT ON VIEW public.loggro_sync_unified IS
  'KPMG D-1: estado unificado de sync hacia Loggro Restrobar/Pyme. Cada huérfano = potencial venta no facturada.';

-- ── 3) Resumen por periodo ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.loggro_sync_summary AS
SELECT
  fuente,
  loggro_environment,
  date_trunc('month', created_at)::date AS mes,
  estado_sync,
  COUNT(*)                              AS n,
  COALESCE(SUM(monto), 0)               AS monto_total
FROM public.loggro_sync_unified
GROUP BY fuente, loggro_environment, mes, estado_sync;

GRANT SELECT ON public.loggro_sync_summary TO authenticated;
