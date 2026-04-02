// vip-bienvenida — Supabase Edge Function
// Envía correo de bienvenida a un nuevo miembro de Atolón Society via Resend

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "Atolon Beach Club <reservas@atolon.co>";
const PORTAL_URL = "https://atolon.co/society";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Miembro {
  nombre: string;
  email: string;
  nivel: "coral" | "reef" | "ocean";
  numero_membresia: string;
}

const BENEFICIOS = {
  coral: {
    label: "Coral Member",
    icon: "🪸",
    color: "#f87171",
    gradient: "linear-gradient(135deg, #7f1d1d 0%, #450a0a 60%, #991b1b 100%)",
    pct: 5,
    camas: 1,
    personasPropia: 4,
    personasLancha: 2,
    descuentoPasadia: 10,
    adicionalConsumible: 100000,
    perks: [
      "🚤 Embarcación propia hasta <strong>4 personas</strong>",
      "⛵ Lancha Atolon hasta <strong>2 pax</strong> · $50.000/persona · pax extra con $100.000 consumibles",
      "🛏 <strong>1 Cama de Playa</strong> por visita",
      "🏖 <strong>10% descuento</strong> en pasadías",
      "💰 <strong>5% en puntos</strong> sobre consumo (redimibles)",
    ],
  },
  reef: {
    label: "Reef Member",
    icon: "🐚",
    color: "#34d399",
    gradient: "linear-gradient(135deg, #064e3b 0%, #022c22 60%, #065f46 100%)",
    pct: 8,
    camas: 2,
    personasPropia: 6,
    personasLancha: 4,
    descuentoPasadia: 12,
    adicionalConsumible: 100000,
    perks: [
      "🚤 Embarcación propia hasta <strong>6 personas</strong>",
      "⛵ Lancha Atolon hasta <strong>4 pax</strong> · $50.000/persona · pax extra con $100.000 consumibles",
      "🛏 <strong>2 Camas de Playa</strong> por visita",
      "🏖 <strong>12% descuento</strong> en pasadías",
      "💰 <strong>8% en puntos</strong> sobre consumo (redimibles)",
    ],
  },
  ocean: {
    label: "Ocean Member",
    icon: "🌊",
    color: "#60a5fa",
    gradient: "linear-gradient(135deg, #1e3a5f 0%, #0c1a35 60%, #1e40af 100%)",
    pct: 10,
    camas: "VIP",
    personasPropia: null,
    personasLancha: 6,
    descuentoPasadia: 15,
    adicionalConsumible: null,
    perks: [
      "🚤 Embarcación propia · <strong>personas ilimitadas</strong>",
      "⛵ Lancha Atolon hasta <strong>6 pax</strong> · $50.000/persona",
      "🛏 <strong>Camas VIP ilimitadas</strong>",
      "🏖 <strong>15% descuento</strong> en pasadías",
      "💰 <strong>10% en puntos</strong> sobre consumo (redimibles)",
    ],
  },
};

