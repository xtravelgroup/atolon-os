-- Audit: RLS endurecido para requisiciones.
-- Fecha: 2026-06-14 · Autorizado por usuario.
--
-- Antes: 2 policies con qual:'true' (efectivamente abierto para anon y auth).
-- Ahora:
--   anon            → DENY todo
--   authenticated   → SELECT/INSERT si tiene modulo 'requisiciones' o 'compras'
--                   → UPDATE si modulo 'compras' (aprobador/mesa de compras)
--                              OR solicitante propio en estado 'Borrador'
--                   → DELETE bloqueado (soft delete vía estado)
--
-- Verificado pre-migracion:
--   - 0 queries desde edge functions / anon contra requisiciones
--   - requisiciones.solicitante_id (text) = usuarios.id (text) — 56/56 match
--   - patrón EXISTS(usuarios u WHERE lower(u.email)=lower(jwt-email))
--     ya en uso en otras tablas (comisiones_semanas)

-- Borrar policies anteriores
DROP POLICY IF EXISTS "Allow all for anon" ON requisiciones;
DROP POLICY IF EXISTS "auth_all_requisiciones" ON requisiciones;

-- ── anon ────────────────────────────────────────────────────────────────
-- Sin policy = denegado (RLS ya esta activo). Pero por defensa-en-profundidad
-- y trazabilidad, agrego una policy explicita que niega todo.
CREATE POLICY "deny_anon_requisiciones"
ON requisiciones FOR ALL TO anon
USING (false) WITH CHECK (false);

-- ── authenticated SELECT ────────────────────────────────────────────────
-- Cualquier usuario activo con modulo 'requisiciones' o 'compras' ve todas.
CREATE POLICY "auth_select_requisiciones"
ON requisiciones FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
      AND u.activo = true
      AND (
        'requisiciones' = ANY(u.modulos)
        OR 'compras' = ANY(u.modulos)
      )
  )
);

-- ── authenticated INSERT ────────────────────────────────────────────────
-- Mismo criterio que SELECT. El solicitante crea su propia req.
CREATE POLICY "auth_insert_requisiciones"
ON requisiciones FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
      AND u.activo = true
      AND (
        'requisiciones' = ANY(u.modulos)
        OR 'compras' = ANY(u.modulos)
      )
  )
);

-- ── authenticated UPDATE ────────────────────────────────────────────────
-- Modelo: aprobadores/compras siempre; solicitantes solo su propio Borrador.
-- 'compras' module = mesa de compras + aprobadores (ya es el patron en la app).
CREATE POLICY "auth_update_requisiciones"
ON requisiciones FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
      AND u.activo = true
      AND (
        -- Compras/aprobadores: pueden editar cualquier req en cualquier estado.
        'compras' = ANY(u.modulos)
        OR
        -- Solicitante: solo su propia req en Borrador.
        ('requisiciones' = ANY(u.modulos)
         AND u.id = requisiciones.solicitante_id
         AND requisiciones.estado = 'Borrador')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
      AND u.activo = true
      AND ('compras' = ANY(u.modulos) OR 'requisiciones' = ANY(u.modulos))
  )
);

-- ── authenticated DELETE ────────────────────────────────────────────────
-- Bloqueado para todos. Se borra cambiando estado a 'Rechazada' (soft delete).
-- Esto conserva auditoria y compatibilidad con foreign keys (items, OCs).
CREATE POLICY "deny_delete_requisiciones"
ON requisiciones FOR DELETE TO authenticated
USING (false);
