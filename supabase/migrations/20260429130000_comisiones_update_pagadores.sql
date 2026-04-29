-- Bug: la política RLS de UPDATE en comisiones_semanas solo permitía a
-- 3 emails (eric/direccion/vsimancas — los aprobadores). Cuando otros
-- usuarios con acceso al módulo Pagos (ej. contabilidad) intentaban
-- marcar una comisión como pagada, el UPDATE fallaba silenciosamente
-- por RLS y la comisión seguía mostrando estado='aprobado'.
--
-- Caso reportado: Inés Negrete (Taquilla 4) — sem 6-12 abr, $210.000
-- marcada pagada pero seguía saliendo en Por Pagar.
--
-- Fix: permitir UPDATE a cualquier usuario activo con 'pagos' o
-- 'comisiones' en su array de modulos. Los aprobadores siguen
-- teniendo acceso completo (también tienen 'comisiones' en sus
-- modulos como admins).

DROP POLICY IF EXISTS aprobadores_update_comisiones_semanas ON comisiones_semanas;

CREATE POLICY pagadores_y_aprobadores_update_comisiones_semanas
  ON comisiones_semanas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE LOWER(u.email) = LOWER(auth.jwt() ->> 'email')
        AND u.activo = true
        AND (
          'pagos'      = ANY(u.modulos) OR
          'comisiones' = ANY(u.modulos)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE LOWER(u.email) = LOWER(auth.jwt() ->> 'email')
        AND u.activo = true
        AND (
          'pagos'      = ANY(u.modulos) OR
          'comisiones' = ANY(u.modulos)
        )
    )
  );
