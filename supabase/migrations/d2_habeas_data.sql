-- KPMG D-2 · Ley 1581/2012 (hábeas data) — Cumplimiento Colombia
-- =====================================================================
-- Marco legal aplicable:
--   - Ley 1581/2012 — Protección de datos personales
--   - Decreto 1377/2013 — Reglamentario
--   - Decreto 090/2018 — Registro Nacional de Bases de Datos
--   - Circular Externa 003/2018 SIC — Régimen sancionatorio
--
-- Controles que un auditor verifica:
--   1. Política de tratamiento documentada y vigente
--   2. Inventario de bases de datos con datos personales
--      (qué guardamos, para qué, cuánto tiempo, base legal)
--   3. Registro de consentimientos por titular
--   4. Atención de solicitudes ARCO + supresión + portabilidad
--      dentro de los plazos legales (10 días hábiles consulta,
--      15 días hábiles para reclamos — Ley 1581 art. 14 y 15)
-- =====================================================================

-- ── 1) Política de Tratamiento (single-row) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.habeas_data_policy (
  id                       int PRIMARY KEY DEFAULT 1,
  version                  text NOT NULL DEFAULT '1.0',
  texto_politica           text,
  aviso_privacidad         text,
  encargado_tratamiento    text,
  encargado_email          text,
  encargado_telefono       text,
  registro_rnbd_numero     text,                     -- número del registro en SIC
  registro_rnbd_fecha      date,
  ultima_revision          timestamptz,
  revisado_por             text,
  vigente_desde            date,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO public.habeas_data_policy (id, texto_politica, aviso_privacidad, encargado_tratamiento, encargado_email, vigente_desde) VALUES (1,
$POL$Atolón Beach Club (Atolón Cartagena S.A.S., NIT [POR_DILIGENCIAR]) trata datos personales conforme a la Ley 1581/2012, su Decreto Reglamentario 1377/2013 y demás normas concordantes.

FINALIDAD DEL TRATAMIENTO
  - Gestionar reservas, pasadías, eventos, alojamiento y servicios contratados.
  - Cumplimiento de obligaciones contractuales con clientes, proveedores y empleados.
  - Envío de información comercial y promocional cuando el titular lo autorice.
  - Cumplimiento de obligaciones tributarias y de facturación electrónica (DIAN).

DERECHOS DEL TITULAR (art. 8 Ley 1581/2012)
  a) Acceder gratuitamente a sus datos
  b) Conocer, actualizar y rectificar sus datos personales
  c) Solicitar prueba de la autorización
  d) Ser informado sobre el uso que se ha dado a sus datos
  e) Presentar quejas ante la Superintendencia de Industria y Comercio
  f) Revocar la autorización y/o solicitar supresión
  g) Acceder en forma gratuita a sus datos personales

PROCEDIMIENTO PARA EJERCER DERECHOS
  Solicitudes a: privacidad@atolon.co
  Plazos legales:
    - Consultas: 10 días hábiles (Ley 1581 art. 14)
    - Reclamos:  15 días hábiles (Ley 1581 art. 15)

SEGURIDAD
  Atolón aplica medidas técnicas y organizativas: cifrado en tránsito y
  reposo (Supabase + TLS), control de acceso por roles, autenticación
  multifactor para roles administrativos, registro de auditoría
  completo y backups con PITR de 7 días.

VIGENCIA
  Los datos se conservan durante el tiempo necesario para cumplir las
  finalidades del tratamiento y los plazos legales aplicables (mínimo
  10 años para soportes contables y tributarios — Estatuto Tributario
  art. 632).
$POL$,
$AV$Aviso de privacidad — Atolón Beach Club

Al usar este servicio o reservar con nosotros, tus datos personales
(nombre, identificación, contacto, datos de pago) son recolectados
por Atolón Cartagena S.A.S. para gestionar tu reserva y cumplir
obligaciones legales. Podés ejercer tus derechos ARCO escribiendo
a privacidad@atolon.co. Política completa en /privacidad.
$AV$,
'Eric Kern',
'privacidad@atolon.co',
CURRENT_DATE
) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, UPDATE ON public.habeas_data_policy TO authenticated;

COMMENT ON TABLE public.habeas_data_policy IS
  'KPMG D-2 · Política de tratamiento de datos personales (Ley 1581/2012). Single-row.';

-- ── 2) Inventario de bases de datos con PII ──────────────────────────
CREATE TABLE IF NOT EXISTS public.habeas_data_inventory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla               text UNIQUE NOT NULL,
  descripcion         text,
  tipos_datos         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ["nombre","email","telefono","identificacion","ubicacion"]
  proposito           text NOT NULL,
  base_legal          text NOT NULL,                       -- "contrato"|"consentimiento"|"obligacion_legal"|"interes_legitimo"
  retencion_anos      int NOT NULL DEFAULT 10,
  contiene_sensibles  boolean NOT NULL DEFAULT false,      -- datos de salud, biométricos, menores, etc.
  notas               text,
  registrada_at       timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.habeas_data_inventory TO authenticated;

