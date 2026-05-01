/**
 * Vercel API Route: ZKTeco ADMS PUSH receiver
 * URL: https://www.atolon.co/iclock/* (vía rewrite en vercel.json)
 *
 * El terminal ZKTeco MB10-T/VC (y similares) envía POSTs cada vez que
 * alguien marca con huella, face o tarjeta. También hace polling con
 * GET para chequear si hay comandos del servidor.
 *
 * Endpoints implementados:
 *   GET  /iclock/cdata?SN=XXX&options=all     → handshake (config inicial)
 *   GET  /iclock/getrequest?SN=XXX            → polling de comandos
 *   POST /iclock/cdata?SN=XXX&table=ATTLOG    → punches (asistencia)
 *   POST /iclock/cdata?SN=XXX&table=OPERLOG   → eventos del aparato
 *   POST /iclock/devicecmd?SN=XXX             → ack de comandos
 *
 * Config en el aparato (Menú → Comm → Cloud Server / ADMS):
 *   - Server: www.atolon.co
 *   - Port:   443
 *   - HTTPS:  ON
 *   - Path:   (algunos firmwares no piden — usa /iclock/ por default)
 *
 * Env vars necesarios (Vercel):
 *   SUPABASE_URL                — URL del proyecto
 *   SUPABASE_SERVICE_ROLE_KEY   — para bypass RLS en inserts
 */

import { createClient } from "@supabase/supabase-js";

// Vercel: necesitamos el body crudo (no parseado) porque el ZK manda
// text/plain con tabs como separador, no JSON.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const sb = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

// Log helper (best-effort, never throws)
async function logComm(client, payload) {
  try { await client.from("zk_terminal_log").insert(payload); } catch { /* ignore */ }
}

// ── Handshake: el aparato pide configuración al arrancar ─────────────
// Respondemos con flags estándar que activan PUSH en tiempo real.
function buildHandshakeResponse(sn) {
  // Stamps controlan re-envío de logs viejos. 9999 = "todo lo nuevo".
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
    `TimeZone=-5`,            // Cartagena UTC-5
    `Realtime=1`,             // empuja cada punch al instante
    `Encrypt=None`,
  ].join("\n");
}

// ── Parser ATTLOG ─────────────────────────────────────────────────────
// Formato ZKTeco (text/plain con tabs):
//   <user_id>\t<datetime>\t<status>\t<verify>\t<workcode>\t<reserved>...
// Una línea por punch, separadas por \n.
//
// status: 0 IN, 1 OUT, 2 break_out, 3 break_in, 4 OT_in, 5 OT_out
// verify: 0 password, 1 fingerprint, 2 card, 4 face, 15 face también
function parseAttLog(text, terminalSn) {
  const lines = (text || "").split(/\r?\n/).filter(l => l.trim());
  const STATUS_MAP = {
    "0": "entrada",
    "1": "salida",
    "2": "break_inicio",
    "3": "break_fin",
    "4": "overtime_entrada",
    "5": "overtime_salida",
  };
  const VERIFY_MAP = {
    "0": "pin",
    "1": "huella",
    "2": "tarjeta",
    "3": "huella+pin",
    "4": "face",
    "11": "face",
    "15": "face",
  };
  return lines.map(line => {
    const parts = line.split(/\t/);
    const [zkUserId, datetime, status, verify, workcode] = parts;
    if (!zkUserId || !datetime) return null;
    return {
      zk_user_id: String(zkUserId).trim(),
      datetime,                  // "2026-05-01 14:30:22"
      tipo_marca: STATUS_MAP[String(status).trim()] || "auto",
      metodo:     VERIFY_MAP[String(verify).trim()]   || "huella",
      workcode:   workcode ? String(workcode).trim() : null,
      raw_line:   line,
    };
  }).filter(Boolean);
}

// Parsea "2026-05-01 14:30:22" en hora Bogotá → ISO UTC
function bogotaToISO(datetime) {
  if (!datetime) return null;
  const m = String(datetime).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Bogotá es UTC-5 (sin DST). Construir como UTC y sumar 5h.
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) + 5 * 3600 * 1000;
  return new Date(utc).toISOString();
}

// ── Match empleado: zk_user_id → rh_empleados ────────────────────────
async function matchEmpleado(client, zkUserId) {
  if (!zkUserId) return null;
  // 1) match directo por zk_user_id
  let { data } = await client
    .from("rh_empleados")
    .select("id, nombres, apellidos, cedula")
    .eq("zk_user_id", String(zkUserId))
    .maybeSingle();
  if (data) return data;
  // 2) fallback: el zk_user_id puede ser la cédula
  ({ data } = await client
    .from("rh_empleados")
    .select("id, nombres, apellidos, cedula")
    .eq("cedula", String(zkUserId))
    .maybeSingle());
  return data || null;
}

