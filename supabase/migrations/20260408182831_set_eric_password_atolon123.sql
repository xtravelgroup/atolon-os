UPDATE auth.users
SET encrypted_password = extensions.crypt('Atolon123', extensions.gen_salt('bf')),
    updated_at = now()
WHERE email = 'eric@lasamericas.com';
