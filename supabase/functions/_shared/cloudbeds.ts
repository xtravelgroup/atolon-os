// Utilidades compartidas para el conector Cloudbeds.
// Docs API v1.2: https://hotels.cloudbeds.com/api/v1.2/docs/
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CB_BASE   = "https://hotels.cloudbeds.com/api/v1.2";
export const CB_OAUTH  = "https://hotels.cloudbeds.com/api/v1.1/oauth";
export const CB_ID     = Deno.env.get("CLOUDBEDS_CLIENT_ID")     || "";
export const CB_SECRET = Deno.env.get("CLOUDBEDS_CLIENT_SECRET") || "";

export const supaAdmin = (): SupabaseClient => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Refresca el access_token si expira en < 5 min. Retorna token vigente.
export async function getValidAccessToken(supa: SupabaseClient, property_id: string): Promise<string> {
  const { data: cred, error } = await supa.from("cloudbeds_credentials")
    .select("*").eq("property_id", property_id).maybeSingle();
  if (error || !cred) throw new Error(`Property ${property_id} sin credenciales Cloudbeds`);

  const expiresAt = new Date(cred.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 60 * 1000) return cred.access_token;

  // Refresh flow
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cred.refresh_token,
    client_id: CB_ID,
    client_secret: CB_SECRET,
  });
  const res = await fetch(`${CB_OAUTH}/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    await supa.from("cloudbeds_credentials").update({
      last_error: `refresh failed: ${err.slice(0, 400)}`,
      updated_at: new Date().toISOString(),
    }).eq("property_id", property_id);
    throw new Error(`Cloudbeds refresh_token falló: ${err}`);
  }
  const t = await res.json();
  const newExpires = new Date(Date.now() + (t.expires_in * 1000) - 60_000).toISOString();
  await supa.from("cloudbeds_credentials").update({
    access_token:  t.access_token,
    refresh_token: t.refresh_token || cred.refresh_token,
    expires_at:    newExpires,
    last_error:    null,
    updated_at:    new Date().toISOString(),
  }).eq("property_id", property_id);
  return t.access_token;
}

// GET wrapper con paginación
export async function cbGet(token: string, path: string, params: Record<string, any> = {}) {
  const url = new URL(`${CB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Cloudbeds GET ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

export async function cbPost(token: string, path: string, body: Record<string, any>) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) form.set(k, String(v));
  }
  const res = await fetch(`${CB_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Cloudbeds POST ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const jr = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
