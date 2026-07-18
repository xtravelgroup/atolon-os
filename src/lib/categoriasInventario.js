// ─────────────────────────────────────────────────────────────────────────────
// TAXONOMÍA DE CATEGORÍAS DE INVENTARIO
// Dos niveles: grupo (Alimentos/Bar) → subcategoría
//
// - Alimentos: 15 subcategorías (todo lo que compra/almacena cocina, incluye
//   bebidas, limpieza, empaques y suministros operativos)
// - Bar: 2 subcategorías (solo bebidas — el resto es compartido con cocina)
// ─────────────────────────────────────────────────────────────────────────────

export const TAXONOMIA_INVENTARIO = {
  Alimentos: [
    { key: "carnes_aves",           label: "Carnes y aves",          ejemplo: "Res, cerdo, pollo, cordero, embutidos" },
    { key: "pescados_mariscos",     label: "Pescados y mariscos",    ejemplo: "Pescado fresco, camarón, pulpo, langosta" },
    { key: "frutas_verduras",       label: "Frutas y verduras",      ejemplo: "Vegetales, frutas, hierbas frescas" },
    { key: "lacteos_huevos",        label: "Lácteos y huevos",       ejemplo: "Leche, quesos, mantequilla, crema, huevos" },
    { key: "secos_abarrotes",       label: "Secos y abarrotes",      ejemplo: "Arroz, pasta, harina, azúcar, granos, cereales" },
    { key: "enlatados_conservas",   label: "Enlatados y conservas",  ejemplo: "Tomate enlatado, aceitunas, atún, encurtidos" },
    { key: "condimentos_especias",  label: "Condimentos y especias", ejemplo: "Sal, pimienta, especias, salsas, vinagre" },
    { key: "congelados",            label: "Congelados",             ejemplo: "Proteínas, papas, vegetales o productos congelados" },
    { key: "panaderia_pasteleria",  label: "Panadería y pastelería", ejemplo: "Pan, masa, levadura, chocolate, decoración" },
    { key: "bebidas_no_alcoholicas",label: "Bebidas no alcohólicas", ejemplo: "Agua, refrescos, jugos, café, té" },
    { key: "bebidas_alcoholicas",   label: "Bebidas alcohólicas",    ejemplo: "Cervezas, vinos, licores" },
    { key: "productos_preparados",  label: "Productos preparados",   ejemplo: "Salsas, fondos, marinados y mise en place elaborados" },
    { key: "desechables_empaques",  label: "Desechables y empaques", ejemplo: "Vasos, servilletas, envases, bolsas" },
    { key: "limpieza_higiene",      label: "Limpieza e higiene",     ejemplo: "Detergentes, desinfectantes, guantes" },
    { key: "suministros_operativos",label: "Suministros operativos", ejemplo: "Gas, carbón, papel aluminio, film plástico" },
  ],
  Bar: [
    { key: "bar_bebidas_no_alcoholicas", label: "Bebidas no alcohólicas",   ejemplo: "Agua, refrescos, jugos, café, té" },
    { key: "bar_bebidas_alcoholicas",    label: "Bebidas alcohólicas",      ejemplo: "Cervezas, vinos, licores" },
    { key: "bar_mezcladores",            label: "Mezcladores",              ejemplo: "Tónica, ginger ale, soda, siropes, purés, bitters" },
    { key: "bar_frutas_frescos",         label: "Frutas y productos frescos", ejemplo: "Limón, naranja, piña, hierbabuena, cerezas" },
    { key: "bar_insumos_preparacion",    label: "Insumos de preparación",   ejemplo: "Azúcar, sal, especias, café, té" },
    { key: "bar_productos_preparados",   label: "Productos preparados",     ejemplo: "Jarabes internos, infusiones, jugos preparados, premezclas" },
    { key: "bar_garnituras",             label: "Garnituras",               ejemplo: "Fruta deshidratada, aceitunas, cerezas, sal para escarchar" },
    { key: "bar_desechables_empaques",   label: "Desechables y empaques",   ejemplo: "Pitillos, servilletas, vasos desechables, bolsas" },
    { key: "bar_limpieza_higiene",       label: "Limpieza e higiene",       ejemplo: "Detergentes, desinfectantes, paños, guantes" },
  ],
};

// Lista plana con [{ grupo, key, label }] — útil para dropdowns simples
export const SUBCATEGORIAS_FLAT = Object.entries(TAXONOMIA_INVENTARIO).flatMap(
  ([grupo, subs]) => subs.map(s => ({ grupo, ...s }))
);

// Formato "Alimentos › Carnes y aves" para mostrar en tabla / cards
export function labelCompleto(grupo, subLabel) {
  return `${grupo} › ${subLabel}`;
}