// ── Insertar punches en asistencia_zk ────────────────────────────────
async function insertPunches(client, punches, terminalSn) {
  if (!punches.length) return { inserted: 0 };
  const rows = [];
  for (const p of punches) {
    const iso = bogotaToISO(p.datetime);
    if (!iso) continue;
    const ts = new Date(iso);
    const fechaBog = ts.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const horaBog  = ts.toLocaleTimeString("en-GB",  { timeZone: "America/Bogota", hour12: false });
    const empleado = await matchEmpleado(client, p.zk_user_id);
    rows.push({
      id:              `ZK-${terminalSn}-${ts.getTime()}-${p.zk_user_id}`,
      empleado_id:     empleado?.id || null,
      zk_user_id:      p.zk_user_id,
      cedula:          empleado?.cedula || null,
      nombre_snapshot: empleado ? `${empleado.nombres || ""} ${empleado.apellidos || ""}`.trim() : null,
      terminal_sn:     terminalSn,
      timestamp:       iso,
      fecha:           fechaBog,
      hora:            horaBog,
      tipo_marca:      p.tipo_marca,
      metodo:          p.metodo,
      workcode:        p.workcode,
      raw:             { line: p.raw_line, datetime_str: p.datetime },
    });
  }
  if (!rows.length) return { inserted: 0 };
  // upsert por id determinístico → reintentos no duplican
  const { error } = await client.from("asistencia_zk").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return { inserted: rows.length };
}

// ── Handler principal ────────────────────────────────────────────────
export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "atolon.co"}`);
  // El path puede llegar como:
  //   - /iclock/cdata           (sin rewrite — caso raro)
  //   - /api/zk-iclock?_zkop=cdata  (con rewrite Vercel — caso normal)
  //   - /api/zk-iclock/cdata    (algunos firmware permiten subdir)
  const fromRewrite = url.searchParams.get("_zkop") || "";
  const fromPath = url.pathname
    .replace(/^\/api\/zk-iclock/, "")
    .replace(/^\/iclock/, "")
    .replace(/^\//, "");
  const opName = (fromRewrite || fromPath || "").split("/")[0].toLowerCase();
  const opPath = "/" + opName;
  const terminalSn = url.searchParams.get("SN") || url.searchParams.get("sn") || "";
  const table      = (url.searchParams.get("table") || "").toUpperCase();

  const client = sb();
  const rawBody = req.method === "POST" ? await readRawBody(req) : "";

  // Best-effort log
  await logComm(client, {
    terminal_sn: terminalSn || null,
    operation:   `${req.method} ${opPath}${table ? "?table=" + table : ""}`,
    method:      req.method,
    query:       Object.fromEntries(url.searchParams.entries()),
    body_text:   rawBody?.slice(0, 4000) || null,
  });

  try {
    // ── GET /cdata → handshake inicial ────────────────────────────────
    if (req.method === "GET" && opPath === "/cdata") {
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(buildHandshakeResponse(terminalSn));
    }

    // ── GET /getrequest → polling de comandos pendientes ─────────────
    if (req.method === "GET" && opPath === "/getrequest") {
      // Buscar comandos pending para este terminal
      const { data: cmds } = await client
        .from("zk_terminal_commands")
        .select("id, command")
        .eq("terminal_sn", terminalSn)
        .eq("status", "pending")
        .order("created_at")
        .limit(1);
      const cmd = (cmds && cmds[0]) || null;
      res.setHeader("Content-Type", "text/plain");
      if (!cmd) return res.status(200).send("OK");
      // marcar como sent
      await client.from("zk_terminal_commands")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", cmd.id);
      return res.status(200).send(`C:${cmd.id}:${cmd.command}`);
    }

    // ── POST /cdata → datos pusheados por el aparato ──────────────────
    if (req.method === "POST" && opPath === "/cdata") {
      if (table === "ATTLOG") {
        const punches = parseAttLog(rawBody, terminalSn);
        const r = await insertPunches(client, punches, terminalSn);
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send(`OK: ${r.inserted}`);
      }
      // OPERLOG, USER, FACE, FP, etc. — log y ACK por ahora
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send("OK");
    }

    // ── POST /devicecmd → ACK de comandos ─────────────────────────────
    if (req.method === "POST" && opPath === "/devicecmd") {
      // Body: ID=<cmd_id>&Return=0&CMD=...
      const params = new URLSearchParams(rawBody);
      const cmdId = params.get("ID");
      const ret   = params.get("Return");
      if (cmdId) {
        await client.from("zk_terminal_commands")
          .update({
            status:  ret === "0" ? "done" : "failed",
            ack_at:  new Date().toISOString(),
            result:  rawBody?.slice(0, 500),
          })
          .eq("id", cmdId);
      }
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send("OK");
    }

    // Fallback: cualquier otra cosa → 200 OK para no bloquear el aparato
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send("OK");

  } catch (err) {
    console.error("[zk-iclock] error:", err);
    await logComm(client, {
      terminal_sn: terminalSn,
      operation: `ERROR ${req.method} ${opPath}`,
      method: req.method,
      query: Object.fromEntries(url.searchParams.entries()),
      body_text: rawBody?.slice(0, 1000),
      response: String(err?.message || err).slice(0, 500),
      status_code: 500,
    });
    res.setHeader("Content-Type", "text/plain");
    // ACK igual para no acumular reenvíos en el aparato; el log queda
    return res.status(200).send("OK");
  }
}
