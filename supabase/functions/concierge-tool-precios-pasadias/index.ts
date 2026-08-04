import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const supa = createClient(SUPA_URL, SUPA_KEY);
  const { data } = await supa.from("pasadias_precios").select("*");
  return new Response(JSON.stringify({ precios: data || [] }), { headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
});
