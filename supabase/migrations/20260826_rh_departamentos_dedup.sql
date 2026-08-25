-- ═══════════════════════════════════════════════════════════════════════
-- Deduplicación rh_departamentos + índice único case-insensitive
-- ═══════════════════════════════════════════════════════════════════════
-- Ya aplicado en prod 2026-08-26. Se incluye en migrations para consistencia
-- de entornos staging/dev.
--
-- Consolidó 17 → 15:
--   Cocina        3c924711 ← [b0e0085d] (vacía)
--   Mantenimiento aed5ebce ← [d86d2ae0] (1 empleado + 1 posición reasignados)
--
-- Objetivo: habilitar flujo de aprobación de nómina por supervisor de depto
-- (ProcesarNomina.jsx / NominaPorDia.jsx). Con duplicados el filtro por
-- departamento_id no atrapaba a todos los empleados del área.
-- ═══════════════════════════════════════════════════════════════════════

-- Prevenir futuros duplicados por variaciones de mayúsculas/espacios
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_departamentos_nombre_norm
  ON rh_departamentos (LOWER(TRIM(nombre)));

COMMENT ON INDEX ux_rh_departamentos_nombre_norm IS
  'Evita crear departamentos duplicados desde UI (case-insensitive + trim).';
