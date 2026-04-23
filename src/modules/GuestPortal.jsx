import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import AvisoCargoInternacional from "../components/AvisoCargoInternacional";

// ── Atolon Brand Palette ────────────────────────────────────────────────────
// Navy azul profundo + arena dorada + cielo caribe. Dark mode premium.
const B = {
  bg:        "#070F1F",   // fondo más profundo que navy para contraste
  navy:      "#0D1B3E",   // Atolón navy oficial
  navyMid:   "#152448",   // navy medio
  navyLight: "#1E2C52",   // navy light con tinte cálido
  sky:       "#8ECAE6",   // Atolón sky
  sand:      "#C8B99A",   // Atolón sand (primary accent)
  sandLight: "#D9CDB3",   // hover states
  sandDeep:  "#A8986F",   // shadows / pressed states
  gold:      "#C8B99A",   // alias a sand — para no romper referencias existentes
  white:     "#F8FAFC",
  success:   "#22c55e",
  danger:    "#ef4444",
  warning:   "#f59e0b",
  text:      "#F8FAFC",
  textDim:   "rgba(248,250,252,0.62)",
  textFaint: "rgba(248,250,252,0.35)",
};
const COP = (n) => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const CAT_ORDER = [
  // ES
  "Entradas", "Marinas", "Ensalada", "Ensaladas", "Tacos", "Pizza", "Pizzas", "Especialidades", "Especialidades de la Isla", "Parrilla", "De la Parrilla", "Complementos", "Postres",
  // EN
  "Starters", "Seafood", "Salad", "Salads", "Island Specialities", "From the Grill", "Sides", "Desserts",
];
const catRank = (cat) => {
  const idx = CAT_ORDER.findIndex(c => c.toLowerCase() === (cat || "").toLowerCase());
  return idx === -1 ? 999 : idx;
};

// Top-level sections del At Your Service (ES/EN)
const CONCIERGE_SECCIONES = [
  { key: "food",        icon: "🛎", color: "#F5C842", label: { es: "Room Service",        en: "Room Service" },        subtitle: { es: "Menú · Pedidos a tu habitación",   en: "Menu · Order to your room" } },
  { key: "experiences", icon: "🏖", color: "#F59E0B", label: { es: "Actividades",         en: "Activities" },          subtitle: { es: "Pasadías · Tours · Experiencias",  en: "Day passes · Tours · Experiences" } },
  { key: "transporte",  icon: "⛵", color: "#8ECAE6", label: { es: "Transporte Marítimo", en: "Boat Transfers" },      subtitle: { es: "Traslados en lancha · Embarcaciones", en: "Boat transfers · Vessels" } },
  { key: "chat",        icon: "💬", color: "#22c55e", label: { es: "Contactar Concierge", en: "Contact Concierge" },   subtitle: { es: "Habla con nuestro equipo",         en: "Chat with our team" } },
];

// Diccionario de traducciones
const T = {
  header_title: { es: "AT YOUR SERVICE", en: "AT YOUR SERVICE" },
  header_food: { es: "ROOM SERVICE", en: "ROOM SERVICE" },
  header_activities: { es: "ACTIVIDADES", en: "ACTIVITIES" },
  header_transport: { es: "TRANSPORTE MARÍTIMO", en: "BOAT TRANSFERS" },
  header_chat: { es: "CONCIERGE", en: "CONCIERGE" },
  header_services: { es: "SERVICIOS", en: "SERVICES" },
  header_mystay: { es: "MI ESTANCIA", en: "MY STAY" },
  header_cart: { es: "TU PEDIDO", en: "YOUR ORDER" },
  header_confirm: { es: "CONFIRMADO", en: "CONFIRMED" },
  header_status: { es: "ESTADO", en: "STATUS" },
  good_morning: { es: "Buenos días", en: "Good morning" },
  good_afternoon: { es: "Buenas tardes", en: "Good afternoon" },
  good_evening: { es: "Buenas noches", en: "Good evening" },
  suite: { es: "Suite", en: "Suite" },
  check_out: { es: "Check-out", en: "Check-out" },
  today_recommend: { es: "Hoy recomendamos", en: "Today's picks" },
  food_destacados: { es: "Destacados", en: "Featured" },
  options: { es: "opciones", en: "options" },
  // Chat
  chat_banner_title: { es: "Escríbenos por WhatsApp", en: "Message us on WhatsApp" },
  chat_banner_sub: { es: "Concierge disponible · Respondemos al instante", en: "Concierge available · Instant replies" },
  chat_quick_msgs: { es: "Mensajes rápidos", en: "Quick messages" },
  chat_footer: { es: "Al enviar, incluiremos tu nombre y habitación automáticamente.", en: "Your name and room will be added automatically." },
  chat_general: { es: "Pregunta general", en: "General question" },
  chat_restaurant: { es: "Reservar restaurante", en: "Book the restaurant" },
  chat_experiences: { es: "Info de actividades", en: "Activities info" },
  chat_recommendation: { es: "Recomiéndame algo", en: "Recommend me something" },
  chat_urgent: { es: "Necesito ayuda urgente", en: "I need urgent help" },
  chat_custom: { es: "Escribir otro mensaje", en: "Write another message" },
  chat_msg_general: { es: "Tengo una pregunta.", en: "I have a question." },
  chat_msg_restaurant: { es: "Quisiera reservar en el restaurante.", en: "I'd like to book the restaurant." },
  chat_msg_experiences: { es: "Me interesa saber más sobre las actividades disponibles.", en: "I'd like to know more about available activities." },
  chat_msg_recommendation: { es: "¿Qué me recomiendas hacer hoy?", en: "What do you recommend I do today?" },
  chat_msg_urgent: { es: "Necesito ayuda con algo urgente por favor.", en: "I need urgent help please." },
  // Stub
  stub_coming_soon: { es: "Próximamente", en: "Coming soon" },
  stub_write_whatsapp: { es: "Escribir por WhatsApp", en: "Message on WhatsApp" },
  stub_meanwhile: { es: "Mientras tanto, escríbenos:", en: "In the meantime, message us:" },
  stub_activities_sub: { es: "Próximamente podrás reservar pasadías, tours y actividades desde aquí.", en: "Soon you'll be able to book day passes, tours and activities from here." },
  stub_transport_sub: { es: "Próximamente podrás reservar traslados en lancha y embarcaciones desde aquí.", en: "Soon you'll be able to book boat transfers from here." },
  // Cart
  cart_empty: { es: "Tu carrito está vacío", en: "Your cart is empty" },
  cart_empty_sub: { es: "Explora el menú y agrega lo que te antoje", en: "Browse the menu and add what you like" },
  cart_deliver: { es: "📍 Entregar en", en: "📍 Deliver to" },
  cart_payment: { es: "💳 Método de pago", en: "💳 Payment method" },
  cart_tip: { es: "💰 Propina", en: "💰 Tip" },
  cart_notes: { es: "📝 Notas", en: "📝 Notes" },
  cart_notes_ph: { es: "Algo más que debamos saber…", en: "Anything else we should know…" },
  cart_subtotal: { es: "Subtotal", en: "Subtotal" },
  cart_total: { es: "Total", en: "Total" },
  cart_confirm: { es: "Confirmar pedido", en: "Confirm order" },
  cart_see: { es: "Ver carrito", en: "View cart" },
  pay_room: { es: "Cargar a la habitación", en: "Charge to room" },
  pay_now: { es: "Pagar ahora (tarjeta)", en: "Pay now (card)" },
  pay_delivery: { es: "Pagar al entregar", en: "Pay on delivery" },
  deliver_room: { es: "Habitación", en: "Room" },
  deliver_cabana: { es: "Cabaña", en: "Cabana" },
  deliver_beach: { es: "Beach bed / Playa", en: "Beach bed" },
  deliver_other: { es: "Otro", en: "Other" },
  deliver_specify: { es: "Especifica la ubicación (nº cabaña, zona, etc.)", en: "Specify location (cabana #, zone, etc.)" },
  // Confirmation
  confirm_title: { es: "¡Pedido confirmado!", en: "Order confirmed!" },
  confirm_sub: { es: "Lo estamos preparando con mucho cariño 🌴", en: "We're preparing it with care 🌴" },
  confirm_code: { es: "CÓDIGO", en: "CODE" },
  confirm_eta: { es: "TIEMPO ESTIMADO", en: "ESTIMATED TIME" },
  confirm_minutes: { es: "minutos", en: "minutes" },
  confirm_see_status: { es: "Ver estado del pedido", en: "View order status" },
  confirm_chat: { es: "Hablar con concierge", en: "Chat with concierge" },
  // Status
  status_received: { es: "Recibido", en: "Received" },
  status_cooking: { es: "En cocina", en: "In kitchen" },
  status_delivery: { es: "En camino", en: "On the way" },
  status_delivered: { es: "Entregado", en: "Delivered" },
  status_in_progress: { es: "En progreso…", en: "In progress…" },
  status_bon_appetit: { es: "¡Buen provecho! 🌴", en: "Enjoy! 🌴" },
  status_thanks: { es: "Gracias por tu pedido", en: "Thanks for your order" },
  // Item detail
  item_notes: { es: "Notas para cocina", en: "Notes for kitchen" },
  item_notes_ph: { es: "Alergias, instrucciones…", en: "Allergies, instructions…" },
  item_add: { es: "Agregar", en: "Add" },
  item_min_select: { es: "Selecciona al menos", en: "Select at least" },
  // Menu subsections
  sub_food: { es: "Comida", en: "Food" },
  sub_drinks: { es: "Bebidas", en: "Drinks" },
  sub_specials: { es: "Especiales", en: "Specials" },
};
const t = (key, lang) => (T[key]?.[lang] ?? T[key]?.es ?? key);

