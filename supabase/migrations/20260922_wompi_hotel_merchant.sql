-- Wompi multi-merchant: cuenta separada para reservas 100% hotel.
--
-- Hoy todo lo público que cobra por Wompi (pasadías, eventos, hotel, agencia)
-- comparte la misma cuenta comercial. Hotel abrió su propia cuenta Wompi para
-- separar contabilidad. Este cambio agrega el 2º juego de llaves a
-- `configuracion` para que HotelReservas y HotelGrupoPublico cobren ahí.
--
-- Regla de negocio (confirmada): reservas con solo habitaciones → Wompi hotel.
-- Cualquier reserva mixta (pasadía + habitación) → Wompi pasadías (default).
-- El resto de módulos (Booking Popup, PagoCliente, Agencia, B2B, Eventos)
-- sigue con el Wompi por defecto.
--
-- La pub key puede ser leída por cualquiera del frontend (es pública por diseño).
-- integrity y events_secret son sensibles pero se leen desde el navegador
-- (frontend) o desde el edge function (webhook); la práctica del proyecto es
-- guardarlas en `configuracion` para poder rotarlas desde el panel /track sin
-- redeploy — mismo patrón que el Wompi por defecto y que ga4_id / meta_pixel_id.
--
-- Los valores reales se cargan por separado (ver comentario al final).

alter table public.configuracion
  add column if not exists wompi_hotel_pub_key         text,
  add column if not exists wompi_hotel_integrity_key   text,
  add column if not exists wompi_hotel_events_secret   text,
  add column if not exists wompi_hotel_priv_key        text;

comment on column public.configuracion.wompi_hotel_pub_key
  is 'Wompi public key del comercio de hotel (pub_prod_...). Se usa en el checkout URL.';
comment on column public.configuracion.wompi_hotel_integrity_key
  is 'Wompi integrity key del comercio de hotel (prod_integrity_...). Firma HMAC del checkout.';
comment on column public.configuracion.wompi_hotel_events_secret
  is 'Wompi events secret del comercio de hotel (prod_events_...). Valida webhooks entrantes.';
comment on column public.configuracion.wompi_hotel_priv_key
  is 'Wompi private key del comercio de hotel (prv_prod_...). Solo edge functions, nunca frontend.';

-- Cargar valores reales fuera de este archivo (no versionar secretos):
--   update public.configuracion
--     set wompi_hotel_pub_key       = '<pub>',
--         wompi_hotel_integrity_key = '<integrity>',
--         wompi_hotel_events_secret = '<events>',
--         wompi_hotel_priv_key      = '<private>'
--    where id = 'atolon';
