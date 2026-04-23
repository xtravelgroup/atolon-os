// middleware.js — Vercel Edge Middleware para OG tags dinámicos
// Intercepta bots de WhatsApp/Facebook/Twitter en rutas públicas
// y les sirve HTML con meta tags correctos. El browser normal pasa directo.

export const config = {
  matcher: ["/zarpe-info", "/booking", "/zarpe-grupo", "/pago"],
};

const SUPABASE_URL = "https://ncdyttgxuicyruathkxd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";

const BOT_UA = /whatsapp|facebookexternalhit|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|googlebot|bingbot|applebot/i;

async function fetchOne(table, id, field = "nombre") {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=${field}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0]?.[field] || null;
}

function ogHtml({ title, description, image, url }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${description}"/>
  <meta property="og:image" content="${image}"/>
  <meta property="og:url" content="${url}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="Atolon Beach Club"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${title}"/>
  <meta name="twitter:description" content="${description}"/>
  <meta name="twitter:image" content="${image}"/>
  <meta http-equiv="refresh" content="0; url=${url}"/>
</head>
<body><p>Redirigiendo…</p></body>
</html>`;
}

export default async function middleware(request) {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) return; // browser normal → pasa directo al SPA

  const { pathname, searchParams, href } = new URL(request.url);
  const origin = new URL(request.url).origin;
  const defaultImage = `${origin}/og-image.png`;

  let title = "Atolon Beach Club";
  let description = "Beach Club · Cartagena de Indias";

  try {
    // /zarpe-info?id=RES-xxx  →  reserva individual
    if (pathname === "/zarpe-info") {
      const id = searchParams.get("id");
      if (id) {
        const nombre = await fetchOne("reservas", id, "nombre");
        if (nombre) {
          title = `Pasadía · ${nombre}`;
          description = "Tu información de zarpe en Atolon Beach Club · Cartagena";
        }
      }
    }

    // /booking?grupo=EVE-xxx  →  evento/grupo
    else if (pathname === "/booking") {
      const id = searchParams.get("grupo");
      if (id) {
        const nombre = await fetchOne("eventos", id, "nombre");
        if (nombre) {
          title = nombre;
          description = "Reserva tu cupo en Atolon Beach Club · Cartagena";
        }
      }
    }

    // /zarpe-grupo?ev=EVE-xxx  →  zarpe de grupo
    else if (pathname === "/zarpe-grupo") {
      const id = searchParams.get("ev");
      if (id) {
        const nombre = await fetchOne("eventos", id, "nombre");
        if (nombre) {
          title = `Zarpe · ${nombre}`;
          description = "Completa tu información de zarpe · Atolon Beach Club";
        }
      }
    }

    // /pago?reserva=RES-xxx  →  link de pago
    else if (pathname === "/pago") {
      const id = searchParams.get("reserva");
      if (id) {
        const nombre = await fetchOne("reservas", id, "nombre");
        if (nombre) {
          title = `Pago · ${nombre}`;
          description = "Completa tu pago · Atolon Beach Club · Cartagena";
        }
      }
    }
  } catch (_) {
    // Si falla el fetch, sirve OG tags genéricos
  }

  return new Response(ogHtml({ title, description, image: defaultImage, url: href }), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
