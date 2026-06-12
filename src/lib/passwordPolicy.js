// Política de contraseñas Atolón Beach Club
// =========================================
// KPMG C-2: control de auditoría. Documentado para revisores externos.
//
// Regla 1 — Largo mínimo 10 caracteres
// Regla 2 — Complejidad: al menos 3 de 4 categorías (minúscula,
//           mayúscula, número, símbolo)
// Regla 3 — Lista negra de patrones triviales / passwords leakeadas
//           comunes en empresas colombianas + nombres de la marca
// Regla 4 — No contiene email ni nombre del usuario
// Regla 5 — Caducidad 90 días para roles administrativos sensibles
//           (super_admin, admin, contabilidad, gerente_*, stripe_admin)
// Regla 6 — Historial: no se puede reutilizar las últimas 3
//
// Las reglas 1-4 se validan client-side (este archivo).
// La regla 5 se valida en App.jsx al loguearse (compara
// password_changed_at vs ahora).
// La regla 6 se valida client-side comparando hash SHA-256 contra
// la lista en usuarios.password_history (jsonb).

const COMMON_PASSWORDS = new Set([
  // Patrones triviales
  "12345678", "123456789", "1234567890", "abcdefgh", "abc12345",
  "qwerty123", "password", "password1", "password123", "Password1",
  // Patrones Atolón (no usar marca como password)
  "atolon", "Atolon", "Atolon26", "Atolon123", "ATOLON", "atolon26",
  "atolon2025", "atolon2026", "Atolon2026", "Atolon2025",
  "beachclub", "atoloncartagena", "cartagena",
  // Patrones Colombia comunes
  "colombia", "Colombia", "bogota2026", "medellin", "cartagena2026",
  // Test passwords no permitidos
  "test1234", "demo1234", "admin1234", "admin123", "Admin123",
  "qwerty", "asdfghjkl",
]);

export const PASSWORD_POLICY = Object.freeze({
  minLength: 10,
  minCategories: 3, // de 4: lower, upper, digit, symbol
  maxAgeDays: 90,
  historySize: 3,
  // Roles a los que aplica la caducidad de 90 días
  rolesConCaducidad: ["super_admin", "admin", "contabilidad", "stripe_admin"],
  rolesConCaducidadPrefix: ["gerente_"],
});

export function categoryCount(s) {
  let c = 0;
  if (/[a-z]/.test(s)) c++;
  if (/[A-Z]/.test(s)) c++;
  if (/[0-9]/.test(s)) c++;
  if (/[^A-Za-z0-9]/.test(s)) c++;
  return c;
}

// Devuelve null si OK, o un mensaje de error específico.
// `context` = { email, nombre } para validar regla 4
export function validatePassword(pwd, context = {}) {
  if (!pwd || typeof pwd !== "string") return "La contraseña es obligatoria.";
  if (pwd.length < PASSWORD_POLICY.minLength) {
    return `La contraseña debe tener al menos ${PASSWORD_POLICY.minLength} caracteres (actual: ${pwd.length}).`;
  }
  const cats = categoryCount(pwd);
  if (cats < PASSWORD_POLICY.minCategories) {
    return `La contraseña debe combinar al menos ${PASSWORD_POLICY.minCategories} de 4 categorías: minúscula, mayúscula, número, símbolo. Tu contraseña solo tiene ${cats}.`;
  }
  if (COMMON_PASSWORDS.has(pwd) || COMMON_PASSWORDS.has(pwd.toLowerCase())) {
    return "Esa contraseña es demasiado común o usa el nombre de la marca. Elegí otra.";
  }
  // Regla 4: no contiene email / nombre
  const lower = pwd.toLowerCase();
  if (context.email) {
    const localPart = String(context.email).split("@")[0].toLowerCase();
    if (localPart.length >= 4 && lower.includes(localPart)) {
      return "La contraseña no puede contener tu email o usuario.";
    }
  }
  if (context.nombre) {
    const partes = String(context.nombre).toLowerCase().split(/\s+/).filter(p => p.length >= 4);
    for (const p of partes) {
      if (lower.includes(p)) {
        return "La contraseña no puede contener tu nombre.";
      }
    }
  }
  return null;
}

// Verifica historial: pwd no debe coincidir (vía hash) con ninguna de
// las últimas N contraseñas guardadas en password_history.
// usa SHA-256 con sal del email para que entre cuentas no se pueda
// inferir si comparten password.
export async function hashPassword(pwd, salt) {
  const buf = new TextEncoder().encode(`${salt || ""}::${pwd}`);
  const out = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(out))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function isInHistory(pwd, history, salt) {
  if (!Array.isArray(history) || history.length === 0) return false;
  const h = await hashPassword(pwd, salt);
  return history.includes(h);
}

export function aplicaCaducidad(rolId) {
  if (!rolId) return false;
  if (PASSWORD_POLICY.rolesConCaducidad.includes(rolId)) return true;
  return PASSWORD_POLICY.rolesConCaducidadPrefix.some(p => rolId.startsWith(p));
}

// Devuelve días restantes hasta que caduque (puede ser negativo)
export function diasHastaCaducidad(passwordChangedAt) {
  if (!passwordChangedAt) return null;
  const t = new Date(passwordChangedAt).getTime();
  if (isNaN(t)) return null;
  const diff = (t + PASSWORD_POLICY.maxAgeDays * 24 * 3600 * 1000) - Date.now();
  return Math.floor(diff / (24 * 3600 * 1000));
}

// Build "strength meter" data para mostrar barras en UI
export function strengthSignals(pwd) {
  return [
    { ok: pwd.length >= PASSWORD_POLICY.minLength, label: `${PASSWORD_POLICY.minLength}+ chars` },
    { ok: /[a-z]/.test(pwd), label: "minúscula" },
    { ok: /[A-Z]/.test(pwd), label: "MAYÚSCULA" },
    { ok: /[0-9]/.test(pwd), label: "número" },
    { ok: /[^A-Za-z0-9]/.test(pwd), label: "símbolo" },
    { ok: !COMMON_PASSWORDS.has(pwd) && !COMMON_PASSWORDS.has(pwd.toLowerCase()), label: "no trivial" },
  ];
}
