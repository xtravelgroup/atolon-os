-- Portal de socios externos (Blue Apple, Lulu Tours, etc.)
-- Permite que un partner externo tome cupos en zarpes programados de Atolón
-- compartiendo embarcación. Estos pax NO cuentan como clientes Atolón
-- (no afectan revenue, KPIs ni servicios incluidos).

-- 1. Partners (socios)
CREATE TABLE IF NOT EXISTS public.partners (
  id                  text PRIMARY KEY,
  slug                text UNIQUE NOT NULL,
  nombre              text NOT NULL,
  logo_url            text,
  color_primario      text DEFAULT '#0EA5E9',
  contacto_persona    text,
  contacto_email      text,
  contacto_telefono   text,
  notas               text,
  activo              boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partners_all" ON public.partners;
CREATE POLICY "partners_all" ON public.partners
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.partners TO anon, authenticated;

-- 2. Usuarios autorizados de cada partner
CREATE TABLE IF NOT EXISTS public.partner_users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   text REFERENCES public.partners(id) ON DELETE CASCADE,
  email        text UNIQUE NOT NULL,
  nombre       text,
  telefono     text,
  rol          text DEFAULT 'operador',  -- operador | admin
  activo       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_users_all" ON public.partner_users;
CREATE POLICY "partner_users_all" ON public.partner_users
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.partner_users TO anon, authenticated;

-- 3. Reservas de partner contra zarpes programados
CREATE TABLE IF NOT EXISTS public.partner_bookings (
  id                  text PRIMARY KEY,
  partner_id          text REFERENCES public.partners(id) ON DELETE CASCADE,
  partner_nombre      text,                          -- snapshot
  zarpe_id            text REFERENCES public.muelle_zarpes_flota(id) ON DELETE SET NULL,
  fecha               date NOT NULL,
  hora                time,
  embarcacion         text,
  destino             text,                          -- "Blue Apple" en lugar de Atolón
  pax_total           int DEFAULT 0,
  -- Pasajeros con info DIMAR (jsonb array):
  -- [{nombre, tipo_doc, num_doc, nacionalidad, fecha_nac, sexo, telefono?, email?}]
  pasajeros           jsonb DEFAULT '[]'::jsonb,
  estado              text DEFAULT 'confirmada',     -- confirmada | cancelada | check_in | abordo | finalizada
  notas               text,
  created_by_email    text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_bookings_partner ON public.partner_bookings(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_bookings_zarpe   ON public.partner_bookings(zarpe_id);
CREATE INDEX IF NOT EXISTS idx_partner_bookings_fecha   ON public.partner_bookings(fecha);

ALTER TABLE public.partner_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_bookings_all" ON public.partner_bookings;
CREATE POLICY "partner_bookings_all" ON public.partner_bookings
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.partner_bookings TO anon, authenticated;

-- 4. Capacidad de embarcaciones (la usaremos para calcular cupos disponibles)
ALTER TABLE public.lanchas
  ADD COLUMN IF NOT EXISTS capacidad_pax_total int;

-- Default razonable para Castillete y Naturalle (ajustable después)
UPDATE public.lanchas
   SET capacidad_pax_total = 30
 WHERE id = 'LCH-NATURALLE' AND capacidad_pax_total IS NULL;
UPDATE public.lanchas
   SET capacidad_pax_total = 12
 WHERE id = 'LCH-CASTILLETE' AND capacidad_pax_total IS NULL;

-- 5. Insertar Blue Apple
INSERT INTO public.partners (id, slug, nombre, color_primario, contacto_email, notas)
VALUES (
  'PARTNER-BLUEAPPLE', 'blueapple', 'Blue Apple',
  '#0EA5E9',
  'reservas@blueapple.co',
  'Intercambio de transporte. Sus pax comparten zarpe pero no van a Atolón. NO cobramos.'
) ON CONFLICT (id) DO NOTHING;
