-- Reset Helen Rivera's password to Atolon123 and force change on next login
UPDATE auth.users
SET encrypted_password = crypt('Atolon123', gen_salt('bf'))
WHERE email = 'comercial@atoloncartagena.com';

UPDATE usuarios
SET must_change_password = true
WHERE email = 'comercial@atoloncartagena.com';
