// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO ÚNICO DE MÓDULOS
// Agrega aquí cualquier módulo nuevo → aparece automáticamente en navegación
// y en el control de acceso de Usuarios.
// ─────────────────────────────────────────────────────────────────────────────

export const GRUPOS_NAV = [
  {
    key: "comercial",
    label: "Comercial",
    icon: "⭐",
    color: "#38bdf8",
    items: [
      { key: "pasadias",    label: "Pasadías",    icon: "☀"  },
      { key: "reservas",    label: "Reservas",    icon: "⚓"  },
      { key: "clientes",    label: "Clientes",    icon: "👤" },
      { key: "b2b",         label: "B2B",         icon: "☯"  },
      { key: "eventos",     label: "Eventos",     icon: "♫"  },
      { key: "upsells",     label: "Upsells",     icon: "⬆" },
      { key: "actividades", label: "Actividades", icon: "🎯" },
      { key: "comercial",   label: "Comercial",   icon: "★"  },
      { key: "metas",       label: "Metas",       icon: "🎯" },
      { key: "comisiones",  label: "Comisiones",  icon: "💜" },
    ],
  },
  {
    key: "operaciones",
    label: "Operaciones",
    icon: "🔧",
    color: "#22c55e",
    items: [
      { key: "checkin",      label: "Check-in",   icon: "✅" },
      { key: "zarpes_log",   label: "Zarpes",     icon: "📋" },
      { key: "muelle",       label: "Llegadas",   icon: "⚓" },
      { key: "salidas_isla", label: "Salidas",    icon: "⛵" },
      { key: "lancha",       label: "Lancha",     icon: "🚤" },
      { key: "cierre_caja",  label: "Cierre Caja", icon: "💵" },
      { key: "contratistas_muelle", label: "Muelle Contratistas", icon: "🦺" },
      { key: "hacer_inventario", label: "Hacer Inventario", icon: "📋" },
    ],
  },
  {
    key: "hotel",
    label: "Hotel",
    icon: "🏨",
    color: "#a78bfa",
    items: [
      { key: "hotel_reservas",      label: "Reservas Hotel",  icon: "🛏️" },
      { key: "hotel_habitaciones",  label: "Habitaciones",    icon: "🚪" },
      { key: "hotel_huespedes",     label: "Huéspedes",       icon: "👥" },
      { key: "hotel_checkin",       label: "Check-in / out",  icon: "🗝️" },
      { key: "hotel_folios",        label: "Folios",          icon: "📋" },
      { key: "hotel_housekeeping",  label: "Housekeeping",    icon: "🧺" },
      { key: "hotel_roomservice",   label: "Room Service",    icon: "🛎️" },
      { key: "hotel_tarifas",       label: "Tarifas",         icon: "💲" },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: "📢",
    color: "#ec4899",
    items: [
      { key: "analitica",          label: "Analítica", icon: "📊" },
      { key: "contenido",          label: "Contenido", icon: "📢" },
      { key: "vip",                label: "Society",   icon: "✦"  },
      { key: "carrito_abandonado", label: "Carritos",  icon: "🛒" },
    ],
  },
  {
    key: "rrhh",
    label: "RRHH",
    icon: "👷",
    color: "#C8B99A",
    items: [
      { key: "rrhh",      label: "Rec. Humanos", icon: "👷" },
      { key: "horarios",  label: "Horarios",     icon: "📅" },
      { key: "nomina",    label: "Nómina",       icon: "💵" },
      { key: "nomina_dia",label: "Nómina Día",   icon: "📆" },
      { key: "contratistas_admin", label: "Contratistas", icon: "🦺" },
      { key: "briefings", label: "Briefings",    icon: "📋" },
    ],
  },
  {
    key: "finanzas",
    label: "Finanzas",
    icon: "💰",
    color: "#f5c842",
    items: [
      { key: "resultados",    label: "Resultados",    icon: "📊" },
      { key: "financiero",    label: "Financiero",    icon: "≡"  },
      { key: "estado_resultados", label: "P&L",       icon: "📈" },
      { key: "reportes",      label: "Reportes",      icon: "📑" },
      { key: "cxc",           label: "CXC",           icon: "💳" },
      { key: "presupuesto",   label: "Presupuesto",   icon: "○"  },
      { key: "activos",       label: "Activos",       icon: "⚒" },
      { key: "requisiciones", label: "Requisiciones", icon: "✆" },
      { key: "items",         label: "Inventario",     icon: "📦" },
      { key: "mantenimiento", label: "Mantenimiento", icon: "🔧" },
      { key: "proveedores",   label: "Proveedores",   icon: "📦" },
    ],
  },
];

// Módulos de sistema / barra inferior
export const BOTTOM_NAV = [
  { key: "staffing",      label: "Staffing",      icon: "👥" },
  { key: "floorplan",     label: "Floor Plan",    icon: "▦"  },
  { key: "menus",         label: "Productos",     icon: "🍽️" },
  { key: "loggro",        label: "Loggro",        icon: "🔗" },
  { key: "historial",     label: "Historial",     icon: "📋" },
  { key: "configuracion", label: "Configuración", icon: "⚙"  },
  { key: "usuarios",      label: "Usuarios",      icon: "👥" },
  { key: "api_portal",    label: "API Portal",    icon: "🔌" },
];

// Lista plana — usada en Usuarios.jsx para el control de acceso
export const TODOS_MODULOS = [
  ...GRUPOS_NAV.flatMap(g => g.items.map(i => ({ ...i, categoria: g.label }))),
  ...BOTTOM_NAV.map(i => ({ ...i, categoria: "Sistema" })),
];
