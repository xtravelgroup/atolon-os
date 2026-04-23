// AtolanTrack v2.1 — GTM/GA4/Pixel + Server-side fallback
/**
 * AtolanTrack — SDK de analítica para Atolon OS
 * Tracking de sesiones, embudos, atribución, abandono, scoring e inteligencia de cliente
 * Integrado con: GTM → GA4 · Meta Pixel · Server-side fallback (Edge Function)
 */

import { supabase } from "./supabase";
import {
  gtmPageView, gtmViewItem, gtmBeginCheckout, gtmAddPaymentInfo,
  gtmPurchase, gtmPaymentError, gtmAbandon, gtmWhatsApp,
  gtmExitIntent, gtmScrollDepth,
} from "./gtm";

const SERVER_TRACK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-event`;
const SERVER_KEY       = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id"].forEach(k => {
    const v = p.get(k); if (v) utms[k] = v;
  });
  return utms;
}

function parseClickIds() {
  const p = new URLSearchParams(window.location.search);
  return {
    gclid:   p.get("gclid")   || null,   // Google Ads
    fbclid:  p.get("fbclid")  || null,   // Meta Ads
    msclkid: p.get("msclkid") || null,   // Microsoft Ads
    ttclid:  p.get("ttclid")  || null,   // TikTok Ads
  };
}

function clasificarCanal(utms, referrer, clickIds) {
  const src = utms.utm_source?.toLowerCase() || "";
  const med = utms.utm_medium?.toLowerCase() || "";
  const ref = referrer?.toLowerCase() || "";

  if (clickIds?.gclid || (src === "google" && med === "cpc")) return "sem_google";
  if (clickIds?.msclkid || (src === "bing" && med === "cpc")) return "sem_bing";
  if (clickIds?.ttclid  || src === "tiktok") return med === "cpc" ? "paid_social_tiktok" : "organic_tiktok";
  if (clickIds?.fbclid  || src === "facebook" || src === "instagram" || src === "meta") {
    return med === "cpc" ? "paid_social_meta" : "organic_social";
  }
  if (src === "email" || med === "email") return "email";
  if (src === "whatsapp" || med === "whatsapp") return "whatsapp";
  if (src === "qr" || med === "qr" || med === "offline") return "offline_qr";
  if (ref.includes("google") || ref.includes("bing") || ref.includes("yahoo") || ref.includes("duckduckgo")) return "seo_organico";
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
  if (ua.includes("Chrome") && !ua.includes("Edg") && !ua.includes("OPR")) return "Chrome";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("OPR") || ua.includes("Opera")) return "Opera";
  return "Otro";
}

function getOS() {
  if (navigator.userAgentData?.platform) return navigator.userAgentData.platform;
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

function isBot() {
  const ua = navigator.userAgent;
  return /bot|crawler|spider|scraper|headless|phantom|selenium|puppeteer|playwright|prerender|preview/i.test(ua);
}

// ─── Scroll Depth Tracking ──────────────────────────────────────────────────

function setupScrollTracking(callback) {
  const thresholds = new Set([25, 50, 75, 90, 100]);
  let fired = new Set();
  const handler = () => {
    const pct = Math.round(
      ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100
    );
    for (const t of thresholds) {
      if (pct >= t && !fired.has(t)) {
        fired.add(t);
        callback(t);
      }
    }
  };
  window.addEventListener("scroll", handler, { passive: true });
  return () => window.removeEventListener("scroll", handler);
}

// ─── Exit Intent ────────────────────────────────────────────────────────────

function setupExitIntent(callback) {
  let fired = false;
  const handler = (e) => {
    if (e.clientY <= 10 && !fired) {
      fired = true;
      callback();
      // Reset after 30s so it can fire again
      setTimeout(() => { fired = false; }, 30000);
    }
  };
  document.addEventListener("mouseleave", handler);
  return () => document.removeEventListener("mouseleave", handler);
}

// ─── Session Manager ────────────────────────────────────────────────────────

const SESSION_KEY  = "at_sid";
const USER_KEY     = "at_uid";
const FIRST_TS_KEY = "at_first_ts";

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

// ─── Tourist Classification ─────────────────────────────────────────────────

function clasificarTurista(geo) {
  if (!geo) return null;
  // If country is not Colombia → definitely tourist
  if (geo.country_code && geo.country_code !== "CO") return true;
  // If in Colombia but not Cartagena/Bolívar region → likely tourist (visiting)
  if (geo.region && !["bolívar","bolivar","cartagena"].some(r => geo.region.toLowerCase().includes(r))) return true;
  return false;
}

// ─── Intent Scoring ─────────────────────────────────────────────────────────

function calcIntentScore(step, scrollPct = 0, eventCount = 0) {
  let score = 0;
  score += (step || 0) * 15;          // Each funnel step = 15 pts (max 90)
  score += Math.min(scrollPct / 2, 5); // Scroll up to 5 pts
  score += Math.min(eventCount, 10);   // Engagement events up to 10 pts
  return Math.min(Math.round(score), 100);
}

// ─── AtolanTrack SDK ────────────────────────────────────────────────────────

class AtolanTrackSDK {
  constructor() {
    this.sesionId    = getSesionId();
    this.usuarioId   = getUsuarioId();
    this.utms        = parseUTMs();
    this.clickIds    = parseClickIds();
    this.canal       = clasificarCanal(this.utms, document.referrer, this.clickIds);
    this.isBot       = isBot();
    this.inicializado = false;
    this.embudo      = null;
    this.currentStep = 0;
    this.maxScroll   = 0;
    this.eventCount  = 0;
    this.siteLang    = null;
    this._startTime  = null;

    // Runtime state for abandonment
    this._abandonmentPayload = null;
  }

  async init() {
    if (this.isBot) return;
    if (this.inicializado) return;
    this.inicializado = true;
    this._startTime = Date.now();

    const isReturning = localStorage.getItem("at_returning") === "true";

    await supabase.from("track_sesiones").upsert({
      id:           this.sesionId,
      usuario_id:   this.usuarioId,
      dispositivo:  getDevice(),
      navegador:    getBrowser(),
      os:           getOS(),
      pantalla:     `${screen.width}x${screen.height}`,
      viewport:     `${window.innerWidth}x${window.innerHeight}`,
      idioma:       navigator.language,
      utms:         this.utms,
      canal:        this.canal,
      referrer:     document.referrer || null,
      entrada_url:  window.location.href,
      is_returning: isReturning,
      is_bot:       this.isBot,
      gclid:        this.clickIds.gclid,
      fbclid:       this.clickIds.fbclid,
      msclkid:      this.clickIds.msclkid,
      ttclid:       this.clickIds.ttclid,
      moneda:       "COP",
      created_at:   new Date().toISOString(),
    }, { onConflict: "id" });

    localStorage.setItem("at_returning", "true");

    // Geo lookup (async, non-blocking)
    this._fetchGeo();

    // Scroll depth tracking
    setupScrollTracking((pct) => {
      this.maxScroll = Math.max(this.maxScroll, pct);
      gtmScrollDepth(pct);
      this.evento("scroll_depth", { profundidad_pct: pct }, "engagement");
    });

    // Exit intent tracking
    setupExitIntent(() => {
      gtmExitIntent(this.currentStep);
      this.evento("exit_intent", {
        paso_actual: this.currentStep,
        max_scroll:  this.maxScroll,
        canal:       this.canal,
      }, "engagement");
    });

    // Flush on exit
    window.addEventListener("beforeunload", () => this._flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this._flush();
    });
  }

  // ── Page View ─────────────────────────────────────────────────────────────

  async pageView(path = null, title = null) {
    if (this.isBot) return;
    if (!this.inicializado) await this.init();
    const p = path  || window.location.pathname;
    const t = title || document.title;
    gtmPageView(p, t);
    await this.evento("page_view", { path: p, title: t, url: window.location.href }, "navegacion");
  }

  // ── Generic Event ─────────────────────────────────────────────────────────

  async evento(tipo, datos = {}, categoria = null) {
    if (this.isBot) return;
    if (!this.inicializado) await this.init();
    this.eventCount++;

    const key    = `${this.sesionId}:${tipo}:${JSON.stringify(datos)}`;
    const idKey  = await sha256(key);
    const id     = nanoid();

    await supabase.from("track_eventos").upsert({
      id,
      sesion_id:        this.sesionId,
      usuario_id:       this.usuarioId,
      tipo,
      categoria,
      datos,
      url:              window.location.href,
      ts:               new Date().toISOString(),
      idempotency_key:  idKey,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  }

  // ── Funnel Step ───────────────────────────────────────────────────────────

  async embudo_paso(paso, datos = {}) {
    if (this.isBot) return;
    if (!this.inicializado) await this.init();

    const campo = `paso_${paso}_ts`;
    const now   = new Date().toISOString();

    if (!this.embudo) {
      const { data } = await supabase.from("track_embudos")
        .select("id").eq("sesion_id", this.sesionId).single();
      if (data) {
        this.embudo = data.id;
      } else {
        this.embudo = nanoid();
        const insertPayload = {
          id:           this.embudo,
          sesion_id:    this.sesionId,
          usuario_id:   this.usuarioId,
          [campo]:      now,
          convertido:   false,
        };
        // Enrich embudo with context if available
        if (datos.producto || datos.package_type) insertPayload.package_type = datos.producto || datos.package_type;
        if (datos.pax_adultos || datos.adultos)   insertPayload.pax_adultos  = datos.pax_adultos || datos.adultos;
        if (datos.pax_ninos   || datos.ninos)     insertPayload.pax_ninos    = datos.pax_ninos || datos.ninos;
        if (datos.fecha)                           insertPayload.fecha_visita = datos.fecha;
        if (datos.valor || datos.monto)            insertPayload.monto_potencial = datos.valor || datos.monto;

        await supabase.from("track_embudos").insert(insertPayload);
        this.currentStep = paso;
        await this.evento(`embudo_paso_${paso}`, datos, "embudo");
        this._syncAbandonmentPayload(datos);
        return;
      }
    }

    // Update existing embudo
    const updatePayload = { [campo]: now };
    if (datos.producto || datos.package_type) updatePayload.package_type   = datos.producto || datos.package_type;
    if (datos.pax_adultos || datos.adultos)   updatePayload.pax_adultos    = datos.pax_adultos || datos.adultos;
    if (datos.pax_ninos   || datos.ninos)     updatePayload.pax_ninos      = datos.pax_ninos || datos.ninos;
    if (datos.fecha)                           updatePayload.fecha_visita   = datos.fecha;
    if (datos.valor || datos.monto)            updatePayload.monto_potencial = datos.valor || datos.monto;

    await supabase.from("track_embudos").update(updatePayload).eq("id", this.embudo);

    if (datos.email) {
      const emailHash = await sha256(datos.email);
      await supabase.from("track_embudos").update({ email_abandono: emailHash }).eq("id", this.embudo);
      await this._stitch(datos.email, emailHash);
    }

    await this.evento(`embudo_paso_${paso}`, datos, "embudo");
    this.currentStep = paso;
    this._syncAbandonmentPayload(datos);

    // Update intent score on usuario
    const score = calcIntentScore(paso, this.maxScroll, this.eventCount);
    supabase.from("track_usuarios").update({ intent_score: score, ultimo_visto: now })
      .eq("id", this.usuarioId).then(() => {});
  }

  _syncAbandonmentPayload(datos = {}) {
    this._abandonmentPayload = {
      package_type:    datos.producto || datos.package_type || this._abandonmentPayload?.package_type || null,
      fecha_visita:    datos.fecha    || this._abandonmentPayload?.fecha_visita || null,
      pax_total:       (datos.pax_adultos || 0) + (datos.pax_ninos || 0)
                       || this._abandonmentPayload?.pax_total || null,
      monto_potencial: datos.valor || datos.monto || this._abandonmentPayload?.monto_potencial || null,
    };
  }

  async embudo_abandono(pasoActual) {
    if (!this.embudo || !pasoActual) return;
    await supabase.from("track_embudos").update({
      abandono_paso: pasoActual,
    }).eq("id", this.embudo);
    await this.evento("embudo_abandono", { paso: pasoActual }, "embudo");
  }

  // ── Conversion ────────────────────────────────────────────────────────────

  async conversion(reservaId, monto, extras = {}) {
    if (!this.inicializado) await this.init();
    const id  = nanoid();
    const now = new Date().toISOString();

    await supabase.from("track_ingresos").upsert({
      id,
      sesion_id:    this.sesionId,
      usuario_id:   this.usuarioId,
      reserva_id:   reservaId,
      monto,
      monto_bruto:  extras.monto_bruto || monto,
      descuento:    extras.descuento   || 0,
      cupon:        extras.cupon       || null,
      canal:        this.canal,
      utms:         this.utms,
      moneda:       "COP",
      metodo_pago:  extras.metodo_pago || null,
      estado_pago:  "pagado",
      package_type: extras.package_type || null,
      adultos:      extras.adultos || null,
      ninos:        extras.ninos   || null,
      fecha_visita: extras.fecha   || null,
      salida:       extras.salida  || null,
      created_at:   now,
    }, { onConflict: "reserva_id", ignoreDuplicates: true });

    // Mark session as converted
    await supabase.from("track_sesiones").update({
      convertida: true,
      ingreso:    monto,
    }).eq("id", this.sesionId);

    // Mark embudo as converted
    if (this.embudo) {
      await supabase.from("track_embudos").update({
        paso_6_ts:  now,
        convertido: true,
      }).eq("id", this.embudo);
    }

    // Update usuario stats
    await this._updateUsuarioStats(monto, now);

    // Attribution models
    await this._registrarAtribuciones(id, monto);

    gtmPurchase(reservaId, monto, { tipo: extras.package_type }, extras.adultos, extras.ninos, extras.fecha);
    await this.evento("conversion", { reserva_id: reservaId, monto, ...extras }, "conversion");
  }

  async _updateUsuarioStats(monto, now) {
    const { data } = await supabase.from("track_usuarios").select("*").eq("id", this.usuarioId).single();
    if (data) {
      const nuevasConversiones = (data.conversiones_count || 0) + 1;
      const nuevoIngreso       = (data.ingreso_total || 0) + monto;
      // Value score: 0–100 based on total spend
      const valueScore = Math.min(Math.round((nuevoIngreso / 2000000) * 100), 100);
      // Segment
      let segmento = "nuevo";
      if (nuevasConversiones >= 3) segmento = "cliente_recurrente";
      else if (nuevoIngreso >= 1500000) segmento = "alto_valor";
      else if (nuevasConversiones >= 2) segmento = "retorno";

      await supabase.from("track_usuarios").update({
        conversiones_count: nuevasConversiones,
        ingreso_total:      nuevoIngreso,
        value_score:        valueScore,
        segmento,
        ultimo_visto:       now,
      }).eq("id", this.usuarioId);
    } else {
      await supabase.from("track_usuarios").upsert({
        id:                 this.usuarioId,
        primer_canal:       this.canal,
        primer_utms:        this.utms,
        sesiones_count:     1,
        conversiones_count: 1,
        ingreso_total:      monto,
        value_score:        Math.min(Math.round((monto / 2000000) * 100), 100),
        ultimo_visto:       now,
        segmento:           "nuevo",
      }, { onConflict: "id" });
    }
  }

  async _registrarAtribuciones(ingresoId, monto) {
    // Last touch (always available)
    await supabase.from("track_atribuciones").insert({
      ingreso_id: ingresoId,
      modelo:     "last_touch",
      canal:      this.canal,
      valor:      monto,
      peso:       1.0,
    });

    // First touch (use primer_canal from track_usuarios if different)
    const { data: usr } = await supabase.from("track_usuarios")
      .select("primer_canal").eq("id", this.usuarioId).single();
    if (usr && usr.primer_canal && usr.primer_canal !== this.canal) {
      await supabase.from("track_atribuciones").insert({
        ingreso_id: ingresoId,
        modelo:     "first_touch",
        canal:      usr.primer_canal,
        valor:      monto,
        peso:       1.0,
      });
    }
  }

  // ── Payment Error ─────────────────────────────────────────────────────────

  async paymentError(metodo, codigo, mensaje, monto = null) {
    gtmPaymentError(metodo, codigo);
    await this.evento("payment_error", {
      metodo,
      codigo_error: codigo,
      mensaje:      mensaje,
      monto,
      paso:         this.currentStep,
    }, "conversion");
  }

  // ── Language Tracking ─────────────────────────────────────────────────────

  // ── WhatsApp helper (wraps evento + GTM) ─────────────────────────────────

  async whatsappClick(source = "float_button") {
    gtmWhatsApp(source);
    await this.evento("whatsapp_click", { source }, "engagement");
  }

  setLang(lang) {
    this.siteLang = lang;
    supabase.from("track_sesiones")
      .update({ idioma_sitio: lang })
      .eq("id", this.sesionId)
      .then(() => {});
    supabase.from("track_usuarios")
      .update({ idioma_preferido: lang })
      .eq("id", this.usuarioId)
      .then(() => {});
    this.evento("language_changed", { idioma: lang }, "engagement");
  }

  setCurrentStep(step) {
    this.currentStep = step;
  }

  // ── User Stitching ────────────────────────────────────────────────────────

  async _stitch(email, emailHash) {
    if (!emailHash) return;
    const { data } = await supabase.from("track_usuarios")
      .select("id").eq("email_hash", emailHash).single();
    if (!data) {
      await supabase.from("track_usuarios").upsert({
        id:            this.usuarioId,
        email_hash:    emailHash,
        primer_canal:  this.canal,
        primer_utms:   this.utms,
        ultimo_visto:  new Date().toISOString(),
      }, { onConflict: "email_hash" });
    } else {
      await supabase.from("track_usuarios").update({
        ultimo_visto: new Date().toISOString(),
      }).eq("id", data.id);
      localStorage.setItem(USER_KEY, data.id);
      this.usuarioId = data.id;
    }
  }

  // ── Geo Lookup ────────────────────────────────────────────────────────────

  async _fetchGeo() {
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 4000);
      const res        = await fetch("https://ipapi.co/json/", { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return;
      const d = await res.json();
      if (d?.country_name) {
        const esTurista = clasificarTurista(d);
        await supabase.from("track_sesiones").update({
          pais:       d.country_name,
          region:     d.region     || null,
          ciudad:     d.city       || null,
          timezone:   d.timezone   || null,
          es_turista: esTurista,
          moneda:     d.currency   || "COP",
        }).eq("id", this.sesionId);

        // Update usuario profile with geo
        supabase.from("track_usuarios").update({
          pais:       d.country_name,
          es_turista: esTurista,
        }).eq("id", this.usuarioId).then(() => {});
      }
    } catch { /* geo not available */ }
  }

  // ── Flush on Exit ─────────────────────────────────────────────────────────

  _flush() {
    const duracion     = Math.round((Date.now() - (this._startTime || Date.now())) / 1000);
    const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const headers = {
      "apikey":        supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=minimal",
    };

    // 1. Update session duration
    fetch(`${supabaseUrl}/rest/v1/track_sesiones?id=eq.${this.sesionId}`, {
      method:    "PATCH",
      keepalive: true,
      headers,
      body: JSON.stringify({ duracion_seg: duracion }),
    }).catch(() => {});

    // 2. If mid-funnel: record abandonment step
    const isMidFunnel = this.embudo && this.currentStep > 0 && this.currentStep < 6;
    if (isMidFunnel) {
      fetch(`${supabaseUrl}/rest/v1/track_embudos?id=eq.${this.embudo}&abandono_paso=is.null`, {
        method:    "PATCH",
        keepalive: true,
        headers,
        body: JSON.stringify({ abandono_paso: this.currentStep }),
      }).catch(() => {});
    }

    // 3. Record in track_abandonment (rich abandonment record)
    if (isMidFunnel) {
      const abPayload = {
        id:               nanoid(),
        sesion_id:        this.sesionId,
        usuario_id:       this.usuarioId,
        paso_abandono:    this.currentStep,
        canal:            this.canal,
        utms:             this.utms,
        dispositivo:      getDevice(),
        idioma:           this.siteLang || navigator.language,
        monto_potencial:  this._abandonmentPayload?.monto_potencial || null,
        package_type:     this._abandonmentPayload?.package_type    || null,
        fecha_visita:     this._abandonmentPayload?.fecha_visita    || null,
        pax_total:        this._abandonmentPayload?.pax_total       || null,
        created_at:       new Date().toISOString(),
      };
      fetch(`${supabaseUrl}/rest/v1/track_abandonment`, {
        method:    "POST",
        keepalive: true,
        headers,
        body: JSON.stringify(abPayload),
      }).catch(() => {});
    }

    // 4. Update intent/engagement scores on session close
    const engScore = Math.min(Math.round((this.eventCount / 20) * 100), 100);
    supabase?.from("track_usuarios").update({
      engagement_score: engScore,
    }).eq("id", this.usuarioId).then(() => {});
  }

  // ── Server-side event (adblocker-resistant fallback) ──────────────────────
  // Use for critical events: conversion, payment_error
  async serverEvent(tipo, datos = {}, categoria = null) {
    if (!SERVER_TRACK_URL || !SERVER_KEY) return;
    try {
      await fetch(SERVER_TRACK_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SERVER_KEY,
          "Authorization": `Bearer ${SERVER_KEY}`,
        },
        body: JSON.stringify({
          tipo,
          categoria,
          datos,
          sesion_id:  this.sesionId,
          usuario_id: this.usuarioId,
          url:        window.location.href,
          ts:         new Date().toISOString(),
        }),
      });
    } catch { /* best effort */ }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────
export const AtolanTrack = new AtolanTrackSDK();
export default AtolanTrack;
