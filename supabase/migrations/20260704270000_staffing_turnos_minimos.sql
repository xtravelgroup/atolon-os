-- Auto-horarios servicio + mínimo diario garantizado — dirección 2026-07-04.
--
-- Reglas de entrada según PRIMER pasadía del día:
--   Primer pasadía 08:30 → mesero entra 07:30
--   Primer pasadía 10:00 → mesero entra 09:00
--   Primer pasadía 11:30 → mesero entra 10:00
--
-- Reglas de salida según ÚLTIMO pasadía del día:
--   Último pasadía 08:30 → mesero sale 16:30
--   Último pasadía 10:00 → mesero sale 17:30
--   Último pasadía 11:30 → mesero sale 18:30
--
-- Aplican a Playa, Piscina y Restaurante (Restaurante SOLO si no hay huéspedes).
-- El Gerente de Servicio puede sobrescribir en un turno específico.
--
-- Mínimo diario garantizado (auto-scheduler debe cumplir aunque calcStaff dé menos):
--   1 Mesero Playa, 1 Mesero Piscina, 1 Mesero Restaurante, 1 Bartender.

UPDATE public.staffing_config
SET
  config = jsonb_set(
    jsonb_set(
      config,
      '{turnos_servicio}',
      '{
        "entrada_por_primer_pasadia": [
          {"primer_pasadia": "08:30", "entrada": "07:30"},
          {"primer_pasadia": "10:00", "entrada": "09:00"},
          {"primer_pasadia": "11:30", "entrada": "10:00"}
        ],
        "salida_por_ultimo_pasadia": [
          {"ultimo_pasadia": "08:30", "salida": "16:30"},
          {"ultimo_pasadia": "10:00", "salida": "17:30"},
          {"ultimo_pasadia": "11:30", "salida": "18:30"}
        ],
        "restaurante_usa_horario_pasadias": true
      }'::jsonb,
      true
    ),
    '{minimo_diario}',
    '{
      "mesPlaya": 1,
      "mesPool": 1,
      "mesRest": 1,
      "bartenders": 1
    }'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'atolon';
