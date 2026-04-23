-- Agregar loggro_id a proveedores + importar los 23 proveedores de Loggro Restobar
-- Columnas existentes en proveedores: id, nombre, nit, email, telefono, direccion, ciudad, activo, notas, created_at

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS loggro_id text,
  ADD COLUMN IF NOT EXISTS razon_social text;

CREATE INDEX IF NOT EXISTS idx_proveedores_loggro ON public.proveedores(loggro_id);

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT * FROM (VALUES
      ('ALMACENES EXITO', '890900608', NULL::text, NULL::text, NULL::text, NULL::text, '68dd81520f4b9cbf48845d56'),
      ('ASHA', '901376480-4', 'INVERSIONES ASHA SAS', NULL, NULL, NULL, '668dcbc91e3b83b9f61c95d8'),
      ('ATLANTIC', '900040299-0', NULL, NULL, NULL, NULL, '68c49bfdb06422b8f939e966'),
      ('CARNES PREMIUM', '901601460', 'INVERSIONESMC MT SAS', NULL, NULL, NULL, '66c7bc9059cf3be9c54d0229'),
      ('CLAUDIA CORREA', '42980085-2', 'CLAUDIA CORREA', NULL, NULL, NULL, '68c49e46360850fc7f3cec9f'),
      ('D1 SAS', '900276962-1', NULL, NULL, NULL, NULL, '68dd96aa70581ed4b6accaf5'),
      ('DISMEL LTDA', '800089872-0', 'DISMEL LTDA', 'CONTABILIDAD@DISMELTDA.COM', '65399OO', 'CARTAGENA BOLIVAR', '68c1a49e5dec62e732c399e1'),
      ('DISOL S.A', '830509277-0', NULL, NULL, NULL, NULL, '68e576e00ea672b2a4bdd961'),
      ('DISPROPAN', '891200701', NULL, NULL, NULL, NULL, '699b2e8e9b9f5bade1ad408c'),
      ('DISTRIBOLIVAR', '900202182-4', 'DISTRIBOLIVAR J.R S.A.S', NULL, NULL, NULL, '668dceadca45568b64cb519f'),
      ('DISTRIBUIDORA DE VINOS Y LICORES SAS', '890916575-4', NULL, NULL, NULL, NULL, '68c1da787255a5147dc4290d'),
      ('INDUSTRI NACIONAL DE GASEOSAS SAS', '890903858', NULL, NULL, NULL, NULL, '697a897a48cf24087f6d41d8'),
      ('JUAN DE HOYOS', '811006789-1', NULL, NULL, NULL, NULL, '68f12c334f70d58588e4958f'),
      ('LHM', '811033374-.3', 'LEGUMBRES HERIBERTO MONTES BEDOYA SAS', NULL, NULL, NULL, '668dd0eeaba13cdaf2c297d7'),
      ('LION CITY', '900446680', 'LION CITY SAS', NULL, NULL, NULL, '668dd016aba13cdaf2c297d4'),
      ('MAKRO', '9000592385', 'MAKRO SUPERMAYORISTA SAS', NULL, NULL, NULL, '668da55fb5dce7b6151f84bc'),
      ('Megatiendas', '900383385-8', 'INVERCOMER DEL CARIBE SAS', NULL, NULL, NULL, '668d9c9e8d27f92e39fdd44b'),
      ('Mónica Díaz carcome', '64583858', NULL, NULL, NULL, NULL, '6695b95116e6db80e0d93793'),
      ('POSTOBON SA', '890903939', NULL, NULL, NULL, NULL, '68e573a0dde66b1c14e9780c'),
      ('RICARDO DIAZ FREDIS MANUEL', '11052196', 'RICARDO DIAZ FREDIS MANUEL', 'FREDISM1980@HOTMAIL.COM', '3106477004', 'GETSEMANI', '68c4884c352debf8a5bb76a7'),
      ('SOLO LOMOS', '901851465', NULL, NULL, NULL, NULL, '68e55d72645e3426a3d02b23'),
      ('VEROFRUIT SAS', '901254740-0', NULL, 'CARTERAVEROFRUT@GMAIL.COJM', '6747656', 'BARRIO PRADO TRANSV 32', '68c09b05be24cd8a10ee498a'),
      ('fresmar', '900481902-6', 'comercializadora fresmar', 'facturaselectronicas@fresmar.com', '3133337902', NULL, '669fa5f59f5c9cee90c2e4a4')
    ) AS t(nombre, nit, razon_social, email, telefono, direccion, loggro_id)
  ) LOOP
    IF EXISTS (SELECT 1 FROM public.proveedores WHERE nit = r.nit) THEN
      UPDATE public.proveedores
      SET loggro_id    = r.loggro_id,
          razon_social = COALESCE(razon_social, r.razon_social),
          email        = COALESCE(NULLIF(email, ''), r.email),
          telefono     = COALESCE(NULLIF(telefono, ''), r.telefono),
          direccion    = COALESCE(NULLIF(direccion, ''), r.direccion)
      WHERE nit = r.nit;
    ELSIF EXISTS (SELECT 1 FROM public.proveedores WHERE lower(nombre) = lower(r.nombre) AND (nit IS NULL OR nit = '')) THEN
      UPDATE public.proveedores
      SET loggro_id    = r.loggro_id,
          nit          = r.nit,
          razon_social = COALESCE(razon_social, r.razon_social),
          email        = COALESCE(NULLIF(email, ''), r.email),
          telefono     = COALESCE(NULLIF(telefono, ''), r.telefono),
          direccion    = COALESCE(NULLIF(direccion, ''), r.direccion)
      WHERE lower(nombre) = lower(r.nombre) AND (nit IS NULL OR nit = '');
    ELSE
      INSERT INTO public.proveedores (id, nombre, nit, razon_social, email, telefono, direccion, loggro_id, activo, created_at)
      VALUES (
        'PROV-' || substr(r.loggro_id, length(r.loggro_id) - 7),
        r.nombre, r.nit, r.razon_social, r.email, r.telefono, r.direccion, r.loggro_id,
        true, now()
      )
      ON CONFLICT (id) DO UPDATE SET loggro_id = EXCLUDED.loggro_id;
    END IF;
  END LOOP;
END $$;