// Sub-secciones de Food & Drinks (menú detallado) — multi-idioma
const FOOD_SUBSECCIONES = [
  { key: "restaurant", icon: "🍽",  color: "#F59E0B", label: { es: "Comida",   en: "Food" } },
  { key: "bebidas",    icon: "🍹", color: "#8ECAE6", label: { es: "Bebidas",  en: "Drinks" } },
  { key: "destacados", icon: "⭐", color: "#C8B99A", label: { es: "Especiales", en: "Specials" } },
];

// Diccionario de traducción de sub-categorías del menú (lo que viene del admin)
const CAT_TRANSLATIONS = {
  "entradas":        { en: "Appetizers" },
  "ensalada":        { en: "Salad" },
  "ensaladas":       { en: "Salads" },
  "tacos":           { en: "Tacos" },
  "pizza":           { en: "Pizza" },
  "pizzas":          { en: "Pizzas" },
  "especialidades":  { en: "Signature Dishes" },
  "parrilla":        { en: "Grill" },
  "a la parrilla":   { en: "Grill" },
  "complementos":    { en: "Sides" },
  "acompañamientos": { en: "Sides" },
  "postres":         { en: "Desserts" },
  "sopas":           { en: "Soups" },
  "pastas":          { en: "Pasta" },
  "mariscos":        { en: "Seafood" },
  "carnes":          { en: "Meats" },
  "pescados":        { en: "Fish" },
  "desayunos":       { en: "Breakfast" },
  "sandwiches":      { en: "Sandwiches" },
  "hamburguesas":    { en: "Burgers" },
  "niños":           { en: "Kids" },
  "ninos":           { en: "Kids" },
  "para niños":      { en: "Kids menu" },
  "bebidas calientes":   { en: "Hot beverages" },
  "bebidas frias":       { en: "Cold beverages" },
  "bebidas frías":       { en: "Cold beverages" },
  "bebidas no alcoholicas": { en: "Non-alcoholic" },
  "bebidas no alcohólicas": { en: "Non-alcoholic" },
  "jugos":           { en: "Juices" },
  "sodas":           { en: "Sodas" },
  "cocteles":        { en: "Cocktails" },
  "cócteles":        { en: "Cocktails" },
  "vinos":           { en: "Wines" },
  "cervezas":        { en: "Beers" },
  "licores":         { en: "Spirits" },
  "aguas":           { en: "Waters" },
  "general":         { en: "General" },
};
const tCat = (cat, lang) => {
  if (!cat) return "";
  if (lang === "es") return cat;
  const key = cat.toLowerCase().trim();
  return CAT_TRANSLATIONS[key]?.en || cat;
};

// Catálogo predefinido de Services
const SERVICIOS_CATALOG = [
  { id: "toallas_extra",   icon: "🧺", nombre: "Toallas extra",       subtitle: "Te las llevamos a tu habitación", categoria: "housekeeping" },
  { id: "turndown",        icon: "🛏", nombre: "Turndown service",    subtitle: "Preparación de cama para la noche", categoria: "housekeeping" },
  { id: "amenities_bano",  icon: "🧴", nombre: "Amenities de baño",   subtitle: "Shampoo, acondicionador, jabón",    categoria: "housekeeping" },
  { id: "limpieza",        icon: "🧹", nombre: "Limpieza extra",      subtitle: "Solicitar limpieza adicional",     categoria: "housekeeping" },
  { id: "taxi",            icon: "🚕", nombre: "Pedir un taxi",       subtitle: "Te coordinamos el transporte",     categoria: "concierge" },
  { id: "late_checkout",   icon: "⏰", nombre: "Late check-out",      subtitle: "Solicitar salida extendida",       categoria: "concierge" },
  { id: "mantenimiento",   icon: "🔧", nombre: "Reportar problema",   subtitle: "Mantenimiento / técnico",          categoria: "mantenimiento" },
  { id: "despertador",     icon: "⏰", nombre: "Wake-up call",        subtitle: "Llamada para despertar",           categoria: "concierge" },
];

// Plantillas de WhatsApp para Ask Anything
const CHAT_PLANTILLAS = [
  { id: "general",        icon: "💬", titulo: "Pregunta general",        mensaje: "Hola, tengo una pregunta." },
  { id: "restaurante",    icon: "🍽", titulo: "Reservar restaurante",   mensaje: "Quisiera reservar en el restaurante." },
  { id: "experiencia",    icon: "🏖", titulo: "Info de experiencias",   mensaje: "Me interesa saber más sobre las experiencias disponibles." },
  { id: "recomendacion",  icon: "🌴", titulo: "Recomiéndame algo",     mensaje: "¿Qué me recomiendas hacer hoy?" },
  { id: "urgente",        icon: "🚨", titulo: "Necesito ayuda urgente", mensaje: "Necesito ayuda con algo urgente por favor." },
  { id: "libre",          icon: "✏️", titulo: "Escribir otro mensaje",  mensaje: "" },
];

