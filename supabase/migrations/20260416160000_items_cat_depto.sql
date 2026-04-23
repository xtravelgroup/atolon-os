-- Agregar departamento a categorías
ALTER TABLE items_categorias ADD COLUMN IF NOT EXISTS departamento text DEFAULT 'Cocina';

-- Limpiar categorías seed y re-insertar con las de Loggro
DELETE FROM items_categorias;

INSERT INTO items_categorias (nombre, icon, color, orden, departamento) VALUES
  -- Cocina
  ('Insumos cocina',              '🍳', '#f59e0b', 1,  'Cocina'),
  ('PRODUCCION COCINA',           '👨‍🍳', '#ef4444', 2,  'Cocina'),
  ('ENTRADAS Y ENSALADAS',        '🥗', '#34d399', 3,  'Cocina'),
  ('PLATOS PRINCIPALES',          '🥩', '#f97316', 4,  'Cocina'),
  ('PIZZAS Y TACOS',              '🍕', '#fbbf24', 5,  'Cocina'),
  ('COMPLEMENTOS Y ADICIONALES',  '🍟', '#a78bfa', 6,  'Cocina'),
  ('POSTRES',                     '🍰', '#ec4899', 7,  'Cocina'),
  ('FULL YATE MENU',              '🚤', '#06b6d4', 8,  'Cocina'),
  ('Desayuno',                    '🥐', '#f59e0b', 9,  'Cocina'),
  -- Bar
  ('Producción BAR',              '🍹', '#a78bfa', 10, 'Bar'),
  ('BEBIDAS',                     '🥤', '#38bdf8', 11, 'Bar'),
  ('BEBIDA CALIENTES - HOT SOFT DRINKS', '☕', '#f97316', 12, 'Bar'),
  ('Jugos',                       '🧃', '#34d399', 13, 'Bar'),
  ('CERVEZAS',                    '🍺', '#fbbf24', 14, 'Bar'),
  ('BOTELLAS',                    '🍾', '#8b5cf6', 15, 'Bar'),
  ('RON',                         '🥃', '#f59e0b', 16, 'Bar'),
  ('TEQUILA / MEZCAL',            '🌵', '#ef4444', 17, 'Bar'),
  ('WHISKY / BOURBON',            '🥃', '#b45309', 18, 'Bar'),
  ('VODKA / GIN',                 '🍸', '#38bdf8', 19, 'Bar'),
  ('LICORES',                     '🍷', '#a855f7', 20, 'Bar'),
  ('VINOS / ESPUMOSOS',           '🍷', '#dc2626', 21, 'Bar'),
  ('Shots',                       '🔥', '#ef4444', 22, 'Bar'),
  -- General
  ('Otros',                       '📦', '#888888', 99, 'Cocina')
ON CONFLICT (nombre) DO UPDATE SET icon = EXCLUDED.icon, color = EXCLUDED.color, orden = EXCLUDED.orden, departamento = EXCLUDED.departamento;
