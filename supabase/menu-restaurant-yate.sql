-- Menú Restaurant — Yate Atolon
-- Extraído de MenuYate_43.18x36.5cm.pdf
-- menu_tipo = 'restaurant'

INSERT INTO menu_items (id, nombre, descripcion, precio, categoria, activo, orden, menu_tipo) VALUES

-- ─── ENTRADAS TRADICIONALES ──────────────────────────────────────────────────
('MENU-YAT-001', 'Entrada de Patacones', 'Crujientes rodajas de plátano verde fritas, acompañadas de aderezo de ajo casero o suero costeño. Una entrada perfecta para compartir que resalta los sabores auténticos de la región.', 24000, 'Entradas', true, 1, 'restaurant'),
('MENU-YAT-002', 'Carimañola de Cerdo y Jengibre', 'Deliciosas y crujientes carimañolas rellenas de carne de cerdo sazonadas con un toque de jengibre.', 30000, 'Entradas', true, 2, 'restaurant'),
('MENU-YAT-003', 'Chicharrón de Cerdo', 'Crujientes piezas de cerdo marinados y acompañados de cebolla encurtida y bolita de yuca frita.', 38500, 'Entradas', true, 3, 'restaurant'),

-- ─── ENTRADAS MARINAS ────────────────────────────────────────────────────────
('MENU-YAT-004', 'Cóctel de Camarón', 'Camarones frescos servidos en un cóctel clásico, acompañados de salsa cóctel, jugo de limón y toques de cilantro.', 60000, 'Entradas', true, 4, 'restaurant'),
('MENU-YAT-005', 'Ceviche de Tierra Bomba', 'Pescado fresco de la costa, leche de tigre, cebolla morada.', 64000, 'Entradas', true, 5, 'restaurant'),
('MENU-YAT-006', 'Atún Poke Bowl', 'Cubos frescos de atún aleta amarilla y sandía, acompañados de arroz gohan, aguacate, pepino, zanahoria, rábano, alga Nori y salsa Ponzu. Una explosión de sabores y texturas frescas.', 52000, 'Entradas', true, 6, 'restaurant'),
('MENU-YAT-007', 'Aguachile de Camarón', 'Camarones marinados en una salsa verde picosa de chile serrano, acompañados de pepino, cebolla morada, cilantro y aguacate. Un clásico lleno de sabor y frescura.', 46000, 'Entradas', true, 7, 'restaurant'),
('MENU-YAT-008', 'Tiradito de Pescado', 'Finas láminas de pescado fresco, acompañadas de cebollín, jugo de limón y salsa de soya. Un bocado fresco y delicado.', 55000, 'Entradas', true, 8, 'restaurant'),
('MENU-YAT-009', 'Hummus Mediterráneo', 'Cremoso hummus de receta tradicional mediterránea, servido con pan pita crujiente, paprika y aceite de oliva extra virgen.', 39000, 'Entradas', true, 9, 'restaurant'),

-- ─── PIZZAS ──────────────────────────────────────────────────────────────────
('MENU-YAT-010', 'Atolon Pizza', 'Jamón serrano, queso crema, tomates secos al sol y pesto, todo sobre una base de masa fina y crujiente.', 52000, 'Pizzas', true, 1, 'restaurant'),
('MENU-YAT-011', 'Pizza Margarita', 'Clásica pizza con tomate fresco, albahaca y mozzarella.', 40000, 'Pizzas', true, 2, 'restaurant'),
('MENU-YAT-012', 'Pizza Pepperoni', 'Salsa de tomate casera, pepperoni y mozzarella derretida.', 48000, 'Pizzas', true, 3, 'restaurant'),
('MENU-YAT-013', 'Pizza Vegetariana', 'Tomate, arúgula, zucchini, alcachofas y tomates secos, con un aderezo de perejil y aceite de oliva.', 42000, 'Pizzas', true, 4, 'restaurant'),

-- ─── ESPECIALIDADES DE LA ISLA ───────────────────────────────────────────────
('MENU-YAT-014', 'Pescado Frito', 'Pescado fresco del día, frito a la perfección, acompañado de ensalada y patacones crujientes. Una delicia típica de la región costera.', 58000, 'Especialidades de la Isla', true, 1, 'restaurant'),
('MENU-YAT-015', 'Filete de Pescado con Arroz Cremoso de Coco', 'Filete de pescado fresco a la plancha, servido con un cremoso arroz de coco que complementa perfectamente los encurtidos de la casa. Un platillo que fusiona lo mejor de la cocina caribeña.', 65000, 'Especialidades de la Isla', true, 2, 'restaurant'),
('MENU-YAT-016', 'Encocado de Langostino y Mejillones', 'Langostinos y mejillones cocidos en una cremosa salsa de coco, con un toque de achiote y cilantro. Un manjar tropical que transporta al Caribe en cada bocado.', 65500, 'Especialidades de la Isla', true, 3, 'restaurant'),
('MENU-YAT-017', 'Arroz Caldoso de Mariscos', 'Un arroz meloso lleno de sabor, cocinado con una abundante mezcla de mariscos frescos, especias locales y caldo de pescado. Perfecto para los amantes de los frutos del mar.', 98000, 'Especialidades de la Isla', true, 4, 'restaurant'),
('MENU-YAT-018', 'Pescado en Posta', 'Posta de pesca del día, cocinada lentamente en su jugo con un sofrito de cebolla, pimentón y especias. Un clásico de la cocina isleña.', 60000, 'Especialidades de la Isla', true, 5, 'restaurant'),

