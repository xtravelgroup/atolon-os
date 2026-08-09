# Bot WhatsApp B2B — Setup y arquitectura

Sistema de atención automatizada por WhatsApp exclusivo para agencias
registradas en `aliados_b2b`. El bot reconoce al agente por su número de
teléfono, le permite consultar disponibilidad, precios netos, crear
reservas, generar links de pago y ver saldo de puntos — todo por chat.

## 🔧 Setup Meta Business (a cargo del owner del proyecto)

Este bot funciona con un **número WhatsApp Business dedicado** distinto
del principal (+1 786-917-3131 usado por Concierge). Yo no puedo comprar
ni verificar números en Meta — este proceso es 100% manual del owner.

### Pasos (proceso ~1-2 semanas total con aprobaciones)

1. **Conseguir el número**
   - Comprar un número Twilio/Vonage o usar un móvil físico dedicado.
   - REQUISITO CRÍTICO: el número **NO puede estar activo** en WhatsApp
     personal (si lo está, borrarlo del app primero, esperar 24h).

2. **Meta Business Manager** → Configuración → Cuentas de WhatsApp
   - "Add phone number" en el mismo WABA existente **o** crear WABA
     nuevo dedicado (recomendado: nuevo WABA para separar métricas y
     quality rating del bot Concierge principal).
   - Verificar via SMS/llamada.

3. **Display name** — "Atolón B2B" o "Atolón Agencias"
   - Va a Meta review (24-48h).
   - No usar "Cartagena" u otros términos geográficos ambiguos que Meta
     bloquea.

4. **System user + Permanent Token**
   - En Business Settings → System Users → crea uno con permiso
     `whatsapp_business_management` + `whatsapp_business_messaging`.
   - Generate Token → SIN expiración.
   - Guarda ese token — es lo que va en el env var `WABA_B2B_TOKEN`.

5. **Webhook**
   - Meta App → WhatsApp → Configuration → Webhook URL:
     ```
     https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/concierge-webhook-whatsapp
     ```
   - Verify token: (te lo doy cuando activemos)
   - Suscribirse a: `messages`, `message_statuses`

6. **Aprobar template UTILITY** — el mismo `atolon_lead_rescue` o
   crear uno nuevo `agency_welcome`:
   ```
   Hola {{1}}, gracias por escribirnos. Soy el asistente de Atolón
   para agencias — puedo ayudarte con disponibilidad, precios netos y
   reservas. ¿Cómo te ayudo hoy?
   ```
   Category: Utility · Language: es_MX

7. **Pasar credenciales**
   Cuando tengas los siguientes datos, me los pasas y yo activo el
   router en 2 minutos:
   - `phone_number_id` (Meta lo llama "Phone Number ID")
   - `waba_id` (WhatsApp Business Account ID)
   - `display_phone_number` (ej "+1 305 ...")
   - `verified_name` (ej "Atolón B2B")
   - `access_token` (el System User token permanente)

   Se guardan en `b2b_wa_config` (tabla ya creada) y en env vars de
   la edge function `send-whatsapp`.

---

## 🏗 Arquitectura del bot

### Reconocimiento por teléfono

Función SQL `find_aliado_by_tel(text)` busca en 3 fuentes:
1. `aliados_b2b.tel` (dueño de la agencia)
2. `b2b_contactos.telefono` (agentes de venta de la agencia)
3. `b2b_locaciones.telefono` (oficinas/sedes)

Match por últimos 10 dígitos (móviles CO), ignora formato/prefijo.
Solo agencias con `estado='activo'`.

### Router en webhook

`concierge-webhook-whatsapp` recibe TODOS los mensajes. Antes de
procesar:
```
IF value.metadata.phone_number_id === b2b_wa_config.phone_number_id
  → ruta al agente B2B (loop de Claude con tools B2B)
ELSE
  → ruta al Concierge normal (comportamiento actual)
```

### Agente B2B

Nuevo agente en `atolon_agents` con:
- Sistema prompt: profesional, muestra precios netos, respeta comisión,
  ofrece link de pago sin fricción, handoff a account manager si conflicto.
- Tools B2B (ver `supabase/functions/b2b-wa-tools/`):
  - `get_agency_context` — datos del aliado, saldo puntos, cupo crédito
  - `check_availability_b2b` — disponibilidad + precios NETOS
  - `create_b2b_booking` — reserva con canal=B2B, aliado_id, comisión
  - `generate_payment_link_b2b` — link Wompi para el cliente final
  - `get_recent_bookings` — últimas 10 reservas del aliado
  - `redeem_points` — canjear puntos B2B en una reserva

### Sesiones + historial

- `b2b_wa_sesiones` — una fila por número, cache del contexto.
- `b2b_wa_mensajes` — historial completo (user + assistant + tool_use +
  tool_result) para reconstruir el context de Claude en cada turno.

### Estados no autorizados

Si el número emisor NO matchea ningún aliado activo, el bot responde:
> 🔐 Este canal es exclusivo para agencias registradas de Atolón. Si
> quieres ser aliado, escríbenos a ventas@atolon.co · Para reservar
> como cliente, usa nuestro WhatsApp principal: +1 786-917-3131

Y NO gasta tokens de Claude — respuesta hardcoded.

---

## 📊 Monitoreo

Panel en AtolonConcierge → Conversations con filtro **"Canal B2B"**:
- Sesiones activas + últimas 24h
- Mensajes por sesión (drill-down)
- Reservas creadas por bot (revenue atribuido)
- Top agencias por uso

---

## 🚨 Cosas que NO hace el bot (por diseño)

- **NO** modifica saldo de crédito directamente (solo consulta).
- **NO** cancela reservas (política: cancelaciones humanas).
- **NO** aplica descuentos custom fuera de comisión ya pactada.
- **NO** confirma pagos manuales (solo genera link Wompi).
- **NO** responde a números fuera de horario `handoff_rules` (si están
  configuradas) — automáticamente hace handoff.

Todas esas operaciones requieren humano — el bot da respuesta clara
"Voy a pasarte con tu account manager" y crea handoff en la tabla.
