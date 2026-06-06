#!/usr/bin/env node
/**
 * Atolón Print Agent — Supabase Realtime Subscriber
 *
 * Se suscribe a la cola `cajas_evento_impresion_queue` de Supabase y
 * envía cada ticket como ESC/POS bytes vía TCP directo a la impresora
 * (puerto 9100). No requiere navegador ni Chrome --kiosk-printing.
 *
 * Configurable con variables de entorno o archivo .env:
 *   SUPABASE_URL=https://...supabase.co
 *   SUPABASE_ANON_KEY=...
 *   IMPRESORA_IDS=IMP-3,IMP-4   ← lista separada por comas
 *
 * Arranque:
 *   node src/agent.js
 *   o npm run agent
 *
 * Diseño:
 *   - Lee impresoras (IP/puerto) de la tabla `cajas_evento_impresoras`
 *   - Procesa pendientes (status=pending|failed) al arrancar
 *   - Subscribe Realtime para INSERTs nuevos
 *   - Polling cada 30s como fallback si Realtime se cae
 *   - Marca status=printing → printed/failed con timestamps
 *   - Reintenta hasta 3 veces antes de marcar failed permanente
 */

const { createClient } = require('@supabase/supabase-js');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────
function loadEnv() {
  // Carga .env si existe en el dir actual o en el dir del script
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      raw.split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
        if (m && !process.env[m[1]]) {
          let val = m[2];
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[m[1]] = val;
        }
      });
      console.log('[env] cargado:', p);
      return;
    }
  }
  console.log('[env] sin .env (usando solo variables de entorno)');
}
loadEnv();

// Defaults baked in al build. Son los mismos valores PÚBLICOS que están
// en el bundle JS de atolon.co — son la URL del proyecto y la anon key
// (RLS controla qué puede leer/escribir, no son secrets). Se pueden
// sobreescribir vía env vars si hace falta.
const SUPABASE_URL      = process.env.SUPABASE_URL      || 'https://ncdyttgxuicyruathkxd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs';

// Resolver IMPRESORA_IDS en orden de prioridad:
//   1. CLI args:        atolon-print-agent.exe IMP-3 IMP-4
//   2. env var:         IMPRESORA_IDS=IMP-3,IMP-4
//   3. archivo imp.txt: en el mismo directorio que el .exe
//   4. default:         IMP-3 (la primera impresora de red del evento)
const IMPRESORA_IDS = (() => {
  const cli = process.argv.slice(2).filter(s => /^IMP-/i.test(s)).map(s => s.toUpperCase());
  if (cli.length) return cli;
  const env = (process.env.IMPRESORA_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (env.length) return env;
  try {
    const exeDir = process.pkg ? path.dirname(process.execPath) : __dirname;
    const file = path.join(exeDir, 'imp.txt');
    if (fs.existsSync(file)) {
      const ids = fs.readFileSync(file, 'utf8').split(/[\r\n,]/).map(s => s.trim()).filter(Boolean);
      if (ids.length) return ids;
    }
  } catch {}
  return ['IMP-3'];
})();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

// Cache de info de impresoras (id → {nombre, printer_ip, printer_port})
const impresoras = new Map();

async function loadImpresoras() {
  const { data, error } = await supabase
    .from('cajas_evento_impresoras')
    .select('id, nombre, ubicacion, printer_ip, printer_port, printer_usb_name, tipo_conexion')
    .in('id', IMPRESORA_IDS);
  if (error) {
    console.error('[loadImpresoras] error:', error.message);
    return;
  }
  impresoras.clear();
  (data || []).forEach(i => impresoras.set(i.id, i));
  console.log(`[impresoras] cargadas ${impresoras.size}/${IMPRESORA_IDS.length}:`);
  for (const i of impresoras.values()) {
    const target = i.tipo_conexion === 'network'
      ? `tcp://${i.printer_ip}:${i.printer_port || 9100}`
      : `usb (${i.printer_usb_name || 'default'})`;
    console.log(`  - ${i.id} → ${i.nombre} @ ${target}`);
  }
  for (const id of IMPRESORA_IDS) {
    if (!impresoras.has(id)) {
      console.warn(`  ⚠ ${id} NO existe en BD o está inactiva`);
    }
  }
}

// Evita doble procesamiento entre INSERT realtime y polling
const procesando = new Set();

// ── ESC/POS render del ticket ─────────────────────────────────────────────
function construirTicket(job) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://localhost:0', // dummy, no se usa — solo construimos el buffer
    characterSet: CharacterSet.PC850_MULTILINGUAL,
    removeSpecialCharacters: false,
  });

  const items = Array.isArray(job.items) ? job.items : [];
  const fecha = new Date(job.created_at || Date.now());
  const horaTxt = fecha.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  });
  // Referencia corta = sufijo random del venta_id
  const shortRef = String(job.venta_id || '').split('-').pop().toUpperCase();
  const cajero = job.cajero_nombre || '—';
  const caja   = job.caja_id || '';

  // Un ticket (papel cortado) por LÍNEA del carrito
  items.forEach((item, idx) => {
    const nombre = String(item.nombre || '').toUpperCase();
    const cant   = Math.max(1, Number(item.cantidad) || 1);

    // Header pequeño
    printer.alignLeft();
    printer.println(`${idx + 1} / ${items.length}        ${caja}`);
    printer.newLine();

    // Nombre BIG centrado
    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.setTextDoubleWidth();
    printer.bold(true);
    printer.println(nombre);
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    // Cantidad
    printer.setTextDoubleHeight();
    printer.println(`x ${cant}`);
    printer.setTextNormal();
    printer.newLine();

    // Línea de referencia
    printer.drawLine();
    printer.bold(true);
    printer.println(`TICKET #${shortRef}`);
    printer.bold(false);
    printer.drawLine();

    // Footer
    printer.alignLeft();
    printer.println(`${cajero}   ${horaTxt}`);
    printer.println(String(job.venta_id || ''));

    // Cortar el papel
    printer.cut();
  });

  return printer.getBuffer();
}