-- ─── SIEMPRE VERDE / ENSALADAS ───────────────────────────────────────────────
('MENU-YAT-019', 'Atolon Salad', 'Refrescante mezcla de lechugas orgánicas, queso de cabra y una vinagreta de frutos rojos casera, ideal para los amantes de los sabores ligeros pero intensos.', 33000, 'Ensaladas', true, 1, 'restaurant'),
('MENU-YAT-020', 'Ensalada César', 'Lechuga fresca, crutones horneados, queso parmesano Reggiano y pechuga de pollo a la parrilla, todo bañado en nuestro aderezo César artesanal.', 44000, 'Ensaladas', true, 2, 'restaurant'),
('MENU-YAT-021', 'Burrata, Confitura de Corozo y Pan de Masa Madre', 'Una fusión perfecta entre la cremosidad de la burrata, el toque dulce de la confitura de corozo y el pan artesanal.', 60000, 'Ensaladas', true, 3, 'restaurant'),

-- ─── DE LA PARRILLA ──────────────────────────────────────────────────────────
('MENU-YAT-022', 'Atolon Burger', 'Hamburguesa de sirloin importado con queso cheddar, cebolla caramelizada, mayonesa de trufa y papas a la francesa.', 58000, 'Parrilla', true, 1, 'restaurant'),
('MENU-YAT-023', 'Entraña', 'Arrachera importada, marinada y cocinada a la parrilla, servida con guarnición de tu elección.', 86600, 'Parrilla', true, 2, 'restaurant'),
('MENU-YAT-024', 'Suprema de Pollo a la Parrilla', 'Pechuga de pollo marinada con especias locales y cocinada a la parrilla.', 56000, 'Parrilla', true, 3, 'restaurant'),
('MENU-YAT-025', 'Langosta a la Parrilla', 'Cola de langosta fresca marinada en vino blanco y mantequilla, terminada a la parrilla para un sabor delicado y suave.', 110000, 'Parrilla', true, 4, 'restaurant'),
('MENU-YAT-026', 'Steak de Atún Sashimi', 'Medallón de atún marinado en finas hierbas, sellado con mantequilla y ajo.', 72000, 'Parrilla', true, 5, 'restaurant'),

-- ─── TACOS ───────────────────────────────────────────────────────────────────
('MENU-YAT-027', 'Tacos de Camarón (4 pz)', 'Camarones empanizados y fritos, acompañados de col encurtida y mayonesa de chipotle en tortillas de maíz.', 52000, 'Tacos', true, 1, 'restaurant'),
('MENU-YAT-028', 'Tacos de Pescado (4 pz)', 'Pescado frito sazonado, servido con col encurtida, cebolla y aderezo de tzatziki en tortillas de maíz.', 48000, 'Tacos', true, 2, 'restaurant'),
('MENU-YAT-029', 'Tacos de Entraña (4 pz)', 'Suave entraña a la parrilla, servida con aguacate, cebolla morada encurtida y salsa de chile habanero tatemado.', 65000, 'Tacos', true, 3, 'restaurant'),

-- ─── COMPLEMENTOS ────────────────────────────────────────────────────────────
('MENU-YAT-030', 'Papas a la Francesa Trufadas', NULL, 18000, 'Complementos', true, 1, 'restaurant'),
('MENU-YAT-031', 'Gnocchis de Papa a la Gorgonzola', NULL, 20000, 'Complementos', true, 2, 'restaurant'),
('MENU-YAT-032', 'Selección de Vegetales a la Parrilla', NULL, 12500, 'Complementos', true, 3, 'restaurant'),
('MENU-YAT-033', 'Espinacas a la Crema y Parmesano', NULL, 15500, 'Complementos', true, 4, 'restaurant'),
('MENU-YAT-034', 'Puré de Batata', NULL, 15500, 'Complementos', true, 5, 'restaurant'),

-- ─── POSTRES ─────────────────────────────────────────────────────────────────
('MENU-YAT-035', 'Pancakes de Nutella', 'Esponjosos pancakes servidos con una generosa capa de Nutella.', 40000, 'Postres', true, 1, 'restaurant'),
('MENU-YAT-036', 'Pizza de Nutella', 'Base de pizza crujiente, cubierta de Nutella y fresas frescas.', 48000, 'Postres', true, 2, 'restaurant'),
('MENU-YAT-037', 'Pie de Limón', 'Cremoso pie de limón con una base crujiente y un toque de merengue.', 32000, 'Postres', true, 3, 'restaurant'),
('MENU-YAT-038', 'Brownie', 'Brownie de chocolate con un centro suave y crujiente por fuera.', 32000, 'Postres', true, 4, 'restaurant')

ON CONFLICT (id) DO UPDATE SET
  nombre      = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  precio      = EXCLUDED.precio,
  categoria   = EXCLUDED.categoria,
  activo      = EXCLUDED.activo,
  orden       = EXCLUDED.orden,
  menu_tipo   = EXCLUDED.menu_tipo;
