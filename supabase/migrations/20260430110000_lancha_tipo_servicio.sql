-- Lanchas: agregar flag para distinguir lanchas que NO transportan pasajeros.
-- Castillete es una lancha de servicio (provisiones, staff, mantenimiento) —
-- el costo se mide por viaje, no por pax. Naturalle SÍ es de pasajeros.

ALTER TABLE lanchas
  ADD COLUMN IF NOT EXISTS tipo_uso text DEFAULT 'pasajeros';

COMMENT ON COLUMN lanchas.tipo_uso IS
  'pasajeros: lancha de transporte de pax (Naturalle). servicio: provisiones/staff sin pax (Castillete). Afecta cómo se calcula costo (por pax vs por viaje) en CostosFlotaTab.';

-- Marcar Castillete como servicio
UPDATE lanchas SET tipo_uso = 'servicio'   WHERE id = 'LCH-CASTILLETE';
UPDATE lanchas SET tipo_uso = 'pasajeros'  WHERE id = 'LCH-NATURALLE';
