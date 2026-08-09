-- ═════════════════════════════════════════════════════════════════════════
-- B2B WhatsApp Bot — schema + funciones
-- ═════════════════════════════════════════════════════════════════════════
-- Feature: bot AI en un WhatsApp Business dedicado que reconoce
-- agencias por su tel registrado (aliados_b2b.tel, b2b_contactos.telefono
-- o b2b_locaciones.telefono) y les permite consultar disponibilidad,
-- precios netos, crear reservas, generar links de pago y ver puntos.

-- ── 1. Función: busca aliado_b2b por tel (múltiples fuentes) ──────────
-- Retorna el UUID del aliado si el tel matchea, o NULL.
-- Comparación por últimos 10 dígitos (ignora +, código país, formato).

CREATE OR REPLACE FUNCTION public.find_aliado_by_tel(p_tel text)
RETURNS TABLE(aliado_id text, aliado_nombre text, source text, contacto_nombre text) AS $$
DECLARE
  v_tel_norm text;
BEGIN
  IF p_tel IS NULL OR length(p_tel) < 7 THEN
    RETURN;
  END IF;

  -- Últimos 10 dígitos (matchea móviles CO independiente de +57 prefix)
  v_tel_norm := right(regexp_replace(p_tel, '[^0-9]', '', 'g'), 10);
  IF length(v_tel_norm) < 7 THEN
    RETURN;
  END IF;

  -- Prioridad: aliados_b2b.tel (dueño), luego b2b_contactos, luego b2b_locaciones
  RETURN QUERY
  SELECT a.id, a.nombre, 'aliado_b2b'::text, NULL::text
  FROM aliados_b2b a
  WHERE COALESCE(a.estado, 'activo') = 'activo'
    AND right(regexp_replace(COALESCE(a.tel, ''), '[^0-9]', '', 'g'), 10) = v_tel_norm
  UNION ALL
  SELECT a.id, a.nombre, 'b2b_contactos'::text, c.nombre
  FROM b2b_contactos c
  JOIN aliados_b2b a ON a.id = c.aliado_id
  WHERE COALESCE(a.estado, 'activo') = 'activo'
    AND right(regexp_replace(COALESCE(c.telefono, ''), '[^0-9]', '', 'g'), 10) = v_tel_norm
  UNION ALL
  SELECT a.id, a.nombre, 'b2b_locaciones'::text, l.nombre
  FROM b2b_locaciones l
  JOIN aliados_b2b a ON a.id = l.aliado_id
  WHERE COALESCE(a.estado, 'activo') = 'activo'
    AND right(regexp_replace(COALESCE(l.telefono, ''), '[^0-9]', '', 'g'), 10) = v_tel_norm
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── 2. Tabla: sesiones B2B por WhatsApp ───────────────────────────────
-- Trackear la conversación por número + aliado. Sirve para restaurar
-- contexto de mensajes previos (últimas 10) al agente AI.

CREATE TABLE IF NOT EXISTS public.b2b_wa_sesiones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aliado_id         text REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  telefono_e164     text NOT NULL,
  contacto_nombre   text,
  contacto_fuente   text,  -- 'aliado_b2b' | 'b2b_contactos' | 'b2b_locaciones'
  primer_mensaje_at timestamptz DEFAULT now(),
  ultimo_mensaje_at timestamptz DEFAULT now(),
  msgs_total        int DEFAULT 0,
  reservas_creadas  int DEFAULT 0,
  handoff_at        timestamptz,           -- si pidió humano
  metadata          jsonb DEFAULT '{}'::jsonb,
  UNIQUE(telefono_e164)
);
CREATE INDEX IF NOT EXISTS idx_b2b_wa_sesiones_aliado ON public.b2b_wa_sesiones(aliado_id);
CREATE INDEX IF NOT EXISTS idx_b2b_wa_sesiones_ultimo ON public.b2b_wa_sesiones(ultimo_mensaje_at DESC);

-- ── 3. Tabla: mensajes de la conversación B2B ─────────────────────────
-- Historial completo (user + assistant + tool_use + tool_result) para
-- construir el context del loop de Claude en cada turno.

CREATE TABLE IF NOT EXISTS public.b2b_wa_mensajes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id      uuid REFERENCES b2b_wa_sesiones(id) ON DELETE CASCADE,
  role           text NOT NULL,   -- 'user' | 'assistant' | 'tool'
  content        jsonb NOT NULL,  -- text o array de content blocks
  wa_message_id  text,            -- wamid de Meta si es inbound/outbound
  tool_name      text,            -- para role='tool'
  tokens_in      int,
  tokens_out     int,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_b2b_wa_mensajes_sesion ON public.b2b_wa_mensajes(sesion_id, created_at);

-- ── 4. Config del bot B2B (WABA credentials) ──────────────────────────
-- Se registra el phone_number_id del WhatsApp Business exclusivo para B2B.
-- El router del webhook lo usa para diferenciar B2B del Concierge normal.
-- Cuando el usuario configure el número nuevo en Meta, aquí se guarda.

CREATE TABLE IF NOT EXISTS public.b2b_wa_config (
  id                    int PRIMARY KEY DEFAULT 1,
  activo                boolean DEFAULT false,
  phone_number_id       text,            -- Meta phone_number_id del WABA B2B
  waba_id               text,            -- Meta WABA id
  display_phone_number  text,            -- +1 305 ... (visual)
  verified_name         text,            -- "Atolón B2B"
  updated_at            timestamptz DEFAULT now(),
  CHECK (id = 1)
);
-- Semilla vacía para que el router pueda hacer SELECT sin fallar
INSERT INTO public.b2b_wa_config (id, activo) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- ── 5. RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.b2b_wa_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_wa_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_wa_config   ENABLE ROW LEVEL SECURITY;

-- Solo service_role escribe/lee (el webhook y admin panel via SUPABASE_SERVICE_ROLE_KEY)
DROP POLICY IF EXISTS "b2b_wa_sesiones_service" ON public.b2b_wa_sesiones;
CREATE POLICY "b2b_wa_sesiones_service" ON public.b2b_wa_sesiones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "b2b_wa_mensajes_service" ON public.b2b_wa_mensajes;
CREATE POLICY "b2b_wa_mensajes_service" ON public.b2b_wa_mensajes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "b2b_wa_config_service" ON public.b2b_wa_config;
CREATE POLICY "b2b_wa_config_service" ON public.b2b_wa_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated puede LEER config + sesiones (para admin panel via anon key)
DROP POLICY IF EXISTS "b2b_wa_config_read_auth" ON public.b2b_wa_config;
CREATE POLICY "b2b_wa_config_read_auth" ON public.b2b_wa_config
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "b2b_wa_sesiones_read_auth" ON public.b2b_wa_sesiones;
CREATE POLICY "b2b_wa_sesiones_read_auth" ON public.b2b_wa_sesiones
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "b2b_wa_mensajes_read_auth" ON public.b2b_wa_mensajes;
CREATE POLICY "b2b_wa_mensajes_read_auth" ON public.b2b_wa_mensajes
  FOR SELECT TO authenticated USING (true);

-- ── Test rápido ────────────────────────────────────────────────────────
-- SELECT * FROM find_aliado_by_tel('+573001234567');
-- SELECT * FROM find_aliado_by_tel('3001234567');
