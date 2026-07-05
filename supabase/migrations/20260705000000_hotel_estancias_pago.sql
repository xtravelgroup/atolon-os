-- Campos de pago para hotel_estancias (usado por reservas de grupo con Wompi).
-- El webhook Wompi actualizará estos campos al confirmar el pago.

ALTER TABLE public.hotel_estancias
  ADD COLUMN IF NOT EXISTS pago_referencia text,
  ADD COLUMN IF NOT EXISTS pagado_en       timestamptz,
  ADD COLUMN IF NOT EXISTS pasarela_usada  text;

CREATE INDEX IF NOT EXISTS idx_hotel_estancias_pagado ON public.hotel_estancias(pagado_en) WHERE pagado_en IS NOT NULL;
