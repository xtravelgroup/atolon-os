import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
console.log("URL:", url ? url : "FALTA");
const supa = createClient(url, key);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
console.log("today =", today);
for (const q of ["reservas","salidas","cierres","embarcaciones","salidas_override","usuarios","pasadias","b2b_convenios","eventos","muelle_llegadas","aliados_b2b"]) {
  const r = await supa.from(q).select("*").limit(1);
  console.log(`${q.padEnd(18)} -> ${r.error ? "ERROR: "+r.error.message : "ok ("+(r.data?.length||0)+")"}`);
}
const rh = await supa.from("reservas").select("*").eq("fecha", today).order("salida_id");
console.log("\nreservas HOY:", rh.error ? "ERROR: "+rh.error.message : (rh.data?.length+" filas"));
