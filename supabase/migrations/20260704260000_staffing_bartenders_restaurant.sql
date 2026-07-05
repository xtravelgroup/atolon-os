-- Actualizar Bartenders y Mesero Restaurante según dirección 2026-07-04:
--
-- Bartenders:
--   1-39 pax   → 1 bartender
--   40-90 pax  → 2 bartenders
--   91+ pax    → 2 + ceil((pax-90)/50) → 91-140=3, 141-190=4, etc.
--   Antes: 60→1, resto→2.
--
-- Mesero Restaurante (sin huéspedes):
--   Cualquier # pax de pasadías → 1 mesero fijo.
--   Antes: ≤80=1, >80=4. Al no haber huéspedes, es 1 sin importar # pasadías.
--   delta_pico_movimiento=1 se mantiene: durante pico movimiento sube a 2
--   porque 1 Mesero Playa cruza al restaurante.
--   NOTA: Cuando hay huéspedes las reglas serán distintas (breakfast + dinner);
--   esa rama se agregará cuando definamos la variable huespedes_pax.

UPDATE public.staffing_config
SET
  config = jsonb_set(
    jsonb_set(
      config,
      '{roles,bartenders}',
      '{
        "label": "Bartenders",
        "orden": 7,
        "variable": "pax_total",
        "umbrales_pax": [
          {"hasta": 39, "cant": 1},
          {"hasta": 90, "cant": 2}
        ],
        "escalar_despues": {"desde_pax": 90, "cada_pax": 50, "suma_cantidad": 1}
      }'::jsonb
    ),
    '{roles,mesRest}',
    '{
      "label": "Mesero Restaurante",
      "orden": 3,
      "variable": "pax_total",
      "min_apertura": 1,
      "umbrales_pax": [
        {"hasta": 999, "cant": 1}
      ],
      "delta_pico_movimiento": 1
    }'::jsonb
  ),
  updated_at = now()
WHERE id = 'atolon';
