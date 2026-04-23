-- Kit de Banquetes Atolon — insertar items en menu_items con menu_tipo = 'banquetes'
-- Ejecutar: node supabase/run-sql.mjs supabase/banquetes-menu-items.sql

-- ============================================================
-- MENÚ DE CANAPÉS
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-CAN-3', 'banquetes', 'Menú de Canapés', 'Canapés — 3 opciones', 'Seleccione 3 opciones frías o calientes. Opciones frías: Mini tartar de salmón con aguacate, Bombones de queso en costra de frutos secos, Rollitos de jamón ibérico y mango, Bruschettas de tomate confitado y jamón serrano, Causa limeña de atún, Carpaccio de remolacha y nuez, Montados de piña y chorizo, Mini nidos de camarón con mango, Timbales de quinoa y garbanzo, Ensalada caprese en palito. Opciones calientes: Mini chicken sliders, Mejillones gratinados, Mini empanadas de lechona, Calamares apanados con salsa tártara, Chicharrones crujientes con sarza criolla, Bocaditos de posta negra, Espárragos envueltos en tocineta, Papillote de salmón en hojaldre, Brochetas de lomo y vegetales caramelizados, Cazuelitas de langostinos.', 45000, true, 1),
('BQ-CAN-6', 'banquetes', 'Menú de Canapés', 'Canapés — 6 opciones', 'Seleccione 6 opciones frías o calientes (ver detalle en opción de 3).', 90000, true, 2),
('BQ-CAN-10', 'banquetes', 'Menú de Canapés', 'Canapés — 10 opciones', 'Seleccione 10 opciones frías o calientes (ver detalle en opción de 3).', 150000, true, 3);

-- ============================================================
-- MENÚ 3 TIEMPOS
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-RUBI', 'banquetes', 'Menú 3 Tiempos', 'Menú 3 Tiempos Rubí', 'Entrada: Hummus con aceite de oliva y pan pita, Burrata empanada con salsa de tomate y reducción de balsámico, Carimañolas de posta cartagenera, Arancinis de hongos con salsa de coco y curry, Ceviche de pescado con mango, Tostadas de patacón con guacamole y suero costeño, Croquetas de ahuyama, Nidos de camarón con dip de mango, Bruschettas con tomates confitados y jamón serrano. Plato fuerte: Paté de garbanzo al curry, Cerdo confitado con tomates deshidratados, Filete de sierra crocante, Lomo fino de res en salsa de pimienta, Pollo a la florentina relleno de espinaca y crema de quesos, Papillote de salmón a las finas hierbas. Guarnición: Papitas a la crema, Papas al romero y limón, Yuca con mojo, Arroz cremoso de coco, Puré de camote, Puré de ñame, Vegetales salteados, Canolis de papa en costra de sésamo, Gnocchis de papa y pesto. Postre: Cheesecake de frutos rojos, Flan de coco, Mousse de chocolate, Torta de chocolate, Panna cotta de maracuyá, Pie de limón.', 129500, true, 10),
('BQ-ESMERALDA', 'banquetes', 'Menú 3 Tiempos', 'Menú 3 Tiempos Esmeralda', 'Entrada: Croquetas de jamón serrano, Arepitas al carbón rellenas de carne o queso, Ceviche Tierra Bomba, Tiradito de pescado en salsa negra, Mejillones gratinados, Tartar de salmón con aguacate, Brocheta de pollo en salsa de maní. Plato fuerte: Lomo de cerdo en adobo y sésamo, Pechuga de pollo en costra con salsa criolla, Filete de róbalo con mantequilla de hierbas, Atún en costra de ajonjolí con chimichurri de mango, Osobuco glaseado en reducción de vino tinto. Guarnición: Arroz cremoso con calabacín, Papitas rostizadas al romero, Puré de ñame o ahuyama, Risotto de champiñones y parmesano, Pimientos rellenos de queso. Postre: Cheesecake de frutos rojos o limón, Flan de coco, Arroz con leche y canela, Mousse de chocolate, Crème brûlée de limón, Tartaleta de chocolate.', 159500, true, 11),
('BQ-DIAMANTE', 'banquetes', 'Menú 3 Tiempos', 'Menú 3 Tiempos Diamante', 'Entrada: Ceviche costeño, Tartar de atún sobre crocante de patacón, Brocheta de pescado y cebollitas caramelizadas, Langostinos crocantes con mayonesa de ajís ahumados, Fritos típicos, Trilogía de tostadas caribeñas. Plato fuerte: Lomo fino de res con reducción de merlot, Salmón horneado al romero y naranja, Rollos de filete de pescado con salsa de langosta, Posta negra cartagenera, Canelones de langosta. Guarnición: Papas al horno con pesto, Arroz cremoso con hongos, Puré de ñame o ahuyama, Espinacas salteadas, Chips de yuca, Arroz al coco. Postre: Cheesecake de frutos rojos o limón, Torta de chocolate, Panna cotta de maracuyá, Aborrajados, Maduros al horno con helado de ron.', 189500, true, 12),
('BQ-NINOS', 'banquetes', 'Menú 3 Tiempos', 'Banquete para Niños 3 Tiempos', 'Entrada: Mini croquetas de pollo con aderezo ranch, Dedos de queso mozzarella con salsa de tomate, Palitos de zanahoria y pepino con hummus o crema de yogurt con hierbas, Mini tostadas de patacones con picadillo y suero costeño, Brochetas de frutas frescas con miel. Plato fuerte: Mini hamburguesas de res o pollo con papas a la francesa, Fingers de pescado crujiente con puré de papas y verduras al vapor, Espagueti a la boloñesa con queso parmesano, Pechuga de pollo o filete de pescado a la plancha con arroz blanco y vegetales al vapor, Mini pizzas de jamón y queso con ensalada de lechuga y zanahoria. Postre: Cupcakes de vainilla decorados con chispas de chocolate, Gelatina de frutas con trozos de fruta fresca, Brownie de chocolate con helado de vainilla, Paletas artesanales de frutos rojos o mango, Tartaletas de limón y chocolate en formas divertidas.', 98500, true, 13);

