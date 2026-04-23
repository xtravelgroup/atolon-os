-- Set password for eric@lasamericas.com to "1010"
UPDATE auth.users
SET encrypted_password = extensions.crypt('1010', extensions.gen_salt('bf'))
WHERE email = 'eric@lasamericas.com';