// Envía bytes ESC/POS a una impresora TCP (puerto 9100 estándar)
async function enviarPorTcp(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      sock.destroy();
      reject(new Error(`Timeout conectando a ${ip}:${port}`));
    }, 8000);
    sock.connect(port, ip, () => {
      sock.write(buffer, () => {
        sock.end();
      });
    });
    sock.on('close', () => {
      clearTimeout(timeout);
      if (!done) { done = true; resolve(); }
    });
    sock.on('error', (e) => {
      clearTimeout(timeout);
      if (!done) { done = true; reject(e); }
    });
  });
}

// Envía bytes raw a una impresora USB local en Windows usando el truco
// `copy /b file "\\.\PrinterName"`. El spooler de Windows recibe los bytes
// crudos SIN diálogo (que es lo que tira Chrome). Solo funciona en Windows.
async function enviarPorWindowsUsb(printerName, buffer) {
  if (process.platform !== 'win32') {
    throw new Error(`USB raw solo en Windows (actual: ${process.platform})`);
  }
  const tmpFile = path.join(os.tmpdir(), `atolon-ticket-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.bin`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    await new Promise((resolve, reject) => {
      // cmd /c copy /b <file> "\\.\PrinterName"
      const args = ['/d', '/c', 'copy', '/b', tmpFile, `\\\\.\\${printerName}`];
      const proc = spawn('cmd.exe', args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`copy /b → ${printerName} exited ${code}: ${stderr || '(sin stderr)'}`));
      });
    });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// Despacha según el tipo de conexión de la impresora
async function imprimirJob_(imp, job) {
  const buffer = construirTicket(job);
  if (imp.tipo_conexion === 'network') {
    if (!imp.printer_ip) throw new Error(`${imp.id}: tipo=network pero sin printer_ip`);
    await enviarPorTcp(imp.printer_ip, imp.printer_port || 9100, buffer);
  } else if (imp.tipo_conexion === 'usb') {
    const name = imp.printer_usb_name || 'Gainscha GA-E200I';
    await enviarPorWindowsUsb(name, buffer);
  } else {
    throw new Error(`${imp.id}: tipo_conexion '${imp.tipo_conexion}' no soportado`);
  }
}