export default function GuestPortal({ token }) {
  useEffect(() => { document.title = "At Your Service — Atolón"; }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null); // { estancia, huesped, habitacion }
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState({ whatsapp_numero: "573001112233" });
  const [lang, setLang] = useState(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("atolon_lang") : null;
    if (saved) return saved;
    const nav = typeof navigator !== "undefined" ? (navigator.language || "es").slice(0, 2) : "es";
    return nav === "en" ? "en" : "es";
  });
  useEffect(() => { try { localStorage.setItem("atolon_lang", lang); } catch {} }, [lang]);

  // Vistas del concierge:
  // home | chat | experiences | food | category | services | mystay | cart | confirm | status
  const [view, setView] = useState("home");
  const [activeCat, setActiveCat] = useState(null);

  // Actualizar título del browser según la vista activa (debe ir DESPUÉS de declarar view/activeCat)
  useEffect(() => {
    if (!session) return;
    const viewTitle = view === "home" ? "At Your Service"
      : view === "chat" ? (lang === "es" ? "Concierge" : "Concierge")
      : view === "experiences" ? (lang === "es" ? "Actividades" : "Activities")
      : view === "transporte" ? (lang === "es" ? "Transporte Marítimo" : "Boat Transfers")
      : view === "food" ? "Room Service"
      : view === "category" ? (typeof activeCat?.label === "object" ? activeCat.label[lang] : activeCat?.label) || "Menu"
      : view === "cart" ? (lang === "es" ? "Tu pedido" : "Your order")
      : view === "confirm" ? (lang === "es" ? "Pedido confirmado" : "Order confirmed")
      : view === "status" ? (lang === "es" ? "Estado del pedido" : "Order status")
      : "At Your Service";
    document.title = `${viewTitle} — Atolón`;
  }, [view, session, lang, activeCat]);
  const [cart, setCart] = useState([]);
  const [itemOpen, setItemOpen] = useState(null); // item detail drawer
  const [deliveryTipo, setDeliveryTipo] = useState("room");
  const [deliveryUbic, setDeliveryUbic] = useState("");
  const [metodoPago, setMetodoPago] = useState("cargo_habitacion");
  const [propinaPct, setPropinaPct] = useState(0);
  const [notasGen, setNotasGen] = useState("");
  const [pedidoConfirm, setPedidoConfirm] = useState(null);
  const [pedidoEstado, setPedidoEstado] = useState(null);

  // Validar token y cargar sesión
  useEffect(() => {
    (async () => {
      if (!token) { setError("Token inválido"); setLoading(false); return; }
      const { data: tokenData } = await supabase
        .from("hotel_guest_tokens")
        .select("*, estancia:hotel_estancias(*, huesped:hotel_huespedes(*), habitacion:hotel_habitaciones(*))")
        .eq("token", token)
        .single();
      if (!tokenData) { setError("Enlace no válido o expirado"); setLoading(false); return; }
      if (new Date(tokenData.expira_at) < new Date()) { setError("Tu enlace ha expirado. Pregunta en recepción."); setLoading(false); return; }
      setSession({
        estancia: tokenData.estancia,
        huesped: tokenData.estancia?.huesped,
        habitacion: tokenData.estancia?.habitacion,
      });
      const hNombre = tokenData.estancia?.huesped?.nombre?.split(" ")[0] || "";
      const hHab = tokenData.estancia?.habitacion?.numero || "";
      document.title = `${hNombre ? `${hNombre} · ` : ""}${hHab ? `Suite #${hHab} · ` : ""}At Your Service — Atolón`;
      setDeliveryUbic(tokenData.estancia?.habitacion?.numero ? `#${tokenData.estancia.habitacion.numero}` : "");

      // Cargar catálogo + config concierge en paralelo
      const [{ data: itData }, { data: cfgData }] = await Promise.all([
        supabase
          .from("menu_items")
          .select("id, nombre, nombre_en, descripcion, descripcion_en, precio, categoria, categoria_en, menu_tipo, foto_url, disponible, destacado, modificadores, tiempo_prep_min, tags, orden, room_service, loggro_id")
          .eq("activo", true)
          .eq("room_service", true)
          .in("menu_tipo", ["restaurant", "bebidas", "experiencias", "servicios_hotel"])
          .order("categoria")
          .order("orden"),
        supabase.from("configuracion").select("*").eq("id", "atolon").single()
      ]);
      setItems((itData || []).filter(i => i.disponible !== false));
      if (cfgData) {
        setConfig({
          whatsapp_numero: (cfgData.concierge_whatsapp || cfgData.tel_muelle || "573001112233").replace(/\D/g, ""),
          plantillas: cfgData.concierge_plantillas || {},
        });
      }
      setLoading(false);
    })();
  }, [token]);

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const cartTotal = useMemo(() => cart.reduce((s, x) => s + x.precio_total * x.cantidad, 0), [cart]);
  const propinaMonto = Math.round(cartTotal * (propinaPct / 100));
  const totalFinal = cartTotal + propinaMonto;

  const addToCart = (item, opts = {}) => {
    const mods = opts.modificadores || [];
    const deltaMods = mods.reduce((s, m) => s + (Number(m.precio_delta) || 0), 0);
    const precio_total = Number(item.precio || 0) + deltaMods;
    const key = `${item.id}-${JSON.stringify(mods)}`;
    setCart(prev => {
      const existing = prev.find(x => x._key === key && x.notas === (opts.notas || ""));
      if (existing) return prev.map(x => x === existing ? { ...x, cantidad: x.cantidad + (opts.cantidad || 1) } : x);
      return [...prev, {
        _key: key,
        id: item.id,
        nombre: itemName(item, lang),
        precio_base: item.precio || 0,
        precio_total,
        modificadores: mods,
        notas: opts.notas || "",
        cantidad: opts.cantidad || 1,
        tiempo_prep_min: item.tiempo_prep_min || 15,
      }];
    });
    trackEvent(item.id, "add_cart");
  };
  const setCantidad = (key, cant) => {
    const n = Number(cant);
    if (n <= 0) return setCart(prev => prev.filter(x => x._key !== key));
    setCart(prev => prev.map(x => x._key === key ? { ...x, cantidad: n } : x));
  };
  const quitar = (key) => setCart(prev => prev.filter(x => x._key !== key));

  const trackEvent = async (itemId, eventType, metadata = null) => {
    try {
      await supabase.from("menu_item_events").insert({
        estancia_id: session?.estancia?.id,
        item_id: itemId,
        event_type: eventType,
        metadata,
      });
    } catch {}
  };

  // ── Filtros por sección ───────────────────────────────────────────────────
  const itemsPorSeccion = useMemo(() => {
    const map = {};
    FOOD_SUBSECCIONES.forEach(s => { map[s.key] = []; });
    items.forEach(it => {
      if (it.menu_tipo && map[it.menu_tipo]) map[it.menu_tipo].push(it);
    });
    // Specials = destacados de todas las secciones
    map.destacados = items.filter(i => i.destacado);
    return map;
  }, [items]);

  const itemsPorCategoria = (seccionKey) => {
    const arr = itemsPorSeccion[seccionKey] || [];
    const grupos = {};
    arr.forEach(it => {
      const g = it.categoria || "General";
      if (!grupos[g]) grupos[g] = [];
      grupos[g].push(it);
    });
    const keys = Object.keys(grupos).sort((a, b) => {
      const ra = catRank(a), rb = catRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
    return keys.map(k => ({ nombre: k, items: grupos[k] }));
  };

  // ── Place order ───────────────────────────────────────────────────────────
  const confirmarPedido = async () => {
    if (cart.length === 0) return;
    const codigo = `RS-${Date.now()}`;
    const maxPrep = Math.max(...cart.map(x => x.tiempo_prep_min || 15));
    const eta = maxPrep + 10;
    const payload = {
      codigo,
      estancia_id: session?.estancia?.id,
      habitacion_id: session?.habitacion?.id,
      habitacion_num: session?.habitacion?.numero || "",
      huesped: session?.huesped?.nombre || "",
      items: cart.map(c => ({
        id: c.id, nombre: c.nombre, cantidad: c.cantidad,
        precio: c.precio_total, modificadores: c.modificadores, notas: c.notas,
      })),
      subtotal: cartTotal,
      propina: propinaMonto,
      total: totalFinal,
      notas: notasGen,
      delivery_tipo: deliveryTipo,
      delivery_ubicacion: deliveryUbic,
      metodo_pago: metodoPago,
      pago_estado: metodoPago === "pago_ahora" ? "pendiente_pago" : "pendiente",
      canal: "guest_portal",
      eta_min: eta,
      estado: "pendiente",
      timeline: [{ estado: "pendiente", at: new Date().toISOString() }],
    };
    const { data, error } = await supabase.from("hotel_room_service_pedidos").insert(payload).select().single();
    if (error) return alert("Error al enviar el pedido: " + error.message);

    // Si cargo a habitación, crear folio
    if (metodoPago === "cargo_habitacion" && session?.estancia?.id) {
      await supabase.from("hotel_room_charges").insert({
        estancia_id: session.estancia.id,
        origen: "room_service",
        origen_ref: data.id,
        descripcion: `Pedido ${codigo} — ${cart.length} ítems`,
        monto: totalFinal,
      });
    }

    // Enviar el pedido a la cocina de Loggro Restobar (POS) — en tiempo real
    // Fire-and-forget: si falla, el pedido queda en DB para que el admin lo re-envíe manualmente.
    (async () => {
      try {
        // Mapeo habitación → mesa loggro
        const { data: hab } = await supabase.from("hotel_habitaciones")
          .select("numero, loggro_mesa_id").eq("id", session.habitacion.id).maybeSingle();
        if (!hab?.loggro_mesa_id) {
          console.warn("[loggro] habitación sin loggro_mesa_id");
          return;
        }
        // Lookup loggro_id de cada menu_item
        const { data: menuItems } = await supabase.from("menu_items")
          .select("id, loggro_id, precio").in("id", cart.map(c => c.id));
        const mapLoggro = Object.fromEntries((menuItems || []).map(m => [m.id, m]));
        const items = cart.map(c => {
          const m = mapLoggro[c.id] || {};
          return {
            productId: m.loggro_id,
            qty: c.cantidad,
            unit_price: Number(c.precio_total) || Number(m.precio) || 0,
            notes: c.notas ? [String(c.notas)] : (notasGen ? [notasGen] : []),
          };
        }).filter(i => i.productId);

        if (items.length === 0) {
          console.warn("[loggro] ningún item tiene loggro_id");
          return;
        }

        const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/create-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anon,
            Authorization: `Bearer ${anon}`,
          },
          body: JSON.stringify({
            mesaId: hab.loggro_mesa_id,
            groupName: `Room Service · Hab ${hab.numero || ""}${session?.huesped?.nombre ? " · " + session.huesped.nombre : ""}`,
            items,
          }),
        });
        const loggroRes = await res.json();
        if (loggroRes.ok) {
          const orderArr = Array.isArray(loggroRes.order) ? loggroRes.order : [loggroRes.order];
          const firstId = orderArr[0]?._id || orderArr[0]?.id || null;
          const groupId = orderArr[0]?.group || null;
          await supabase.from("hotel_room_service_pedidos").update({
            estado: "enviado_loggro",
            enviado_loggro_at: new Date().toISOString(),
            loggro_response: loggroRes.order,
            loggro_order_id: firstId,
            loggro_group_id: groupId,
          }).eq("id", data.id);
        } else {
          await supabase.from("hotel_room_service_pedidos").update({
            loggro_response: { error: loggroRes.error, at: new Date().toISOString() },
          }).eq("id", data.id);
        }
      } catch (err) {
        console.warn("[loggro] error enviando pedido:", err);
      }
    })();

    // Track
    cart.forEach(c => trackEvent(c.id, "order"));

    setPedidoConfirm(data);
    setCart([]);
    setNotasGen("");
    setView("confirm");
  };

  // ── Poll order status ─────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== "status" || !pedidoConfirm) return;
    let active = true;
    const poll = async () => {
      const { data } = await supabase
        .from("hotel_room_service_pedidos")
        .select("*")
        .eq("id", pedidoConfirm.id)
        .single();
      if (active && data) setPedidoEstado(data);
    };
    poll();
    const t = setInterval(poll, 10000);
    return () => { active = false; clearInterval(t); };
  }, [view, pedidoConfirm]);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return <CenteredMessage icon="🛎️" title="Cargando menú…" />;
  }
  if (error) {
    return <CenteredMessage icon="⚠️" title="Enlace no válido" sub={error} />;
  }

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div style={{ background: B.bg, minHeight: "100vh", color: B.text, fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: cart.length > 0 && view !== "cart" && view !== "confirm" && view !== "status" ? 80 : 0 }}>
      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, background: `linear-gradient(180deg, ${B.navy} 0%, ${B.navyMid} 100%)`, zIndex: 10, padding: "14px 16px", borderBottom: `1px solid ${B.sand}22`, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {view !== "home" ? (
            <button onClick={() => {
              if (view === "category") setView("food");
              else setView("home");
            }}
              style={{ background: "transparent", border: `1px solid ${B.sand}33`, color: B.sand, fontSize: 18, cursor: "pointer", padding: "4px 10px", borderRadius: 20, lineHeight: 1 }}>‹</button>
          ) : (
            <img src="/atolon-logo-sand.png" alt="Atolón Beach Club"
              style={{ height: 38, width: "auto", display: "block" }} />
          )}
          {view !== "home" && (
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: "0.04em" }}>
                {view === "chat" ? t("header_chat", lang)
                  : view === "experiences" ? t("header_activities", lang)
                  : view === "transporte" ? t("header_transport", lang)
                  : view === "food" ? t("header_food", lang)
                  : view === "category" ? (typeof activeCat?.label === "object" ? activeCat.label[lang] : activeCat?.label)?.toUpperCase()
                  : view === "services" ? t("header_services", lang)
                  : view === "mystay" ? t("header_mystay", lang)
                  : view === "cart" ? t("header_cart", lang)
                  : view === "confirm" ? t("header_confirm", lang)
                  : view === "status" ? t("header_status", lang) : ""}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setLang(lang === "es" ? "en" : "es")}
            style={{ background: B.navyLight, color: B.white, border: `1px solid ${B.navyLight}`, borderRadius: 16, padding: "5px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer", letterSpacing: "0.05em" }}>
            {lang === "es" ? "🇪🇸 ES" : "🇬🇧 EN"}
          </button>
          {cart.length > 0 && view !== "cart" && view !== "confirm" && view !== "status" && (
            <button onClick={() => setView("cart")}
              style={{ background: B.gold, color: B.navy, border: "none", borderRadius: 20, padding: "6px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              🛒 {cart.reduce((s, x) => s + x.cantidad, 0)}
            </button>
          )}
        </div>
      </header>

      {/* ── CONTENT ── */}
      {view === "home" && <Home session={session} items={items} setView={setView} lang={lang} />}
      {view === "chat" && <ChatView session={session} config={config} lang={lang} />}
      {view === "experiences" && <StubView icon="🏖" title={lang === "es" ? "Actividades" : "Activities"} subtitle={t("stub_activities_sub", lang)} session={session} config={config} lang={lang} />}
      {view === "transporte" && <StubView icon="⛵" title={lang === "es" ? "Transporte Marítimo" : "Boat Transfers"} subtitle={t("stub_transport_sub", lang)} session={session} config={config} lang={lang} />}
      {view === "food" && <FoodSection session={session} saludo={saludo} items={items} itemsPorSeccion={itemsPorSeccion} setView={setView} setActiveCat={setActiveCat} setItemOpen={setItemOpen} />}
      {view === "category" && activeCat && <CategoryView seccion={activeCat} grupos={itemsPorCategoria(activeCat.key)} setItemOpen={setItemOpen} addToCart={addToCart} lang={lang} />}
      {view === "services" && <ServicesView session={session} config={config} lang={lang} />}
      {view === "mystay" && <MyStayView session={session} lang={lang} />}
      {view === "cart" && <CartView cart={cart} setCantidad={setCantidad} quitar={quitar} session={session} deliveryTipo={deliveryTipo} setDeliveryTipo={setDeliveryTipo} deliveryUbic={deliveryUbic} setDeliveryUbic={setDeliveryUbic} metodoPago={metodoPago} setMetodoPago={setMetodoPago} propinaPct={propinaPct} setPropinaPct={setPropinaPct} notasGen={notasGen} setNotasGen={setNotasGen} cartTotal={cartTotal} propinaMonto={propinaMonto} totalFinal={totalFinal} confirmarPedido={confirmarPedido} lang={lang} />}
      {view === "confirm" && pedidoConfirm && <ConfirmView pedido={pedidoConfirm} setView={setView} lang={lang} />}
      {view === "status" && <StatusView pedido={pedidoEstado || pedidoConfirm} lang={lang} />}

      {/* ── ITEM DETAIL BOTTOM SHEET ── */}
      {itemOpen && (
        <ItemDetail item={itemOpen} onClose={() => setItemOpen(null)} addToCart={addToCart} trackEvent={trackEvent} lang={lang} />
      )}

      {/* ── STICKY CART FOOTER ── */}
      {cart.length > 0 && ["home", "food", "category", "chat", "services", "mystay", "experiences"].includes(view) && (
        <div onClick={() => setView("cart")}
          style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: B.gold, color: B.navy, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, cursor: "pointer", zIndex: 20, boxShadow: "0 -4px 20px rgba(0,0,0,0.3)" }}>
          <span>{t("cart_see", lang)} ({cart.reduce((s, x) => s + x.cantidad, 0)})</span>
          <span>{COP(cartTotal)} →</span>
        </div>
      )}
    </div>
  );
}

