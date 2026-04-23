-- Fix Violeta Simancas auth setup
-- Her usuarios.id = 063e8cd2-85f0-4bd4-84f0-0c278eecbd78

-- 1. Ensure auth.users record exists and has correct password
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  role,
  aud,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_sent_at
)
VALUES (
  '063e8cd2-85f0-4bd4-84f0-0c278eecbd78',
  'vsimancas@atoloncartagena.com',
  extensions.crypt('Atolon123', extensions.gen_salt('bf')),
  now(),
  'authenticated',
  'authenticated',
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  false,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = extensions.crypt('Atolon123', extensions.gen_salt('bf')),
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
  updated_at = now(),
  raw_app_meta_data = '{"provider":"email","providers":["email"]}',
  role = 'authenticated',
  aud = 'authenticated';

-- 2. Remove any existing broken identities for this user
DELETE FROM auth.identities
WHERE user_id = '063e8cd2-85f0-4bd4-84f0-0c278eecbd78';

-- 3. Insert correct identity record
INSERT INTO auth.identities (
  id,
  user_id,
  provider,
  provider_id,
  identity_data,
  created_at,
  updated_at,
  last_sign_in_at
)
VALUES (
  '063e8cd2-85f0-4bd4-84f0-0c278eecbd78',
  '063e8cd2-85f0-4bd4-84f0-0c278eecbd78',
  'email',
  'vsimancas@atoloncartagena.com',
  jsonb_build_object(
    'sub', '063e8cd2-85f0-4bd4-84f0-0c278eecbd78',
    'email', 'vsimancas@atoloncartagena.com',
    'email_verified', true,
    'phone_verified', false
  ),
  now(),
  now(),
  now()
);
