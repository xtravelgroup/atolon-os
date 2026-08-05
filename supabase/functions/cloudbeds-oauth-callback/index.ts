// Callback de OAuth 2.0 de Cloudbeds. Recibe ?code=... del user-authorization,
// intercambia por access+refresh token, y guarda en cloudbeds_credentials.
// Redirige de vuelta a AtolonOS con status en query.
import { CB_ID, CB_SECRET, CB_OAUTH, CB_BASE, supaAdmin, CORS, jr } from "../_shared/cloudbeds.ts";

const REDIRECT_URI = Deno.env.get("CLOUDBEDS_REDIRECT_URI")
  || "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/cloudbeds-oauth-callback";
const APP_URL = Deno.env.get("APP_URL") || "https://www.atolon.co";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || ""; // email del user que inició
  if (!code) return redirect("?cb_error=missing_code");
  if (!CB_ID || !CB_SECRET) return redirect("?cb_error=missing_client_secrets");

  try {
    // 1) Intercambio code → tokens
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CB_ID,
      client_secret: CB_SECRET,
    });
    const tokRes = await fetch(`${CB_OAUTH}/access_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokRes.ok) throw new Error(`token exchange ${tokRes.status}: ${(await tokRes.text()).slice(0,300)}`);
    const t = await tokRes.json();

    // 2) Averigar property(ies) autorizadas via /getHotels
    const hRes = await fetch(`${CB_BASE}/getHotels`, {
      headers: { "Authorization": `Bearer ${t.access_token}` },
    });
    if (!hRes.ok) throw new Error(`getHotels ${hRes.status}: ${(await hRes.text()).slice(0,300)}`);
    const hData = await hRes.json();
    const hotels: any[] = hData?.data || [];
    if (!hotels.length) throw new Error("La cuenta autorizada no tiene propiedades visibles.");

    const supa = supaAdmin();
    const expiresAt = new Date(Date.now() + (t.expires_in * 1000) - 60_000).toISOString();

    // 3) Upsert un registro por property
    for (const h of hotels) {
      const propId = String(h.propertyID || h.property_id || h.id);
      await supa.from("cloudbeds_credentials").upsert({
        id: `CB-${propId}`,
        property_id: propId,
        property_nombre: h.propertyName || h.name || null,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: expiresAt,
        scope: t.scope || null,
        activo: true,
        connected_by: state || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "property_id" });
    }

    return redirect(`?cb_connected=${hotels.length}`);
  } catch (e: any) {
    console.error("cb-oauth error:", e);
    return redirect(`?cb_error=${encodeURIComponent(e.message || String(e)).slice(0, 200)}`);
  }
});

function redirect(qs: string) {
  const to = `${APP_URL}/hotel-integraciones${qs}`;
  return new Response(null, { status: 302, headers: { Location: to, ...CORS } });
}