// ─── HOME — At Your Service con 4 secciones ───────────────────────────────
function Home({ session, items, setView, lang }) {
  const destacados = items.filter(i => i.destacado).slice(0, 6);
  const hora = new Date().getHours();
  const saludoKey = hora < 12 ? "good_morning" : hora < 19 ? "good_afternoon" : "good_evening";
  const saludo = t(saludoKey, lang);
  const fechaCheckOut = session?.estancia?.check_out_at
    ? new Date(session.estancia.check_out_at).toLocaleDateString(lang === "es" ? "es-CO" : "en-US", { day: "numeric", month: "short" })
    : null;

  return (
    <div style={{ padding: "24px 16px 18px" }}>
      {/* Hero — logo + greeting + estancia */}
      <div style={{ marginBottom: 24, padding: "24px 20px 20px", background: `linear-gradient(135deg, ${B.navy} 0%, ${B.navyMid} 100%)`, borderRadius: 16, border: `1px solid ${B.sand}22`, textAlign: "center" }}>
        <img src="/atolon-logo-sand.png" alt="Atolón Beach Club"
          style={{ height: 72, width: "auto", display: "block", margin: "0 auto 14px" }} />
        <div style={{ fontSize: 9, color: B.sand, fontWeight: 800, letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${B.sand}22` }}>
          {t("header_title", lang)}
        </div>
        <div style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.02em", color: B.white, lineHeight: 1.2 }}>
          {saludo}{session?.huesped?.nombre ? `,` : ""}
        </div>
        {session?.huesped?.nombre && (
          <div style={{ fontSize: 26, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.sand, lineHeight: 1.1, marginBottom: 4 }}>
            {session.huesped.nombre.split(" ")[0]}
          </div>
        )}
        {(session?.habitacion?.numero || fechaCheckOut) && (
          <div style={{ fontSize: 11, color: B.textDim, marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            {session?.habitacion?.numero && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12, background: `${B.sand}15`, color: B.sand, fontWeight: 700, fontSize: 10, letterSpacing: "0.03em" }}>
                🗝 {t("suite", lang)} #{session.habitacion.numero}
              </span>
            )}
            {fechaCheckOut && (
              <span style={{ fontSize: 10 }}>{t("check_out", lang)} · {fechaCheckOut}</span>
            )}
          </div>
        )}
      </div>

      {/* Carrusel destacados */}
      {destacados.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, color: B.gold, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>⭐ {t("today_recommend", lang)}</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -16px", padding: "0 16px 6px" }}>
            {destacados.map(it => (
              <div key={it.id} onClick={() => setView("food")}
                style={{ flex: "0 0 160px", background: B.navy, borderRadius: 12, border: `1px solid ${B.navyLight}`, overflow: "hidden", cursor: "pointer" }}>
                <div style={{ height: 100, background: it.foto_url ? `url(${it.foto_url}) center/cover` : B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
                  {!it.foto_url && "🍽"}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{it.nombre}</div>
                  <div style={{ fontSize: 13, color: B.sand, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(it.precio)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 secciones del At Your Service */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CONCIERGE_SECCIONES.map(s => (
          <button key={s.key} onClick={() => setView(s.key)}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 18px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 14, color: B.white, cursor: "pointer", textAlign: "left", width: "100%", transition: "all 0.15s" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{s.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.03em", textTransform: "uppercase" }}>{s.label[lang]}</div>
              <div style={{ fontSize: 11, color: B.textFaint, marginTop: 2 }}>{s.subtitle[lang]}</div>
            </div>
            <div style={{ fontSize: 22, color: s.color }}>›</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers para obtener nombre/descripción/categoría según idioma ────────
const itemName  = (it, lang) => (lang === "en" && it.nombre_en) || it.nombre || "";
const itemDesc  = (it, lang) => (lang === "en" && it.descripcion_en) || it.descripcion || "";
const itemCat   = (it, lang) => (lang === "en" && it.categoria_en) || it.categoria || "";

// ─── FOOD SECTION (hub de Food & Drinks con sub-categorías) ────────────────
function FoodSection({ session, items, itemsPorSeccion, setView, setActiveCat, setItemOpen, lang }) {
  const destacados = items.filter(i => i.destacado).slice(0, 6);
  return (
    <div style={{ padding: "18px 16px" }}>
      {destacados.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>⭐ {t("food_destacados", lang)}</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -16px", padding: "0 16px 6px" }}>
            {destacados.map(it => (
              <div key={it.id} onClick={() => setItemOpen(it)}
                style={{ flex: "0 0 160px", background: B.navy, borderRadius: 12, border: `1px solid ${B.navyLight}`, overflow: "hidden", cursor: "pointer" }}>
                <div style={{ height: 100, background: it.foto_url ? `url(${it.foto_url}) center/cover` : B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
                  {!it.foto_url && "🍽"}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{itemName(it, lang)}</div>
                  <div style={{ fontSize: 13, color: B.sand, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(it.precio)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FOOD_SUBSECCIONES.map(s => {
          const count = itemsPorSeccion[s.key]?.length || 0;
          if (count === 0) return null;
          return (
            <button key={s.key} onClick={() => { setActiveCat(s); setView("category"); }}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 18px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 14, color: B.white, cursor: "pointer", textAlign: "left", width: "100%" }}>
              <div style={{ fontSize: 28 }}>{s.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.03em", textTransform: "uppercase" }}>{s.label[lang]}</div>
                <div style={{ fontSize: 11, color: B.textFaint, marginTop: 2 }}>{count} {t("options", lang)}</div>
              </div>
              <div style={{ fontSize: 20, color: s.color }}>›</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── CATEGORY VIEW ─────────────────────────────────────────────────────────
function CategoryView({ seccion, grupos, setItemOpen, addToCart, lang }) {
  const [activeSub, setActiveSub] = useState(null);
  const visibles = activeSub ? grupos.filter(g => g.nombre === activeSub) : grupos;
  const catLabel = (g) => {
    // g.items[0] may have categoria_en; fallback a CAT_TRANSLATIONS por nombre
    const first = g.items[0];
    if (lang === "en" && first?.categoria_en) return first.categoria_en;
    return tCat(g.nombre, lang);
  };
  return (
    <div style={{ padding: "16px 16px 20px" }}>
      {grupos.length > 1 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, padding: "0 0 4px" }}>
          <button onClick={() => setActiveSub(null)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${activeSub === null ? seccion.color : B.navyLight}`,
              background: activeSub === null ? `${seccion.color}22` : "transparent", color: activeSub === null ? seccion.color : B.textDim,
              fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{lang === "es" ? "Todos" : "All"}</button>
          {grupos.map(g => (
            <button key={g.nombre} onClick={() => setActiveSub(g.nombre)}
              style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${activeSub === g.nombre ? seccion.color : B.navyLight}`,
                background: activeSub === g.nombre ? `${seccion.color}22` : "transparent", color: activeSub === g.nombre ? seccion.color : B.textDim,
                fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{catLabel(g)}</button>
          ))}
        </div>
      )}
      {visibles.map(g => (
        <div key={g.nombre} style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 800, color: seccion.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>{catLabel(g)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {g.items.map(it => (
              <ItemCard key={it.id} item={it} lang={lang} onTap={() => setItemOpen(it)}
                onQuickAdd={(e) => { e.stopPropagation(); if ((it.modificadores || []).length > 0) setItemOpen(it); else addToCart(it); }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemCard({ item, onTap, onQuickAdd, lang = "es" }) {
  return (
    <div onClick={onTap}
      style={{ display: "flex", gap: 12, padding: "12px", background: B.navy, borderRadius: 12, border: `1px solid ${B.navyLight}`, cursor: "pointer" }}>
      <div style={{ width: 76, height: 76, borderRadius: 10, background: item.foto_url ? `url(${item.foto_url}) center/cover` : B.navyLight, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
        {!item.foto_url && "🍽"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: B.white, marginBottom: 3, lineHeight: 1.3 }}>{itemName(item, lang)}</div>
        {itemDesc(item, lang) && <div style={{ fontSize: 11, color: B.textDim, lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{itemDesc(item, lang)}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 800, color: B.sand }}>{COP(item.precio)}</div>
          <button onClick={onQuickAdd}
            style={{ width: 34, height: 34, borderRadius: "50%", background: B.sand, color: B.navy, border: "none", fontSize: 20, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
        </div>
      </div>
    </div>
  );
}

// ─── ITEM DETAIL (bottom sheet) ────────────────────────────────────────────
function ItemDetail({ item, onClose, addToCart, trackEvent, lang = "es" }) {
  const [cantidad, setCantidad] = useState(1);
  const [notas, setNotas] = useState("");
  const [modSel, setModSel] = useState({}); // { grupoIdx: [opcionIdx] }

  useEffect(() => { trackEvent(item.id, "view"); }, [item.id]);

  const grupos = item.modificadores || [];
  const seleccionadasFlat = useMemo(() => {
    const res = [];
    grupos.forEach((g, gi) => {
      (modSel[gi] || []).forEach(oi => {
        res.push({ grupo: g.grupo, ...(g.opciones[oi] || {}) });
      });
    });
    return res;
  }, [modSel, grupos]);

  const deltaMods = seleccionadasFlat.reduce((s, o) => s + (Number(o.precio_delta) || 0), 0);
  const precioUnit = (item.precio || 0) + deltaMods;
  const totalBtn = precioUnit * cantidad;

  const toggleMod = (gi, oi, maxSel) => {
    setModSel(prev => {
      const cur = prev[gi] || [];
      const exists = cur.includes(oi);
      let next;
      if (exists) next = cur.filter(x => x !== oi);
      else if (maxSel === 1) next = [oi];
      else if (cur.length < maxSel) next = [...cur, oi];
      else next = cur;
      return { ...prev, [gi]: next };
    });
  };

  const confirmar = () => {
    // Validar min de cada grupo
    for (let gi = 0; gi < grupos.length; gi++) {
      const g = grupos[gi];
      const sel = (modSel[gi] || []).length;
      if (sel < (g.min || 0)) return alert(`${t("item_min_select", lang)} ${g.min} — "${g.grupo}"`);
    }
    addToCart(item, { modificadores: seleccionadasFlat, notas, cantidad });
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: B.navy, width: "100%", maxHeight: "92vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: 0 }}>
        {item.foto_url && (
          <div style={{ width: "100%", height: 220, background: `url(${item.foto_url}) center/cover`, borderRadius: "20px 20px 0 0" }}></div>
        )}
        <div style={{ padding: "20px 20px 24px" }}>
          <div style={{ width: 40, height: 4, background: B.navyLight, borderRadius: 2, margin: "-8px auto 14px" }}></div>
          <div style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.02em", marginBottom: 4 }}>{itemName(item, lang)}</div>
          {itemDesc(item, lang) && <div style={{ fontSize: 13, color: B.textDim, lineHeight: 1.5, marginBottom: 12 }}>{itemDesc(item, lang)}</div>}
          {(item.tags || []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {item.tags.map(t => <span key={t} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 10, background: B.navyLight, color: B.textDim }}>{t}</span>)}
            </div>
          )}

          {grupos.map((g, gi) => (
            <div key={gi} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                {g.grupo} {g.min > 0 && <span style={{ color: B.warning }}>*</span>}
                {g.max > 1 && <span style={{ color: B.textFaint, fontWeight: 400 }}> (hasta {g.max})</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(g.opciones || []).map((o, oi) => {
                  const sel = (modSel[gi] || []).includes(oi);
                  return (
                    <label key={oi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: sel ? `${B.gold}22` : B.navyLight, borderRadius: 8, cursor: "pointer", border: `1px solid ${sel ? B.gold : "transparent"}` }}>
                      <input type={g.max === 1 ? "radio" : "checkbox"} name={`grp-${gi}`} checked={sel} onChange={() => toggleMod(gi, oi, g.max || 99)} style={{ accentColor: B.gold }} />
                      <div style={{ flex: 1, fontSize: 13 }}>{o.nombre}</div>
                      {o.precio_delta > 0 && <div style={{ fontSize: 12, color: B.sand, fontWeight: 700 }}>+{COP(o.precio_delta)}</div>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{t("item_notes", lang)}</div>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder={t("item_notes_ph", lang)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} style={{ width: 44, height: 44, borderRadius: 22, background: B.navyLight, border: "none", color: B.white, fontSize: 22, cursor: "pointer", fontWeight: 800 }}>−</button>
            <div style={{ fontSize: 20, fontWeight: 800, minWidth: 24, textAlign: "center" }}>{cantidad}</div>
            <button onClick={() => setCantidad(cantidad + 1)} style={{ width: 44, height: 44, borderRadius: 22, background: B.navyLight, border: "none", color: B.white, fontSize: 22, cursor: "pointer", fontWeight: 800 }}>+</button>
          </div>

          <button onClick={confirmar}
            style={{ width: "100%", padding: "16px", borderRadius: 12, background: B.gold, color: B.navy, border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {t("item_add", lang)} · {COP(totalBtn)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CART ──────────────────────────────────────────────────────────────────
function CartView({ cart, setCantidad, quitar, session, deliveryTipo, setDeliveryTipo, deliveryUbic, setDeliveryUbic, metodoPago, setMetodoPago, propinaPct, setPropinaPct, notasGen, setNotasGen, cartTotal, propinaMonto, totalFinal, confirmarPedido, lang }) {
  if (cart.length === 0) {
    return <CenteredMessage icon="🛒" title={t("cart_empty", lang)} sub={t("cart_empty_sub", lang)} />;
  }
  return (
    <div style={{ padding: "16px 16px 120px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {cart.map(c => (
          <div key={c._key} style={{ background: B.navy, borderRadius: 12, padding: 14, border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{c.nombre}</div>
              <button onClick={() => quitar(c._key)} style={{ background: "transparent", border: "none", color: B.danger, fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>
            {c.modificadores?.length > 0 && (
              <div style={{ fontSize: 11, color: B.textDim, marginBottom: 4 }}>
                {c.modificadores.map(m => m.nombre).join(" · ")}
              </div>
            )}
            {c.notas && <div style={{ fontSize: 11, color: B.textFaint, fontStyle: "italic", marginBottom: 4 }}>"{c.notas}"</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setCantidad(c._key, c.cantidad - 1)} style={{ width: 30, height: 30, borderRadius: 15, background: B.navyLight, border: "none", color: B.white, fontSize: 16, cursor: "pointer", fontWeight: 800 }}>−</button>
                <div style={{ fontSize: 14, fontWeight: 800, minWidth: 18, textAlign: "center" }}>{c.cantidad}</div>
                <button onClick={() => setCantidad(c._key, c.cantidad + 1)} style={{ width: 30, height: 30, borderRadius: 15, background: B.navyLight, border: "none", color: B.white, fontSize: 16, cursor: "pointer", fontWeight: 800 }}>+</button>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(c.precio_total * c.cantidad)}</div>
            </div>
          </div>
        ))}
      </div>

      <Section title={t("cart_deliver", lang)}>
        <Radio value="room" selected={deliveryTipo} onChange={setDeliveryTipo} label={`${t("deliver_room", lang)} ${session?.habitacion?.numero ? `#${session.habitacion.numero}` : ""}`.trim()} />
        <Radio value="cabana" selected={deliveryTipo} onChange={setDeliveryTipo} label={t("deliver_cabana", lang)} />
        <Radio value="beach_bed" selected={deliveryTipo} onChange={setDeliveryTipo} label={t("deliver_beach", lang)} />
        <Radio value="otro" selected={deliveryTipo} onChange={setDeliveryTipo} label={t("deliver_other", lang)} />
        {deliveryTipo !== "room" && (
          <input value={deliveryUbic} onChange={e => setDeliveryUbic(e.target.value)} placeholder={t("deliver_specify", lang)}
            style={{ width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        )}
      </Section>

      <Section title={t("cart_payment", lang)}>
        <Radio value="cargo_habitacion" selected={metodoPago} onChange={setMetodoPago} label={t("pay_room", lang)} />
        <Radio value="pago_ahora" selected={metodoPago} onChange={setMetodoPago} label={t("pay_now", lang)} />
        <Radio value="pago_al_entregar" selected={metodoPago} onChange={setMetodoPago} label={t("pay_delivery", lang)} />
        {metodoPago === "pago_ahora" && (
          <AvisoCargoInternacional lang={lang} style={{ marginTop: 8 }} />
        )}
      </Section>

      <Section title={t("cart_tip", lang)}>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 5, 10, 15].map(p => (
            <button key={p} onClick={() => setPropinaPct(p)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${propinaPct === p ? B.gold : B.navyLight}`,
                background: propinaPct === p ? `${B.gold}22` : "transparent", color: propinaPct === p ? B.gold : B.textDim,
                fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {p}%
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("cart_notes", lang)}>
        <textarea value={notasGen} onChange={e => setNotasGen(e.target.value)} rows={2}
          placeholder={t("cart_notes_ph", lang)}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
      </Section>

      <div style={{ padding: "16px 0", marginTop: 14, borderTop: `1px solid ${B.navyLight}` }}>
        <Row label={t("cart_subtotal", lang)} value={COP(cartTotal)} />
        {propinaMonto > 0 && <Row label={`${t("cart_tip", lang).replace(/^[💰 ]+/, "")} (${propinaPct}%)`} value={COP(propinaMonto)} />}
        <Row label={t("cart_total", lang)} value={COP(totalFinal)} big />
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: B.navy, padding: "14px 16px", borderTop: `1px solid ${B.navyLight}`, zIndex: 20 }}>
        <button onClick={confirmarPedido}
          style={{ width: "100%", padding: "16px", borderRadius: 12, background: B.gold, color: B.navy, border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
          {t("cart_confirm", lang)} · {COP(totalFinal)}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}
function Radio({ value, selected, onChange, label }) {
  const sel = selected === value;
  return (
    <label onClick={() => onChange(value)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: sel ? `${B.gold}15` : B.navy, borderRadius: 10, cursor: "pointer", border: `1px solid ${sel ? B.gold : B.navyLight}` }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${sel ? B.gold : B.textFaint}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: B.gold }}></div>}
      </div>
      <div style={{ fontSize: 13, color: sel ? B.white : B.textDim, fontWeight: sel ? 700 : 400 }}>{label}</div>
    </label>
  );
}
function Row({ label, value, big }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: big ? 16 : 13, fontWeight: big ? 800 : 400, color: big ? B.white : B.textDim }}>
      <span>{label}</span>
      <span style={big ? { color: B.gold, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22 } : {}}>{value}</span>
    </div>
  );
}

