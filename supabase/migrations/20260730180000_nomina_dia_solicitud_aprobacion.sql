-- Flujo de 3 estados para nomina_por_dia:
--   1. solicitado   → supervisor de depto crea la solicitud (día, empleado, horas, tarifa)
--   2. aprobado     → gerente/admin revisa, puede ajustar valores, y aprueba
--   3. ejecutado    → al terminar el turno se registran horas reales; solo lo ejecutado va al pago
--
-- Compatible con registros existentes: los que ya tenían total > 0 los
-- backfileamos como estado='ejecutado' (asumimos que ya se pagaron/pagan)

ALTER TABLE nomina_por_dia
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'solicitado'
    CHECK (estado IN ('solicitado','aprobado','ejecutado','rechazado')),
  ADD COLUMN IF NOT EXISTS departamento_id text,
  ADD COLUMN IF NOT EXISTS horas_solicitadas numeric,
  ADD COLUMN IF NOT EXISTS solicitado_por text,
  ADD COLUMN IF NOT EXISTS solicitado_at   timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_por    text,
  ADD COLUMN IF NOT EXISTS aprobado_at     timestamptz,
  ADD COLUMN IF NOT EXISTS ejecutado_por   text,
  ADD COLUMN IF NOT EXISTS ejecutado_at    timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rechazo  text,
  ADD COLUMN IF NOT EXISTS notas_aprobacion text;

-- Backfill: registros anteriores al flujo se marcan como ejecutados.
UPDATE nomina_por_dia
SET estado = 'ejecutado',
    ejecutado_at = COALESCE(updated_at, created_at, now()),
    horas_solicitadas = horas
WHERE estado = 'solicitado' AND (total > 0 OR pagado = true) AND ejecutado_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_nom_dia_estado_fecha ON nomina_por_dia(estado, fecha);
CREATE INDEX IF NOT EXISTS idx_nom_dia_depto ON nomina_por_dia(departamento_id);

COMMENT ON COLUMN nomina_por_dia.estado IS
  'Ciclo: solicitado → aprobado → ejecutado. rechazado si el aprobador lo descarta.';
COMMENT ON COLUMN nomina_por_dia.horas_solicitadas IS
  'Horas planificadas al momento de la solicitud. `horas` guarda las reales al ejecutar.';
