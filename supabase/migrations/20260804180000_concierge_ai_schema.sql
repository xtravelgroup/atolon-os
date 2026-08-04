-- =====================================================================
-- Atolón Concierge AI — schema completo
-- Inspirado en Visito.ai. Multi-tenant por diseño (property).
-- =====================================================================

-- 1) Tenants / propiedades del concierge (Atolon Beach Club, Castillete, etc.)
CREATE TABLE IF NOT EXISTS ai_tenants (
  id           text PRIMARY KEY,
  nombre       text NOT NULL,
  slug         text UNIQUE NOT NULL,
  timezone     text DEFAULT 'America/Bogota',
  activo       boolean DEFAULT true,
  logo_url     text,
  color        text DEFAULT '#38bdf8',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- 2) Agente configurable por tenant (persona + prompt + model)
CREATE TABLE IF NOT EXISTS ai_agents (
  id                   text PRIMARY KEY,
  tenant_id            text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  nombre               text NOT NULL,           -- "Concierge Atolón"
  descripcion          text,
  model                text DEFAULT 'claude-sonnet-4-5-20250929',
  activo               boolean DEFAULT true,
  base_style           text DEFAULT 'default',  -- default|formal|casual|luxury
  usa_emoji            boolean DEFAULT true,
  message_length       text DEFAULT 'default',  -- short|default|long
  conversation_scope   text DEFAULT 'business', -- business|general_business
  assistant_name       text,                    -- "Sofía" u opcional
  custom_instructions  text,                    -- system prompt libre
  temperature          numeric DEFAULT 0.6,
  max_tokens           integer DEFAULT 1024,
  idioma_default       text DEFAULT 'es',
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_agents_tenant ON ai_agents(tenant_id);

-- 3) Knowledge Base — RAG almacena chunks con embeddings opcionales
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
  id            text PRIMARY KEY,
  tenant_id     text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('text','url','file')),
  scope         text DEFAULT 'tenant' CHECK (scope IN ('global','tenant')),
  contenido     text,                    -- para 'text' y cache de url/file
  url           text,                    -- para 'url'
  file_url      text,                    -- para 'file' (Supabase Storage)
  tokens        integer DEFAULT 0,
  activo        boolean DEFAULT true,
  creado_por    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_kb_tenant ON ai_knowledge_base(tenant_id);
CREATE INDEX IF NOT EXISTS ix_ai_kb_activo ON ai_knowledge_base(activo);

-- 4) Handoff Rules — cuándo escalar a humano
CREATE TABLE IF NOT EXISTS ai_handoff_rules (
  id              text PRIMARY KEY,
  tenant_id       text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  descripcion     text,
  activo          boolean DEFAULT true,
  scope           text DEFAULT 'all' CHECK (scope IN ('all','pasadias','hotel','eventos','b2b')),
  trigger_keywords text[] DEFAULT '{}',
  required_fields text[] DEFAULT '{}',
  action          text DEFAULT 'notify' CHECK (action IN ('notify','assign','pause','send_email')),
  asignar_a_email text,
  orden           integer DEFAULT 100,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_handoff_tenant ON ai_handoff_rules(tenant_id);

-- 5) Working hours (para banner "estamos fuera de horario")
CREATE TABLE IF NOT EXISTS ai_working_hours (
  tenant_id  text PRIMARY KEY REFERENCES ai_tenants(id) ON DELETE CASCADE,
  activo     boolean DEFAULT false,
  timezone   text DEFAULT 'America/Bogota',
  dias       jsonb DEFAULT '{"lun":["09:00","20:00"],"mar":["09:00","20:00"],"mie":["09:00","20:00"],"jue":["09:00","20:00"],"vie":["09:00","20:00"],"sab":["10:00","18:00"],"dom":["10:00","18:00"]}',
  mensaje_off_hours text DEFAULT 'Estamos fuera de horario. Te responderemos apenas abramos.',
  updated_at timestamptz DEFAULT now()
);

