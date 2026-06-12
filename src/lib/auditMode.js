// Modo auditoría — bloqueo de escrituras
// =======================================
//
// Cuando un usuario logueado tiene rol_id = 'auditor' (típicamente revisor
// fiscal externo), la app entra en "modo auditoría":
//
//   1. Banner morado en el header global ("MODO AUDITORÍA · SOLO LECTURA")
//   2. body[data-auditor-mode="true"] → CSS deshabilita botones de submit
//      y agrega cursor not-allowed sobre inputs editables (las edge
//      cases existen, pero el usuario auditor no debería intentar nada)
//   3. Wrapper sobre el cliente Supabase: insert/update/delete/upsert
//      lanzan error inmediato sin tocar la red. Cualquier módulo que
//      use `supabase.from(...).insert(...)` recibe el error en lugar de
//      llegar al servidor.
//
// Esto NO es una defensa de fondo (un atacante con consola puede
// llamar al cliente nativo). La defensa de fondo sería RLS por tabla,
// que es un proyecto aparte. Para un revisor fiscal externo de buena
// fe, esto es suficiente — el banner es claro y los botones quedan
// inertes.

let _audit = false;
const listeners = new Set();

export function setAuditMode(on) {
  const next = Boolean(on);
  if (next === _audit) return;
  _audit = next;
  if (typeof document !== "undefined" && document.body) {
    if (next) document.body.setAttribute("data-auditor-mode", "true");
    else document.body.removeAttribute("data-auditor-mode");
  }
  for (const fn of listeners) { try { fn(next); } catch {} }
}

export function isAuditMode() { return _audit; }

export function onAuditModeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Métodos de escritura bloqueados sobre supabase.from()
const WRITE_METHODS = new Set(["insert", "update", "delete", "upsert"]);

// Envuelve un cliente supabase para interceptar writes cuando el modo
// auditoría está activo. Las operaciones de lectura (select, etc) pasan
// directo sin overhead.
export function wrapSupabaseForAudit(client) {
  if (!client || client.__atolon_audit_wrapped) return client;

  const origFrom = client.from.bind(client);

  client.from = function patchedFrom(table) {
    const qb = origFrom(table);
    if (!qb) return qb;

    // Interceptar cada método de escritura
    for (const m of WRITE_METHODS) {
      if (typeof qb[m] === "function") {
        const orig = qb[m].bind(qb);
        qb[m] = function (...args) {
          if (_audit) {
            const err = new Error(
              `🔒 MODO AUDITORÍA · operación '${m}' bloqueada sobre '${table}'. ` +
              `Este usuario tiene acceso de solo lectura.`
            );
            err.code = "AUDIT_READ_ONLY";
            // Imitar la forma de respuesta de supabase para que el código
            // que hace `.then(({data, error}) => …)` no rompa
            return Promise.resolve({ data: null, error: err });
          }
          return orig(...args);
        };
      }
    }
    return qb;
  };

  // RPC también puede mutar — bloqueamos para estar seguros
  if (typeof client.rpc === "function") {
    const origRpc = client.rpc.bind(client);
    client.rpc = function patchedRpc(fn, params, options) {
      if (_audit) {
        return Promise.resolve({
          data: null,
          error: Object.assign(new Error(
            `🔒 MODO AUDITORÍA · RPC '${fn}' bloqueado. Solo lectura.`
          ), { code: "AUDIT_READ_ONLY" }),
        });
      }
      return origRpc(fn, params, options);
    };
  }

  client.__atolon_audit_wrapped = true;
  return client;
}
