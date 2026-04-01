// Supabase Edge Function — notify-b2b-user
// Notifica al vendedor de Atolon cuando una agencia crea un nuevo usuario en el portal

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM       = "Atolon Beach Club <reservas@atolon.co>";

Deno.serve(async (req: Request) => {
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
    const { vendedor_email, vendedor_nombre, agencia_nombre, nuevo_nombre, nuevo_email, nuevo_rol, portal_url } = await req.json();

    if (!vendedor_email || !agencia_nombre) {
      return new Response(JSON.stringify({ error: "vendedor_email y agencia_nombre son requeridos" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0D1B3E;font-family:'Helvetica Neue',Arial,sans-serif;color:#FFFFFF;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B3E;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="https://atolon.co/atolon-peces.png" alt="Atolon Beach Club" width="160" style="display:block;margin:0 auto;" />
        </td></tr>

        <!-- Hero -->
        <tr><td align="center" style="background:#162040;border-radius:16px 16px 0 0;padding:30px 28px 20px;">
          <div style="font-size:44px;margin-bottom:10px;">👤</div>
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#38bdf8;">Nuevo usuario en el portal B2B</h1>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">Hola ${vendedor_nombre || "Vendedor"}, una agencia de tu cartera acaba de agregar un nuevo contacto.</p>
        </td></tr>

        <!-- Info -->
        <tr><td style="background:#1a2855;padding:24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B3E;border-radius:12px;padding:18px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Agencia</td>
                <td align="right" style="font-weight:700;font-size:13px;color:#f5c842;">${agencia_nombre}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Nombre del usuario</td>
                <td align="right" style="font-weight:600;font-size:13px;">${nuevo_nombre}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Email de acceso</td>
                <td align="right" style="font-size:13px;">${nuevo_email}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;">
              <table width="100%"><tr>
                <td style="color:rgba(255,255,255,0.45);font-size:13px;">Rol</td>
                <td align="right" style="font-size:13px;text-transform:capitalize;">${nuevo_rol || "vendedor"}</td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>

        <!-- First login note -->
        <tr><td style="background:#1a2855;padding:0 28px 24px;">
          <div style="background:#0f2a1a;border-radius:12px;padding:16px 20px;border:1px solid rgba(52,211,153,0.2);">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#34D399;">🔑 Primer ingreso sin clave</p>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.6;">
              Al ingresar por primera vez, el sistema le pedirá automáticamente que cree su clave de acceso personal. No necesita clave temporal.
            </p>
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="background:#162040;padding:0 28px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${portal_url}" style="display:inline-block;background:#38bdf8;color:#0D1B3E;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;">
                Ver portal de la agencia →
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="background:#0D1B3E;border-radius:0 0 16px 16px;padding:16px 28px 24px;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">Atolon Beach Club · Cartagena de Indias · atolon.co</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    FROM,
        to:      [vendedor_email],
        subject: `👤 Nuevo usuario B2B — ${agencia_nombre} agregó a ${nuevo_nombre}`,
        html,
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
