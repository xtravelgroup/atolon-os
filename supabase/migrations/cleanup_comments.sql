-- Limpieza de comentarios en BD para que no mencionen referencias internas
-- a metodologías de auditoría específicas. La funcionalidad queda igual;
-- solo se reescriben los COMMENT ON.

COMMENT ON TABLE public.sod_exceptions IS
  'Excepciones temporales a la matriz de Segregación de Funciones (SoD). Cada fila requiere autorización explícita de un super_admin y debe tener fecha de expiración.';

COMMENT ON FUNCTION public.req_sod_check IS
  'Control SoD: bloquea autoaprobación de requisiciones. Falla con SQLSTATE 42501 si solicitante_id = aprobador_id en Aprobada/Rechazada.';

COMMENT ON FUNCTION public.oc_sod_check IS
  'Control SoD: bloquea que el emisor de una OC sea el mismo que registra el pago del anticipo.';

COMMENT ON VIEW public.sod_violations_log IS
  'Lista todas las violaciones de SoD detectadas en datos actuales. Solo lectura.';

COMMENT ON TABLE public.dr_checks IS
  'Registro de cada verificación de integridad post-backup. Soporta evidencia de control interno.';

COMMENT ON TABLE public.dr_policy IS
  'Política y runbook de Disaster Recovery. Single-row (id=1).';

COMMENT ON FUNCTION public.dr_run_integrity_check IS
  'Corre verificación de integridad sobre tablas críticas. Devuelve JSON con assertions + overall status.';

COMMENT ON TABLE public.dian_resoluciones IS
  'Registro de resoluciones DIAN vigentes en cada ambiente Loggro. Una resolución por (environment, tipo_documento, prefijo).';

COMMENT ON VIEW public.loggro_sync_unified IS
  'Estado unificado de sync hacia Loggro Restrobar/Pyme. Cada huérfano = potencial venta no facturada.';

COMMENT ON TABLE public.habeas_data_policy IS
  'Política de tratamiento de datos personales (Ley 1581/2012). Single-row.';

COMMENT ON TABLE public.habeas_data_inventory IS
  'Inventario de tablas con datos personales. Base para Registro Nacional de Bases de Datos (RNBD) ante SIC.';

COMMENT ON TABLE public.habeas_data_consents IS
  'Registro de consentimientos otorgados por titulares. Append-only; "retirar" se marca con retirado_at.';

COMMENT ON TABLE public.habeas_data_requests IS
  'Solicitudes de titulares (ARCO + supresión + portabilidad + queja). fecha_limite se calcula automáticamente con plazo Ley 1581.';

COMMENT ON TABLE public.niif_policy IS
  'Política contable NIIF Pymes. Single-row. Review anual obligatorio.';

COMMENT ON TABLE public.niif_vidas_utiles IS
  'Catálogo de vidas útiles por categoría conforme NIIF Pymes sec. 17 y referencias DIAN.';

COMMENT ON VIEW public.niif_activos_depreciacion IS
  'Depreciación NIIF calculada por activo. Status indica si la fila está lista para reportería contable.';

COMMENT ON COLUMN public.usuarios.password_changed_at  IS 'Política de contraseñas: timestamp del último cambio. Usado para caducidad de 90 días en roles administrativos.';
COMMENT ON COLUMN public.usuarios.password_history     IS 'Política de contraseñas: hashes SHA-256 de las últimas N contraseñas para impedir reutilización.';
COMMENT ON COLUMN public.usuarios.failed_login_count   IS 'Contador de intentos fallidos consecutivos.';
COMMENT ON COLUMN public.usuarios.locked_until         IS 'Si está seteado, el usuario está bloqueado hasta esta fecha.';
COMMENT ON COLUMN public.usuarios.mfa_enrolled_at      IS 'Timestamp del enrollment de TOTP. NULL = sin MFA.';
COMMENT ON COLUMN public.usuarios.mfa_factor_id        IS 'factor_id de Supabase Auth (auth.mfa_factors.id).';
COMMENT ON COLUMN public.usuarios.mfa_last_used_at     IS 'Última vez que se completó un challenge MFA (login).';
COMMENT ON COLUMN public.usuarios.mfa_required         IS 'Override per-user de la política de MFA. NULL = usa default del rol. TRUE = fuerza MFA. FALSE = exime al usuario.';
