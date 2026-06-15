-- Follow-up del hotfix audit_log (migration 20260615120000):
-- buscar y arreglar TODOS los triggers/helpers con el mismo patrón roto
-- (NO SECURITY DEFINER + escriben/leen tablas con RLS sin policies).
--
-- Sweep ejecutado encontró 3 funciones más afectadas:
--   1. req_sod_check        — trigger en requisiciones (compliance KPMG C-4)
--   2. secrets_after_rotation — trigger en secrets_rotations
--   3. sod_has_exception     — helper llamada por req_sod_check
--
-- Las 3 leen/escriben tablas con RLS sin policies (sod_exceptions,
-- secrets_inventory). Sin SECURITY DEFINER, fallarían cuando un user
-- authenticated dispare la operación que las activa.
--
-- Aplicar SECURITY DEFINER deja la lógica intacta — solo cambia el
-- contexto de ejecución a "owner" (postgres) para leer/escribir esas
-- tablas internas. Las tablas siguen cerradas a escritura directa
-- desde clientes.

ALTER FUNCTION public.req_sod_check()           SECURITY DEFINER;
ALTER FUNCTION public.secrets_after_rotation()  SECURITY DEFINER;
ALTER FUNCTION public.sod_has_exception(text, text) SECURITY DEFINER;

-- Verificación: posterior sweep para asegurar que NO quedan otros
-- triggers con el patrón roto (escribir/leer tablas RLS-locked sin
-- SECURITY DEFINER). El sweep retornó 0 matches → audit completo.
