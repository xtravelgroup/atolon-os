-- Fix bloqueante producción: Emma (gerente_general) no podía aprobar
-- requisiciones. Síntoma: "no pasa nada al darle Aprobar".
--
-- Causa raíz: El RLS endurecido (migration 20260614020000) tenía 2
-- problemas semánticos para los APROBADORES:
--
-- 1) Policy UPDATE: solo permitía editar a quien tuviera modulo 'compras'
--    o al solicitante con modulo 'requisiciones' en estado Borrador. Pero
--    los aprobadores cambian estado de "Pendiente" → "Aprobada" y muchos
--    NO tienen modulo 'compras' en su perfil (Emma tiene 'requisiciones'
--    pero su perfil no incluye 'compras'). El UPDATE se rechazaba
--    silenciosamente (Postgres devuelve 0 filas afectadas, sin error).
--
-- 2) Policy SELECT: igual restricción — sin modulo compras/requisiciones,
--    los aprobadores no veían la lista. (Emma sí tenia 'requisiciones'
--    así que el SELECT pasaba en su caso, pero Carlos como super_admin
--    sin modulos configurados estaría doblemente bloqueado.)
--
-- Fix: agregar reconocimiento por ROL en ambas policies. Los roles
-- con autoridad de aprobación (gerente_general*, super_admin, admin,
-- direccion) pueden VER y EDITAR cualquier requisición. El trigger SQL
-- req_aprobador_check sigue validando que la transición a 'Aprobada'
-- cumpla la matriz de roles + doble firma para >=$10M.

-- ── UPDATE ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_update_requisiciones" ON requisiciones;

CREATE POLICY "auth_update_requisiciones"
ON requisiciones FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
      AND u.activo = true
      AND (
        -- Mesa de compras: puede editar cualquier req en cualquier estado.
        'compras' = ANY(u.modulos)
        -- Aprobadores por rol: gerente_general*, super_admin, admin, direccion.
        OR u.rol_id LIKE 'gerente_general%'
        OR u.rol_id IN ('super_admin', 'admin', 'direccion')
        -- Solicitante con modulo requisiciones puede editar SU borrador.
        OR ('requisiciones' = ANY(u.modulos)
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
      AND (
        'compras' = ANY(u.modulos)
        OR u.rol_id LIKE 'gerente_general%'
        OR u.rol_id IN ('super_admin', 'admin', 'direccion')
        OR 'requisiciones' = ANY(u.modulos)
      )
  )
);

-- ── SELECT ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_requisiciones" ON requisiciones;

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
        OR u.rol_id LIKE 'gerente_general%'
        OR u.rol_id IN ('super_admin', 'admin', 'direccion')
      )
  )
);
