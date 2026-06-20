-- KPMG C-2 (continuación) · MFA / 2FA tracking
-- Marca enrollment en TOTP para roles sensibles.
-- Supabase Auth gestiona los factores en auth.mfa_factors (encrypted);
-- esta tabla guarda solo metadata para reportería y auditoría.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_factor_id    text,
  ADD COLUMN IF NOT EXISTS mfa_last_used_at timestamptz;

-- Índice para reporte "quién no tiene MFA en rol sensible"
CREATE INDEX IF NOT EXISTS idx_usuarios_mfa_enrolled
  ON public.usuarios (rol_id, mfa_enrolled_at)
  WHERE mfa_enrolled_at IS NULL;

COMMENT ON COLUMN public.usuarios.mfa_enrolled_at  IS 'KPMG C-2: timestamp del enrollment de TOTP. NULL = sin MFA.';
COMMENT ON COLUMN public.usuarios.mfa_factor_id    IS 'KPMG C-2: factor_id de Supabase Auth (auth.mfa_factors.id).';
COMMENT ON COLUMN public.usuarios.mfa_last_used_at IS 'KPMG C-2: última vez que se completó un challenge MFA (login).';
