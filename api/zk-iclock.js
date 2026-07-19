/**
 * Vercel API Route: ZKTeco ADMS PUSH receiver
 * URL: https://www.atolon.co/iclock/* (vía rewrite en vercel.json)
 *
 * Endpoints:
 *   GET  /iclock/cdata?SN=XXX&options=all     → handshake (config inicial)
 *   GET  /iclock/getrequest?SN=XXX            → polling de comandos
 *   POST /iclock/cdata?SN=XXX&table=ATTLOG    → punches (asistencia)
 *   POST /iclock/devicecmd?SN=XXX             → ack de comandos
 *
 * Env vars (Vercel): SUPABASE_URL, SUPABASE_SERVICE_KEY (o SERVICE_ROLE_KEY).
 *
 * No usamos el SDK @supabase/supabase-js para evitar dependencias —
 * llamamos a PostgREST directo como hacen los otros api/*.js.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
                  || process.env.SUPABASE_SERVICE_KEY
                  || process.env.VITE_SUPABASE_ANON_KEY
                  || process.env.SUPABASE_ANON_KEY
                  || "";

function pgHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function pgInsert(table, rows, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}` + (opts.onConflict ? `?on_conflict=${opts.onConflict}` : "");
  const headers = pgHeaders({ Prefer: opts.onConflict ? "resolution=merge-duplicates,return=minimal" : "return=minimal" });
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(rows) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`pg insert ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function pgUpdate(table, where, patch) {
  const qs = Object.entries(where).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join("&");
  const url = `${SUPABASE_URL}/rest/v1/${table}?${qs}`;
  const res = await fetch(url, { method: "PATCH", headers: pgHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(patch) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`pg update ${table} ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function pgSelect(table, params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${SUPABASE_URL}/rest/v1/${table}?${qs}`;
  const res = await fetch(url, { headers: pgHeaders() });
  if (!res.ok) return [];
  return res.json();
}

// ── Whitelist de terminales autorizados ─────────────────────────────
// Antes el endpoint aceptaba cualquier SN — riesgo de inyección de punches
// fake (nómina/control físico). Ahora valida contra zk_terminals_autorizados.
// Si SN no listado o activo=false → 401.
//
// Modo MONITOR para IP: registra last_seen_ip pero NO bloquea si difiere
// de ip_origen_esperada — fase 1 de descubrimiento. Hard-enforce en futuro.
async function autorizarTerminal(sn, ipOrigen) {
  if (!sn) return { ok: false, motivo: "sn_missing" };
  const rows = await pgSelect("zk_terminals_autorizados", {
    select: "sn,activo,ip_origen_esperada",
    sn: `eq.${sn}`,
    limit: 1,
  });
  const t = rows[0];
  if (!t) return { ok: false, motivo: "sn_no_autorizado" };
  if (!t.activo) return { ok: false, motivo: "terminal_inactivo" };
  // Update last_seen (fire-and-forget — no romper si falla)
  pgUpdate("zk_terminals_autorizados", { sn },
    { last_seen_ip: ipOrigen || null, last_seen_at: new Date().toISOString() }
  ).catch(() => {});
  const ipMismatch = !!(t.ip_origen_esperada && ipOrigen && t.ip_origen_esperada !== ipOrigen);
  return { ok: true, ip_mismatch: ipMismatch };
}

// ── Read raw body (text/plain con tabs) ──────────────────────────────
// El terminal ZK a veces manda binary (Buffer) — antes se serializaba con
// JSON.stringify(buffer) → {"type":"Buffer","data":[73,68,...]} y perdíamos
// el texto real. Decodifico como UTF-8 explícito.
function readRawBody(req) {
  if (typeof req.body === "string") return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString("utf8"));
  if (req.body && typeof req.body === "object") {
    // Vercel puede parsear form-urlencoded/JSON antes de entregarnos req.body.
    // Reconstruimos algo utilizable para URLSearchParams.
    if (req.body.type === "Buffer" && Array.isArray(req.body.data)) {
      return Promise.resolve(Buffer.from(req.body.data).toString("utf8"));
    }
    // form-urlencoded parseado → convertir de vuelta a query string
    try {
      return Promise.resolve(new URLSearchParams(req.body).toString());
    } catch {
      return Promise.resolve(JSON.stringify(req.body));
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ── Best-effort log ──────────────────────────────────────────────────
async function logComm(payload) {
  try { await pgInsert("zk_terminal_log", [payload]); } catch { /* swallow */ }
}

