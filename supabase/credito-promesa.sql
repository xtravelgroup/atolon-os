-- Agregar columnas para formulario de solicitud y promesa de pago
ALTER TABLE b2b_credito_solicitudes ADD COLUMN IF NOT EXISTS formulario_solicitud jsonb DEFAULT '{}';
ALTER TABLE b2b_credito_solicitudes ADD COLUMN IF NOT EXISTS promesa_firmada_url text;
ALTER TABLE b2b_credito_solicitudes ADD COLUMN IF NOT EXISTS promesa_firmada_en timestamptz;
ALTER TABLE b2b_credito_solicitudes ADD COLUMN IF NOT EXISTS promesa_firmada_por text;
