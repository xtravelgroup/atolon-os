-- Bug bloqueante producción: usuarios authenticated no podían INSERT en
-- 10 tablas (requisiciones, eventos, ordenes_compra, proveedores, usuarios,
-- roles, cotizaciones, empleados, cajas_evento_ventas, pool_service_pedidos)
-- porque el trigger audit_log_trigger intentaba escribir a public.audit_log
-- y la tabla tiene RLS activo con CERO policies — todo INSERT rechazado.
--
-- Mensaje al usuario: "new row violates row-level security policy 'audit_log'".
-- Reportado por Andrea al crear una requisición (2026-06-15).
--
-- Fix: hacer el trigger SECURITY DEFINER. Con eso, la inserción a audit_log
-- corre con los privilegios del owner (postgres / supabase superuser) en
-- lugar del usuario authenticated. audit_log queda CERRADO a escritura
-- manual desde el cliente (correcto: solo triggers escriben ahí).

ALTER FUNCTION public.audit_log_trigger() SECURITY DEFINER;

-- Verificación esperada:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname='audit_log_trigger';
--   → prosecdef = true
