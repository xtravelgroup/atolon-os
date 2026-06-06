#!/usr/bin/env node
/**
 * Atolón Print Agent
 * Daemon HTTP que recibe trabajos de impresión desde el navegador (https://www.atolon.co)
 * y los envía a la impresora térmica Digital POS DIG-E2001 vía TCP (puerto 9100, ESC/POS raw).
 *
 * Endpoints:
 *   GET  /              → ping (status + version)
 *   GET  /status        → estado del agente + alcance de la impresora
 *   POST /config        → { printerIp, printerPort, allowedOrigins } → guarda config
 *   POST /print         → { type, data } → imprime
 *
 * Tipos soportados (type):
 *   recibo_pos          → recibo de bar/restaurante (subtotal, propina, total, items)
 *   test                → página de prueba
 *
 * Lanza en localhost:9100 por defecto (configurable con env PORT).
 *
 * Distribuir como .exe con: npm run build:win
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');

const VERSION = '1.0.0';
const PORT = Number(process.env.PORT || 9100);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0'; // 0.0.0.0 → accept LAN connections too
const CONFIG_DIR = path.join(os.homedir(), '.atolon-print-agent');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

// ── Config storage ─────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  printerIp: '192.168.1.100',
  printerPort: 9100,
  printerWidth: 48,           // 80mm thermal = 48 chars per line typically
  allowedOrigins: [
    'https://www.atolon.co',
    'https://atolon.co',
    'http://localhost:5173',
    'http://localhost:4173',
  ],
  empresa: {
    nombre: 'ATOLÓN',
    nit: '901.175.815-5',
    direccion: 'Bocachica, Cartagena',
    telefono: '+57 300 123 4567',
  },
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  try {
    ensureConfigDir();
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('[config] load failed:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();
console.log('[config] loaded from', CONFIG_PATH);
console.log('[config] printer:', `${config.printerIp}:${config.printerPort}`);

// ── ESC/POS helpers ────────────────────────────────────────────────────────
function buildPrinter() {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,                          // DIG-E2001 = ESC/POS compatible
    interface: `tcp://${config.printerIp}:${config.printerPort}`,
    characterSet: CharacterSet.PC850_MULTILINGUAL,     // soporta tildes y ñ
    removeSpecialCharacters: false,
    lineCharacter: '-',
    options: { timeout: 5000 },
  });
}

const COP = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('es-CO');

function padCols(left, right, width) {
  const w = width || config.printerWidth;
  const l = String(left || '');
  const r = String(right || '');
  const space = Math.max(1, w - l.length - r.length);
  return l + ' '.repeat(space) + r;
}

// ── Templates ──────────────────────────────────────────────────────────────
async function printTest() {
  const printer = buildPrinter();
  const reachable = await printer.isPrinterConnected();
  if (!reachable) throw new Error(`Impresora no responde en ${config.printerIp}:${config.printerPort}`);

  printer.alignCenter();
  printer.setTextDoubleHeight();
  printer.bold(true);
  printer.println(config.empresa.nombre);
  printer.bold(false);
  printer.setTextNormal();
  printer.drawLine();
  printer.println('PÁGINA DE PRUEBA');
  printer.println(new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }));
  printer.drawLine();
  printer.alignLeft();
  printer.println('Si lees esto en el papel,');
  printer.println('la impresora está OK ✓');
  printer.println('');
  printer.alignCenter();
  printer.println(`Agente v${VERSION}`);
  printer.println(`Conectado a ${config.printerIp}`);
  printer.cut();
  await printer.execute();
}

async function printReciboPOS(data) {
  const printer = buildPrinter();
  const reachable = await printer.isPrinterConnected();
  if (!reachable) throw new Error(`Impresora no responde en ${config.printerIp}:${config.printerPort}`);

  const {
    numero = '',
    fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
    mesero = '',
    mesa = '',
    cliente = '',
    items = [],
    subtotal = 0,
    propina = 0,
    descuento = 0,
    impuesto = 0,
    total = 0,
    pago_metodo = '',
    pago_recibido = 0,
    cambio = 0,
    nota = '',
  } = data || {};

  // Header empresa
  printer.alignCenter();
  printer.setTextDoubleHeight();
  printer.bold(true);
  printer.println(config.empresa.nombre);
  printer.bold(false);
  printer.setTextNormal();
  if (config.empresa.nit) printer.println(`NIT ${config.empresa.nit}`);
  if (config.empresa.direccion) printer.println(config.empresa.direccion);
  if (config.empresa.telefono) printer.println(config.empresa.telefono);
  printer.drawLine();

  // Meta del recibo
  printer.alignLeft();
  if (numero) printer.println(padCols('RECIBO #', numero));
  printer.println(padCols('Fecha:', fecha));
  if (mesero) printer.println(padCols('Mesero:', mesero));
  if (mesa)   printer.println(padCols('Mesa:', mesa));
  if (cliente) printer.println(padCols('Cliente:', cliente));
  printer.drawLine();

  // Items
  printer.bold(true);
  printer.println(padCols('PRODUCTO', 'TOTAL'));
  printer.bold(false);
  for (const it of items) {
    const cant = Number(it.cantidad || it.qty || 1);
    const precio = Number(it.precio || it.price || 0);
    const subtot = cant * precio;
    const nombre = String(it.nombre || it.name || it.descripcion || '—');
    // Primera línea: nombre truncado + total
    const maxNameLen = config.printerWidth - 12;
    printer.println(padCols(nombre.slice(0, maxNameLen), COP(subtot)));
    // Segunda línea: detalle cantidad x precio
    if (cant !== 1) {
      printer.println('  ' + cant + ' x ' + COP(precio));
    }
    if (it.notas) printer.println('  → ' + String(it.notas));
  }
  printer.drawLine();

  // Totales
  printer.println(padCols('Subtotal', COP(subtotal)));
  if (descuento > 0) printer.println(padCols('Descuento', '-' + COP(descuento)));
  if (impuesto > 0)  printer.println(padCols('Impuesto', COP(impuesto)));
  if (propina > 0)   printer.println(padCols('Propina', COP(propina)));
  printer.bold(true);
  printer.setTextDoubleHeight();
  printer.println(padCols('TOTAL', COP(total)));
  printer.setTextNormal();
  printer.bold(false);

  if (pago_metodo) {
    printer.drawLine();
    printer.println(padCols('Pago:', String(pago_metodo).toUpperCase()));
    if (pago_recibido > 0) printer.println(padCols('Recibido:', COP(pago_recibido)));
    if (cambio > 0)        printer.println(padCols('Cambio:', COP(cambio)));
  }

  if (nota) {
    printer.drawLine();
    printer.alignLeft();
    printer.println('Nota: ' + nota);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println('¡Gracias por su visita!');
  printer.println('atolon.co');
  printer.feed(2);
  printer.cut();
  await printer.execute();
}

// ── HTTP server ────────────────────────────────────────────────────────────
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Para uso desde localhost o el .exe en LAN
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 5e6) reject(new Error('Payload too large')); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = req.url.split('?')[0];

  try {
    if (req.method === 'GET' && (url === '/' || url === '/status')) {
      const printer = buildPrinter();
      let printerOk = false;
      let printerErr = null;
      try { printerOk = await printer.isPrinterConnected(); }
      catch (e) { printerErr = e.message; }
      return json(res, 200, {
        ok: true,
        agent: 'atolon-print-agent',
        version: VERSION,
        printer: {
          ip: config.printerIp,
          port: config.printerPort,
          reachable: printerOk,
          error: printerErr,
        },
        config: { printerWidth: config.printerWidth, empresa: config.empresa },
      });
    }

    if (req.method === 'POST' && url === '/config') {
      const body = await readBody(req);
      const next = { ...config };
      if (body.printerIp)       next.printerIp = String(body.printerIp);
      if (body.printerPort)     next.printerPort = Number(body.printerPort);
      if (body.printerWidth)    next.printerWidth = Number(body.printerWidth);
      if (Array.isArray(body.allowedOrigins)) next.allowedOrigins = body.allowedOrigins;
      if (body.empresa && typeof body.empresa === 'object') next.empresa = { ...next.empresa, ...body.empresa };
      saveConfig(next);
      config = next;
      console.log('[config] saved');
      return json(res, 200, { ok: true, config });
    }

    if (req.method === 'POST' && url === '/print') {
      const body = await readBody(req);
      const { type, data } = body;
      console.log('[print]', type);
      if (type === 'test')              await printTest();
      else if (type === 'recibo_pos')   await printReciboPOS(data);
      else return json(res, 400, { ok: false, error: 'Tipo desconocido: ' + type });
      return json(res, 200, { ok: true });
    }

    json(res, 404, { ok: false, error: 'Ruta no encontrada' });
  } catch (e) {
    console.error('[error]', e);
    json(res, 500, { ok: false, error: e.message || 'Error interno' });
  }
});

server.listen(PORT, BIND_HOST, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║      Atolón Print Agent v' + VERSION + '          ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║  Escuchando en:  http://' + BIND_HOST + ':' + PORT);
  console.log('║  Impresora:      ' + config.printerIp + ':' + config.printerPort);
  console.log('║  Config:         ' + CONFIG_PATH);
  console.log('║                                           ║');
  console.log('║  Endpoints:                               ║');
  console.log('║    GET  /status                           ║');
  console.log('║    POST /print  { type, data }            ║');
  console.log('║    POST /config { printerIp, ... }        ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');
});
