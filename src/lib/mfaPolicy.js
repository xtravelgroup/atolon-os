// Política de MFA (2FA TOTP)
//
// Define qué roles requieren un segundo factor. La verificación corre en
// dos puntos del flujo de auth:
//
//   1. Después del login con password (App.jsx): si el rol exige MFA y
//      el usuario YA está enrolado → se pide código TOTP antes de
//      mostrar la OS.
//   2. Después del login si el rol exige MFA pero el usuario AÚN no
//      está enrolado → se fuerza la inscripción (QR + Authenticator).
//
// Esto está alineado con NIA 315, ISO 27001 A.9.4.2, SOX 404 (acceso
// privilegiado), y supera el piso de Circular 007/2018 SFC.

/**
 * Roles que DEBEN tener MFA habilitado por defecto.
 * Decisión de Gerencia (2026-06): por ahora solo super_admin y admin.
 * Para otros roles sensibles (contabilidad, stripe_admin, gerente_*),
 * un super_admin puede habilitar MFA usuario-por-usuario en
 * Usuarios.jsx vía el toggle "Requiere MFA".
 */
export const MFA_REQUIRED_ROLES = [
  "super_admin",
  "admin",
];

/**
 * Prefijos de rol que exigen MFA por defecto.
 * Vacío por ahora — se gestiona por usuario.
 */
export const MFA_REQUIRED_ROLE_PREFIXES = [];

/**
 * ¿Este rol exige MFA según la política GENERAL (default del rol)?
 * @param {string|null|undefined} rolId
 * @returns {boolean}
 */
export function aplicaMFA(rolId) {
  if (!rolId) return false;
  if (MFA_REQUIRED_ROLES.includes(rolId)) return true;
  return MFA_REQUIRED_ROLE_PREFIXES.some(p => rolId.startsWith(p));
}

/**
 * Resuelve MFA para un usuario concreto, considerando el override
 * almacenado en usuarios.mfa_required:
 *   - true      → fuerza MFA aunque el rol no lo exija
 *   - false     → exime al usuario aunque el rol lo exija
 *   - null/undef → usa la política del rol (aplicaMFA)
 *
 * @param {string|null|undefined} rolId
 * @param {boolean|null|undefined} mfaRequired
 * @returns {boolean}
 */
export function aplicaMFAEffective(rolId, mfaRequired) {
  if (mfaRequired === true)  return true;
  if (mfaRequired === false) return false;
  return aplicaMFA(rolId);
}

/**
 * Devuelve el estado MFA del usuario actual usando Supabase Auth.
 *
 * @param {object} supabase  Cliente Supabase
 * @returns {Promise<{
 *   factors: Array<{id:string, factor_type:string, status:string, friendly_name?:string}>,
 *   verifiedTotp: object|null,
 *   currentAal: string|null,
 *   nextAal: string|null,
 *   needsChallenge: boolean,    // ya enrolado, sesión todavía en aal1
 *   needsEnrollment: boolean,   // no tiene factor verificado
 * }>}
 */
export async function getMFAStatus(supabase) {
  if (!supabase) return null;

  // Factores
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const factors = factorsData?.all || [];
  const verifiedTotp = factors.find(f => f.factor_type === "totp" && f.status === "verified") || null;

  // AAL: aal1 = solo password, aal2 = password + segundo factor
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentAal = aalData?.currentLevel || null;
  const nextAal    = aalData?.nextLevel || null;

  return {
    factors,
    verifiedTotp,
    currentAal,
    nextAal,
    needsChallenge:  !!verifiedTotp && currentAal === "aal1" && nextAal === "aal2",
    needsEnrollment: !verifiedTotp,
  };
}
