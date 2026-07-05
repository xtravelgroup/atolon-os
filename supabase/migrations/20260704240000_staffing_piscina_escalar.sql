-- Actualizar reglas de Mesero Piscina según dirección 2026-07-04:
--   1-10 pax   → 1 mesero
--   11-23 pax  → 2 meseros
--   24-36 pax  → 3 meseros
--   37+ pax    → 3 + ceil((pax-36) / 12) → 37-48=4, 49-60=5, 61-72=6, etc.
--
-- Antes: 1-10=1, 11-30=2, 31+=3 (cap sub-staff).
-- Nota: la variable de entrada sigue siendo exclusive_pax (huéspedes se sumará
-- después cuando restructuremos por área — Piscina recibe Exclusive Pass + Huéspedes).

UPDATE public.staffing_config
SET
  config = jsonb_set(
    config,
    '{roles,mesPool}',
    '{
      "label": "Mesero Piscina",
      "orden": 2,
      "variable": "exclusive_pax",
      "min_apertura": 1,
      "umbrales_pax": [
        {"hasta": 10, "cant": 1},
        {"hasta": 23, "cant": 2},
        {"hasta": 36, "cant": 3}
      ],
      "escalar_despues": {"desde_pax": 36, "cada_pax": 12, "suma_cantidad": 1}
    }'::jsonb
  ),
  updated_at = now()
WHERE id = 'atolon';
