-- Campos para facturación electrónica (Colombia / DIAN) en reservas

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS factura_electronica   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fe_tipo_persona       text,        -- 'natural' | 'juridica'
  ADD COLUMN IF NOT EXISTS fe_tipo_documento     text,        -- 'CC' | 'CE' | 'NIT' | 'Pasaporte' | 'TI' | 'RC' | 'PEP'
  ADD COLUMN IF NOT EXISTS fe_numero_documento   text,
  ADD COLUMN IF NOT EXISTS fe_dv                 text,        -- dígito de verificación (NIT)
  ADD COLUMN IF NOT EXISTS fe_razon_social       text,
  ADD COLUMN IF NOT EXISTS fe_nombres            text,
  ADD COLUMN IF NOT EXISTS fe_apellidos          text,
  ADD COLUMN IF NOT EXISTS fe_email              text,
  ADD COLUMN IF NOT EXISTS fe_telefono           text,
  ADD COLUMN IF NOT EXISTS fe_direccion          text,
  ADD COLUMN IF NOT EXISTS fe_ciudad             text,
  ADD COLUMN IF NOT EXISTS fe_departamento       text,
  ADD COLUMN IF NOT EXISTS fe_pais               text DEFAULT 'Colombia',
  ADD COLUMN IF NOT EXISTS fe_regimen            text,        -- 'responsable_iva' | 'no_responsable_iva' | 'gran_contribuyente' | 'simple'
  ADD COLUMN IF NOT EXISTS fe_responsabilidades  text[],      -- códigos RUT (ej: O-13, R-99-PN)
  ADD COLUMN IF NOT EXISTS fe_estado             text DEFAULT 'pendiente', -- 'pendiente' | 'emitida' | 'rechazada' | 'anulada'
  ADD COLUMN IF NOT EXISTS fe_numero_factura     text,
  ADD COLUMN IF NOT EXISTS fe_emitida_at         timestamptz;