// ─── CONFIRMATION ──────────────────────────────────────────────────────────
function ConfirmView({ pedido, setView, lang = "es" }) {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 72, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 6, letterSpacing: "0.02em" }}>{t("confirm_title", lang)}</div>
      <div style={{ fontSize: 13, color: B.textDim, marginBottom: 24 }}>{t("confirm_sub", lang)}</div>
      <div style={{ background: B.navy, borderRadius: 14, padding: "20px 18px", border: `1px solid ${B.navyLight}`, marginBottom: 18 }}>
        <div style={{ fontSize: 10, color: B.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{t("confirm_code", lang)}</div>
        <div style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.gold, marginBottom: 16 }}>{pedido.codigo}</div>
        <div style={{ fontSize: 10, color: B.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{t("confirm_eta", lang)}</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>⏱ {pedido.eta_min} {t("confirm_minutes", lang)}</div>
      </div>
      <button onClick={() => setView("status")}
        style={{ width: "100%", padding: "14px", borderRadius: 12, background: B.gold, color: B.navy, border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>
        {t("confirm_see_status", lang)} →
      </button>
      <button onClick={() => setView("chat")}
        style={{ display: "block", fontSize: 13, color: B.success, background: "transparent", border: "none", padding: 12, cursor: "pointer", width: "100%" }}>
        💬 {t("confirm_chat", lang)}
      </button>
    </div>
  );
}

// ─── STATUS ────────────────────────────────────────────────────────────────
function StatusView({ pedido, lang = "es" }) {
  if (!pedido) return <CenteredMessage icon="📋" title={lang === "es" ? "Sin pedido activo" : "No active order"} />;
  const pasos = [
    { key: "pendiente",  label: t("status_received", lang),  icon: "📩" },
    { key: "preparando", label: t("status_cooking", lang),   icon: "🍳" },
    { key: "en_camino",  label: t("status_delivery", lang),  icon: "🛎" },
    { key: "entregado",  label: t("status_delivered", lang), icon: "✓" },
  ];
  const currentIdx = Math.max(0, pasos.findIndex(p => p.key === pedido.estado));
  return (
    <div style={{ padding: "20px 20px 40px" }}>
      <div style={{ background: B.navy, borderRadius: 14, padding: "16px 18px", marginBottom: 18, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 20, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.gold }}>{pedido.codigo}</div>
          <div style={{ fontSize: 11, color: B.textFaint }}>{pedido.items?.length || 0} {lang === "es" ? "ítems" : "items"} · {COP(pedido.total)}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {pasos.map((p, i) => {
          const done = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={p.key} style={{ display: "flex", gap: 14, paddingBottom: i === pasos.length - 1 ? 0 : 24, position: "relative" }}>
              {i < pasos.length - 1 && (
                <div style={{ position: "absolute", left: 23, top: 48, bottom: 0, width: 2, background: done && i < currentIdx ? B.gold : B.navyLight }}></div>
              )}
              <div style={{ width: 48, height: 48, borderRadius: 24, background: done ? B.gold : B.navyLight, color: done ? B.navy : B.textFaint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, border: isCurrent ? `3px solid ${B.gold}` : "none", boxShadow: isCurrent ? `0 0 20px ${B.gold}80` : "none" }}>
                {p.icon}
              </div>
              <div style={{ paddingTop: 10 }}>
                <div style={{ fontSize: 15, fontWeight: done ? 800 : 400, color: done ? B.white : B.textFaint }}>{p.label}</div>
                {isCurrent && pedido.estado !== "entregado" && (
                  <div style={{ fontSize: 11, color: B.gold, marginTop: 2 }}>{t("status_in_progress", lang)}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {pedido.estado === "entregado" && (
        <div style={{ marginTop: 24, padding: "16px 18px", background: `${B.success}22`, borderRadius: 12, border: `1px solid ${B.success}44`, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: B.success }}>{t("status_bon_appetit", lang)}</div>
          <div style={{ fontSize: 11, color: B.textDim, marginTop: 4 }}>{t("status_thanks", lang)}</div>
        </div>
      )}
    </div>
  );
}

// ─── CHAT / ASK ANYTHING ───────────────────────────────────────────────────
function ChatView({ session, config, lang }) {
  const nombre = session?.huesped?.nombre?.split(" ")[0] || "";
  const hab = session?.habitacion?.numero || "";
  const numero = (config?.whatsapp_numero || "573001112233").replace(/\D/g, "");

  const waLink = (mensaje) => {
    const greet = lang === "es" ? "Hola" : "Hi";
    const nameBit = nombre ? (lang === "es" ? `, soy ${nombre}` : `, I'm ${nombre}`) : "";
    const roomBit = hab ? (lang === "es" ? ` de la habitación #${hab}` : ` from room #${hab}`) : "";
    const prefijo = `${greet}${nameBit}${roomBit}. `;
    const msg = encodeURIComponent(prefijo + (mensaje || ""));
    return `https://wa.me/${numero}?text=${msg}`;
  };

  const plantillas = [
    { id: "general",       icon: "💬", titulo: t("chat_general", lang),         mensaje: t("chat_msg_general", lang) },
    { id: "restaurant",    icon: "🍽", titulo: t("chat_restaurant", lang),      mensaje: t("chat_msg_restaurant", lang) },
    { id: "experiences",   icon: "🏖", titulo: t("chat_experiences", lang),     mensaje: t("chat_msg_experiences", lang) },
    { id: "recommendation",icon: "🌴", titulo: t("chat_recommendation", lang),  mensaje: t("chat_msg_recommendation", lang) },
    { id: "urgent",        icon: "🚨", titulo: t("chat_urgent", lang),          mensaje: t("chat_msg_urgent", lang) },
    { id: "custom",        icon: "✏️", titulo: t("chat_custom", lang),          mensaje: "" },
  ];

  return (
    <div style={{ padding: "20px 16px 40px" }}>
      <div style={{ background: `${B.success}15`, border: `1px solid ${B.success}44`, borderRadius: 14, padding: "18px 20px", marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 6 }}>💬</div>
        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em", marginBottom: 4 }}>{t("chat_banner_title", lang)}</div>
        <div style={{ fontSize: 12, color: B.textDim, lineHeight: 1.5 }}>{t("chat_banner_sub", lang)}</div>
      </div>

      <div style={{ fontSize: 10, color: B.textFaint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        {t("chat_quick_msgs", lang)}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {plantillas.map(p => (
          <a key={p.id} href={waLink(p.mensaje)} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 14, color: B.white, textDecoration: "none", cursor: "pointer" }}>
            <div style={{ fontSize: 26 }}>{p.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.titulo}</div>
              {p.mensaje && <div style={{ fontSize: 11, color: B.textFaint, marginTop: 2, fontStyle: "italic", lineHeight: 1.4 }}>"{p.mensaje}"</div>}
            </div>
            <div style={{ fontSize: 20, color: B.success }}>›</div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 24, padding: "12px 14px", background: B.navyMid, borderRadius: 10, textAlign: "center" }}>
        <div style={{ fontSize: 10, color: B.textFaint, lineHeight: 1.5 }}>
          {t("chat_footer", lang)}
        </div>
      </div>
    </div>
  );
}

// ─── SERVICES (housekeeping, amenities, concierge) ─────────────────────────
function ServicesView({ session, config }) {
  const [enviando, setEnviando] = useState(null); // service id en progreso
  const [enviado, setEnviado] = useState(null); // service id entregado
  const nombre = session?.huesped?.nombre?.split(" ")[0] || "";
  const hab = session?.habitacion?.numero || "";

  const solicitar = async (serv) => {
    setEnviando(serv.id);
    const codigo = `SV-${Date.now()}`;
    const payload = {
      codigo,
      estancia_id: session?.estancia?.id,
      habitacion_id: session?.habitacion?.id,
      habitacion_num: hab,
      huesped: session?.huesped?.nombre || "",
      items: [{ id: serv.id, nombre: serv.nombre, cantidad: 1, precio: 0, notas: "" }],
      subtotal: 0, total: 0, propina: 0,
      notas: `Solicitud de servicio — ${serv.categoria}`,
      delivery_tipo: "room",
      delivery_ubicacion: hab ? `#${hab}` : "",
      metodo_pago: "cargo_habitacion",
      pago_estado: "pendiente",
      canal: "guest_portal",
      tipo: "servicio",
      estado: "pendiente",
      timeline: [{ estado: "pendiente", at: new Date().toISOString() }],
    };
    const { error } = await supabase.from("hotel_room_service_pedidos").insert(payload);
    setEnviando(null);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    setEnviado(serv.id);
    setTimeout(() => setEnviado(null), 3000);
  };

  return (
    <div style={{ padding: "20px 16px 40px" }}>
      <div style={{ background: `#a78bfa15`, border: `1px solid #a78bfa44`, borderRadius: 14, padding: "16px 18px", marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 4 }}>🛎</div>
        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em", marginBottom: 4 }}>¿Qué necesitas?</div>
        <div style={{ fontSize: 11, color: B.textDim }}>Tap para solicitar · Te atendemos en minutos</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {SERVICIOS_CATALOG.map(serv => {
          const isSending = enviando === serv.id;
          const isDone = enviado === serv.id;
          return (
            <button key={serv.id} onClick={() => !isSending && !isDone && solicitar(serv)}
              disabled={isSending || isDone}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 12px",
                background: isDone ? `${B.success}22` : B.navy,
                border: `1px solid ${isDone ? B.success : B.navyLight}`,
                borderRadius: 14, color: B.white, cursor: isSending || isDone ? "default" : "pointer", textAlign: "center",
                minHeight: 124 }}>
              <div style={{ fontSize: 32 }}>{isDone ? "✓" : serv.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>
                {isSending ? "Enviando…" : isDone ? "Solicitado" : serv.nombre}
              </div>
              {!isSending && !isDone && (
                <div style={{ fontSize: 9, color: B.textFaint, lineHeight: 1.3 }}>{serv.subtitle}</div>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 20, padding: "14px 16px", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.navyLight}`, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: B.textDim, marginBottom: 6 }}>¿No ves lo que necesitas?</div>
        <a href={`https://wa.me/${(config?.whatsapp_numero || "573001112233").replace(/\D/g, "")}?text=${encodeURIComponent(`Hola${nombre ? `, soy ${nombre}` : ""}${hab ? ` de la habitación #${hab}` : ""}. Necesito...`)}`}
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: B.success, fontWeight: 700, textDecoration: "none" }}>
          💬 Escríbenos por WhatsApp
        </a>
      </div>
    </div>
  );
}

// ─── MY STAY (estancia + folio) ────────────────────────────────────────────
function MyStayView({ session }) {
  const [cargos, setCargos] = useState([]);
  const [loadingCargos, setLoadingCargos] = useState(true);

  useEffect(() => {
    if (!session?.estancia?.id) { setLoadingCargos(false); return; }
    supabase.from("hotel_room_charges")
      .select("*")
      .eq("estancia_id", session.estancia.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setCargos(data || []);
        setLoadingCargos(false);
      });
  }, [session?.estancia?.id]);

  const totalFolio = cargos.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const estancia = session?.estancia;
  const fmtF = (iso) => iso ? new Date(iso).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "—";

  return (
    <div style={{ padding: "20px 16px 40px" }}>
      {/* Tarjeta de estancia */}
      <div style={{ background: B.navy, borderRadius: 14, padding: "18px 20px", border: `1px solid ${B.navyLight}`, marginBottom: 18 }}>
        <div style={{ fontSize: 10, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Tu estancia</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: B.textFaint, marginBottom: 3 }}>HUÉSPED</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{session?.huesped?.nombre || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: B.textFaint, marginBottom: 3 }}>HABITACIÓN</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>#{session?.habitacion?.numero || "—"}{session?.habitacion?.categoria ? ` · ${session.habitacion.categoria}` : ""}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: B.textFaint, marginBottom: 3 }}>CHECK-IN</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtF(estancia?.check_in_at)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: B.textFaint, marginBottom: 3 }}>CHECK-OUT</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtF(estancia?.check_out_at)}</div>
          </div>
        </div>
      </div>

      {/* Folio */}
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 11, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>Cargos del folio</div>
        <div style={{ fontSize: 11, color: B.textFaint }}>{cargos.length} {cargos.length === 1 ? "cargo" : "cargos"}</div>
      </div>

      {loadingCargos ? (
        <div style={{ textAlign: "center", padding: 30, color: B.textFaint, fontSize: 12 }}>Cargando…</div>
      ) : cargos.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, background: B.navy, borderRadius: 12, border: `1px dashed ${B.navyLight}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
          <div style={{ fontSize: 13, color: B.textDim }}>Sin cargos todavía</div>
          <div style={{ fontSize: 11, color: B.textFaint, marginTop: 4 }}>Tu folio está en cero</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cargos.map(c => (
              <div key={c.id} style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", border: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{c.descripcion}</div>
                  <div style={{ fontSize: 10, color: B.textFaint }}>
                    {new Date(c.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {c.origen && ` · ${c.origen}`}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: "nowrap" }}>{COP(c.monto)}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, padding: "16px 18px", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.sand}44`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: B.white, fontWeight: 700 }}>Total folio</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: B.gold, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalFolio)}</div>
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: B.textFaint, textAlign: "center", lineHeight: 1.5 }}>
            Este monto será cargado al momento del check-out.
          </div>
        </>
      )}
    </div>
  );
}

// ─── STUB (placeholder para secciones en construcción) ─────────────────────
function StubView({ icon, title, subtitle, session, config, lang = "es" }) {
  const numero = (config?.whatsapp_numero || "573001112233").replace(/\D/g, "");
  const nombre = session?.huesped?.nombre?.split(" ")[0] || "";
  const hab = session?.habitacion?.numero || "";
  const greet = lang === "es" ? "Hola" : "Hi";
  const nameBit = nombre ? (lang === "es" ? `, soy ${nombre}` : `, I'm ${nombre}`) : "";
  const roomBit = hab ? (lang === "es" ? ` de la habitación #${hab}` : ` from room #${hab}`) : "";
  const askMsg = lang === "es" ? "Necesito info." : "I need info.";
  const msg = encodeURIComponent(`${greet}${nameBit}${roomBit}. ${askMsg}`);
  return (
    <div style={{ padding: "40px 24px 40px", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: B.textDim, maxWidth: 320, margin: "0 auto 24px", lineHeight: 1.5 }}>{subtitle}</div>
      <div style={{ display: "inline-block", padding: "8px 14px", borderRadius: 8, background: `${B.gold}22`, border: `1px solid ${B.gold}55`, color: B.gold, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 28 }}>
        {t("stub_coming_soon", lang)}
      </div>
      <div style={{ padding: "16px 18px", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.navyLight}`, maxWidth: 380, margin: "0 auto" }}>
        <div style={{ fontSize: 12, color: B.textDim, marginBottom: 8 }}>{t("stub_meanwhile", lang)}</div>
        <a href={`https://wa.me/${numero}?text=${msg}`} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", padding: "10px 18px", background: B.success, color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
          💬 {t("stub_write_whatsapp", lang)}
        </a>
      </div>
    </div>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────
function CenteredMessage({ icon, title, sub }) {
  return (
    <div style={{ background: B.bg, minHeight: "100vh", color: B.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div>
        <div style={{ fontSize: 64, marginBottom: 16 }}>{icon}</div>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em", marginBottom: 8 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: B.textDim, maxWidth: 300 }}>{sub}</div>}
      </div>
    </div>
  );
}
