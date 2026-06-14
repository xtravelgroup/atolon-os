// Cliente del Print Agent local (atolon-print-agent).
//
// El agente corre como proceso aparte en una PC de la red (ver /print-agent/).
// Esta lib es lo único que el resto del frontend necesita importar para imprimir.
//
// Configuración:
//   - URL del agente: localStorage["atolon.printAgentUrl"] (default: http://localhost:9100)
//   - IP impresora: la guarda el propio agente en su config (POST /config la sincroniza)

const LS_KEY = "atolon.printAgentUrl";
const DEFAULT_URL = "http://localhost:9100";

export function getAgentUrl() {
  try {
    return localStorage.getItem(LS_KEY) || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export function setAgentUrl(url) {
  try {
    if (url) localStorage.setItem(LS_KEY, url);
    else localStorage.removeItem(LS_KEY);
  } catch {}
}

async function fetchAgent(path, opts = {}) {
  const url = getAgentUrl().replace(/\/+$/, "") + path;
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs || 8000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Timeout — agente no responde en ${url}`);
    if (e.message?.includes("Failed to fetch")) throw new Error(`No se pudo conectar al agente (${url}). ¿Está corriendo?`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Status del agente + alcance de la impresora. */
export async function getStatus() {
  return fetchAgent("/status");
}

/** Sincroniza config del agente (IP impresora, puerto, datos empresa). */
export async function updateAgentConfig(cfg) {
  return fetchAgent("/config", { method: "POST", body: cfg });
}

/** Imprime una página de prueba. */
export async function testPrint() {
  return fetchAgent("/print", { method: "POST", body: { type: "test" } });
}

/**
 * Imprime un recibo POS (bar/restaurante).
 *
 * @param {object} data
 * @param {string} [data.numero]         Número/folio del recibo
 * @param {string} [data.fecha]          Fecha legible (si no, se usa now())
 * @param {string} [data.mesero]
 * @param {string} [data.mesa]
 * @param {string} [data.cliente]
 * @param {Array<{nombre:string,cantidad:number,precio:number,notas?:string}>} data.items
 * @param {number} [data.subtotal]
 * @param {number} [data.propina]
 * @param {number} [data.descuento]
 * @param {number} [data.impuesto]
 * @param {number} data.total
 * @param {string} [data.pago_metodo]    'efectivo' | 'tarjeta' | 'transferencia' | ...
 * @param {number} [data.pago_recibido]
 * @param {number} [data.cambio]
 * @param {string} [data.nota]
 */
export async function printReciboPOS(data) {
  return fetchAgent("/print", { method: "POST", body: { type: "recibo_pos", data } });
}

/** Helper: ¿hay un agente alcanzable y la impresora responde? */
export async function isReady() {
  try {
    const s = await getStatus();
    return !!s?.printer?.reachable;
  } catch {
    return false;
  }
}
