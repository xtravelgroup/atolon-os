-- Posiciones (puestos) para armar organigrama estructural — dirección 2026-07-04.
--
-- Antes: el organigrama usaba rh_empleados.jefe_id (relación persona→persona).
-- Ahora: rh_posiciones es la entidad primaria del organigrama. Empleados
-- ocupan posiciones (M:1 empleado→posición, con cupos>1 para roles con varias
-- personas como "Mesero Playa" que tiene ~5 ocupantes).
--
-- El jefe_id se mantiene por backward compat pero el organigrama nuevo se
-- deriva del árbol de posiciones (parent_id).

CREATE TABLE IF NOT EXISTS public.rh_posiciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  descripcion      text,
  departamento_id  uuid REFERENCES public.rh_departamentos(id) ON DELETE SET NULL,
  parent_id        uuid REFERENCES public.rh_posiciones(id) ON DELETE SET NULL,
  nivel            int  DEFAULT 0,      -- 0=raíz, 1=direccion, 2=gerencia, ...
  orden            int  DEFAULT 0,      -- para ordenar hermanos en mismo nivel
  cupos            int  DEFAULT 1,      -- # empleados que pueden ocupar la posición
  color            text,
  icono            text,
  activo           bool DEFAULT true,
  notas            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  CONSTRAINT rh_posiciones_no_self CHECK (id != parent_id)
);

CREATE INDEX IF NOT EXISTS idx_rh_posiciones_parent ON public.rh_posiciones(parent_id);
CREATE INDEX IF NOT EXISTS idx_rh_posiciones_dept   ON public.rh_posiciones(departamento_id);

ALTER TABLE public.rh_posiciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_rh_posiciones" ON public.rh_posiciones;
CREATE POLICY "auth_all_rh_posiciones" ON public.rh_posiciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- FK: cada empleado ocupa una posición (nullable → se puede tener empleados sin posición).
ALTER TABLE public.rh_empleados
  ADD COLUMN IF NOT EXISTS posicion_id uuid REFERENCES public.rh_posiciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rh_empleados_posicion ON public.rh_empleados(posicion_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_rh_posiciones_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rh_posiciones_updated_at ON public.rh_posiciones;
CREATE TRIGGER rh_posiciones_updated_at
  BEFORE UPDATE ON public.rh_posiciones
  FOR EACH ROW EXECUTE FUNCTION update_rh_posiciones_updated_at();