-- ============================================================
-- BANQUETES BUFFET
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-BUFF-STD', 'banquetes', 'Buffet', 'Buffet Estándar', 'Arma tu propio menú: 2 Entradas + 2 Ensaladas + 2 Proteínas + 3 Acompañantes + 2 Postres. Entradas disponibles: Hummus con pan pita, Burrata empanada, Carimañolas de posta cartagenera, Arancinis de hongos, Ceviche de pescado con mango, Tostadas de patacón con guacamole, Croquetas de ahuyama, Nidos de camarón, Bruschettas, Tartar de salmón. Proteínas: Paté de garbanzo al curry, Cerdo confitado, Filete de sierra crocante, Lomo fino de res, Pollo a la florentina, Papillote de salmón, Camarones jumbo marinados, Calamares tiernos, Langostinos al carbón, Filete de corvina, Filete de atún en costra de ajonjolí.', 160000, true, 20),
('BQ-BUFF-PREM', 'banquetes', 'Buffet', 'Buffet Premium', 'Arma tu propio menú: 3 Entradas + 3 Ensaladas + 4 Proteínas + 4 Acompañantes + 3 Postres. Incluye todas las opciones del Buffet Estándar más mayor variedad de proteínas y acompañantes premium.', 190000, true, 21);

-- ============================================================
-- MENÚ PARRILLADA DEL MAR
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-PARRILLADA', 'banquetes', 'Parrillada', 'Menú Parrillada del Mar', 'Entrada: Ensalada de Aguacate y Verduras Frescas. Parrillada de Mariscos: Camarones jumbo marinados en ajo y hierbas frescas, Calamares tiernos con limón y pimentón, Langostinos al carbón con mantequilla de ajo, Filete de corvina con finas hierbas. Acompañamientos: Yuca dorada con salsa de ajo, Patacones crujientes, Arroz blanco al vapor o arroz con coco, Vegetales a la parrilla. Postres a la Parrilla: Guineos al Carbón, Piña al Carbón. Bebidas: Limonada de Hierbabuena, Agua de Maracuyá natural.', 138000, true, 30);

-- ============================================================
-- ESTACIONES
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-EST-FRUTAS', 'banquetes', 'Estaciones', 'Estación de Frutas', 'Estación de frutas frescas desde 50 pax. Incluye: Estación de frutas, Brocheta de frutas, Vasos con Frutas, Fruta de Mano.', 28500, true, 40);

