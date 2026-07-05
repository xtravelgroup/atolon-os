-- Configuración de reglas de staffing — antes las reglas estaban hardcoded en
-- src/modules/staffing/calc.js. Ahora los UMBRALES son editables desde la UI
-- (mientras la ESTRUCTURA de los 9 roles y la lógica valle/pico sigue en código).
--
-- Reportado por Eric 2026-07-04: quiere una "guía de staffing" que se pueda
-- ajustar sin dev, para dejar las políticas de dirección claras y estables.

CREATE TABLE IF NOT EXISTS public.staffing_config (
  id text PRIMARY KEY DEFAULT 'atolon',
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.staffing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_staffing_config" ON public.staffing_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed con los valores actualmente hardcoded en calc.js (equivalencia exacta).
-- Cada rol tiene: label, orden, variable de entrada, y umbrales editables.
INSERT INTO public.staffing_config (id, config) VALUES ('atolon', $$
{
  "apertura_minima_pax": 20,
  "movimiento_max_pax": 80,
  "umbrales_ocupacion": [
    {"nombre": "Cerrado", "hasta_pax": 0, "color": "#6B7280"},
    {"nombre": "Apertura", "hasta_pax": 20, "color": "#94A3B8"},
    {"nombre": "Bajo", "hasta_pax": 60, "color": "#10B981"},
    {"nombre": "Medio", "hasta_pax": 80, "color": "#F59E0B"},
    {"nombre": "Alto", "hasta_pax": 999, "color": "#EF4444"}
  ],
  "roles": {
    "mesPlaya":   {"label": "Mesero Playa",        "orden": 1, "variable": "vip_pax",    "min_apertura": 1, "pax_por_mesero": 20, "max_valle": 3, "fijo_pax_alto": 4, "delta_pico_movimiento": -1},
    "mesPool":    {"label": "Mesero Pool",         "orden": 2, "variable": "exclusive_pax","min_apertura": 1, "umbrales_pax": [{"hasta": 10, "cant": 1}, {"hasta": 30, "cant": 2}, {"hasta": 999, "cant": 3}]},
    "mesRest":    {"label": "Mesero Restaurante",  "orden": 3, "variable": "pax_total",  "min_apertura": 1, "umbrales_pax": [{"hasta": 80, "cant": 1}, {"hasta": 999, "cant": 4}], "delta_pico_movimiento": 1},
    "runnersBeb": {"label": "Runner Bebidas",      "orden": 4, "variable": "pax_total",  "umbrales_pax": [{"hasta": 60, "cant": 1}, {"hasta": 80, "cant": 2}, {"hasta": 999, "cant": 3}]},
    "runnersCom": {"label": "Runner Comida",       "orden": 5, "variable": "pax_total",  "solo_pico": true, "umbrales_pax": [{"hasta": 20, "cant": 0}, {"hasta": 80, "cant": 1}, {"hasta": 999, "cant": 2}]},
    "bussers":    {"label": "Bussers",             "orden": 6, "variable": "pax_total",  "umbrales_pax": [{"hasta": 20, "cant": 0}, {"hasta": 60, "cant": 1}, {"hasta": 999, "cant": 2}]},
    "bartenders": {"label": "Bartenders",          "orden": 7, "variable": "pax_total",  "umbrales_pax": [{"hasta": 60, "cant": 1}, {"hasta": 999, "cant": 2}]},
    "supervisor": {"label": "Supervisor",          "orden": 8, "variable": "pax_total",  "umbrales_pax": [{"hasta": 999, "cant": 1}]},
    "hostess":    {"label": "Hostess",             "orden": 9, "variable": "pax_total",  "umbrales_pax": [{"hasta": 20, "cant": 0}, {"hasta": 80, "cant": 1}, {"hasta": 999, "cant": 2}]}
  }
}
$$::jsonb)
ON CONFLICT (id) DO NOTHING;
