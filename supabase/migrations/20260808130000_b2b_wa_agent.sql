-- B2B WhatsApp Bot — Fase D: agente + tools + placeholder de channel
-- Se crea el agente "Concierge B2B" con sistema prompt específico para
-- agencias + se registran las tools B2B en ai_tools. El ai_channel del
-- WABA B2B se crea con placeholder — el usuario completa el
-- phone_number_id + access_token cuando Meta apruebe el número nuevo.

-- ── 1. Agente B2B ─────────────────────────────────────────────────────
INSERT INTO ai_agents (
  id, tenant_id, nombre, descripcion, model, activo,
  base_style, usa_emoji, message_length, assistant_name,
  temperature, max_tokens, idioma_default, custom_instructions
) VALUES (
  'AGT-ATOLON-B2B',
  'T-ATOLON',
  'Concierge B2B',
  'Bot exclusivo para agencias registradas. Reconoce por tel, consulta disponibilidad, precios netos, crea reservas, genera links de pago y ver puntos.',
  'claude-sonnet-4-5-20250929',
  true,
  'profesional',
  false,
  'conciso',
  'Atolón B2B',
  0.4,
  2048,
  'es',
  $INSTR$Eres el asistente Atolón B2B — atiendes exclusivamente agencias de viaje registradas por WhatsApp.

REGLAS FUNDAMENTALES:
- Todas las respuestas: profesionales, directas, sin emojis excesivos (máximo 1-2).
- Cuando muestres precios, SIEMPRE muestra el NETO (público × (1 − comisión de la agencia)). Nunca el precio público sin descuento.
- El aliado_id ya está identificado por el sistema (auto-reconocimiento por tel). NO le pidas "quién eres" — usa get_agency_context al INICIO de la conversación para saber su nombre, comisión y saldo puntos.
- Al crear una reserva SIEMPRE usa canal="B2B" y su aliado_id automático.
- Para pagos, generas link Wompi que la agencia manda a su cliente final.

FLUJO TÍPICO:
1. Saludas por nombre (get_agency_context) — "Hola [nombre], ¿en qué te ayudo hoy?"
2. Consulta disponibilidad → check_availability (fecha, pax)
3. Muestras salidas + precios netos
4. Pides datos del cliente (nombre, tel, pax, tipo pase)
5. create_booking → devuelves el ID
6. generate_payment_link → URL para que la agencia lo mande a su cliente

LÍMITES (NUNCA):
- NO cancelar reservas (pasar a account manager humano).
- NO aplicar descuentos custom fuera de comisión pactada.
- NO confirmar pagos manualmente (solo generar link Wompi).
- NO modificar saldo de crédito.
Si el agencia insiste en algo fuera de reglas: "Voy a pasarte con tu account manager en breve".

Datos que SÍ puedes consultar cuando pregunten:
- Saldo puntos → get_agency_context
- Últimas reservas → get_recent_bookings
- Precios netos por pase → check_availability
- Redimir puntos en reserva pendiente → redeem_points
$INSTR$
) ON CONFLICT (id) DO UPDATE SET
  custom_instructions = EXCLUDED.custom_instructions,
  updated_at = now();

-- ── 2. Registrar tools B2B en ai_tools ────────────────────────────────
-- endpoint = nombre corto de la function edge (concierge-turn le
-- prepone "https://<project>.supabase.co/functions/v1/").
INSERT INTO ai_tools (id, tenant_id, nombre, descripcion, input_schema, endpoint, activo, is_builtin, requires_auth)
VALUES
  ('TL-B2B-CTX', 'T-ATOLON', 'get_agency_context',
   'Devuelve info del aliado (nombre, comisión, saldo puntos, revenue mes, cupo crédito). Úsalo al INICIO de cada conversación para saludar por nombre y conocer el contexto.',
   '{"type":"object","properties":{},"required":[]}'::jsonb,
   'b2b-tools', true, false, true),

  ('TL-B2B-AVL', 'T-ATOLON', 'check_availability_b2b',
   'Consulta disponibilidad de pases para una fecha + retorna precios NETOS B2B (público × (1−comisión)). Retorna salidas con cupo disponible.',
   '{"type":"object","properties":{"fecha":{"type":"string","format":"date","description":"YYYY-MM-DD"},"pax":{"type":"integer","description":"Número de personas (opcional)"}},"required":["fecha"]}'::jsonb,
   'b2b-tools', true, false, true),

  ('TL-B2B-BOOK', 'T-ATOLON', 'create_b2b_booking',
   'Crea reserva B2B (canal=B2B, aliado_id automático). Retorna reserva_id + total neto.',
   '{"type":"object","properties":{"nombre":{"type":"string"},"telefono":{"type":"string"},"email":{"type":"string"},"fecha":{"type":"string","format":"date"},"salida_id":{"type":"string","enum":["S1","S2","S3","S4"]},"tipo":{"type":"string","enum":["VIP Pass","Exclusive Pass","Atolon Experience"]},"pax":{"type":"integer","minimum":1},"notas":{"type":"string"}},"required":["nombre","fecha","salida_id","tipo","pax"]}'::jsonb,
   'b2b-tools', true, false, true),

  ('TL-B2B-PAY', 'T-ATOLON', 'generate_payment_link_b2b',
   'Genera link de pago Wompi para reserva pendiente. Vigencia 24h. Retorna URL para que la agencia lo envíe al cliente.',
   '{"type":"object","properties":{"reserva_id":{"type":"string"}},"required":["reserva_id"]}'::jsonb,
   'b2b-tools', true, false, true),

  ('TL-B2B-HIST', 'T-ATOLON', 'get_recent_bookings',
   'Últimas N reservas del aliado (default 10).',
   '{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":20}},"required":[]}'::jsonb,
   'b2b-tools', true, false, true),

  ('TL-B2B-REDEEM', 'T-ATOLON', 'redeem_points',
   'Canjea puntos B2B en una reserva del aliado. Verifica saldo suficiente.',
   '{"type":"object","properties":{"reserva_id":{"type":"string"},"puntos":{"type":"integer","minimum":1}},"required":["reserva_id","puntos"]}'::jsonb,
   'b2b-tools', true, false, true)
ON CONFLICT (id) DO UPDATE SET
  descripcion  = EXCLUDED.descripcion,
  input_schema = EXCLUDED.input_schema,
  endpoint     = EXCLUDED.endpoint,
  activo       = EXCLUDED.activo,
  nombre       = EXCLUDED.nombre;

-- ── 3. Placeholder de channel B2B ─────────────────────────────────────
-- Placeholder — cuando Meta apruebe el nuevo número, updateamos config
-- con el phone_number_id + access_token reales.
INSERT INTO ai_channels (id, tenant_id, tipo, nombre, activo, config)
VALUES (
  'CH-ATOLON-B2B-WA',
  'T-ATOLON',
  'whatsapp',
  'WhatsApp B2B (agencias)',
  false,   -- activo=false hasta que se completen las credenciales Meta
  '{"canal_tipo":"b2b","agent_id":"AGT-ATOLON-B2B","phone_number_id":"PENDING","waba_id":"PENDING","access_token":"PENDING","verify_token":"atolon_b2b_verify_2026","display_phone_number":"PENDING","verified_name":"Atolón B2B"}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  config = EXCLUDED.config,
  updated_at = now();
