/**
 * AtolanTrack — SDK de analítica para Atolon OS
 * Tracking de sesiones, embudos, atribución y abandono
 */

import { supabase } from "./supabase";

// ─── Utilidades ────────────────────────────────────────────────────────────

function nanoid(len = 21) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  const arr = crypto.getRandomValues(new Uint8Array(len));
  arr.forEach(b => (id += chars[b % chars.length]));
  return id;
}

async function sha256(str) {
  if (!str) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str.toLowerCase().trim()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function parseUTMs() {
  const p = new URLSearchParams(window.location.search);
  const utms = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(k => {
    const v = p.get(k); if (v) utms[k] = v;
  });
  return utms;
}

function clasificarCanal(utms, referrer) {
  const src = utms.utm_source?.toLowerCase() || "";
  const med = utms.utm_medium?.toLowerCase() || "";
  const ref = referrer?.toLowerCase() || "";
  if (med === "cpc" || med === "paid" || src === "google" && med === "cpc") return "sem_google";
  if (src === "facebook" || src === "instagram" || src === "meta") return med === "cpc" ? "paid_social_meta" : "organic_social";
  if (src === "email" || med === "email") return "email";
  if (src === "whatsapp" || med === "whatsapp") return "whatsapp";
  if (ref.includes("google") || ref.includes("bing") || ref.includes("yahoo")) return "seo_organico";
  if (ref && !ref.includes(window.location.hostname)) return "referido";
  if (!ref && !src) return "directo";
  return "otro";
}

function getDevice() {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

function getBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  return "Otro";
}

// ─── Gestor de Sesión ───────────────────────────────────────────────────────

const SESSION_KEY = "at_sid";
const USER_KEY    = "at_uid";

function getSesionId() {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) { sid = nanoid(); sessionStorage.setItem(SESSION_KEY, sid); }
  return sid;
}

function getUsuarioId() {
  let uid = localStorage.getItem(USER_KEY);
  if (!uid) { uid = nanoid(); localStorage.setItem(USER_KEY, uid); }
  return uid;
}

// ─── AtolanTrack ────────────────────────────────────────────────────────────

class AtolanTrackSDK {
  constructor() {
    this.sesionId  = getSesionId();
    this.usuarioId = getUsuarioId();
    this.utms      = parseUTMs();
    this.canal     = clasificarCanal(this.utms, document.referrer);
    this.inicializado = false;
    this.embudo    = null;
  }

