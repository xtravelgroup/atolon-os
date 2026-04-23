-- Agregar columnas para documentos de soporte al aprobar comisión semanal
ALTER TABLE public.comisiones_semanas
  ADD COLUMN IF NOT EXISTS cuenta_cobro_url text,
  ADD COLUMN IF NOT EXISTS rut_url text,
  ADD COLUMN IF NOT EXISTS cert_bancaria_url text;
