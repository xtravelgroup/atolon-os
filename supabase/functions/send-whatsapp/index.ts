/**
 * send-whatsapp — Supabase Edge Function
 * Envía mensajes de WhatsApp via Meta Cloud API
 *
 * POST body:
 *   { to, template, params }
 *   to       = "+573001234567"
 *   template = "confirmacion_reserva" | "recordatorio_visita" | "recordatorio_muelle"
 *   params   = string[]   (variables {{1}}, {{2}}, ...)
 *
 * Endpoints:
 *   POST /send-whatsapp                   — enviar template (legacy, body en root)
 *   POST /send-whatsapp/send              — enviar template
 *   POST /send-whatsapp/send-text         — enviar texto libre (solo dentro de ventana 24h)
 *   GET  /send-whatsapp/diag              — diagnóstico público (token, phone, WABA, templates)
 *   GET  /send-whatsapp/templates         — lista templates aprobadas/rechazadas
 *
 * Configuración (todas en `configuracion` BD, rotable desde UI):
 *   meta_whatsapp_token            — token de acceso (env var META_WHATSAPP_TOKEN tiene prioridad)
 *   meta_whatsapp_phone_id         — phone_number_id de Meta
 *   meta_whatsapp_waba_id          — WhatsApp Business Account ID
 *   meta_whatsapp_token_expires_at — fecha de expiración (informativa, alerta UI)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ── Template variable counts (for validation) ────────────────────────────────
const TEMPLATE_PARAMS: Record<string, number> = {
  confirmacion_reserva: 7,   // nombre, fecha, paquete, personas, llegada, salida, zarpe_url
  recordatorio_visita:  6,   // nombre, fecha, paquete, personas, llegada, salida
  recordatorio_muelle:  3,   // nombre, llegada, salida
};

type MetaConfig = {
  token: string;
  phoneId: string;
  wabaId: string;
  tokenExpiresAt: string | null;
  source: { token: string; phoneId: string; wabaId: string };
};

// ── Cargar config: BD primero (rotable), env vars como fallback ──────────────
// Razón: cuando se rota el token desde la UI, queda en BD. El env var de
// Supabase puede quedar con el token viejo y bloquear envíos. Priorizar
// DB asegura que siempre se use el más reciente.
async function loadMetaConfig(SB: any): Promise<MetaConfig> {
  const envToken   = Deno.env.get("META_WHATSAPP_TOKEN") || "";
  const envPhone   = Deno.env.get("META_WHATSAPP_PHONE_ID") || "";
  const envWaba    = Deno.env.get("META_WHATSAPP_WABA_ID") || "";

  let dbToken = "", dbPhone = "", dbWaba = "", dbExpires: string | null = null;
  try {
    const { data } = await SB.from("configuracion")
      .select("meta_whatsapp_token, meta_whatsapp_phone_id, meta_whatsapp_waba_id, meta_whatsapp_token_expires_at")
      .eq("id", "atolon").single();
    if (data) {
      dbToken   = data.meta_whatsapp_token   || "";
      dbPhone   = data.meta_whatsapp_phone_id || "";
      dbWaba    = data.meta_whatsapp_waba_id  || "";
      dbExpires = data.meta_whatsapp_token_expires_at || null;
    }
  } catch { /* ignore */ }

  return {
    token:   dbToken || envToken,
    phoneId: dbPhone || envPhone,
    wabaId:  dbWaba  || envWaba,
    tokenExpiresAt: dbExpires,
    source: {
      token:   dbToken ? "db" : (envToken ? "env" : "none"),
      phoneId: dbPhone ? "db" : (envPhone ? "env" : "none"),
      wabaId:  dbWaba  ? "db" : (envWaba  ? "env" : "none"),
    },
  };
}

// ── Normalize phone number to E.164 ─────────────────────────────────────────
function normalizePhone(raw: string): string {
  let num = raw.replace(/[\s\-\(\)]/g, "");
  if (/^3\d{9}$/.test(num)) num = "+57" + num;
  if (!num.startsWith("+")) num = "+" + num;
  return num;
}

