// abandoned-cart-sender — Supabase Edge Function
// Procesa la cola de emails y envía los emails de carrito abandonado via Resend.
// Se ejecuta cada 5 minutos via pg_cron:
//   SELECT cron.schedule('ac-sender', '*/5 * * * *',
//     'SELECT net.http_post(url:=''https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/abandoned-cart-sender'',
//     headers:=''{\"Content-Type\":\"application/json\",\"Authorization\":\"Bearer {SERVICE_ROLE_KEY}\"}'',
//     body:=''{}''::jsonb)');

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY") ?? "";

// URLs base para tracking
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

function nanoid(n = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function formatFecha(fecha: string): string {
  try {
    return new Date(fecha + "T12:00:00")
      .toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return fecha; }
}

function formatCOP(n: number): string {
  return "COP " + Math.round(n).toLocaleString("es-CO");
}

// Reemplaza todas las variables {{var}} en un template HTML o texto
function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val ?? "");
  }
  return result;
}

// Convierte un link normal en un link trackeado via ac-click-track
function trackLink(url: string, queueId: string, cartId: string): string {
  return `${FN_BASE}/ac-click-track?q=${encodeURIComponent(queueId)}&c=${encodeURIComponent(cartId)}&u=${encodeURIComponent(url)}`;
}

// Construye el recovery link completo (directo al BookingPopup con token)
function buildRecoveryLink(cart: Record<string, unknown>, queueId: string, settings: Record<string, unknown>): string {
  const bookingUrl = settings.booking_url as string ?? "https://atolon.co/booking";
  const token      = cart.recovery_token as string ?? "";
  const tipo       = cart.tipo_pase as string ?? "";
  const idioma     = cart.idioma as string ?? "es";

  const params = new URLSearchParams({ r: token });
  if (tipo)   params.set("tipo", tipo);
  if (idioma !== "es") params.set("lang", idioma);

  const directRecoveryUrl = `${bookingUrl}?${params.toString()}`;
  // Wrap with click tracker
  return trackLink(directRecoveryUrl, queueId, cart.id as string);
}

// Construye la URL del pixel de apertura
function buildPixelUrl(queueId: string, cartId: string): string {
  return `${FN_BASE}/ac-open-pixel?q=${encodeURIComponent(queueId)}&c=${encodeURIComponent(cartId)}`;
}

// Construye la URL de unsubscribe
function buildUnsubscribeUrl(cartId: string, token: string): string {
  return `${FN_BASE}/ac-unsubscribe?c=${encodeURIComponent(cartId)}&t=${encodeURIComponent(token)}`;
}

// Construye el link de homepage trackeado
function buildHomepageLink(url: string, queueId: string, cartId: string): string {
  return trackLink(url, queueId, cartId);
}

