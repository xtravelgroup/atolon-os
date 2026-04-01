// Supabase Edge Function — send-confirmation
// Sends booking confirmation email via Resend after Wompi payment approved

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM       = "Atolon Beach Club <reservas@atolon.co>";
const BASE_URL   = "https://atolon.co";

interface Reserva {
  id:       string;
  nombre:   string;
  contacto: string; // email
  telefono?: string;
  fecha:    string;
  tipo:     string;
  pax:      number;
  total:    number;
  salida?:  string;
}

function qrUrl(id: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(id)}&size=200x200&bgcolor=0D1B3E&color=FFFFFF&margin=12&format=png`;
}

function formatFecha(fecha: string) {
  return new Date(fecha + "T12:00:00")
    .toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatCOP(n: number) {
  return "COP " + n.toLocaleString("es-CO");
}

function buildHtml(r: Reserva): string {
  const zarpeLink = `${BASE_URL}/zarpe-info?id=${r.id}`;
  const fecha = formatFecha(r.fecha);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reserva Confirmada — Atolon Beach Club</title>
</head>
<body style="margin:0;padding:0;background:#0D1B3E;font-family:'Helvetica Neue',Arial,sans-serif;color:#FFFFFF;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B3E;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <img src="https://atolon.co/atolon-peces.png" alt="Atolon Beach Club" width="200" style="display:block;margin:0 auto;" />
        </td></tr>

        <!-- Hero -->
        <tr><td align="center" style="background:#162040;border-radius:20px 20px 0 0;padding:36px 28px 24px;">
          <div style="font-size:52px;margin-bottom:12px;">✅</div>
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#34D399;">¡Reserva confirmada!</h1>
          <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.55);">Hola ${r.nombre}, tu reserva está confirmada</p>
        </td></tr>

        <!-- QR Code -->
        <tr><td align="center" style="background:#1A2855;padding:28px;">
          <p style="margin:0 0 16px;font-size:11px;color:#FFFFFF;text-transform:uppercase;letter-spacing:2px;">Tu código de embarque</p>
          <div style="display:inline-block;padding:12px;background:#0D1B3E;border-radius:16px;border:2px solid #FFFFFF;">
            <img src="${qrUrl(r.id)}" width="160" height="160" alt="QR ${r.id}" style="display:block;border-radius:8px;" />
          </div>
          <p style="margin:14px 0 4px;font-size:18px;font-weight:700;letter-spacing:3px;color:#FFFFFF;font-family:'Courier New',monospace;">${r.id}</p>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);">Muestra este QR al llegar al muelle</p>
        </td></tr>

        <!-- Reservation details -->
        <tr><td style="background:#162040;padding:0 28px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B3E;border-radius:14px;padding:18px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Nombre</td>
                <td align="right" style="font-weight:600;font-size:13px;">${r.nombre}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Fecha</td>
                <td align="right" style="font-size:13px;text-transform:capitalize;">${fecha}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Pasadía</td>
                <td align="right" style="font-size:13px;">${r.tipo}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Personas</td>
                <td align="right" style="font-size:13px;">${r.pax}</td>
              </tr></table>
            </td></tr>
            ${r.salida ? `<tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Salida</td>
                <td align="right" style="font-size:13px;">${r.salida}</td>
              </tr></table>
            </td></tr>` : ""}
            <tr><td style="padding:12px 0 4px;">
              <table width="100%"><tr>
                <td style="font-weight:700;font-size:14px;">Total pagado</td>
                <td align="right" style="font-size:20px;font-weight:700;color:#34D399;">${formatCOP(r.total)}</td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>

        <!-- Embarkation info -->
        <tr><td style="background:#162040;padding:0 28px 24px;">
          <div style="background:#0F2A1A;border-radius:14px;padding:20px;border:1px solid rgba(52,211,153,0.2);">
            <p style="margin:0 0 14px;font-size:14px;font-weight:700;color:#34D399;">🚢 Información de embarque</p>
            <table cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0;font-size:13px;color:rgba(255,255,255,0.8);">📍&nbsp; <strong>Muelle de La Bodeguita — Puerta 1</strong></td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:rgba(255,255,255,0.8);">⏰&nbsp; Llegar <strong>20 minutos antes</strong> de la salida</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:rgba(255,255,255,0.8);">💵&nbsp; Impuesto de muelle: <strong style="color:#FFFFFF;">COP 18.000</strong> (no incluido)</td></tr>
            </table>
          </div>
        </td></tr>

        <!-- Suggestions -->
        <tr><td style="background:#162040;padding:0 28px 24px;">
          <div style="background:#1C1E0F;border-radius:14px;padding:20px;border:1px solid rgba(200,185,154,0.15);">
            <p style="margin:0 0 14px;font-size:14px;font-weight:700;color:#FFFFFF;">☀️ Recomendaciones</p>
            <table cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:13px;color:rgba(255,255,255,0.7);">🧴&nbsp; Bloqueador solar</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:rgba(255,255,255,0.7);">👙&nbsp; Traje de baño y ropa ligera</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:rgba(255,255,255,0.7);">🕶️&nbsp; Gafas de sol y sombrero</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:rgba(255,255,255,0.7);">👟&nbsp; Sandalias cómodas</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:rgba(255,255,255,0.7);">📸&nbsp; ¡Cámara o celular para las fotos!</td></tr>
            </table>
          </div>
        </td></tr>

        <!-- Zarpe CTA -->
        <tr><td style="background:#162040;padding:0 28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(200,185,154,0.1);border-radius:14px;border:1px solid rgba(200,185,154,0.25);">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#FFFFFF;">📄 Completa tus datos de zarpe</p>
              <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.6;">Ingresa el nombre, identificación y nacionalidad de todos los viajeros para agilizar el trámite en el muelle.</p>
              <a href="${zarpeLink}" style="display:inline-block;background:#FFFFFF;color:#0D1B3E;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700;">Completar datos →</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="background:#0D1B3E;border-radius:0 0 20px 20px;padding:20px 28px 32px;">
          <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.25);">Atolon Beach Club · Cartagena de Indias, Colombia</p>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);">atolon.co · reservas@atolon.co</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  try {
    const reserva: Reserva = await req.json();

    if (!reserva?.id || !reserva?.contacto?.includes("@")) {
      return new Response(JSON.stringify({ error: "reserva.id and reserva.contacto (email) are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [reserva.contacto],
        subject: `✅ Reserva confirmada — ${reserva.tipo} · ${formatFecha(reserva.fecha)}`,
        html:    buildHtml(reserva),
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      console.error("Resend error:", body);
      return new Response(JSON.stringify({ error: body }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: body.id }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