// ── Build Meta API payload (template) ────────────────────────────────────────
// `params` son las variables del body. `buttonParams` opcional son los
// parámetros para botones URL dinámicos (ej: link a confirmación con id de
// reserva). Si la template tiene botón URL con {{1}}, ese {{1}} viene del
// PRIMER buttonParams (sub_type=url, index=0).
function buildTemplatePayload(to: string, template: string, params: string[], lang = "es", buttonParams?: string[]) {
  const components: any[] = [];
  if (params.length > 0) {
    components.push({
      type: "body",
      parameters: params.map(p => ({ type: "text", text: String(p) })),
    });
  }
  if (buttonParams && buttonParams.length > 0) {
    buttonParams.forEach((bp, idx) => {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(idx),
        parameters: [{ type: "text", text: String(bp) }],
      });
    });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type: "template",
    template: {
      name:     template,
      language: { code: lang },
      components,
    },
  };
}

function buildTextPayload(to: string, body: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type: "text",
    text: { body: body.slice(0, 4096) },
  };
}

function jsonResp(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Logger a whatsapp_logs ──────────────────────────────────────────────────
async function logSend(SB: any, payload: {
  id: string; to: string; template: string; params: any[];
  status: string; meta_response: any; reserva_id?: string;
}) {
  try {
    await SB.from("whatsapp_logs").insert({
      id:           payload.id,
      to_number:    payload.to,
      template:     payload.template,
      params:       payload.params,
      status:       payload.status,
      meta_response: payload.meta_response,
      reserva_id:   payload.reserva_id || null,
      created_at:   new Date().toISOString(),
    });
  } catch { /* logging is best-effort */ }
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/send-whatsapp/, "");

  const SB = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ══ GET /diag ════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "/diag") {
    try {
      const cfg = await loadMetaConfig(SB);
      let phoneStatus: any = null;
      let templates: any[] = [];

      if (cfg.token && cfg.phoneId) {
        try {
          const r = await fetch(
            `https://graph.facebook.com/v19.0/${cfg.phoneId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,name_status,messaging_limit_tier,is_official_business_account`,
            { headers: { Authorization: `Bearer ${cfg.token}` } }
          );
          phoneStatus = await r.json();
        } catch { /* ignore */ }
      }

      if (cfg.token && cfg.wabaId) {
        try {
          const r = await fetch(
            `https://graph.facebook.com/v19.0/${cfg.wabaId}/message_templates?limit=20&fields=name,status,category,language`,
            { headers: { Authorization: `Bearer ${cfg.token}` } }
          );
          const data = await r.json();
          templates = data?.data || [];
        } catch { /* ignore */ }
      }

      const { count: totalLogs } = await SB
        .from("whatsapp_logs")
        .select("*", { count: "exact", head: true });

      const tokenExpired = cfg.tokenExpiresAt
        ? new Date(cfg.tokenExpiresAt) < new Date()
        : null;

      return jsonResp({
        ok: true,
        timestamp: new Date().toISOString(),
        config: {
          token_configured: !!cfg.token,
          token_source:     cfg.source.token,
          token_expires_at: cfg.tokenExpiresAt,
          token_expired:    tokenExpired,
          phone_id:         cfg.phoneId || null,
          phone_id_source:  cfg.source.phoneId,
          waba_id:          cfg.wabaId || null,
          waba_id_source:   cfg.source.wabaId,
        },
        phone_status: phoneStatus,
        templates,
        stats: { total_logs: totalLogs || 0 },
      });
    } catch (err) {
      return jsonResp({ ok: false, error: String(err) }, 500);
    }
  }

  // ══ GET /templates ═══════════════════════════════════════════════════
  if (req.method === "GET" && path === "/templates") {
    try {
      const cfg = await loadMetaConfig(SB);
      if (!cfg.token || !cfg.wabaId) {
        return jsonResp({ ok: false, error: "Token o WABA ID no configurados" }, 500);
      }
      const r = await fetch(
        `https://graph.facebook.com/v19.0/${cfg.wabaId}/message_templates?limit=50&fields=name,status,category,language,components,rejected_reason`,
        { headers: { Authorization: `Bearer ${cfg.token}` } }
      );
      const data = await r.json();
      return jsonResp({ ok: r.ok, ...data });
    } catch (err) {
      return jsonResp({ ok: false, error: String(err) }, 500);
    }
  }

  // ══ POST send (template) — admite path "" o "/send" ═════════════════
  if (req.method === "POST" && (path === "" || path === "/send")) {
    try {
      const { to, template, params = [], lang = "es", reserva_id, buttonParams } = await req.json();
      if (!to || !template) return jsonResp({ error: "to and template are required" }, 400);

      const cfg = await loadMetaConfig(SB);
      if (!cfg.token || !cfg.phoneId) {
        return jsonResp({ error: "Meta config incompleta. Configurar meta_whatsapp_token y meta_whatsapp_phone_id." }, 500);
      }

      const phone   = normalizePhone(to);
      // Si la template es confirmacion_pasadia_atolon o vip_pass_confirmacion
      // y no se pasa buttonParams explícito, usar reserva_id (último param o
      // el reserva_id del body) como parámetro del botón URL.
      const autoButtonParams = !buttonParams && (template === "confirmacion_pasadia_atolon" || template === "vip_pass_confirmacion")
        ? [String(reserva_id || params[params.length - 1] || "")]
        : buttonParams;
      const payload = buildTemplatePayload(phone, template, params, lang, autoButtonParams);

      // Timeout 15s en fetch a Meta Graph — antes podia colgar la function
      // hasta el global timeout (60s+) si Meta se ponia lenta.
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${cfg.phoneId}/messages`,
        {
          method:  "POST",
          signal:  AbortSignal.timeout(15_000),
          headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();

      await logSend(SB, {
        id:       data.messages?.[0]?.id ?? `LOG-${Date.now()}`,
        to:       phone,
        template,
        params,
        status:   res.ok ? "sent" : "error",
        meta_response: data,
        reserva_id,
      });

      return jsonResp(data, res.ok ? 200 : 400);
    } catch (err) {
      // No exponer String(err) — puede contener Authorization header truncado o env names.
      console.error("[send-whatsapp /send-template] error:", err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return jsonResp({ error: isAbort ? "meta_timeout" : "internal_error" }, isAbort ? 504 : 500);
    }
  }

  // ══ POST /send-text — texto libre (solo dentro de ventana 24h) ═══════
  if (req.method === "POST" && path === "/send-text") {
    try {
      const { to, body, reserva_id } = await req.json();
      if (!to || !body) return jsonResp({ error: "to and body are required" }, 400);

      const cfg = await loadMetaConfig(SB);
      if (!cfg.token || !cfg.phoneId) {
        return jsonResp({ error: "Meta config incompleta." }, 500);
      }

      const phone   = normalizePhone(to);
      const payload = buildTextPayload(phone, body);

      const res = await fetch(
        `https://graph.facebook.com/v19.0/${cfg.phoneId}/messages`,
        {
          method:  "POST",
          signal:  AbortSignal.timeout(15_000),
          headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();

      await logSend(SB, {
        id:       data.messages?.[0]?.id ?? `LOG-${Date.now()}`,
        to:       phone,
        template: "_text_libre",
        params:   [body.slice(0, 200)],
        status:   res.ok ? "sent" : "error",
        meta_response: data,
        reserva_id,
      });

      return jsonResp(data, res.ok ? 200 : 400);
    } catch (err) {
      console.error("[send-whatsapp /send-text] error:", err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return jsonResp({ error: isAbort ? "meta_timeout" : "internal_error" }, isAbort ? 504 : 500);
    }
  }

  return jsonResp({ error: "Not found", path }, 404);
});
