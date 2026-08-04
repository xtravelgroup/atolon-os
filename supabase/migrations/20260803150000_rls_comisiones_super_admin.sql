-- Fix RLS: super_admin/admin/direccion no tenian permiso de UPDATE en
-- comisiones_semanas — solo usuarios con modulo 'pagos' o 'comisiones'.
-- El UPDATE se rechazaba silenciosamente (data:[], error:null) y el
-- modal creia que se guardo.

DROP POLICY IF EXISTS "pagadores_y_aprobadores_update_comisiones_semanas"
  ON comisiones_semanas;

CREATE POLICY "pagadores_y_aprobadores_update_comisiones_semanas"
  ON comisiones_semanas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
        AND u.activo = true
        AND (
          u.rol_id IN ('super_admin', 'admin', 'direccion')
          OR 'pagos' = ANY (u.modulos)
          OR 'comisiones' = ANY (u.modulos)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
        AND u.activo = true
        AND (
          u.rol_id IN ('super_admin', 'admin', 'direccion')
          OR 'pagos' = ANY (u.modulos)
          OR 'comisiones' = ANY (u.modulos)
        )
    )
  );