-- ============================================================
-- BARRA LIBRE (precio por persona por hora, mínimo 2 horas)
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-BARRA-N1', 'banquetes', 'Barra Libre', 'Barra Libre Nivel 1 — Soft Drinks', 'Contratación base (mínimo 2 horas). Incluye: Agua natural y con gas, Refrescos (Coca-Cola, Sprite, Naranja), Jugos naturales (naranja, piña, maracuyá), Téfrio y limonadas. A partir de la 4ª hora: 10% descuento.', 40000, true, 50),
('BQ-BARRA-N2', 'banquetes', 'Barra Libre', 'Barra Libre Nivel 2 — Cervezas y Micheladas', 'Incluye Nivel 1 + Barra de cervezas nacionales e internacionales: Cervezas locales (lager, pilsner, Club Colombia), Cervezas internacionales (Heineken, Corona). Mínimo 2 horas. A partir de la 4ª hora: 10% descuento.', 48000, true, 51),
('BQ-BARRA-N3', 'banquetes', 'Barra Libre', 'Barra Libre Nivel 3 — Vinos', 'Incluye Niveles 1 y 2 + Barra de vinos: Vino blanco seco y semiseco, Vino tinto joven y reserva, Vino rosado fresco. Mínimo 2 horas. A partir de la 4ª hora: 10% descuento.', 54000, true, 52),
('BQ-BARRA-N4', 'banquetes', 'Barra Libre', 'Barra Libre Nivel 4 — Licores Estándar', 'Incluye Niveles 1, 2 y 3 + Barra con destilados típicos: Aguardiente colombiano, Ron colombiano (Viejo de Caldas), Vodka (Absolut), Gin (Gordons), Whisky (3 años), Tequila (José Cuervo Especial). Mínimo 2 horas. A partir de la 4ª hora: 10% descuento.', 68000, true, 53),
('BQ-BARRA-N5', 'banquetes', 'Barra Libre', 'Barra Libre Nivel 5 — Premium', 'Incluye Niveles 1 al 4 + Barra premium con licores de alta gama y coctelería especial: Whisky (12 años), Vodka premium, Tequila (Jimador reposado), Ginebra Premium, Ron (Havana 7 años). Mínimo 2 horas. A partir de la 4ª hora: 10% descuento.', 92000, true, 54),
('BQ-BARRA-N6', 'banquetes', 'Barra Libre', 'Barra Libre Nivel 6 — Espumantes y Spritz', 'Incluye Niveles 1 al 5 + Barra de espumantes y cocteles Spritz: Espumantes brut y demi-sec, Cocteles Spritz como Aperol Spritz, Limoncello Spritz, entre otros. Mínimo 2 horas. A partir de la 4ª hora: 10% descuento.', 105000, true, 55);

-- ============================================================
-- CARTA DE VINOS (por botella)
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-VINO-RC-T', 'banquetes', 'Carta de Vinos', 'Rosaleda Cabernet Sauvignon', 'Vino Tinto.', 99500, true, 60),
('BQ-VINO-SC-T', 'banquetes', 'Carta de Vinos', 'Santa Carolina Cabernet Sauvignon', 'Vino Tinto.', 131700, true, 61),
('BQ-VINO-DL-T', 'banquetes', 'Carta de Vinos', 'Don Luis CS-Merlot', 'Vino Tinto.', 179400, true, 62),
('BQ-VINO-RS-B', 'banquetes', 'Carta de Vinos', 'Rosaleda Sauvignon Blanc', 'Vino Blanco.', 99500, true, 63),
('BQ-VINO-SH-B', 'banquetes', 'Carta de Vinos', 'Santa Helena Sauvignon Blanc', 'Vino Blanco.', 122700, true, 64),
('BQ-VINO-DL-B', 'banquetes', 'Carta de Vinos', 'Don Luis Chardonnay', 'Vino Blanco.', 179400, true, 65),
('BQ-VINO-RC-R', 'banquetes', 'Carta de Vinos', 'Rosaleda Cabernet Rose', 'Vino Rosado.', 99500, true, 66),
('BQ-VINO-SC-R', 'banquetes', 'Carta de Vinos', 'Santa Carolina Cabernet Rose', 'Vino Rosado.', 131700, true, 67),
('BQ-VINO-SH-R', 'banquetes', 'Carta de Vinos', 'Santa Helena Cabernet Rose', 'Vino Rosado.', 149700, true, 68);

