-- Nuevo rol Cajero — dirección 2026-07-04.
--   1 cajero diario, turno fijo 12:30 – 22:00.
--   Aplica siempre que el club opere (mínimo diario garantizado).

UPDATE public.staffing_config
SET
  config = jsonb_set(
    jsonb_set(
      config,
      '{roles,cajero}',
      '{
        "label": "Cajero",
        "orden": 10,
        "variable": "pax_total",
        "min_apertura": 1,
        "umbrales_pax": [{"hasta": 999, "cant": 1}],
        "turno_fijo": {"entrada": "12:30", "salida": "22:00"}
      }'::jsonb,
      true
    ),
    '{minimo_diario,cajero}',
    '1'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'atolon';