function buildHtml(m: Miembro): string {
  const b = BENEFICIOS[m.nivel] || BENEFICIOS.coral;

  const perksHtml = b.perks.map(p =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:14px;color:rgba(255,255,255,0.85);line-height:1.5;">${p}</td>
      </tr></table>
    </td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a Atolón Society</title>
</head>
<body style="margin:0;padding:0;background:#0D1B3E;font-family:'Helvetica Neue',Arial,sans-serif;color:#FFFFFF;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B3E;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="https://atolon.co/atolon-peces.png" alt="Atolon Beach Club" width="190" style="display:block;margin:0 auto;" />
        </td></tr>

        <!-- Hero Card (nivel gradient) -->
        <tr><td style="background:${b.gradient};border-radius:20px 20px 0 0;padding:36px 32px 28px;position:relative;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td>
              <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.55;margin-bottom:6px;">Atolón Society</div>
              <h1 style="margin:0 0 4px;font-size:30px;font-weight:800;color:#fff;">${m.nombre}</h1>
              <div style="font-size:15px;opacity:0.55;letter-spacing:2px;font-family:'Courier New',monospace;margin-bottom:20px;">${m.numero_membresia}</div>
              <div style="display:inline-block;padding:6px 18px;border-radius:30px;font-size:13px;font-weight:700;background:rgba(255,255,255,0.13);color:${b.color};border:1px solid ${b.color}88;">
                ${b.icon} ${b.label.toUpperCase()}
              </div>
            </td></tr>
          </table>
        </td></tr>

        <!-- Welcome message -->
        <tr><td style="background:#162040;padding:28px 32px 20px;">
          <p style="margin:0 0 10px;font-size:20px;font-weight:700;color:#fff;">¡Bienvenido al club exclusivo! 🎉</p>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.55);line-height:1.7;">
            Ahora haces parte de <strong style="color:${b.color};">Atolón Society</strong>, el programa de membresías exclusivo de Atolon Beach Club. Accede a beneficios únicos cada vez que nos visites en nuestra isla privada en el Archipiélago de Rosario.
          </p>
        </td></tr>

        <!-- Benefits -->
        <tr><td style="background:#162040;padding:0 32px 24px;">
          <div style="background:#0D1B3E;border-radius:16px;padding:20px 24px;">
            <p style="margin:0 0 16px;font-size:12px;font-weight:700;color:${b.color};text-transform:uppercase;letter-spacing:2px;">Tus beneficios ${b.label}</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${perksHtml}
            </table>
          </div>
        </td></tr>

        <!-- How to use -->
        <tr><td style="background:#162040;padding:0 32px 24px;">
          <div style="background:#0F2A1A;border-radius:16px;padding:20px 24px;border:1px solid rgba(52,211,153,0.2);">
            <p style="margin:0 0 14px;font-size:14px;font-weight:700;color:#34D399;">📲 ¿Cómo usar tu membresía?</p>
            <table cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0;font-size:13px;color:rgba(255,255,255,0.8);">1️⃣&nbsp; Ingresa a tu portal exclusivo en <strong>atolon.co/society</strong></td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:rgba(255,255,255,0.8);">2️⃣&nbsp; Reserva tu llegada o lancha directamente desde el portal</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:rgba(255,255,255,0.8);">3️⃣&nbsp; Sube tu recibo de consumo y acumula puntos automáticamente</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:rgba(255,255,255,0.8);">4️⃣&nbsp; Presenta tu tarjeta digital al llegar para activar tus beneficios</td></tr>
            </table>
          </div>
        </td></tr>

        <!-- Points info -->
        <tr><td style="background:#162040;padding:0 32px 24px;">
          <div style="background:#1C1A0F;border-radius:16px;padding:20px 24px;border:1px solid rgba(232,160,32,0.2);">
            <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#E8A020;">◉ Sistema de puntos</p>
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.7;">
              Por cada visita, sube la foto de tu recibo desde el portal. La IA analiza el monto y te acredita automáticamente el <strong style="color:#E8A020;">${b.pct}%</strong> de tu consumo en puntos (descontando IVA). Los puntos se pueden redimir en futuras visitas.
            </p>
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="background:#162040;padding:0 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:20px 24px;background:rgba(255,255,255,0.04);border-radius:14px;border:1px solid rgba(255,255,255,0.1);">
              <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#fff;">Tu portal exclusivo te espera</p>
              <p style="margin:0 0 20px;font-size:12px;color:rgba(255,255,255,0.4);">Usa tu correo y cédula para ingresar la primera vez</p>
              <a href="${PORTAL_URL}" style="display:inline-block;background:${b.color};color:#0D1B3E;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:15px;font-weight:800;letter-spacing:0.02em;">Ir al Portal →</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="background:#0D1B3E;border-radius:0 0 20px 20px;padding:20px 28px 32px;">
          <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.25);">Atolon Beach Club · Archipiélago de Rosario, Cartagena de Indias</p>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);">atolon.co · reservas@atolon.co</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const miembro: Miembro = await req.json();

    if (!miembro?.email?.includes("@") || !miembro?.nombre) {
      return new Response(JSON.stringify({ error: "nombre y email son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [miembro.email],
        subject: `${b.icon} Bienvenido a Atolón Society — ${b.label}`,
        html: buildHtml(miembro),
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      console.error("Resend error:", body);
      return new Response(JSON.stringify({ error: body }), {
        status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: body.id }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
