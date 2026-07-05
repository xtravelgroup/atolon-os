-- Actualizar reglas de Mesero Playa según dirección 2026-07-04:
--   1-16 pax   → 1 mesero
--   17-49 pax  → 2 meseros
--   50-60 pax  → 3 meseros
--   61+ pax    → 3 + ceil((pax-60) / 20) → 61-80=4, 81-100=5, 101-120=6, etc.
--
-- Antes: pax_por_mesero=20 con cap 3 hasta 80, fijo 4 después. Sub-staff en 100+.

UPDATE public.staffing_config
SET
  config = jsonb_set(
    config,
    '{roles,mesPlaya}',
    '{
      "label": "Mesero Playa",
      "orden": 1,
      "variable": "vip_pax",
      "min_apertura": 1,
      "umbrales_pax": [
        {"hasta": 16, "cant": 1},
        {"hasta": 49, "cant": 2},
        {"hasta": 60, "cant": 3}
      ],
      "escalar_despues": {"desde_pax": 60, "cada_pax": 20, "suma_cantidad": 1},
      "delta_pico_movimiento": -1
    }'::jsonb
  ),
  updated_at = now()
WHERE id = 'atolon';