-- Seed con las tablas que SÍ contienen PII en este momento
INSERT INTO public.habeas_data_inventory (tabla, descripcion, tipos_datos, proposito, base_legal, retencion_anos, contiene_sensibles, notas) VALUES
  ('clientes',       'Clientes B2C y B2B', '["nombre","email","telefono","identificacion","direccion","nacionalidad"]'::jsonb,
   'Gestionar reservas, pasadías, eventos, envío de propuestas comerciales',
   'contrato', 10, false, NULL),
  ('reservas',       'Reservas de pasadías y servicios', '["nombre","email","telefono","identificacion"]'::jsonb,
   'Operación del servicio reservado, registro contable y tributario',
   'contrato', 10, false, NULL),
  ('eventos',        'Eventos privados (bodas, corporativos)', '["nombre","email","telefono","empresa","nit","contacto","cargo"]'::jsonb,
   'Planeación y ejecución del evento contratado',
   'contrato', 10, false, NULL),
  ('huespedes',      'Huéspedes de hotel + acompañantes', '["nombre","identificacion","fecha_nacimiento","nacionalidad","direccion","email","telefono"]'::jsonb,
   'Cumplimiento RNT (Decreto 297/2016), obligaciones migratorias, operación hotelera',
   'obligacion_legal', 10, false, 'Incluye datos de menores acompañantes — manejar con consentimiento parental'),
  ('usuarios',       'Usuarios del sistema (empleados)', '["nombre","email","telefono"]'::jsonb,
   'Gestión de acceso a sistemas, control interno',
   'contrato', 5, false, 'Eliminar tras desvinculación + plazo de responsabilidad laboral (3 años SS)'),
  ('rh_empleados',   'Empleados y contratistas', '["nombre","identificacion","fecha_nacimiento","direccion","telefono","email","arl","salud","contrato"]'::jsonb,
   'Gestión laboral, obligaciones SS, nómina, retención fuente',
   'obligacion_legal', 30, true, 'Datos sensibles (salud, ARL). Retención obligatoria 30 años por Ley 50/1990 art. 39 — historia laboral'),
  ('contratistas',   'Contratistas eventos (DJ, decoradores, etc.)', '["nombre","identificacion","email","telefono","rut","arl"]'::jsonb,
   'Cumplimiento SST, ingreso a instalaciones, soporte contable',
   'obligacion_legal', 10, false, NULL),
  ('proveedores',    'Proveedores de bienes y servicios', '["nombre","identificacion","email","telefono","direccion"]'::jsonb,
   'Gestión de compras, OCs, pagos, retención',
   'contrato', 10, false, NULL),
  ('cajas_express_cajeros', 'Cajeros de eventos', '["nombre","email","telefono"]'::jsonb,
   'Operación de cajas durante eventos',
   'contrato', 3, false, NULL)
ON CONFLICT (tabla) DO NOTHING;

COMMENT ON TABLE public.habeas_data_inventory IS
  'KPMG D-2 · Inventario de tablas con datos personales. Base para Registro Nacional de Bases de Datos (RNBD) ante SIC.';

-- ── 3) Consentimientos otorgados ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.habeas_data_consents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_email       text NOT NULL,
  titular_identif     text,
  tipo                text NOT NULL,            -- "marketing"|"cookies"|"operativo"|"datos_sensibles"
  version_politica    text NOT NULL DEFAULT '1.0',
  canal_captura       text,                     -- "booking"|"signup"|"checkin"|"contratista"|"manual"
  otorgado_at         timestamptz NOT NULL DEFAULT now(),
  retirado_at         timestamptz,
  retirado_motivo     text,
  ip_origen           text,
  user_agent          text
);

CREATE INDEX IF NOT EXISTS idx_hd_consents_email
  ON public.habeas_data_consents (titular_email, tipo, otorgado_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.habeas_data_consents TO authenticated;

COMMENT ON TABLE public.habeas_data_consents IS
  'KPMG D-2 · Registro de consentimientos otorgados por titulares. Append-only; "retirar" se marca con retirado_at.';

-- ── 4) Solicitudes ARCO + Supresión + Portabilidad ───────────────────
CREATE TABLE IF NOT EXISTS public.habeas_data_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_email       text NOT NULL,
  titular_nombre      text,
  titular_identif     text,
  tipo                text NOT NULL CHECK (tipo IN ('acceso','rectificacion','cancelacion','supresion','revocatoria','portabilidad','queja')),
  detalle             text NOT NULL,
  estado              text NOT NULL DEFAULT 'recibida' CHECK (estado IN ('recibida','en_proceso','atendida','rechazada')),
  canal_recepcion     text,                     -- "email"|"formulario_web"|"presencial"|"telefono"
  recibida_at         timestamptz NOT NULL DEFAULT now(),
  fecha_limite        timestamptz NOT NULL,     -- 10 días hábiles consultas / 15 reclamos
  atendido_por        text,
  atendido_at         timestamptz,
  respuesta           text,
  motivo_rechazo      text,
  evidencia_url       text                       -- enlace a respuesta enviada / soporte
);

CREATE INDEX IF NOT EXISTS idx_hd_requests_estado_limite
  ON public.habeas_data_requests (estado, fecha_limite)
  WHERE estado IN ('recibida','en_proceso');

GRANT SELECT, INSERT, UPDATE ON public.habeas_data_requests TO authenticated;

-- Trigger: setear fecha_limite automáticamente según tipo
CREATE OR REPLACE FUNCTION public.habeas_data_set_fecha_limite()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fecha_limite IS NULL THEN
    -- Ley 1581 art. 14: consultas 10 días hábiles ≈ 14 días calendario
    -- Ley 1581 art. 15: reclamos    15 días hábiles ≈ 21 días calendario
    IF NEW.tipo IN ('acceso','portabilidad') THEN
      NEW.fecha_limite := NEW.recibida_at + interval '14 days';
    ELSE
      NEW.fecha_limite := NEW.recibida_at + interval '21 days';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hd_set_fecha_limite ON public.habeas_data_requests;
CREATE TRIGGER trg_hd_set_fecha_limite
  BEFORE INSERT ON public.habeas_data_requests
  FOR EACH ROW EXECUTE FUNCTION public.habeas_data_set_fecha_limite();

COMMENT ON TABLE public.habeas_data_requests IS
  'KPMG D-2 · Solicitudes de titulares (ARCO + supresión + portabilidad + queja). fecha_limite se calcula automáticamente con plazo Ley 1581.';