// Determina el nuevo estado del cart según el template enviado
function cartEstado(templateId: string): string {
  const map: Record<string, string> = {
    email_1: "email_1_sent",
    email_2: "email_2_sent",
    email_3: "email_3_sent",
    email_4: "email_4_sent",
  };
  return map[templateId] ?? "email_1_sent";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const now      = new Date();

  // 1. Obtener configuración
  const { data: cfg } = await supabase.from("ac_flow_settings").select("*").eq("id", "default").single();
  if (!cfg?.activo) {
    return new Response(JSON.stringify({ ok: true, skipped: "module_inactive" }), { status: 200 });
  }

  // 2. Obtener emails pendientes cuyo scheduled_for ya pasó (max 50 a la vez)
  const { data: pending, error: qErr } = await supabase
    .from("ac_email_queue")
    .select(`
      id, cart_id, template_id, scheduled_for, intentos,
      ac_carts!inner(
        id, email, nombre, apellido, telefono,
        producto, tipo_pase, fecha_visita, pax_total, pax_adultos, pax_ninos,
        valor_total, moneda, idioma, recovery_token, recovery_expires_at,
        estado, flow_pausado, unsubscribed
      ),
      ac_email_templates!inner(
        id, asunto, preheader, body_html, body_texto, cta_link_var, activo
      )
    `)
    .eq("estado", "pending")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for")
    .limit(50);

  if (qErr) {
    console.error("Queue fetch error:", qErr);
    return new Response(JSON.stringify({ error: qErr.message }), { status: 500 });
  }

  let sent    = 0;
  let skipped = 0;
  let failed  = 0;

  for (const item of (pending ?? [])) {
    const cart: Record<string, unknown>     = item.ac_carts as unknown as Record<string, unknown>;
    const tmpl: Record<string, unknown>     = item.ac_email_templates as unknown as Record<string, unknown>;

    // Guaridas de envío — STOP si:
    const shouldStop =
      !cart                                   ||
      !tmpl                                   ||
      !(tmpl.activo as boolean)               ||
      (cart.flow_pausado as boolean)          ||
      (cart.unsubscribed as boolean)          ||
      ["recovered", "unsubscribed", "stopped", "expired", "bounced"].includes(cart.estado as string);

    if (shouldStop) {
      await supabase.from("ac_email_queue").update({
        estado: "skipped",
        sent_at: now.toISOString(),
      }).eq("id", item.id);
      skipped++;
      continue;
    }

    // Verificar si ya compró (anti duplicado — cross-device)
    if (cart.fecha_visita) {
      const { data: existingBooking } = await supabase
        .from("reservas")
        .select("id")
        .eq("email", cart.email as string)
        .eq("fecha", (cart.fecha_visita as string).substring(0, 10))
        .in("estado", ["confirmado", "pagado", "checked_in"])
        .limit(1)
        .maybeSingle();

      if (existingBooking) {
        // Ya compró — cancelar todo el flujo
        await supabase.from("ac_carts").update({
          estado: "recovered",
          recovered_at: now.toISOString(),
          reserva_id: existingBooking.id,
          updated_at: now.toISOString(),
        }).eq("id", cart.id as string);

        await supabase.from("ac_email_queue").update({ estado: "cancelled" })
          .eq("cart_id", cart.id as string).eq("estado", "pending");

        skipped++;
        continue;
      }
    }

    // Máximo 3 intentos por email
    if ((item.intentos ?? 0) >= 3) {
      await supabase.from("ac_email_queue").update({
        estado: "failed",
        error_msg: "Max intentos reached",
      }).eq("id", item.id);
      failed++;
      continue;
    }

    // Construir variables de reemplazo
    const nombre = (cart.nombre as string ?? "").split(" ")[0] || "amigo";
    const recoveryLink = buildRecoveryLink(cart, item.id, cfg);
    const homepageLink = buildHomepageLink(cfg.homepage_url ?? "https://atolon.co", item.id, cart.id as string);
    const pixelUrl     = buildPixelUrl(item.id, cart.id as string);
    const unsubUrl     = buildUnsubscribeUrl(cart.id as string, cart.recovery_token as string ?? "");

    const fechaRaw    = cart.fecha_visita ? (cart.fecha_visita as string).substring(0, 10) : "";
    const fechaFmt    = fechaRaw ? formatFecha(fechaRaw) : "—";
    const valorFmt    = cart.valor_total ? formatCOP(cart.valor_total as number) : "—";

    const vars: Record<string, string> = {
      nombre:           nombre,
      apellido:         (cart.apellido as string) ?? "",
      email:            (cart.email as string) ?? "",
      telefono:         (cart.telefono as string) ?? "",
      fecha:            fechaFmt,
      producto:         (cart.producto as string) ?? "",
      tipo_pase:        (cart.tipo_pase as string) ?? "",
      pax_total:        String(cart.pax_total ?? 0),
      pax_adultos:      String(cart.pax_adultos ?? 0),
      pax_ninos:        String(cart.pax_ninos ?? 0),
      valor_total:      valorFmt,
      moneda:           (cart.moneda as string) ?? "COP",
      idioma:           (cart.idioma as string) ?? "es",
      recovery_link:    recoveryLink,
      homepage_link:    homepageLink,
      open_pixel_url:   pixelUrl,
      unsubscribe_link: unsubUrl,
    };

    // Reemplazar variables en HTML y texto
    const bodyHtml  = replaceVars(tmpl.body_html as string ?? "", vars);
    const bodyTexto = replaceVars(tmpl.body_texto as string ?? "", vars);
    const asunto    = replaceVars(tmpl.asunto as string ?? "", vars);

    // Enviar via Resend (con headers anti-spam completos)
    try {
      // Message-ID único con dominio propio (mejora deliverability)
      const msgId = `${nanoid(24)}@atolon.co`;
      // RFC 2369 compliant List headers
      const listUnsub     = `<${unsubUrl}>, <mailto:bajas@atolon.co?subject=unsubscribe>`;
      const listUnsubPost = "List-Unsubscribe=One-Click";

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:     `${cfg.from_nombre ?? "Atolón Beach Club"} <${cfg.from_email ?? "reservas@atolon.co"}>`,
          to:       [cart.email as string],
          reply_to: cfg.reply_to ?? "hola@atolon.co",
          subject:  asunto,
          html:     bodyHtml,
          text:     bodyTexto,
          headers: {
            // Anti-spam / RFC compliance
            "Message-ID":             `<${msgId}>`,
            "List-Unsubscribe":        listUnsub,
            "List-Unsubscribe-Post":   listUnsubPost,
            "Precedence":              "bulk",
            "X-Mailer":               "AtolanOS/1.0",
            "X-Entity-Ref-ID":        item.id,  // deduplicación en destino
            // Marca el tipo de email para filtros
            "X-Campaign-ID":           tmpl.id as string,
          },
          tags: [
            { name: "template", value: tmpl.id as string },
            { name: "cart_id",  value: (cart.id as string).slice(0, 50) },
            { name: "tipo",     value: "abandoned_cart" },
          ],
        }),
      });

      const resendData = await resendRes.json();

      if (!resendRes.ok) {
        throw new Error(resendData.message ?? "Resend error");
      }

      // Marcar como enviado en la cola
      await supabase.from("ac_email_queue").update({
        estado:    "sent",
        sent_at:   now.toISOString(),
        resend_id: resendData.id ?? null,
        intentos:  (item.intentos ?? 0) + 1,
      }).eq("id", item.id);

      // Actualizar estado del cart
      const newEstado = cartEstado(tmpl.id as string);
      await supabase.from("ac_carts").update({
        estado:              newEstado,
        emails_enviados:     ((cart.emails_enviados as number) ?? 0) + 1,
        ultimo_email_enviado: tmpl.id as string,
        ultimo_email_at:     now.toISOString(),
        updated_at:          now.toISOString(),
      }).eq("id", cart.id as string);

      // Registrar evento de sent
      await supabase.from("ac_email_events").insert({
        id:          `ace_${nanoid(16)}`,
        cart_id:     cart.id as string,
        queue_id:    item.id,
        template_id: tmpl.id as string,
        tipo:        "sent",
      });

      sent++;

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Send error:", item.id, errMsg);

      await supabase.from("ac_email_queue").update({
        intentos:  (item.intentos ?? 0) + 1,
        error_msg: errMsg.slice(0, 500),
        // Si es el último intento, marcar como failed
        estado:    (item.intentos ?? 0) >= 2 ? "failed" : "pending",
      }).eq("id", item.id);

      failed++;
    }
  }

  return new Response(JSON.stringify({
    ok:        true,
    sent,
    skipped,
    failed,
    processed: (pending ?? []).length,
    timestamp: now.toISOString(),
  }), {
    headers: { "Content-Type": "application/json" },
  });
});
