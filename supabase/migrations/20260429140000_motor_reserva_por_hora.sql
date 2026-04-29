-- Reserva para reposición de motores: $30.000 COP por hora de uso.
-- Antes existía motor_reserva_mensual (un cargo fijo mensual).
-- Ahora cambiamos a un cargo basado en horas reales de uso, que es
-- la forma correcta de provisionar para reposición de motores fuera
-- de borda Yamaha F350 (vida útil ~2.000h).

ALTER TABLE lanchas
  ADD COLUMN IF NOT EXISTS motor_reserva_por_hora numeric(14,2) DEFAULT 0;

COMMENT ON COLUMN lanchas.motor_reserva_por_hora IS
  'Provisión por hora de uso para reposición de motores. Multiplica las horas de uso del mes (de muelle_*.motores_horas + lancha_bitacora.kilometraje_h) y se acumula como costo en CostosFlotaTab.';

-- Naturalle: 2 × Yamaha F350 → $30k/h por embarcación
UPDATE lanchas SET motor_reserva_por_hora = 30000 WHERE id = 'LCH-NATURALLE';
-- Castillete: por definir — el usuario debe ajustar el valor
-- (queda en 0 por ahora). Si se confirma luego, se hace UPDATE.