// ── Procesar un job ──────────────────────────────────────────────────────
async function procesarJob(job) {
  if (!job || !job.id) return;
  if (procesando.has(job.id)) return;
  procesando.add(job.id);

  const imp = impresoras.get(job.impresora_id);
  if (!imp) {
    console.warn(`[skip] job ${job.id} para impresora desconocida ${job.impresora_id}`);
    procesando.delete(job.id);
    return;
  }
  // Validar config según tipo
  if (imp.tipo_conexion === 'network' && !imp.printer_ip) {
    console.warn(`[skip] ${imp.id}: tipo=network pero sin printer_ip`);
    procesando.delete(job.id);
    return;
  }

  const target = imp.tipo_conexion === 'network'
    ? `tcp://${imp.printer_ip}:${imp.printer_port || 9100}`
    : `usb (${imp.printer_usb_name || 'default'})`;
  console.log(`[print] ${job.venta_id} → ${imp.id} ${target} — ${(job.items || []).length} ítems`);
  const startedAt = Date.now();

  // Marcar status=printing
  await supabase.from('cajas_evento_impresion_queue').update({
    status: 'printing',
    intentos: (job.intentos || 0) + 1,
  }).eq('id', job.id);

  try {
    await imprimirJob_(imp, job);
    await supabase.from('cajas_evento_impresion_queue').update({
      status: 'printed',
      printed_at: new Date().toISOString(),
      error: null,
    }).eq('id', job.id);
    const ms = Date.now() - startedAt;
    console.log(`  ✓ impreso en ${ms}ms`);
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    await supabase.from('cajas_evento_impresion_queue').update({
      status: 'failed',
      error: e.message || String(e),
    }).eq('id', job.id);
  } finally {
    procesando.delete(job.id);
  }
}

// ── Procesar pendientes (al arrancar y cada 30s como fallback) ────────────
async function procesarPendientes() {
  const { data, error } = await supabase
    .from('cajas_evento_impresion_queue')
    .select('*')
    .in('impresora_id', IMPRESORA_IDS)
    .in('status', ['pending', 'failed'])
    .lt('intentos', 3)
    .order('created_at', { ascending: true })
    .limit(30);
  if (error) {
    console.warn('[poll] error:', error.message);
    return;
  }
  if ((data || []).length > 0) {
    console.log(`[poll] ${data.length} pendientes`);
  }
  for (const job of data || []) {
    await procesarJob(job);
  }
}

// ── Realtime subscription ────────────────────────────────────────────────
let canal;
function suscribir() {
  if (canal) supabase.removeChannel(canal);
  canal = supabase.channel(`agent-${IMPRESORA_IDS.join('-')}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'cajas_evento_impresion_queue',
    }, payload => {
      const j = payload.new;
      if (j && IMPRESORA_IDS.includes(j.impresora_id)) {
        procesarJob(j).catch(e => console.error('[realtime] ', e.message));
      }
    })
    .subscribe(status => {
      console.log('[realtime]', status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // intentar resuscribir en 10s
        setTimeout(suscribir, 10000);
      }
    });
}

// ── Heartbeat ──────────────────────────────────────────────────────────
// Cada 10s el agent actualiza `agent_last_seen` + `agent_status` en la BD
// para CADA impresora que maneja. La página /cajas-setup muestra esto en
// vivo, así el usuario VE si el agent está corriendo sin abrir consola.
async function heartbeat() {
  const status = {
    version: '1.1.0',
    platform: process.platform,
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    hostname: require('os').hostname(),
    impresoras: IMPRESORA_IDS,
  };
  const now = new Date().toISOString();
  for (const id of IMPRESORA_IDS) {
    if (!impresoras.has(id)) continue;
    supabase.from('cajas_evento_impresoras').update({
      agent_last_seen: now,
      agent_status: status,
    }).eq('id', id).then(() => {});
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────
async function start() {
  console.log('=== Atolón Print Agent (Supabase mode) v1.1.0 ===');
  console.log(`Impresoras a manejar: ${IMPRESORA_IDS.join(', ')}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Platform: ${process.platform}`);
  console.log();

  await loadImpresoras();
  await procesarPendientes();
  suscribir();

  // Polling fallback
  setInterval(procesarPendientes, 30000);

  // Recargar info de impresoras cada 5 min (por si cambia la IP en la BD)
  setInterval(loadImpresoras, 5 * 60 * 1000);

  // Heartbeat — cada 10s
  await heartbeat();
  setInterval(heartbeat, 10000);

  console.log('\n→ Agent listo. Escuchando ventas…\n');
}

start().catch(e => {
  console.error('[fatal]', e);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT',  () => { console.log('\n[exit] cerrando…'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[exit] SIGTERM');   process.exit(0); });