-- 6) Canales (WhatsApp, Instagram, Web widget, Messenger)
CREATE TABLE IF NOT EXISTS ai_channels (
  id                text PRIMARY KEY,
  tenant_id         text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  tipo              text NOT NULL CHECK (tipo IN ('whatsapp','instagram','messenger','web','sms','email')),
  nombre            text NOT NULL,
  activo            boolean DEFAULT true,
  status            text DEFAULT 'pending' CHECK (status IN ('active','pending','error','paused')),
  config            jsonb DEFAULT '{}',       -- {phone_number_id, waba_id, page_id, access_token_enc, verify_token, ...}
  webhook_url       text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_channels_tenant ON ai_channels(tenant_id);

-- 7) Integraciones externas (Loggro, Cloudbeds, Stripe...)
CREATE TABLE IF NOT EXISTS ai_integrations (
  id             text PRIMARY KEY,
  tenant_id      text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  proveedor      text NOT NULL,               -- 'loggro','cloudbeds','stripe','wompi','zoho_pay'
  nombre         text NOT NULL,
  activo         boolean DEFAULT true,
  health         text DEFAULT 'unknown' CHECK (health IN ('active','degraded','error','unknown')),
  last_check_at  timestamptz,
  config         jsonb DEFAULT '{}',
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_integrations_tenant ON ai_integrations(tenant_id);

-- 8) Tools que el agente puede invocar (JSON schema + endpoint)
CREATE TABLE IF NOT EXISTS ai_tools (
  id             text PRIMARY KEY,
  tenant_id      text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  nombre         text NOT NULL,               -- 'check_disponibilidad_pasadia'
  descripcion    text NOT NULL,               -- description que ve el modelo
  input_schema   jsonb NOT NULL,              -- JSON Schema para Claude tool-use
  endpoint       text NOT NULL,               -- edge fn o URL
  activo         boolean DEFAULT true,
  is_builtin     boolean DEFAULT false,
  requires_auth  boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_tools_tenant ON ai_tools(tenant_id);

-- 9) Conversaciones (unifica WA/IG/Web por contacto)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id                 text PRIMARY KEY,
  tenant_id          text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  channel_id         text REFERENCES ai_channels(id) ON DELETE SET NULL,
  channel_tipo       text,                     -- denormalizado para filtros rápidos
  contact_id         text NOT NULL,           -- teléfono WA / IG psid / session web
  contact_nombre     text,
  contact_meta       jsonb DEFAULT '{}',      -- {avatar_url, meta_ad_id, first_seen_channel, ...}
  estado             text DEFAULT 'live' CHECK (estado IN ('live','needs_reply','handoff','resolved','archived','snoozed')),
  asignado_a         text,                    -- email del humano si handoff
  ultimo_mensaje     text,
  ultimo_mensaje_at  timestamptz,
  fuente             text,                    -- 'meta_ad', 'organico', 'web_widget', ...
  meta_ad_id         text,
  tags               text[] DEFAULT '{}',
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_conv_tenant ON ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS ix_ai_conv_estado ON ai_conversations(estado);
CREATE INDEX IF NOT EXISTS ix_ai_conv_contact ON ai_conversations(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS ix_ai_conv_ultimo ON ai_conversations(ultimo_mensaje_at DESC);

-- 10) Mensajes (inbox unificado)
CREATE TABLE IF NOT EXISTS ai_messages (
  id                text PRIMARY KEY,
  conversation_id   text REFERENCES ai_conversations(id) ON DELETE CASCADE,
  tenant_id         text,                     -- denormalizado
  rol               text NOT NULL CHECK (rol IN ('user','assistant','system','tool')),
  contenido         text,
  media_url         text,
  media_type        text,                     -- image|audio|video|document
  tool_calls        jsonb,                    -- [{name, input, output}]
  origen            text,                     -- 'user','agent','human','system'
  autor_email       text,                     -- si es humano
  usage_tokens_in   integer,
  usage_tokens_out  integer,
  usage_cost_usd    numeric,
  provider_msg_id   text,                     -- id nativo WA/IG para dedup
  status            text DEFAULT 'sent',      -- sent|delivered|read|failed
  error             text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_msg_conv ON ai_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ix_ai_msg_provider ON ai_messages(provider_msg_id) WHERE provider_msg_id IS NOT NULL;

-- 11) Follow-ups automáticos (recuperación de leads)
CREATE TABLE IF NOT EXISTS ai_followups (
  id              text PRIMARY KEY,
  conversation_id text REFERENCES ai_conversations(id) ON DELETE CASCADE,
  tenant_id       text,
  motivo          text,                       -- 'no_respondio_24h','abandono_pago','cotizacion_sin_cerrar'
  programado_para timestamptz NOT NULL,
  ejecutado_at    timestamptz,
  estado          text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','ejecutado','cancelado')),
  mensaje         text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_followups_prog ON ai_followups(estado, programado_para);

-- 12) Campañas WA/IG salientes (broadcast)
CREATE TABLE IF NOT EXISTS ai_campaigns (
  id               text PRIMARY KEY,
  tenant_id        text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  nombre           text NOT NULL,
  canal_tipo       text NOT NULL,             -- 'whatsapp'|'instagram'|'email'
  template_id      text,                       -- Meta approved template id
  segmento_sql     text,                       -- SELECT que retorna contact_id, nombre, vars
  segmento_meta    jsonb,                      -- filtros amigables
  estado           text DEFAULT 'borrador' CHECK (estado IN ('borrador','programada','enviando','completada','cancelada')),
  programada_para  timestamptz,
  enviados         integer DEFAULT 0,
  entregados       integer DEFAULT 0,
  leidos           integer DEFAULT 0,
  respuestas       integer DEFAULT 0,
  conversiones     integer DEFAULT 0,
  created_by       text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_campaigns_tenant ON ai_campaigns(tenant_id);

-- 13) Uso / billing (tokens consumidos por tenant)
CREATE TABLE IF NOT EXISTS ai_usage (
  id            bigserial PRIMARY KEY,
  tenant_id     text REFERENCES ai_tenants(id) ON DELETE CASCADE,
  fecha         date DEFAULT CURRENT_DATE,
  model         text,
  tokens_in     integer DEFAULT 0,
  tokens_out    integer DEFAULT 0,
  cost_usd      numeric DEFAULT 0,
  conversations integer DEFAULT 0,
  messages      integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_ai_usage_tenant_fecha ON ai_usage(tenant_id, fecha DESC);

-- =====================================================================
-- Seed inicial: tenant "Atolon" + agente + working hours
-- =====================================================================
INSERT INTO ai_tenants (id, nombre, slug, timezone, color, activo)
VALUES ('T-ATOLON', 'Atolón Beach Club', 'atolon', 'America/Bogota', '#38bdf8', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_agents (id, tenant_id, nombre, descripcion, model, base_style,
                       usa_emoji, message_length, conversation_scope, assistant_name,
                       custom_instructions)
VALUES (
  'AGT-ATOLON-MAIN', 'T-ATOLON', 'Concierge Atolón',
  'Agente principal de ventas/atencion para Atolón Beach Club',
  'claude-sonnet-4-5-20250929', 'luxury', true, 'default', 'business', 'Sofía',
  'Eres Sofía, la concierge virtual de Atolón Beach Club (isla privada de Cartagena). ' ||
  'Habla siempre en primera persona como Atolón. Sé cálida, profesional y concisa. ' ||
  E'\n\n' ||
  'REGLAS:\n' ||
  '- Si el cliente pregunta por precios o disponibilidad, usa las herramientas antes de responder.\n' ||
  '- Nunca inventes fechas u ofertas. Si no lo sabes, pide un momento y pasa a un asesor humano.\n' ||
  '- Sé breve. 2-3 líneas máximo por respuesta salvo que pidan detalle.\n' ||
  '- Precios en COP con separador de miles.\n' ||
  '- Cuando el cliente esté listo para pagar, genera el link con la herramienta correspondiente.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_working_hours (tenant_id, activo)
VALUES ('T-ATOLON', false)
ON CONFLICT (tenant_id) DO NOTHING;

-- Handoff rules builtin
INSERT INTO ai_handoff_rules (id, tenant_id, nombre, descripcion, scope, trigger_keywords, action, orden)
VALUES
  ('HR-ATOLON-1', 'T-ATOLON', 'Solicita hablar con humano', 'Cliente pide humano/asesor', 'all',
   ARRAY['asesor','humano','persona','agente','representante'], 'notify', 10),
  ('HR-ATOLON-2', 'T-ATOLON', 'Grupo grande (>10 pax)', 'Grupos requieren cotización manual', 'pasadias',
   ARRAY['grupo','10 personas','15 personas','20 personas','evento'], 'notify', 20),
  ('HR-ATOLON-3', 'T-ATOLON', 'Queja o problema', 'Cliente reporta problema', 'all',
   ARRAY['queja','problema','reclamo','mal servicio','molesto','decepcion'], 'notify', 5)
ON CONFLICT (id) DO NOTHING;

-- Tools builtin (schemas)
INSERT INTO ai_tools (id, tenant_id, nombre, descripcion, input_schema, endpoint, is_builtin)
VALUES
  ('TL-DISP-PASADIA', 'T-ATOLON', 'check_disponibilidad_pasadia',
   'Consulta la disponibilidad y precios de pasadías para una fecha y número de personas',
   '{"type":"object","properties":{"fecha":{"type":"string","format":"date","description":"YYYY-MM-DD"},"pax_adultos":{"type":"integer"},"pax_ninos":{"type":"integer"}},"required":["fecha","pax_adultos"]}'::jsonb,
   'concierge-tool-disponibilidad-pasadia', true),
  ('TL-PRECIOS-PASADIA', 'T-ATOLON', 'get_precios_pasadias',
   'Retorna los precios vigentes de todos los tipos de pasadía',
   '{"type":"object","properties":{"fecha":{"type":"string","format":"date"}}}'::jsonb,
   'concierge-tool-precios-pasadias', true),
  ('TL-CREAR-RESERVA', 'T-ATOLON', 'crear_reserva_pendiente',
   'Crea una reserva pendiente de pago y retorna el link de pago',
   '{"type":"object","properties":{"tipo":{"type":"string","enum":["VIP Pass","Exclusive Pass"]},"fecha":{"type":"string"},"pax_a":{"type":"integer"},"pax_n":{"type":"integer"},"nombre":{"type":"string"},"telefono":{"type":"string"},"email":{"type":"string"}},"required":["tipo","fecha","pax_a","nombre","telefono"]}'::jsonb,
   'concierge-tool-crear-reserva', true),
  ('TL-HOTEL-DISP', 'T-ATOLON', 'check_hotel_disponibilidad',
   'Consulta disponibilidad y tarifas de habitaciones en Castillete',
   '{"type":"object","properties":{"checkin":{"type":"string"},"checkout":{"type":"string"},"adultos":{"type":"integer"},"ninos":{"type":"integer"}},"required":["checkin","checkout","adultos"]}'::jsonb,
   'concierge-tool-hotel-disponibilidad', true),
  ('TL-EVENTOS-COTI', 'T-ATOLON', 'cotizar_evento',
   'Genera cotización preliminar de evento (boda/corporativo)',
   '{"type":"object","properties":{"tipo_evento":{"type":"string"},"fecha":{"type":"string"},"pax":{"type":"integer"},"detalles":{"type":"string"}},"required":["tipo_evento","fecha","pax"]}'::jsonb,
   'concierge-tool-cotizar-evento', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: super_admin/admin/direccion + módulo 'concierge_ai'
ALTER TABLE ai_tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_base    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_handoff_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_working_hours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_channels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_integrations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tools             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_followups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage             ENABLE ROW LEVEL SECURITY;

-- Policy común: authenticated con rol privilegiado o modulo concierge_ai
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_tenants','ai_agents','ai_knowledge_base','ai_handoff_rules',
    'ai_working_hours','ai_channels','ai_integrations','ai_tools',
    'ai_conversations','ai_messages','ai_followups','ai_campaigns','ai_usage'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_all ON %I FOR ALL TO authenticated ' ||
      'USING (EXISTS (SELECT 1 FROM usuarios u ' ||
      '               WHERE lower(u.email)=lower(auth.jwt()->>''email'') ' ||
      '                 AND u.activo=true ' ||
      '                 AND (u.rol_id IN (''super_admin'',''admin'',''direccion'') OR ''concierge_ai''=ANY(u.modulos)))) ' ||
      'WITH CHECK (EXISTS (SELECT 1 FROM usuarios u ' ||
      '               WHERE lower(u.email)=lower(auth.jwt()->>''email'') ' ||
      '                 AND u.activo=true ' ||
      '                 AND (u.rol_id IN (''super_admin'',''admin'',''direccion'') OR ''concierge_ai''=ANY(u.modulos))));',
      t, t
    );
  END LOOP;
END $$;
