-- ============================================
-- ATOLON OS — Tabla de Requisiciones de Compras
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Crear la tabla principal
create table if not exists requisiciones (
  id text primary key,
  descripcion text not null,
  tipo text not null check (tipo in ('OPEX', 'CAPEX')),
  categoria text not null,
  area text not null,
  solicitante text not null,
  prioridad text not null default 'Media' check (prioridad in ('Baja', 'Media', 'Alta', 'Urgente')),
  estado text not null default 'Borrador' check (estado in ('Borrador', 'Pendiente', 'Aprobada', 'En Compra', 'Recibida', 'Rechazada')),
  fecha date not null default current_date,
  fecha_necesaria date,
  proveedor text,
  justificacion text,
  items jsonb not null default '[]',
  total integer not null default 0,
  timeline jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Indice para consultas frecuentes
create index if not exists idx_requisiciones_estado on requisiciones(estado);
create index if not exists idx_requisiciones_tipo on requisiciones(tipo);
create index if not exists idx_requisiciones_area on requisiciones(area);
create index if not exists idx_requisiciones_fecha on requisiciones(fecha desc);

-- 3. Trigger para updated_at automatico
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on requisiciones;
create trigger set_updated_at
  before update on requisiciones
  for each row execute function update_updated_at();

-- 4. Habilitar RLS (Row Level Security)
alter table requisiciones enable row level security;

-- 5. Politica permisiva para anon (desarrollo — restringir en produccion)
create policy "Allow all for anon" on requisiciones
  for all
  to anon
  using (true)
  with check (true);

-- 6. Insertar datos mock
insert into requisiciones (id, descripcion, tipo, categoria, area, solicitante, prioridad, estado, fecha, fecha_necesaria, proveedor, justificacion, items, total, timeline) values
(
  'REQ-001', 'Combustible flota mensual - Abril 2026', 'OPEX', 'Combustible', 'Flota',
  'Carlos Mendoza', 'Alta', 'Aprobada', '2026-03-28', '2026-04-01',
  'Terpel Marina Cartagena', 'Abastecimiento mensual de combustible para las 5 embarcaciones de la flota.',
  '[{"item":"Gasolina Premium (gal)","cant":800,"unidad":"Galones","precioU":14500,"subtotal":11600000},{"item":"Aceite nautico 2T","cant":24,"unidad":"Litros","precioU":45000,"subtotal":1080000}]',
  12680000,
  '[{"quien":"Carlos Mendoza","accion":"Creada","fecha":"2026-03-28 08:30","comentario":""},{"quien":"Carlos Mendoza","accion":"Enviada","fecha":"2026-03-28 08:35","comentario":"Urgente para inicio de mes"},{"quien":"Juan Diaz (Dir. Ops)","accion":"Aprobada","fecha":"2026-03-28 10:15","comentario":"Aprobado. Alineado con presupuesto flota."}]'
),
(
  'REQ-002', 'Insumos cocina - Semana 14', 'OPEX', 'Alimentos', 'Cocina',
  'Maria Fernandez', 'Media', 'En Compra', '2026-03-27', '2026-03-31',
  'Distribuidora del Caribe', 'Reposicion semanal de insumos para restaurante y bar.',
  '[{"item":"Proteina (res, pollo, pescado)","cant":1,"unidad":"Lote","precioU":4200000,"subtotal":4200000},{"item":"Frutas y verduras frescas","cant":1,"unidad":"Lote","precioU":1800000,"subtotal":1800000},{"item":"Licores y bebidas","cant":1,"unidad":"Lote","precioU":3500000,"subtotal":3500000},{"item":"Desechables y empaques","cant":1,"unidad":"Lote","precioU":650000,"subtotal":650000}]',
  10150000,
  '[{"quien":"Maria Fernandez","accion":"Creada","fecha":"2026-03-27 14:00","comentario":""},{"quien":"Maria Fernandez","accion":"Enviada","fecha":"2026-03-27 14:10","comentario":""},{"quien":"Sofia Ramirez (Admin)","accion":"Aprobada","fecha":"2026-03-27 15:30","comentario":"OK"},{"quien":"Sofia Ramirez (Admin)","accion":"En Compra","fecha":"2026-03-28 09:00","comentario":"Orden enviada a proveedor"}]'
),
(
  'REQ-003', 'Kayaks nuevos x4 - Temporada alta', 'CAPEX', 'Equipos', 'Deportes',
  'Andres Rivera', 'Media', 'Pendiente', '2026-03-26', '2026-04-15',
  'Wilderness Systems Colombia', '3 kayaks actuales tienen desgaste severo. Necesitamos 4 nuevos para temporada alta Jun-Ago.',
  '[{"item":"Kayak Wilderness Tarpon 120","cant":4,"unidad":"Unidades","precioU":4800000,"subtotal":19200000},{"item":"Remos doble aluminio","cant":4,"unidad":"Unidades","precioU":280000,"subtotal":1120000},{"item":"Chalecos salvavidas","cant":8,"unidad":"Unidades","precioU":195000,"subtotal":1560000}]',
  21880000,
  '[{"quien":"Andres Rivera","accion":"Creada","fecha":"2026-03-26 11:00","comentario":""},{"quien":"Andres Rivera","accion":"Enviada","fecha":"2026-03-26 11:15","comentario":"Adjunto cotizacion de Wilderness. Necesitamos aprobar antes de Abril para entrega a tiempo."}]'
),
(
  'REQ-004', 'Mantenimiento motor Sunrise', 'OPEX', 'Mantenimiento', 'Flota',
  'Carlos Mendoza', 'Urgente', 'Aprobada', '2026-03-25', '2026-03-28',
  'Yamaha Marine Service CTG', 'Motor principal de Sunrise presento falla. Requiere revision y posible cambio de piezas.',
  '[{"item":"Diagnostico motor fuera borda","cant":1,"unidad":"Servicio","precioU":850000,"subtotal":850000},{"item":"Kit impellers y empaques","cant":1,"unidad":"Kit","precioU":1200000,"subtotal":1200000},{"item":"Mano de obra tecnico (est. 8h)","cant":8,"unidad":"Horas","precioU":120000,"subtotal":960000}]',
  3010000,
  '[{"quien":"Carlos Mendoza","accion":"Creada","fecha":"2026-03-25 07:00","comentario":"URGENTE - Sunrise fuera de servicio"},{"quien":"Carlos Mendoza","accion":"Enviada","fecha":"2026-03-25 07:05","comentario":""},{"quien":"Juan Diaz (Dir. Ops)","accion":"Aprobada","fecha":"2026-03-25 07:30","comentario":"Aprobacion urgente. Necesitamos Sunrise operativa para temporada."}]'
),
(
  'REQ-005', 'Sistema de sonido zona piscina', 'CAPEX', 'Equipos', 'Bar',
  'Diana Ortiz', 'Baja', 'Borrador', '2026-03-29', '2026-05-01',
  '', 'El sonido actual de la piscina es insuficiente para eventos. Propongo upgrade a sistema JBL Pro.',
  '[{"item":"JBL PRX915 parlantes (par)","cant":2,"unidad":"Pares","precioU":8500000,"subtotal":17000000},{"item":"Subwoofer JBL PRX918S","cant":1,"unidad":"Unidad","precioU":7200000,"subtotal":7200000},{"item":"Mezcladora Yamaha MG16","cant":1,"unidad":"Unidad","precioU":3400000,"subtotal":3400000},{"item":"Cableado e instalacion","cant":1,"unidad":"Servicio","precioU":2800000,"subtotal":2800000}]',
  30400000,
  '[{"quien":"Diana Ortiz","accion":"Creada","fecha":"2026-03-29 16:00","comentario":"Borrador - pendiente de cotizacion final"}]'
),
(
  'REQ-006', 'Uniformes temporada alta - Staff completo', 'OPEX', 'Uniformes', 'Administracion',
  'Sofia Ramirez', 'Media', 'Recibida', '2026-03-15', '2026-03-25',
  'Confecciones del Caribe', 'Renovacion de uniformes para todo el staff previo a temporada alta.',
  '[{"item":"Polo bordado Atolon (staff)","cant":45,"unidad":"Unidades","precioU":65000,"subtotal":2925000},{"item":"Short cargo beige","cant":30,"unidad":"Unidades","precioU":48000,"subtotal":1440000},{"item":"Gorra Atolon bordada","cant":25,"unidad":"Unidades","precioU":22000,"subtotal":550000}]',
  4915000,
  '[{"quien":"Sofia Ramirez","accion":"Creada","fecha":"2026-03-15 09:00","comentario":""},{"quien":"Sofia Ramirez","accion":"Enviada","fecha":"2026-03-15 09:05","comentario":""},{"quien":"Juan Diaz (Dir. Ops)","accion":"Aprobada","fecha":"2026-03-15 11:00","comentario":"OK"},{"quien":"Sofia Ramirez","accion":"En Compra","fecha":"2026-03-16 10:00","comentario":"Orden colocada"},{"quien":"Sofia Ramirez","accion":"Recibida","fecha":"2026-03-24 14:00","comentario":"Recibido completo. Calidad OK."}]'
),
(
  'REQ-007', 'Reparacion techo palapa principal', 'OPEX', 'Mantenimiento', 'Mantenimiento',
  'Pedro Gomez', 'Alta', 'Pendiente', '2026-03-28', '2026-04-05',
  'Construcciones Caribe SAS', 'Filtracion detectada en palapa del restaurante. Riesgo de dano a mobiliario.',
  '[{"item":"Hojas de palma tratada","cant":200,"unidad":"Unidades","precioU":15000,"subtotal":3000000},{"item":"Estructura bambu refuerzo","cant":1,"unidad":"Lote","precioU":2200000,"subtotal":2200000},{"item":"Mano de obra especializada","cant":3,"unidad":"Dias","precioU":450000,"subtotal":1350000}]',
  6550000,
  '[{"quien":"Pedro Gomez","accion":"Creada","fecha":"2026-03-28 13:00","comentario":""},{"quien":"Pedro Gomez","accion":"Enviada","fecha":"2026-03-28 13:10","comentario":"Adjunto fotos de la filtracion"}]'
),
(
  'REQ-008', 'Tablets POS para mesas - x6', 'CAPEX', 'Tecnologia', 'Administracion',
  'Sofia Ramirez', 'Media', 'Rechazada', '2026-03-20', '2026-04-10',
  'Tecnoglobal Colombia', 'Implementar sistema de pedidos en mesa via tablet.',
  '[{"item":"Samsung Galaxy Tab A9 + funda","cant":6,"unidad":"Unidades","precioU":1250000,"subtotal":7500000},{"item":"Soporte de mesa antirrobo","cant":6,"unidad":"Unidades","precioU":180000,"subtotal":1080000},{"item":"Licencia software POS (anual)","cant":6,"unidad":"Licencias","precioU":420000,"subtotal":2520000}]',
  11100000,
  '[{"quien":"Sofia Ramirez","accion":"Creada","fecha":"2026-03-20 10:00","comentario":""},{"quien":"Sofia Ramirez","accion":"Enviada","fecha":"2026-03-20 10:15","comentario":""},{"quien":"Juan Diaz (Dir. Ops)","accion":"Rechazada","fecha":"2026-03-21 09:00","comentario":"Presupuesto CAPEX de tecnologia agotado para Q1. Reprogramar para Q2."}]'
),
(
  'REQ-009', 'Productos limpieza mensual - Abril', 'OPEX', 'Limpieza', 'Operaciones',
  'Laura Mendez', 'Baja', 'Pendiente', '2026-03-29', '2026-04-02',
  'Aseo Total SAS', 'Reposicion mensual de productos de limpieza y desinfeccion.',
  '[{"item":"Desinfectante industrial (20L)","cant":4,"unidad":"Galones","precioU":85000,"subtotal":340000},{"item":"Jabon liquido antibacterial","cant":10,"unidad":"Litros","precioU":28000,"subtotal":280000},{"item":"Bolsas basura industriales","cant":500,"unidad":"Unidades","precioU":800,"subtotal":400000},{"item":"Toallas de papel (caja)","cant":8,"unidad":"Cajas","precioU":45000,"subtotal":360000}]',
  1380000,
  '[{"quien":"Laura Mendez","accion":"Creada","fecha":"2026-03-29 08:00","comentario":""},{"quien":"Laura Mendez","accion":"Enviada","fecha":"2026-03-29 08:05","comentario":""}]'
);
