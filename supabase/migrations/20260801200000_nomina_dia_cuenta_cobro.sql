-- Nomina por dia: agregar campo para URL de cuenta de cobro.
-- Se carga despues de que el registro pasa a estado 'ejecutado'. El trabajador
-- extra entrega su cuenta de cobro (PDF/imagen) y contabilidad la sube aqui
-- para respaldar el pago.

ALTER TABLE nomina_por_dia
  ADD COLUMN IF NOT EXISTS cuenta_cobro_url text,
  ADD COLUMN IF NOT EXISTS cuenta_cobro_at timestamptz,
  ADD COLUMN IF NOT EXISTS cuenta_cobro_por text;

COMMENT ON COLUMN nomina_por_dia.cuenta_cobro_url IS
  'URL Storage del PDF/imagen de la cuenta de cobro que entrega el trabajador extra. Se carga solo cuando estado=ejecutado.';