-- ============================================================
-- PAQUETES ROMÁNTICOS
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-ROM-HAB', 'banquetes', 'Paquetes Románticos', 'Habitación Decorada con Detalles Románticos', 'Habitación de lujo con cama King size, decorada con globos en tonos suaves y velas aromáticas para crear una atmósfera mágica y acogedora. Globos temáticos, pétalos de rosas y velas LED.', 1075000, true, 70),
('BQ-ROM-CENA', 'banquetes', 'Paquetes Románticos', 'Cena Romántica en el Muelle', 'Menú exclusivo de 4 tiempos diseñado para compartir, servido en nuestro muelle privado bajo las estrellas con decoración especial de velas. Incluye una botella de vino blanco. Entrada: Carpaccio de pulpo con emulsión de cítricos y ají amarillo / Ensalada de burrata. Plato fuerte: Medallones de res en salsa de vino tinto y reducción de trufas / Filete de salmón al horno con glaseado de miel y mostaza. Guarnición: Puré de papa con mantequilla de hierbas, Vegetales asados al tomillo. Postre: Brownie de chocolate con helado / Tiramisú de café y mascarpone. Vino de la casa: Tinto, Blanco Rosado o Espumoso Prosecco.', 430000, true, 71),
('BQ-ROM-DESAYUNO', 'banquetes', 'Paquetes Románticos', 'Desayuno Romántico en la Terraza', 'Desayuno especial servido en un ambiente íntimo con vistas espectaculares, acompañado de detalles románticos en la mesa. Bebidas: Jugo de naranja natural y café o té al gusto. Platos: Croissants rellenos de queso crema y jamón serrano o French toast con miel, frutos rojos y canela. Acompañamientos: Mini bowl de frutas frescas con yogur y miel, Mermeladas artesanales y mantequilla.', 215000, true, 72),
('BQ-ROM-ESPUMOSO', 'banquetes', 'Paquetes Románticos', 'Botella de Vino Espumoso en la Habitación', 'Perfecta para brindar al llegar a la habitación o para disfrutar durante la estadía.', 258000, true, 73),
('BQ-ROM-CANAPES-D', 'banquetes', 'Paquetes Románticos', 'Selección de Canapés Dulces en la Habitación', 'Una variedad de postres en formato finger-size ideales para compartir momentos dulces juntos. Incluye: Selección de Chocolates, Cocadas tradicionales, Mini pie de limón.', 107500, true, 74),
('BQ-ROM-MASAJE', 'banquetes', 'Paquetes Románticos', 'Masaje en Pareja en la Habitación', 'Una relajante sesión de 60 minutos en pareja realizada por terapeutas profesionales, utilizando aceites aromáticos para revitalizar cuerpo y mente.', 516000, true, 75),
('BQ-ROM-PEDIDA', 'banquetes', 'Paquetes Románticos', 'Paquete Romántico Pedida — Cena Privada en Playa o Muelle', 'Cena privada (Puesta de Sol – Noche). Escenario exclusivo decorado con LED bags, sillones para pareja, menú gourmet de 4 tiempos diseñado para compartir, botella de Vino de la casa a su elección (tinto, blanco o rosado), botella de vino espumoso para brindar por el Sí.', 980000, true, 76),
('BQ-ROM-TRANSPORTE', 'banquetes', 'Paquetes Románticos', 'Transporte VIP en Embarcación Deportiva de Lujo', 'Traslados exclusivos viaje redondo Cartagena-Atolon-Cartagena (2 a 20 pax). Tarifa exclusiva contratando Paquete Romántico Propuesta.', 950000, true, 77),
('BQ-ROM-MUSICA', 'banquetes', 'Paquetes Románticos', 'Música Ambiental Personalizada 45 min', 'Música ambiental personalizada (opcional: violinista o Sax en vivo).', 1200000, true, 78),
('BQ-ROM-FOTO', 'banquetes', 'Paquetes Románticos', 'Fotografía Profesional durante la Propuesta', 'Un fotógrafo capturará discretamente los momentos más especiales de la velada.', 650000, true, 79);

-- ============================================================
-- MENÚ STAFF
-- ============================================================
INSERT INTO menu_items (id, menu_tipo, categoria, nombre, descripcion, precio, activo, orden) VALUES
('BQ-STAFF-HAM', 'banquetes', 'Menú Staff', 'Hamburguesa con Queso y Papas', 'Incluyen: Gaseosa, Agua, Limonada.', 38500, true, 90),
('BQ-STAFF-POLLO', 'banquetes', 'Menú Staff', 'Pechuga de Pollo a la Parrilla con Arroz', 'Incluyen: Gaseosa, Agua, Limonada.', 38500, true, 91),
('BQ-STAFF-BURRP', 'banquetes', 'Menú Staff', 'Burrito de Pollo', 'Incluyen: Gaseosa, Agua, Limonada.', 35000, true, 92),
('BQ-STAFF-BURRF', 'banquetes', 'Menú Staff', 'Burrito de Pescado', 'Incluyen: Gaseosa, Agua, Limonada.', 35000, true, 93),
('BQ-STAFF-CESAR', 'banquetes', 'Menú Staff', 'Ensalada César con Pollo', 'Incluyen: Gaseosa, Agua, Limonada.', 35000, true, 94),
('BQ-STAFF-PIZZA-M', 'banquetes', 'Menú Staff', 'Pizza Margarita Mediana', 'Incluyen: Gaseosa, Agua, Limonada.', 35000, true, 95),
('BQ-STAFF-PIZZA-P', 'banquetes', 'Menú Staff', 'Pizza Pepperoni Mediana', 'Incluyen: Gaseosa, Agua, Limonada.', 38500, true, 96),
('BQ-STAFF-PASTA', 'banquetes', 'Menú Staff', 'Pasta Espagueti con Pollo', 'Incluyen: Gaseosa, Agua, Limonada.', 38500, true, 97),
('BQ-STAFF-IND', 'banquetes', 'Menú Staff', 'Comida Individual', 'Incluyen: Gaseosa, Agua, Limonada.', 22000, true, 98),
('BQ-STAFF-BROW', 'banquetes', 'Menú Staff', 'Brownie', 'Postre.', 18500, true, 99);
