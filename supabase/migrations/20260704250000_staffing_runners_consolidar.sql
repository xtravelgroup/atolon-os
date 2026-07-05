-- Consolidar Runners a un solo rol según dirección 2026-07-04:
--   <20 pax    → 0 runners
--   20-39 pax  → 1 runner
--   40-79 pax  → 2 runners
--   80-130 pax → 3 runners
--   131+ pax   → 3 + ceil((pax-130)/50) → 180=4, 230=5, 280=6, etc.
--
-- Antes: dos roles (runnersBeb + runnersCom con solo_pico). Ahora uno solo:
-- 'Runners' generico que cubre Playa+Piscina+Restaurante.

UPDATE public.staffing_config
SET
  config = jsonb_set(
    config #- '{roles,runnersCom}',
    '{roles,runnersBeb}',
    '{
      "label": "Runners",
      "orden": 4,
      "variable": "pax_total",
      "umbrales_pax": [
        {"hasta": 19, "cant": 0},
        {"hasta": 39, "cant": 1},
        {"hasta": 79, "cant": 2},
        {"hasta": 130, "cant": 3}
      ],
      "escalar_despues": {"desde_pax": 130, "cada_pax": 50, "suma_cantidad": 1}
    }'::jsonb
  ),
  updated_at = now()
WHERE id = 'atolon';

-- Limpiar overrides antiguos de runnersCom (rol ya no existe).
DELETE FROM public.staffing_overrides WHERE role = 'runnersCom';
