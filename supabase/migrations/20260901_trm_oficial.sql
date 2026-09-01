-- ═══════════════════════════════════════════════════════════════════════
-- TRM oficial + ajuste configurable + persistencia de tasa aplicada
-- ═══════════════════════════════════════════════════════════════════════
-- Antes: PagoCliente.jsx dividía COP entre 4200 hardcodeado, y con TRM real
-- ~3200 estábamos cobrando ~24% MENOS al cliente que la conversión real.
-- Ejemplo: evento EVT-1785790073042 cobró $7.572 USD por $31.799.200 COP
-- cuando debía cobrar ~$10.211 USD (a TRM 3213.97 - 100).
--
-- Ahora: se lee TRM oficial de datos.gov.co (SuperFinanciera) y se le
-- aplica un ajuste configurable en pesos (default -100) como margen para
-- cubrir fees Zoho y variación intradía.
-- ═══════════════════════════════════════════════════════════════════════

-- Ajuste en pesos que se resta a la TRM oficial (default -100)
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS trm_ajuste_pesos numeric DEFAULT 100;

-- Cache de TRM oficial del día (evitar hits repetidos a datos.gov.co)
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS trm_oficial numeric,
  ADD COLUMN IF NOT EXISTS trm_oficial_fecha date;

-- Persistir la tasa efectiva aplicada en cada sesión Zoho para auditoría
ALTER TABLE pagos_zoho_sessions
  ADD COLUMN IF NOT EXISTS tasa_aplicada numeric,
  ADD COLUMN IF NOT EXISTS trm_oficial_al_cobro numeric,
  ADD COLUMN IF NOT EXISTS monto_cop_origen numeric;

COMMENT ON COLUMN configuracion.trm_ajuste_pesos IS
  'Pesos COP que se restan a la TRM oficial para calcular la tasa efectiva de cobro Zoho/Stripe. Default 100. Sube este número si quieres más margen.';
COMMENT ON COLUMN pagos_zoho_sessions.tasa_aplicada IS
  'Tasa COP/USD efectiva usada para dividir el monto COP y obtener el USD que Zoho cobró. = trm_oficial_al_cobro - trm_ajuste_pesos';
