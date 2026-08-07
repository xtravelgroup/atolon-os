-- Bug 2026-08-06: 31 de 36 OCs recibidas entre 15-jul y 5-ago no tenian
-- movimientos en movimientos_inventario_atolon porque la RLS exigia
-- auth.role() = 'authenticated' y bloqueaba silenciosamente cuando la
-- sesion del navegador perdia el auth. Se relaja a `true` (igual que
-- items_stock_locacion y items_ajustes).

DROP POLICY IF EXISTS auth_all_movinv ON public.movimientos_inventario_atolon;

CREATE POLICY movimientos_inventario_atolon_all
  ON public.movimientos_inventario_atolon
  FOR ALL
  USING (true)
  WITH CHECK (true);
