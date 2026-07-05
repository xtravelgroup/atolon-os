-- Restaurante CON huéspedes — dirección 2026-07-04:
--
-- Cuando hay huéspedes en el hotel, el restaurante NO usa el horario de pasadías.
-- Trabaja 2 turnos fijos:
--   T1: 06:30 – 15:00
--   T2: 12:30 – 22:00
--
-- Staffing POR TURNO según # huéspedes (headcount total dia = per_turno × 2):
--   1-9 huéspedes   → 1 mesero por turno   (2 total)
--   10-19 huéspedes → 2 meseros por turno  (4 total)
--   20-40 huéspedes → 3 meseros por turno  (6 total)
--   +1 mesero por turno por cada 20 huéspedes adicionales sobre 40.
--
-- Sin huéspedes (huespedesPax=0) sigue aplicando la regla previa: 1 mesero fijo.

UPDATE public.staffing_config
SET
  config = jsonb_set(
    config,
    '{roles,mesRest,regla_con_huespedes}',
    '{
      "variable": "huespedes_pax",
      "umbrales_por_turno": [
        {"hasta": 9,  "cant": 1},
        {"hasta": 19, "cant": 2},
        {"hasta": 40, "cant": 3}
      ],
      "escalar_despues_por_turno": {"desde_pax": 40, "cada_pax": 20, "suma_cantidad": 1},
      "turnos": [
        {"key": "T1", "entrada": "06:30", "salida": "15:00"},
        {"key": "T2", "entrada": "12:30", "salida": "22:00"}
      ]
    }'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'atolon';
