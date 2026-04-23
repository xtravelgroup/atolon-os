-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO: CARRITO ABANDONADO — SCHEMA + SEED DATA
-- Atolón Beach Club — Integrado en atolon-os
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. ac_carts — Un registro por sesión de checkout ────────────────────────
CREATE TABLE IF NOT EXISTS ac_carts (
  id                    text PRIMARY KEY,        -- "AC-{timestamp}"
  sesion_id             text,                    -- → track_sesiones.id
  reserva_id            text,                    -- → reservas.id (si llegó a pagar)

  -- Contacto
  email                 text NOT NULL,
  nombre                text,
  apellido              text,
  telefono              text,

  -- Producto seleccionado
  producto              text,                    -- 'VIP Pass', 'Exclusive Pass', etc.
  tipo_pase             text,                    -- slug: 'vip-pass'
  pasadia_id            text,                    -- 'PAS-VIP', etc.
  fecha_visita          date,
  salida_id             text,
  pax_adultos           int     DEFAULT 0,
  pax_ninos             int     DEFAULT 0,
  pax_total             int     DEFAULT 0,
  valor_total           numeric DEFAULT 0,
  moneda                text    DEFAULT 'COP',
  upsells               jsonb,

  -- Atribución & contexto
  idioma                text    DEFAULT 'es',
  pais                  text,
  ciudad                text,
  device_type           text,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  utm_content           text,
  utm_term              text,
  landing_page          text,
  checkout_url          text,

  -- Recovery link
  recovery_token        text    UNIQUE,
  recovery_expires_at   timestamptz,

  -- Estado del carrito
  -- initiated | checkout_started | abandoned |
  -- email_1_sent | email_2_sent | email_3_sent | email_4_sent |
  -- recovered | expired | unsubscribed | stopped | bounced
  estado                text    DEFAULT 'initiated',
  emails_enviados       int     DEFAULT 0,
  ultimo_email_enviado  text,                    -- 'email_1' | 'email_2' | ...
  ultimo_email_at       timestamptz,
  email_abierto         boolean DEFAULT false,
  email_clicked         boolean DEFAULT false,
  unsubscribed          boolean DEFAULT false,
  flow_pausado          boolean DEFAULT false,

  -- Timestamps clave
  checkout_started_at   timestamptz,
  abandoned_at          timestamptz,
  recovered_at          timestamptz,

  notas_internas        text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ac_carts_email_idx     ON ac_carts(email);
CREATE INDEX IF NOT EXISTS ac_carts_estado_idx    ON ac_carts(estado);
CREATE INDEX IF NOT EXISTS ac_carts_token_idx     ON ac_carts(recovery_token);
CREATE INDEX IF NOT EXISTS ac_carts_abandoned_idx ON ac_carts(abandoned_at) WHERE abandoned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ac_carts_reserva_idx   ON ac_carts(reserva_id) WHERE reserva_id IS NOT NULL;

-- ─── 2. ac_email_templates — Plantillas editables ────────────────────────────
CREATE TABLE IF NOT EXISTS ac_email_templates (
  id              text PRIMARY KEY,              -- 'email_1' .. 'email_4'
  nombre          text        NOT NULL,
  delay_horas     numeric     NOT NULL,          -- horas después de abandoned_at
  activo          boolean     DEFAULT true,
  asunto          text        NOT NULL,
  preheader       text,
  body_html       text        NOT NULL,          -- HTML completo del email
  body_texto      text,                          -- Versión texto plano
  cta_texto       text        DEFAULT 'Completar mi reserva →',
  cta_link_var    text        DEFAULT '{{recovery_link}}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─── 3. ac_email_queue — Cola de emails programados ──────────────────────────
CREATE TABLE IF NOT EXISTS ac_email_queue (
  id              text PRIMARY KEY,
  cart_id         text REFERENCES ac_carts(id) ON DELETE CASCADE,
  template_id     text REFERENCES ac_email_templates(id),
  scheduled_for   timestamptz NOT NULL,
  sent_at         timestamptz,
  estado          text        DEFAULT 'pending',
  -- pending | sent | failed | cancelled | skipped
  error_msg       text,
  intentos        int         DEFAULT 0,
  resend_id       text,                          -- ID de mensaje en Resend
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ac_queue_pending_idx ON ac_email_queue(scheduled_for) WHERE estado = 'pending';
CREATE INDEX IF NOT EXISTS ac_queue_cart_idx    ON ac_email_queue(cart_id);

-- ─── 4. ac_email_events — Tracking: opens, clicks, etc. ─────────────────────
CREATE TABLE IF NOT EXISTS ac_email_events (
  id              text PRIMARY KEY,
  cart_id         text REFERENCES ac_carts(id) ON DELETE CASCADE,
  queue_id        text REFERENCES ac_email_queue(id) ON DELETE SET NULL,
  template_id     text,
  tipo            text NOT NULL,
  -- sent | opened | clicked | bounced | unsubscribed | cart_recovered
  url_clicked     text,
  ip              text,
  user_agent      text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ac_events_cart_idx ON ac_email_events(cart_id);
CREATE INDEX IF NOT EXISTS ac_events_tipo_idx ON ac_email_events(tipo);

-- ─── 5. ac_flow_settings — Configuración global ──────────────────────────────
CREATE TABLE IF NOT EXISTS ac_flow_settings (
  id                            text        PRIMARY KEY DEFAULT 'default',
  activo                        boolean     DEFAULT true,
  abandono_delay_minutos        int         DEFAULT 60,
  recovery_link_expires_horas   int         DEFAULT 72,
  from_email                    text        DEFAULT 'reservas@atolon.co',
  from_nombre                   text        DEFAULT 'Atolón Beach Club',
  reply_to                      text        DEFAULT 'hola@atolon.co',
  homepage_url                  text        DEFAULT 'https://atolon.co',
  booking_url                   text        DEFAULT 'https://atolon.co/booking',
  max_emails_por_contacto_dias  int         DEFAULT 7,
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now()
);

INSERT INTO ac_flow_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ─── 6. RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE ac_carts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ac_email_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ac_email_queue      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ac_email_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ac_flow_settings    ENABLE ROW LEVEL SECURITY;

-- Anon: solo puede insertar/actualizar su propio cart (desde BookingPopup)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_cart' AND tablename = 'ac_carts') THEN
    CREATE POLICY anon_insert_cart ON ac_carts FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_update_cart' AND tablename = 'ac_carts') THEN
    CREATE POLICY anon_update_cart ON ac_carts FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_cart_by_token' AND tablename = 'ac_carts') THEN
    CREATE POLICY anon_select_cart_by_token ON ac_carts FOR SELECT TO anon USING (recovery_token IS NOT NULL);
  END IF;
END $$;

-- Auth (admin): acceso completo a todo
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_carts' AND tablename = 'ac_carts') THEN
    CREATE POLICY auth_all_carts         ON ac_carts            FOR ALL TO authenticated USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_templates' AND tablename = 'ac_email_templates') THEN
    CREATE POLICY auth_all_templates     ON ac_email_templates  FOR ALL TO authenticated USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_queue' AND tablename = 'ac_email_queue') THEN
    CREATE POLICY auth_all_queue         ON ac_email_queue      FOR ALL TO authenticated USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_events' AND tablename = 'ac_email_events') THEN
    CREATE POLICY auth_all_events        ON ac_email_events     FOR ALL TO authenticated USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_settings' AND tablename = 'ac_flow_settings') THEN
    CREATE POLICY auth_all_settings      ON ac_flow_settings    FOR ALL TO authenticated USING (true);
  END IF;
END $$;
-- Anon: read templates and settings (needed for recovery flow)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_read_templates' AND tablename = 'ac_email_templates') THEN
    CREATE POLICY anon_read_templates    ON ac_email_templates  FOR SELECT TO anon USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_read_settings' AND tablename = 'ac_flow_settings') THEN
    CREATE POLICY anon_read_settings     ON ac_flow_settings    FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- ─── 7. Seed: 4 plantillas de email ──────────────────────────────────────────
INSERT INTO ac_email_templates (id, nombre, delay_horas, activo, asunto, preheader, cta_texto, cta_link_var, body_html, body_texto)
VALUES

-- EMAIL 1: 1 hora — Recordación + Emoción
('email_1', 'Email 1 — Recordación', 1, true,
 'Tu experiencia en Atolón te está esperando 🌊',
 'No pierdas tu fecha seleccionada',
 'Completar mi reserva →',
 '{{recovery_link}}',
$HTML1$<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Tu experiencia en Atolón te está esperando 🌊</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ed;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f5f2ed;">No pierdas tu fecha seleccionada ·&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f2ed;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">

  <!-- Logo -->
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://atolon.co/atolon-peces.png" alt="Atolón Beach Club" width="110" style="display:block;" />
  </td></tr>

  <!-- Card -->
  <tr><td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(13,27,62,0.10);">

    <!-- Hero -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:linear-gradient(160deg,#0D1B3E 0%,#1a3a72 60%,#0e4a6e 100%);padding:44px 32px 36px;text-align:center;">
      <div style="font-size:44px;margin-bottom:14px;">🌊</div>
      <h1 style="margin:0 0 10px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">Tu experiencia te está esperando</h1>
      <p style="margin:0;font-size:15px;color:rgba(200,185,154,0.9);line-height:1.5;">Dejaste tu reserva en proceso en Atolón Beach Club</p>
    </td></tr>
    </table>

    <!-- Body -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 36px 8px;">

      <p style="margin:0 0 20px;font-size:16px;color:#0F172A;line-height:1.6;">Hola <strong>{{nombre}}</strong>,</p>

      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">Imagina esto:</p>

      <!-- Benefits list -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:20px;padding-right:14px;">🌴</td>
            <td style="font-size:14px;color:#334155;line-height:1.5;">Llegas en lancha en solo <strong>15–20 minutos</strong></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:20px;padding-right:14px;">🍹</td>
            <td style="font-size:14px;color:#334155;line-height:1.5;">Recibes tu <strong>welcome cocktail</strong> al llegar</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:20px;padding-right:14px;">🍽</td>
            <td style="font-size:14px;color:#334155;line-height:1.5;">Disfrutas un <strong>almuerzo frente al mar</strong></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:20px;padding-right:14px;">🛏</td>
            <td style="font-size:14px;color:#334155;line-height:1.5;">Descansas en <strong>camas de playa o piscina</strong></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 0;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:20px;padding-right:14px;">🌊</td>
            <td style="font-size:14px;color:#334155;line-height:1.5;">Música, ambiente y <strong>servicio exclusivo</strong></td>
          </tr></table>
        </td></tr>
      </table>

      <!-- Fecha card -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
      <tr><td style="background:#f8f7f5;border-radius:12px;padding:16px 20px;border-left:4px solid #C8B99A;">
        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Tu fecha seleccionada</div>
        <div style="font-size:17px;font-weight:700;color:#0D1B3E;">📅 {{fecha}}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">{{producto}} · {{pax_total}} personas</div>
      </td></tr>
      </table>

    </td></tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 36px 16px;text-align:center;">
      <a href="{{recovery_link}}" style="display:inline-block;background:#0D1B3E;color:#ffffff;text-decoration:none;padding:16px 44px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:0.3px;min-width:200px;">Completar mi reserva →</a>
    </td></tr>
    </table>

    <!-- Warning -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:16px 36px;text-align:center;">
      <p style="margin:0;font-size:13px;color:#94a3b8;">⚠️ Trabajamos con cupos limitados por día.</p>
    </td></tr>
    </table>

    <!-- Divider + sign-off -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:20px 36px 36px;border-top:1px solid #f1f5f9;">
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Nos vemos en la isla,<br><strong style="color:#0D1B3E;">Equipo Atolón</strong></p>
    </td></tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0 8px;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">Atolón Beach Club · Barú, Cartagena, Colombia</p>
    <p style="margin:0;font-size:11px;color:#cbd5e1;"><a href="{{unsubscribe_link}}" style="color:#94a3b8;text-decoration:underline;">No quiero recibir más correos de Atolón</a></p>
  </td></tr>

  <!-- Tracking pixel -->
  <tr><td><img src="{{open_pixel_url}}" width="1" height="1" alt="" style="display:block;" /></td></tr>

</table>
</td></tr>
</table>
</body>
</html>$HTML1$,
$TXT1$Hola {{nombre}},

Notamos que dejaste tu reserva en proceso en Atolón Beach Club.

Imagina esto:
🌴 Llegas en lancha en solo 15–20 minutos
🍹 Recibes tu welcome cocktail
🍽 Disfrutas un almuerzo frente al mar
🛏 Descansas en camas de playa o piscina
🌊 Música, ambiente y servicio exclusivo

Tu fecha seleccionada:
📅 {{fecha}}
{{producto}} · {{pax_total}} personas

Completa tu reserva aquí:
{{recovery_link}}

⚠️ Trabajamos con cupos limitados por día.

Nos vemos en la isla,
Equipo Atolón

---
No quiero recibir más correos de Atolón: {{unsubscribe_link}}$TXT1$),

-- EMAIL 2: 6 horas — Urgencia suave
('email_2', 'Email 2 — Urgencia', 6, true,
 'Tu fecha en Atolón se está llenando',
 'Quedan pocos cupos disponibles',
 'Asegurar mi lugar →',
 '{{recovery_link}}',
$HTML2$<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Tu fecha en Atolón se está llenando</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ed;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f5f2ed;">Quedan pocos cupos disponibles ·&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f2ed;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">

  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://atolon.co/atolon-peces.png" alt="Atolón Beach Club" width="110" style="display:block;" />
  </td></tr>

  <tr><td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(13,27,62,0.10);">

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:linear-gradient(160deg,#1a1a2e 0%,#2d1b69 60%,#0D1B3E 100%);padding:44px 32px 36px;text-align:center;">
      <div style="font-size:44px;margin-bottom:14px;">⏳</div>
      <h1 style="margin:0 0 10px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">Tu fecha se está llenando</h1>
      <p style="margin:0;font-size:15px;color:rgba(200,185,154,0.9);line-height:1.5;">La disponibilidad para {{fecha}} está bajando</p>
    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 36px 8px;">

      <p style="margin:0 0 20px;font-size:16px;color:#0F172A;line-height:1.6;">Hola <strong>{{nombre}}</strong>,</p>

      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">Solo para avisarte que la disponibilidad para <strong>{{fecha}}</strong> está bajando.</p>

      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">En Atolón Beach Club limitamos el acceso diario para garantizar una <strong>experiencia exclusiva</strong>. Tu reserva aún está disponible, pero no por mucho tiempo.</p>

      <!-- Urgency indicator -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td style="background:#fff8f0;border-radius:12px;padding:18px 20px;border:1.5px solid #f59e0b;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-size:22px;padding-right:14px;">🔥</td>
          <td>
            <div style="font-size:14px;font-weight:700;color:#92400e;margin-bottom:2px;">Alta demanda para esta fecha</div>
            <div style="font-size:13px;color:#b45309;">Tu reserva aún está disponible — pero no podemos garantizarlo por mucho más.</div>
          </td>
        </tr></table>
      </td></tr>
      </table>

      <!-- Fecha card -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
      <tr><td style="background:#f8f7f5;border-radius:12px;padding:16px 20px;border-left:4px solid #C8B99A;">
        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Tu reserva pendiente</div>
        <div style="font-size:17px;font-weight:700;color:#0D1B3E;">📅 {{fecha}}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">{{producto}} · {{pax_total}} personas</div>
      </td></tr>
      </table>

    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 36px 16px;text-align:center;">
      <a href="{{recovery_link}}" style="display:inline-block;background:#0D1B3E;color:#ffffff;text-decoration:none;padding:16px 44px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:0.3px;min-width:200px;">Asegurar mi lugar →</a>
    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:16px 36px;text-align:center;">
      <p style="margin:0;font-size:13px;color:#94a3b8;">Si necesitas ayuda, estamos atentos para asistirte.</p>
    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:20px 36px 36px;border-top:1px solid #f1f5f9;">
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Equipo Atolón</p>
    </td></tr>
    </table>

  </td></tr>

  <tr><td style="padding:24px 0 8px;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">Atolón Beach Club · Barú, Cartagena, Colombia</p>
    <p style="margin:0;font-size:11px;"><a href="{{unsubscribe_link}}" style="color:#94a3b8;text-decoration:underline;">No quiero recibir más correos de Atolón</a></p>
  </td></tr>
  <tr><td><img src="{{open_pixel_url}}" width="1" height="1" alt="" style="display:block;" /></td></tr>

</table>
</td></tr>
</table>
</body>
</html>$HTML2$,
$TXT2$Hola {{nombre}},

Solo para avisarte que la disponibilidad para {{fecha}} está bajando.

En Atolón Beach Club limitamos el acceso diario para garantizar una experiencia exclusiva.

Tu reserva aún está disponible, pero no por mucho tiempo.

Finaliza aquí:
{{recovery_link}}

Si necesitas ayuda, estamos atentos para asistirte.

Equipo Atolón

---
No quiero recibir más correos de Atolón: {{unsubscribe_link}}$TXT2$),

-- EMAIL 3: 24 horas — Incentivo no monetario
('email_3', 'Email 3 — Incentivo', 24, true,
 'Último chance para tu experiencia en Atolón',
 'Incluye un beneficio especial hoy',
 'Reclamar mi beneficio →',
 '{{recovery_link}}',
$HTML3$<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Último chance para tu experiencia en Atolón</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ed;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f5f2ed;">Incluye un beneficio especial hoy ·&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f2ed;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">

  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://atolon.co/atolon-peces.png" alt="Atolón Beach Club" width="110" style="display:block;" />
  </td></tr>

  <tr><td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(13,27,62,0.10);">

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:linear-gradient(160deg,#0D1B3E 0%,#0f4c75 60%,#1b262c 100%);padding:44px 32px 36px;text-align:center;">
      <div style="font-size:44px;margin-bottom:14px;">🎁</div>
      <h1 style="margin:0 0 10px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">Tu reserva está a punto de liberarse</h1>
      <p style="margin:0;font-size:15px;color:rgba(200,185,154,0.9);line-height:1.5;">Pero tenemos algo especial para ti</p>
    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 36px 8px;">

      <p style="margin:0 0 20px;font-size:16px;color:#0F172A;line-height:1.6;">Hola <strong>{{nombre}}</strong>,</p>

      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">Tu reserva en Atolón Beach Club está a punto de liberarse. Si completas <strong>hoy</strong>, te incluimos:</p>

      <!-- Special benefit -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td style="background:linear-gradient(135deg,#C8B99A22,#C8B99A11);border-radius:16px;padding:22px 24px;border:1.5px solid #C8B99A55;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="font-size:28px;padding-right:16px;vertical-align:top;">🌟</td>
          <td>
            <div style="font-size:15px;font-weight:800;color:#0D1B3E;margin-bottom:6px;">Mejor ubicación disponible</div>
            <div style="font-size:13px;color:#475569;line-height:1.5;">Playa o piscina según disponibilidad — garantizamos que tengas el mejor lugar del día para ti.</div>
          </td>
        </tr></table>
      </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
      <tr><td style="background:#f8f7f5;border-radius:12px;padding:16px 20px;border-left:4px solid #C8B99A;">
        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Tu fecha</div>
        <div style="font-size:17px;font-weight:700;color:#0D1B3E;">📅 {{fecha}}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">{{producto}} · {{pax_total}} personas</div>
      </td></tr>
      </table>

      <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;text-align:center;">Después de hoy, no podemos garantizar disponibilidad.</p>

    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:8px 36px 16px;text-align:center;">
      <a href="{{recovery_link}}" style="display:inline-block;background:#0D1B3E;color:#ffffff;text-decoration:none;padding:16px 44px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:0.3px;min-width:200px;">Reclamar mi beneficio →</a>
    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:20px 36px 36px;border-top:1px solid #f1f5f9;">
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Nos vemos en la isla,<br><strong style="color:#0D1B3E;">Equipo Atolón</strong></p>
    </td></tr>
    </table>

  </td></tr>

  <tr><td style="padding:24px 0 8px;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">Atolón Beach Club · Barú, Cartagena, Colombia</p>
    <p style="margin:0;font-size:11px;"><a href="{{unsubscribe_link}}" style="color:#94a3b8;text-decoration:underline;">No quiero recibir más correos de Atolón</a></p>
  </td></tr>
  <tr><td><img src="{{open_pixel_url}}" width="1" height="1" alt="" style="display:block;" /></td></tr>

</table>
</td></tr>
</table>
</body>
</html>$HTML3$,
$TXT3$Hola {{nombre}},

Tu reserva en Atolón Beach Club está a punto de liberarse.

Si completas hoy, te incluimos:
🎁 Mejor ubicación disponible en playa o piscina (según disponibilidad)

Tu fecha:
📅 {{fecha}}
{{producto}} · {{pax_total}} personas

Finaliza aquí:
{{recovery_link}}

Después de hoy, no podemos garantizar disponibilidad.

Nos vemos en la isla,
Equipo Atolón

---
No quiero recibir más correos de Atolón: {{unsubscribe_link}}$TXT3$),

-- EMAIL 4: 48 horas — Cierre final
('email_4', 'Email 4 — Cierre final', 48, true,
 'Tu reserva expiró (pero aún puedes volver)',
 'Revisa nuevas fechas disponibles',
 'Ver nuevas fechas →',
 '{{homepage_link}}',
$HTML4$<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Tu reserva expiró — pero aún puedes volver</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ed;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f5f2ed;">Revisa nuevas fechas disponibles ·&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f2ed;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">

  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://atolon.co/atolon-peces.png" alt="Atolón Beach Club" width="110" style="display:block;" />
  </td></tr>

  <tr><td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(13,27,62,0.10);">

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:linear-gradient(160deg,#1e293b 0%,#0D1B3E 100%);padding:44px 32px 36px;text-align:center;">
      <div style="font-size:44px;margin-bottom:14px;">🏝️</div>
      <h1 style="margin:0 0 10px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">Tu intento de reserva expiró</h1>
      <p style="margin:0;font-size:15px;color:rgba(200,185,154,0.9);line-height:1.5;">La experiencia Atolón sigue esperándote</p>
    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:36px 36px 8px;">

      <p style="margin:0 0 20px;font-size:16px;color:#0F172A;line-height:1.6;">Hola <strong>{{nombre}}</strong>,</p>

      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">Tu intento de reserva en Atolón Beach Club ha expirado. La fecha <strong>{{fecha}}</strong> ya puede estar llena o cerrada.</p>

      <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.7;">Si aún quieres vivir la experiencia, puedes revisar nuevas fechas disponibles:</p>

      <!-- What they're missing -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
      <tr><td style="background:#f8f7f5;border-radius:12px;padding:20px 24px;">
        <div style="font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;font-weight:600;">Lo que te espera en Atolón</div>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:4px 0;font-size:14px;color:#334155;">🌴&nbsp; Lancha privada ida y vuelta</td></tr>
          <tr><td style="padding:4px 0;font-size:14px;color:#334155;">🍹&nbsp; Welcome cocktail incluido</td></tr>
          <tr><td style="padding:4px 0;font-size:14px;color:#334155;">🍽&nbsp; Almuerzo frente al mar</td></tr>
          <tr><td style="padding:4px 0;font-size:14px;color:#334155;">🛏&nbsp; Camas de playa y piscina</td></tr>
          <tr><td style="padding:4px 0;font-size:14px;color:#334155;">🌊&nbsp; Ambiente exclusivo en Barú</td></tr>
        </table>
      </td></tr>
      </table>

    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:0 36px 16px;text-align:center;">
      <a href="{{homepage_link}}" style="display:inline-block;background:#0D1B3E;color:#ffffff;text-decoration:none;padding:16px 44px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:0.3px;min-width:200px;">Ver nuevas fechas →</a>
    </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:20px 36px 36px;border-top:1px solid #f1f5f9;">
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Te esperamos pronto,<br><strong style="color:#0D1B3E;">Equipo Atolón</strong></p>
    </td></tr>
    </table>

  </td></tr>

  <tr><td style="padding:24px 0 8px;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">Atolón Beach Club · Barú, Cartagena, Colombia</p>
    <p style="margin:0;font-size:11px;"><a href="{{unsubscribe_link}}" style="color:#94a3b8;text-decoration:underline;">No quiero recibir más correos de Atolón</a></p>
  </td></tr>
  <tr><td><img src="{{open_pixel_url}}" width="1" height="1" alt="" style="display:block;" /></td></tr>

</table>
</td></tr>
</table>
</body>
</html>$HTML4$,
$TXT4$Hola {{nombre}},

Tu intento de reserva en Atolón Beach Club ha expirado.

La fecha {{fecha}} ya puede estar llena o cerrada.

Si aún quieres vivir la experiencia, puedes revisar nuevas fechas aquí:
{{homepage_link}}

Lo que te espera en Atolón:
🌴 Lancha privada ida y vuelta
🍹 Welcome cocktail incluido
🍽 Almuerzo frente al mar
🛏 Camas de playa y piscina
🌊 Ambiente exclusivo en Barú

Te esperamos pronto,
Equipo Atolón

---
No quiero recibir más correos de Atolón: {{unsubscribe_link}}$TXT4$)

ON CONFLICT (id) DO NOTHING;
