-- Eventos: gastos/facturas de servicios contratados (terceros).
-- ──────────────────────────────────────────────────────────────────
-- Cada servicio contratado del evento (DJ, decoración, fotografía,
-- transporte tercerizado, etc.) puede tener uno o más gastos asociados:
-- factura del proveedor, anticipos, pagos parciales. Esto alimenta el
-- costo real del servicio en el P/L del evento.

CREATE TABLE IF NOT EXISTS eventos_servicios_gastos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id       text NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  servicio_id     text,                                -- id dentro de servicios_contratados
  servicio_descripcion text,                           -- snapshot del servicio
  proveedor_id    text,                                -- FK suave a proveedores
  proveedor_nombre text,                               -- snapshot
  concepto        text NOT NULL,                       -- "Anticipo DJ", "Factura final decoración"
  monto           numeric NOT NULL CHECK (monto > 0),
  iva_pct         numeric DEFAULT 0,
  iva_monto       numeric DEFAULT 0,
  total           numeric NOT NULL,                    -- monto + iva_monto
  fecha           date NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago     text,                                -- transferencia | efectivo | tarjeta | cheque
  factura_numero  text,
  factura_url     text,                                -- PDF/imagen subida
  estado          text DEFAULT 'pendiente',            -- pendiente | pagado | anulado
  pagado_at       timestamptz,
  notas           text,
  registrado_por  text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servgastos_evento ON eventos_servicios_gastos(evento_id, servicio_id);
CREATE INDEX IF NOT EXISTS idx_servgastos_estado ON eventos_servicios_gastos(evento_id, estado);

-- Storage bucket para facturas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('facturas-servicios', 'facturas-servicios', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE eventos_servicios_gastos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='eventos_servicios_gastos'::regclass AND polname='servgastos_auth_all') THEN
    EXECUTE 'CREATE POLICY servgastos_auth_all ON eventos_servicios_gastos FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='facturas_auth_all') THEN
    EXECUTE 'CREATE POLICY facturas_auth_all ON storage.objects FOR ALL TO authenticated USING (bucket_id = ''facturas-servicios'') WITH CHECK (bucket_id = ''facturas-servicios'')';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
