-- Eliminar el registro auth roto del duplicado de Violeta Simancas
-- Email con typo: vsimancas@atloncartagena.com (falta la 'o')
-- ID: 97a444d7-5297-4032-b588-fd5b1f093af6

-- Limpiar sesiones activas del usuario roto
DELETE FROM auth.sessions    WHERE user_id = '97a444d7-5297-4032-b588-fd5b1f093af6';
DELETE FROM auth.refresh_tokens WHERE user_id = '97a444d7-5297-4032-b588-fd5b1f093af6';
DELETE FROM auth.mfa_factors  WHERE user_id = '97a444d7-5297-4032-b588-fd5b1f093af6';
DELETE FROM auth.identities   WHERE user_id = '97a444d7-5297-4032-b588-fd5b1f093af6';
DELETE FROM auth.users        WHERE id      = '97a444d7-5297-4032-b588-fd5b1f093af6';