// ── Handshake response ───────────────────────────────────────────────
function buildHandshakeResponse(sn) {
  const stamp = "9999";
  return [
    `GET OPTION FROM: ${sn || ""}`,
    `ATTLOGStamp=${stamp}`,
    `OPERLOGStamp=${stamp}`,
    `ATTPHOTOStamp=${stamp}`,
    `ErrorDelay=30`,
    `Delay=30`,
    `TransTimes=00:00;14:05`,
    `TransInterval=1`,
    `TransFlag=TransData AttLog OpLog AttPhoto EnrollUser ChgUser EnrollFP ChgFP UserPic`,
    `TimeZone=-5`,
    `Realtime=1`,
    `Encrypt=None`,
  ].join("\n");
}

// ── ATTLOG parser ────────────────────────────────────────────────────
function parseAttLog(text) {
  const lines = (text || "").split(/\r?\n/).filter(l => l.trim());
  const STATUS_MAP = {
    "0": "entrada", "1": "salida", "2": "break_inicio", "3": "break_fin",
    "4": "overtime_entrada", "5": "overtime_salida",
  };
  const VERIFY_MAP = {
    "0": "pin", "1": "huella", "2": "tarjeta", "3": "huella+pin",
    "4": "face", "11": "face", "15": "face",
  };
  return lines.map(line => {
    const parts = line.split(/\t/);
    const [zkUserId, datetime, status, verify, workcode] = parts;
    if (!zkUserId || !datetime) return null;
    return {
      zk_user_id: String(zkUserId).trim(),
      datetime,
      tipo_marca: STATUS_MAP[String(status || "").trim()] || "auto",
      metodo:     VERIFY_MAP[String(verify || "").trim()] || "huella",
      workcode:   workcode ? String(workcode).trim() : null,
      raw_line:   line,
    };
  }).filter(Boolean);
}

function bogotaToISO(datetime) {
  if (!datetime) return null;
  const m = String(datetime).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) + 5 * 3600 * 1000;
  return new Date(utc).toISOString();
}

async function matchEmpleado(zkUserId) {
  if (!zkUserId) return null;
  const zk = String(zkUserId);
  // 1) match por zk_user_id
  let rows = await pgSelect("rh_empleados", {
    select: "id,nombres,apellidos,cedula",
    zk_user_id: `eq.${zk}`,
    limit: 1,
  });
  if (rows[0]) return rows[0];
  // 2) fallback: cédula
  rows = await pgSelect("rh_empleados", {
    select: "id,nombres,apellidos,cedula",
    cedula: `eq.${zk}`,
    limit: 1,
  });
  return rows[0] || null;
}