  async init() {
    if (this.inicializado) return;
    this.inicializado = true;

    // Crear sesión
    await supabase.from("track_sesiones").upsert({
      id: this.sesionId,
      usuario_id: this.usuarioId,
      dispositivo: getDevice(),
      navegador: getBrowser(),
      os: navigator.platform || "desconocido",
      pantalla: `${screen.width}x${screen.height}`,
      idioma: navigator.language,
      utms: this.utms,
      canal: this.canal,
      referrer: document.referrer || null,
      entrada_url: window.location.href,
      created_at: new Date().toISOString(),
    }, { onConflict: "id" });

    // Guardar hora de inicio para calcular duración
    this._startTime = Date.now();

    // Flush al salir
    window.addEventListener("beforeunload", () => this._flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this._flush();
    });
  }

  async evento(tipo, datos = {}, categoria = null) {
    if (!this.inicializado) await this.init();
    const id = nanoid();
    const key = `${this.sesionId}:${tipo}:${JSON.stringify(datos)}`;
    const idKey = await sha256(key);

    await supabase.from("track_eventos").upsert({
      id,
      sesion_id: this.sesionId,
      usuario_id: this.usuarioId,
      tipo,
      categoria,
      datos,
      url: window.location.href,
      ts: new Date().toISOString(),
      idempotency_key: idKey,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  }

  // ── Embudo de conversión ──────────────────────────────────────────────────

  async embudo_paso(paso, datos = {}) {
    if (!this.inicializado) await this.init();

    const campo = `paso_${paso}_ts`;
    const now = new Date().toISOString();

    if (!this.embudo) {
      // Buscar embudo existente para esta sesión
      const { data } = await supabase.from("track_embudos")
        .select("id").eq("sesion_id", this.sesionId).single();
      if (data) {
        this.embudo = data.id;
      } else {
        this.embudo = nanoid();
        await supabase.from("track_embudos").insert({
          id: this.embudo,
          sesion_id: this.sesionId,
          usuario_id: this.usuarioId,
          [campo]: now,
        });
        return;
      }
    }

    await supabase.from("track_embudos").update({ [campo]: now })
      .eq("id", this.embudo);

    // Guardar email si se proporciona (para abandono)
    if (datos.email) {
      const emailHash = await sha256(datos.email);
      await supabase.from("track_embudos").update({
        email_abandono: datos.email,
      }).eq("id", this.embudo);
      // Stitch usuario
      await this._stitch(datos.email, emailHash);
    }

    await this.evento(`embudo_paso_${paso}`, datos, "embudo");
  }

  async embudo_abandono(pasoActual) {
    if (!this.embudo) return;
    await supabase.from("track_embudos").update({
      abandono_paso: pasoActual,
    }).eq("id", this.embudo);
    await this.evento("embudo_abandono", { paso: pasoActual }, "embudo");
  }

  // ── Conversión / Ingreso ─────────────────────────────────────────────────

  async conversion(reservaId, monto) {
    if (!this.inicializado) await this.init();
    const id = nanoid();

    await supabase.from("track_ingresos").insert({
      id,
      sesion_id: this.sesionId,
      usuario_id: this.usuarioId,
      reserva_id: reservaId,
      monto,
      canal: this.canal,
      utms: this.utms,
      created_at: new Date().toISOString(),
    });

    // Marcar sesión como convertida
    await supabase.from("track_sesiones").update({
      convertida: true, ingreso: monto,
    }).eq("id", this.sesionId);

    // Marcar embudo como completado
    if (this.embudo) {
      await supabase.from("track_embudos").update({
        paso_6_ts: new Date().toISOString(),
      }).eq("id", this.embudo);
    }

    // Registrar atribuciones (4 modelos)
    await this._registrarAtribuciones(id, monto);

    await this.evento("conversion", { reserva_id: reservaId, monto }, "conversion");
  }

  async _registrarAtribuciones(ingresoId, monto) {
    const modelos = [
      { modelo: "last_touch", peso: 1.0 },
      { modelo: "first_touch", peso: 1.0 },
      { modelo: "linear", peso: 1.0 },
      { modelo: "time_decay", peso: 1.0 },
    ];
    const rows = modelos.map(m => ({
      ingreso_id: ingresoId,
      modelo: m.modelo,
      canal: this.canal,
      valor: monto * m.peso,
      peso: m.peso,
    }));
    await supabase.from("track_atribuciones").insert(rows);
  }

  // ── User Stitching ───────────────────────────────────────────────────────

  async _stitch(email, emailHash) {
    if (!emailHash) return;
    // Actualizar o crear track_usuario con email_hash
    const { data } = await supabase.from("track_usuarios")
      .select("id").eq("email_hash", emailHash).single();
    if (!data) {
      await supabase.from("track_usuarios").upsert({
        id: this.usuarioId,
        email_hash: emailHash,
        primer_canal: this.canal,
        primer_utms: this.utms,
        ultimo_visto: new Date().toISOString(),
      }, { onConflict: "id" });
    } else {
      await supabase.from("track_usuarios").update({
        ultimo_visto: new Date().toISOString(),
      }).eq("id", data.id);
      // Actualizar userId local para futuras sesiones
      localStorage.setItem(USER_KEY, data.id);
      this.usuarioId = data.id;
    }
  }

  // ── Flush on exit ────────────────────────────────────────────────────────

  _flush() {
    const duracion = Math.round((Date.now() - (this._startTime || Date.now())) / 1000);
    const payload = JSON.stringify({
      id: this.sesionId,
      duracion_seg: duracion,
      salida_url: window.location.href,
      updated_at: new Date().toISOString(),
    });
    // Use sendBeacon for guaranteed delivery on page exit
    if (navigator.sendBeacon) {
      // We'll use a Supabase edge function endpoint if available
      // Fallback: just update directly (may not complete on exit)
    }
    // Best-effort update
    supabase.from("track_sesiones").update({
      duracion_seg: duracion,
      salida_url: window.location.href,
    }).eq("id", this.sesionId).then(() => {});
  }
}

// Singleton
export const AtolanTrack = new AtolanTrackSDK();
export default AtolanTrack;
