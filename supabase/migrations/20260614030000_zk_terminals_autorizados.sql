-- Whitelist de terminales ZKTeco autorizados para enviar punches al endpoint
-- /api/zk-iclock. Sin este registro, el endpoint rechaza el SN con 401.
--
-- ip_origen_esperada / last_seen_ip son para fase 2: detectar si el reloj se
-- mueve de IP (modo monitor en el primer release; hard-enforce más adelante).

CREATE TABLE IF NOT EXISTS public.zk_terminals_autorizados (
  sn                  text PRIMARY KEY,
  label               text,
  activo              boolean NOT NULL DEFAULT true,
  ip_origen_esperada  inet,
  last_seen_ip        inet,
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Index por activo para que el lookup del endpoint sea O(log n).
CREATE INDEX IF NOT EXISTS idx_zk_terminals_autorizados_activo
  ON public.zk_terminals_autorizados (sn) WHERE activo = true;

-- Seed: el único terminal con actividad real en asistencia_zk.
-- Si llegan punches de UDP3234600028, pasan. Si llega otro SN, 401.
INSERT INTO public.zk_terminals_autorizados (sn, label, activo)
VALUES ('UDP3234600028', 'Reloj asistencia principal Atolón', true)
ON CONFLICT (sn) DO UPDATE SET activo = EXCLUDED.activo, label = EXCLUDED.label;

COMMENT ON TABLE public.zk_terminals_autorizados IS
  'Whitelist de terminales ZK autorizados. El endpoint /api/zk-iclock rechaza con 401 si el SN no está acá o si activo=false.';