async function insertPunches(punches, terminalSn) {
  if (!punches.length) return { inserted: 0 };
  const rows = [];
  for (const p of punches) {
    const iso = bogotaToISO(p.datetime);
    if (!iso) continue;
    const ts = new Date(iso);
    const fecha = ts.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const hora  = ts.toLocaleTimeString("en-GB",  { timeZone: "America/Bogota", hour12: false });
    const empleado = await matchEmpleado(p.zk_user_id);
    rows.push({
      id:              `ZK-${terminalSn}-${ts.getTime()}-${p.zk_user_id}`,
      empleado_id:     empleado?.id || null,
      zk_user_id:      p.zk_user_id,
      cedula:          empleado?.cedula || null,
      nombre_snapshot: empleado ? `${empleado.nombres || ""} ${empleado.apellidos || ""}`.trim() : null,
      terminal_sn:     terminalSn,
      timestamp:       iso,
      fecha,
      hora,
      tipo_marca:      p.tipo_marca,
      metodo:          p.metodo,
      workcode:        p.workcode,
      raw:             { line: p.raw_line, datetime_str: p.datetime },
    });
  }
  if (!rows.length) return { inserted: 0 };
  await pgInsert("asistencia_zk", rows, { onConflict: "id" });
  return { inserted: rows.length };
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "atolon.co"}`);
  const fromRewrite = url.searchParams.get("_zkop") || "";
  const fromPath = url.pathname
    .replace(/^\/api\/zk-iclock/, "")
    .replace(/^\/iclock/, "")
    .replace(/^\//, "");
  const opName = (fromRewrite || fromPath || "").split("/")[0].toLowerCase();
  const opPath = "/" + opName;
  const terminalSn = url.searchParams.get("SN") || url.searchParams.get("sn") || "";
  const table      = (url.searchParams.get("table") || "").toUpperCase();

  const rawBody = req.method === "POST" ? await readRawBody(req).catch(() => "") : "";

  // IP de origen para auditoría (modo monitor, no bloquea aún).
  const ipOrigen = String(
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    ""
  ).trim() || null;

  // Best-effort log (no bloquear si falla)
  logComm({
    terminal_sn: terminalSn || null,
    operation:   `${req.method} ${opPath}${table ? "?table=" + table : ""}`,
    method:      req.method,
    query:       Object.fromEntries(url.searchParams.entries()),
    body_text:   rawBody?.slice(0, 4000) || null,
  });

  // Validar SN contra whitelist. Si no autorizado, 401 inmediato sin tocar
  // asistencia_zk ni responder OK al terminal — así no se simula handshake
  // a un atacante.
  const auth = await autorizarTerminal(terminalSn, ipOrigen);
  if (!auth.ok) {
    logComm({
      terminal_sn: terminalSn || null,
      operation:   `REJECT_AUTH ${req.method} ${opPath}`,
      method:      req.method,
      query:       Object.fromEntries(url.searchParams.entries()),
      body_text:   `motivo=${auth.motivo} ip=${ipOrigen || "?"}`,
      response:    auth.motivo,
      status_code: 401,
    });
    res.setHeader("Content-Type", "text/plain");
    return res.status(401).send("Unauthorized");
  }
  if (auth.ip_mismatch) {
    // Solo logueamos — no bloqueamos. Fase 1 de descubrimiento de IP real.
    console.warn(`[zk-iclock] IP mismatch para ${terminalSn}: esperada vs actual ${ipOrigen}`);
  }

  try {
    if (req.method === "GET" && opPath === "/cdata") {
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(buildHandshakeResponse(terminalSn));
    }

    if (req.method === "GET" && opPath === "/getrequest") {
      const cmds = await pgSelect("zk_terminal_commands", {
        select: "id,command",
        terminal_sn: `eq.${terminalSn}`,
        status: "eq.pending",
        order: "created_at.asc",
        limit: 1,
      });
      const cmd = cmds[0];
      res.setHeader("Content-Type", "text/plain");
      if (!cmd) return res.status(200).send("OK");
      await pgUpdate("zk_terminal_commands", { id: cmd.id }, {
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      return res.status(200).send(`C:${cmd.id}:${cmd.command}`);
    }

    if (req.method === "POST" && opPath === "/cdata") {
      if (table === "ATTLOG") {
        const punches = parseAttLog(rawBody);
        const r = await insertPunches(punches, terminalSn);
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send(`OK: ${r.inserted}`);
      }
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send("OK");
    }

    if (req.method === "POST" && opPath === "/devicecmd") {
      const params = new URLSearchParams(rawBody);
      const cmdId = params.get("ID");
      const ret   = params.get("Return");
      if (cmdId) {
        await pgUpdate("zk_terminal_commands", { id: cmdId }, {
          status: ret === "0" ? "done" : "failed",
          ack_at: new Date().toISOString(),
          result: rawBody?.slice(0, 500),
        });
      }
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send("OK");
    }

    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send("OK");

  } catch (err) {
    console.error("[zk-iclock] error:", err);
    logComm({
      terminal_sn: terminalSn,
      operation: `ERROR ${req.method} ${opPath}`,
      method: req.method,
      query: Object.fromEntries(url.searchParams.entries()),
      body_text: rawBody?.slice(0, 1000),
      response: String(err?.message || err).slice(0, 500),
      status_code: 500,
    });
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send("OK");
  }
}
