-- KPMG C-2 · MFA per-user override
-- Permite que un super_admin habilite o deshabilite MFA por usuario
-- independientemente del rol. Por defecto NULL → usa la política del rol.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS mfa_required boolean;

COMMENT ON COLUMN public.usuarios.mfa_required IS
  'KPMG C-2: override per-user de la política de MFA. NULL = usa default del rol. TRUE = fuerza MFA. FALSE = exime al usuario.';
