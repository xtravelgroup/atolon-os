// BookingPopup.jsx — Embeddable booking widget (light theme)
// Route: /booking?tipo=vip-pass&lang=es
// Or: /booking (shows product selector first)

import { useState, useEffect, useRef } from "react";
import { COP } from "../brand";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";
import AtolanTrack from "../lib/AtolanTrack";
import { gtmViewItem, gtmBeginCheckout, gtmAddPaymentInfo, gtmAbandon } from "../lib/gtm";

// ── Palette (light theme) ───────────────────────────────────────────────────
const C = {
  bg:         "#FFFFFF",
  bgCard:     "#F8F8F6",
  bgHover:    "#F0F4FF",
  primary:    "#0D1B3E",
  accent:     "#1B4FD8",
  accentLight:"#EEF2FF",
  text:       "#0F172A",
  textMid:    "#475569",
  textLight:  "#94A3B8",
  border:     "#E2E8F0",
  success:    "#16A34A",
  successBg:  "#F0FDF4",
  danger:     "#DC2626",
  sand:       "#C8B99A",
  divider:    "#F1F5F9",
};

// ── Product catalog ─────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    slug:         "vip-pass",
    pasadiaId:    "PAS-VIP",
    tipo:         "VIP Pass",
    precio:       320000,  // adultos público
    precioNeto:   320000,  // adultos neto (igual para web directo)
    precioNino:   240000,  // niños público
    precioNetoNino: 210000, // niños neto
    noNinos:      false,
    minA:         1,
    icon:         "🌴",
    color:        "#0D1B3E",
    desc:         "Acceso full day · Lancha ida y vuelta · Cóctel de bienvenida · Almuerzo con postre · Cama de playa · Toallas · WiFi",
    desc_en:      "Full day access · Round-trip boat transfer · Welcome cocktail · Lunch with dessert · Beach lounger · Towels · WiFi",
    includes:     ["Lancha ida y vuelta", "Cóctel de bienvenida", "Almuerzo con postre", "Cama de playa VIP", "Toallas", "WiFi"],
    includes_en:  ["Round-trip boat transfer", "Welcome cocktail", "Lunch with dessert", "VIP beach lounger", "Towels", "WiFi"],
  },
  {
    slug:         "exclusive-pass",
    pasadiaId:    "PAS-EXC",
    tipo:         "Exclusive Pass",
    precio:       590000,
    precioNeto:   590000,
    precioNino:   0,
    precioNetoNino: 0,
    noNinos:      true,   // no aplica para niños ni infantes
    minA:         2,
    icon:         "⭐",
    color:        "#7C3AED",
    desc:         "Experiencia premium con pool cabana · Zona privada · Open bar · Atención personalizada. Mínimo 2 personas.",
    desc_en:      "Premium experience with pool cabana · Private area · Open bar · Personalized service. Minimum 2 people.",
    includes:     ["Todo del VIP Pass", "Zona privada reservada", "Open bar premium", "Atención personalizada"],
    includes_en:  ["Everything in VIP Pass", "Reserved private area", "Premium open bar", "Personalized service"],
  },
  {
    slug:         "atolon-experience",
    pasadiaId:    "PAS-EXP",
    tipo:         "Atolon Experience",
    precio:       1100000,
    precioNeto:   1100000,
    precioNino:   0,
    precioNetoNino: 0,
    noNinos:      true,   // no aplica para niños ni infantes
    minA:         4,
    icon:         "🛥️",
    color:        "#0E7490",
    desc:         "Máximo lujo 100% consumible · Traslado en yate privado · Chef a bordo · Menú degustación · Acceso VIP. Mínimo 4 personas.",
    desc_en:      "Ultimate luxury, 100% redeemable on Food & Beverage · Private yacht transfer · On-board chef · Tasting menu · Full VIP access. Minimum 4 people.",
    includes:     ["Transfer en yate privado", "Chef a bordo", "Menú degustación", "Acceso VIP todas las áreas", "Experiencia personalizada"],
    includes_en:  ["Private yacht transfer", "On-board chef", "Tasting menu", "Full VIP area access", "Personalized experience"],
  },
  {
    slug:         "vip-pass-grupo",
    pasadiaId:    "PAS-1775870973208",
    tipo:         "VIP Pass (Bebida + Impuesto de Muelle)",
    tipo_en:      "VIP Pass (Beverage & Port Tax Included)",
    precio:       380000,
    precioNeto:   380000,
    precioNino:   270000,
    precioNetoNino: 270000,
    noNinos:      false,
    minA:         1,
    icon:         "🌴",
    color:        "#0D1B3E",
    desc:         "Bebida incluida · Impuesto de Muelle incluido · Acceso al beach club",
    desc_en:      "Welcome Drink · Port tax included · Beach club access",
    includes:     ["Bebida de bienvenida", "Impuesto de Muelle", "Acceso al beach club"],
    includes_en:  ["Welcome Drink", "Port tax", "Beach club access"],
  },
  {
    slug:         "after-island",
    pasadiaId:    "PAS-AFT",
    tipo:         "After Island",
    noSalida:     true,  // no departure time — asks for vessel name + arrival time
    precio:       170000,  // adultos público
    precioNeto:   170000,
    precioNino:   120000,  // niños público
    precioNetoNino: 100000, // niños neto (+ $50.000 consumibles)
    noNinos:      false,
    ninoNota:     "+$50.000 consumibles incluidos",
    ninoNota_en:  "+$50,000 consumables included",
    minA:         1,
    icon:         "🌙",
    color:        "#B45309",
    desc:         "Llega en tu propia embarcación · Disfruta la isla al atardecer con música, coctelería y vistas únicas.",
    desc_en:      "Arrive on your own vessel · Enjoy the island at sunset with music, cocktails and stunning views.",
    includes:     ["Traslado en lancha", "Acceso tarde–noche", "Barra de cócteles", "Música y DJ"],
    includes_en:  ["Boat transfer", "Afternoon–night access", "Cocktail bar", "Music & DJ"],
  },
];

// ── Calendar helpers ─────────────────────────────────────────────────────────
const MONTH_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTH_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW_ES   = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"];
const DOW_EN   = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function isoToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
function isoDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function firstDow(y, m) { // 0=Mon
  const d = new Date(y, m, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}
function fmtDate(iso, lang) {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-");
  const months = lang === "en" ? MONTH_EN : MONTH_ES;
  return `${parseInt(d)} ${months[parseInt(mo) - 1]} ${y}`;
}

// ── Abandoned Cart helpers ───────────────────────────────────────────────────
function acNanoid(n = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Main component ───────────────────────────────────────────────────────────
export default function BookingPopup() {
  const params  = new URLSearchParams(window.location.search);
  // Support both /booking?tipo=after-island and /booking/after-island
  const pathSlug = window.location.pathname.replace(/^\/booking\/?/, "").split("?")[0] || "";
  const tipoQ   = params.get("tipo") || pathSlug || "";
  const grupoQ  = params.get("grupo") || "";   // grupo mode: EVT-xxx
  const recoveryTokenQ = params.get("r") || "";  // Recovery link token
  // Auto-detect device language if ?lang= not explicitly set
  const deviceLang = navigator.language?.slice(0, 2).toLowerCase() || "es";
  const initLang = (params.get("lang") || (deviceLang === "en" ? "en" : "es")).toLowerCase();
  const [langQ, setLangQ] = useState(initLang);
  const isEN    = langQ === "en";

  const switchLang = (l) => {
    setLangQ(l);
    // Actualizar URL sin recargar la página
    const sp = new URLSearchParams(window.location.search);
    sp.set("lang", l);
    window.history.replaceState(null, "", "?" + sp.toString());
  };

  const matchedProduct = PRODUCTS.find(p => p.slug === tipoQ || p.tipo === tipoQ) || null;

  const [product,    setProduct]   = useState(matchedProduct);
  const [grupoEvt,   setGrupoEvt]  = useState(null);  // the group event record
  const [grupoLock,  setGrupoLock] = useState(false);  // date/salida locked by group
  const [calYear,    setCalYear]   = useState(() => { const n = new Date(); return n.getFullYear(); });
  const [calMonth,   setCalMonth]  = useState(() => { const n = new Date(); return n.getMonth(); });
  const [selDate,    setSelDate]   = useState("");
  const [paxA,       setPaxA]      = useState(matchedProduct ? matchedProduct.minA : 1);
  const [paxN,       setPaxN]      = useState(0);  // niños hasta 11
  const [edadesNinos, setEdadesNinos] = useState([]); // array de edades por niño
  const [paxI,       setPaxI]      = useState(0);  // infants 0-2
  const [step,       setStep]      = useState(matchedProduct ? 1 : 0); // 0=select, 1=booking, 2=info, 3=done
  const [form,      setForm]      = useState({ nombre: "", email: "", telefono: "", notas: "" });

  // ── Abandoned Cart state ─────────────────────────────────────────────────
  const acCartIdRef  = useRef(null);  // ID del cart en ac_carts
  const [errors,    setErrors]    = useState({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [linkPago,  setLinkPago]  = useState("");
  const [dispon,      setDispon]      = useState({}); // ISO → remaining total
  const [cierres,     setCierres]     = useState([]); // dates closed
  const [salidas,     setSalidas]     = useState([]); // all active salidas
  const [selSalida,   setSelSalida]   = useState(null); // selected salida object
  const [disponSal,   setDisponSal]   = useState({}); // salida_id → spots remaining for selDate
  const [embarcacion, setEmbarcacion] = useState(""); // After Island: vessel name
  const [horaLlegada, setHoraLlegada] = useState(""); // After Island: estimated arrival time
  const [loadingSal,  setLoadingSal]  = useState(false);
  const [fotoPrincipal, setFotoPrincipal] = useState("");
  const [fotosExtra,    setFotosExtra]    = useState([]);
  const [fotoActiva,    setFotoActiva]    = useState(0); // index of displayed photo
  const [upsells,       setUpsells]       = useState([]);
  const [selUpsells,    setSelUpsells]    = useState([]); // selected addon upsells
  const [loadingUps,    setLoadingUps]    = useState(false);
  const [incluye,       setIncluye]       = useState([]); // items from pasadia_incluye
  const [leadId,        setLeadId]        = useState("");

  // AtolanTrack: init on mount, mark funnel step 1
  useEffect(() => {
    AtolanTrack.init().then(() => {
      AtolanTrack.evento("booking_widget_visto", { lang: langQ }, "booking");
      AtolanTrack.embudo_paso(1, { lang: langQ });
      AtolanTrack.setCurrentStep(1);
      if (langQ !== "es") AtolanTrack.setLang(langQ);
    });
  }, []);

  // ── Recovery link: pre-fill cart from token ──────────────────────────────
  useEffect(() => {
    if (!recoveryTokenQ || !supabase) return;
    supabase.from("ac_carts")
      .select("*")
      .eq("recovery_token", recoveryTokenQ)
      .maybeSingle()
      .then(({ data: cart }) => {
        if (!cart) return;
        if (cart.recovery_expires_at && new Date(cart.recovery_expires_at) < new Date()) return;
        // Guardar cart ID para actualizaciones
        acCartIdRef.current = cart.id;
        // Pre-llenar datos del usuario
        if (cart.nombre || cart.email || cart.telefono) {
          setForm(f => ({
            ...f,
            nombre:   cart.nombre   || f.nombre,
            email:    cart.email    || f.email,
            telefono: cart.telefono || f.telefono,
          }));
        }
        // Pre-seleccionar producto
        if (cart.tipo_pase) {
          const prod = PRODUCTS.find(p => p.slug === cart.tipo_pase || p.tipo === cart.producto);
          if (prod) {
            setProduct(prod);
            setPaxA(Math.max(cart.pax_adultos || prod.minA, prod.minA));
            setPaxN(cart.pax_ninos || 0);
          }
        }
        // Pre-seleccionar fecha
        if (cart.fecha_visita) {
          const fechaStr = cart.fecha_visita.substring(0, 10);
          if (fechaStr >= new Date().toLocaleDateString("en-CA")) {
            setSelDate(fechaStr);
            const [y, m] = fechaStr.split("-");
            setCalYear(Number(y));
            setCalMonth(Number(m) - 1);
          }
        }
        // Saltar al paso de info si tenemos producto y fecha
        if (cart.tipo_pase && cart.fecha_visita) setStep(2);
        else if (cart.tipo_pase) setStep(1);
      });
  }, [recoveryTokenQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track funnel abandonment on unmount (user navigates away)
  useEffect(() => {
    return () => {
      if (AtolanTrack.currentStep > 0 && AtolanTrack.currentStep < 6) {
        gtmAbandon(AtolanTrack.currentStep, AtolanTrack._abandonmentPayload?.monto_potencial);
      }
      AtolanTrack.embudo_abandono(AtolanTrack.currentStep);
    };
  }, []);

  // AtolanTrack: paso 4 debounced on email input
  const _emailDebounceRef = useRef(null);
  const _prevPaxRef = useRef({ a: 1, n: 0 });
  const _acDebounceRef = useRef(null);
  useEffect(() => {
    if (!form.email) return;
    clearTimeout(_emailDebounceRef.current);
    _emailDebounceRef.current = setTimeout(() => {
      AtolanTrack.embudo_paso(4, { email: form.email });
    }, 800);
    return () => clearTimeout(_emailDebounceRef.current);
  }, [form.email]);

  // ── Abandoned Cart: crear/actualizar registro cuando se captura el email ──
  useEffect(() => {
    const emailOk = form.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
    if (!emailOk || !supabase) return;
    clearTimeout(_acDebounceRef.current);
    _acDebounceRef.current = setTimeout(async () => {
      try {
        const now   = new Date().toISOString();
        const sesId = AtolanTrack._sesionId ?? null;
        // Detectar device type
        const isMob = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
        const deviceType = isMob ? "mobile" : "desktop";
        // UTMs desde sessionStorage / AtolanTrack
        const utms  = AtolanTrack._utms ?? {};
        const landing = sessionStorage.getItem("ac_landing") || window.location.origin + "/booking";

        if (!acCartIdRef.current) {
          // Primero: verificar si hay un cart reciente con el mismo email
          const { data: existingCart } = await supabase
            .from("ac_carts")
            .select("id, estado")
            .eq("email", form.email.toLowerCase().trim())
            .not("estado", "in", "(recovered,unsubscribed,expired,stopped)")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingCart) {
            acCartIdRef.current = existingCart.id;
          } else {
            acCartIdRef.current = `AC-${Date.now()}-${acNanoid(8)}`;
          }
        }

        const cartData = {
          id:                   acCartIdRef.current,
          sesion_id:            sesId,
          email:                form.email.toLowerCase().trim(),
          nombre:               form.nombre?.trim() || null,
          telefono:             form.telefono?.trim() || null,
          producto:             product?.tipo || null,
          tipo_pase:            product?.slug || null,
          pasadia_id:           product?.pasadiaId || null,
          fecha_visita:         selDate || null,
          pax_adultos:          paxA,
          pax_ninos:            paxN,
          edades_ninos:         edadesNinos.filter(e => e !== ""),
          pax_total:            paxA + paxN + paxI,
          valor_total:          (product?.precio || 0) * paxA + (product?.precioNino || 0) * paxN,
          moneda:               "COP",
          idioma:               langQ,
          device_type:          deviceType,
          utm_source:           utms.utm_source || null,
          utm_medium:           utms.utm_medium || null,
          utm_campaign:         utms.utm_campaign || null,
          utm_content:          utms.utm_content || null,
          utm_term:             utms.utm_term || null,
          landing_page:         landing,
          checkout_url:         window.location.href,
          estado:               "checkout_started",
          checkout_started_at:  now,
          updated_at:           now,
        };

        await supabase.from("ac_carts").upsert(cartData, { onConflict: "id" });
      } catch (err) {
        console.warn("[AC] Cart upsert error:", err?.message);
      }
    }, 1200);
    return () => clearTimeout(_acDebounceRef.current);
  }, [form.email, form.nombre, form.telefono, product?.slug, selDate, paxA, paxN]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track pax changes
  useEffect(() => {
    const prev = _prevPaxRef.current;
    if (prev.a !== paxA || prev.n !== paxN) {
      if (prev.a !== 1 || prev.n !== 0) { // skip initial render
        AtolanTrack.evento("pax_cambio", { adults: paxA, children: paxN, total: paxA + paxN + paxI }, "booking");
      }
      _prevPaxRef.current = { a: paxA, n: paxN };
    }
  }, [paxA, paxN]);

  // Load group event when ?grupo= param present
  useEffect(() => {
    if (!grupoQ || !supabase) return;
    supabase.from("eventos").select("*").eq("id", grupoQ).single().then(({ data }) => {
      if (!data) return;
      setGrupoEvt(data);
      // Case-insensitive match: evento.tipo puede venir con casing diferente (VIP PASS vs VIP Pass)
      const prod = PRODUCTS.find(p =>
        p.tipo === data.tipo ||
        p.tipo.toLowerCase() === (data.tipo || "").toLowerCase()
      );
      if (prod) {
        setProduct(prod);
        setPaxA(prod.minA);
      }
      if (data.fecha) {
        setSelDate(data.fecha);
        const [y, m] = data.fecha.split("-");
        setCalYear(Number(y));
        setCalMonth(Number(m) - 1);
      }
      setGrupoLock(true);
      setStep(1);
    });
  }, [grupoQ]);

  // In group mode, salidas come from grupoEvt.salidas_grupo — no auto-preselect needed

  // Load photos, includes, and live prices from DB for selected product
  useEffect(() => {
    if (!supabase || !product) return;
    // Run both fetches in parallel
    Promise.all([
      supabase.from("pasadias")
        .select("foto_principal_url, fotos_adicionales, precio, precio_neto_agencia, precio_nino, precio_neto_nino, nino_nota")
        .eq("id", product.pasadiaId).single(),
      supabase.from("pasadia_incluye").select("descripcion, descripcion_en").eq("pasadia_id", product.pasadiaId).order("orden"),
    ]).then(([{ data }, { data: incData }]) => {
      if (data) {
        setFotoPrincipal(data.foto_principal_url || "");
        setFotosExtra(data.fotos_adicionales || []);
        setFotoActiva(0);
        // Override hardcoded prices with live DB values
        setProduct(prev => ({
          ...prev,
          precio:         data.precio         ?? prev.precio,
          precioNeto:     data.precio_neto_agencia ?? prev.precioNeto,
          precioNino:     data.precio_nino     ?? prev.precioNino,
          precioNetoNino: data.precio_neto_nino ?? prev.precioNetoNino,
          ninoNota:       data.nino_nota       ?? prev.ninoNota,
          noNinos:        (data.precio_nino === 0 || data.precio_nino === null) ? true : prev.noNinos,
        }));
      }
      setIncluye(incData || []);
    });
  }, [product?.pasadiaId]); // only re-run when product ID changes, not on every price update

  // Load month-level availability + salidas catalog
  useEffect(() => {
    if (!supabase || !product) return;
    const y = calYear, m = calMonth;
    const from  = isoDate(y, m, 1);
    const toFix = `${y}-${String(m + 1).padStart(2,"0")}-${String(daysInMonth(y, m)).padStart(2,"0")}`;

    Promise.all([
      supabase.from("reservas").select("fecha, pax")
        .neq("estado", "cancelado").gte("fecha", from).lte("fecha", toFix),
      supabase.from("cierres").select("fecha, tipo").eq("activo", true)
        .gte("fecha", from).lte("fecha", toFix),
      supabase.from("salidas").select("id, hora, hora_regreso, nombre, capacidad_total, auto_apertura, orden").eq("activo", true).order("orden"),
    ]).then(([resR, cierreR, salR]) => {
      const sals = salR.data || [];
      setSalidas(sals);
      const cap = sals.filter(s => !s.auto_apertura)
        .reduce((s, r) => s + (r.capacidad_total || 0), 0) || 120;
      const paxByDate = {};
      (resR.data || []).forEach(r => {
        paxByDate[r.fecha] = (paxByDate[r.fecha] || 0) + (r.pax || 0);
      });
      const avail = {};
      for (let d = 1; d <= daysInMonth(y, m); d++) {
        const iso = isoDate(y, m, d);
        avail[iso] = Math.max(0, cap - (paxByDate[iso] || 0));
      }
      setDispon(avail);
      setCierres((cierreR.data || []).map(c => c.fecha));
    });
  }, [calYear, calMonth, product]);

  // Load salida-level availability when date changes
  useEffect(() => {
    if (!supabase || !selDate || salidas.length === 0) return;
    setLoadingSal(true);
    setSelSalida(null);
    Promise.all([
      supabase.from("reservas").select("salida_id, pax")
        .eq("fecha", selDate).neq("estado", "cancelado"),
      supabase.from("cierres").select("tipo, salidas").eq("fecha", selDate).eq("activo", true),
      supabase.from("salidas_override").select("salida_id, accion").eq("fecha", selDate),
    ]).then(([resR, cierreR, ovrR]) => {
      const paxBySalida = {};
      (resR.data || []).forEach(r => {
        if (r.salida_id) paxBySalida[r.salida_id] = (paxBySalida[r.salida_id] || 0) + (r.pax || 0);
      });
      const cierre = (cierreR.data || [])[0] || null;
      const ovrMap = {};
      (ovrR.data || []).forEach(o => { ovrMap[o.salida_id] = o.accion; });

      // 45-min cutoff: if date is today, close salidas within 45 mins (Colombia timezone)
      const isToday = selDate === isoToday();
      const nowMins = isToday ? (() => { const t = new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }); const [h, m] = t.split(":").map(Number); return h * 60 + m; })() : -1;

      const result = {};
      salidas.forEach(s => {
        // Check if this salida is available on this date
        if (ovrMap[s.id] === "cerrar") { result[s.id] = -1; return; }
        if (ovrMap[s.id] === "abrir")  { result[s.id] = Math.max(0, (s.capacidad_total || 30) - (paxBySalida[s.id] || 0)); return; }
        if (cierre) {
          if (cierre.tipo === "total") { result[s.id] = -1; return; }
          if ((cierre.salidas || []).includes(s.id)) { result[s.id] = -1; return; }
        }
        // Close sales 45 minutes before departure when booking for today
        if (isToday && s.hora) {
          const [h, m] = s.hora.split(":").map(Number);
          if (nowMins >= (h * 60 + m) - 45) { result[s.id] = -1; return; }
        }
        if (s.auto_apertura) {
          // Auto-open only if fixed salidas are 75%+ full
          const fixedSals = salidas.filter(f => !f.auto_apertura);
          const allFull = fixedSals.every(f => (paxBySalida[f.id] || 0) / (f.capacidad_total || 1) >= 0.75);
          if (!allFull) { result[s.id] = -1; return; }
        }
        result[s.id] = Math.max(0, (s.capacidad_total || 30) - (paxBySalida[s.id] || 0));
      });
      setDisponSal(result);
      setLoadingSal(false);
    });
  }, [selDate, salidas]);

  const today      = isoToday();
  const totalA     = product ? product.precio * paxA : 0;
  const totalN     = product ? (product.precioNino || 0) * paxN : 0;
  const totalExtras = selUpsells.reduce((s, u) => s + (u.por_persona ? u.precio * (paxA + paxN) : u.precio), 0);
  const total      = totalA + totalN + totalExtras;
  const paxTotal   = paxA + paxN + paxI;

  // AtolanTrack: paso 5 when reaching payment step
  useEffect(() => {
    if (step === 3) {
      AtolanTrack.embudo_paso(5, { producto: product?.tipo, package_type: product?.tipo, pax: paxTotal, pax_adultos: paxA, pax_ninos: paxN, fecha: selDate, valor: total, monto: total });
      AtolanTrack.setCurrentStep(5);
    }
  }, [step]);

  // Load upsells when reaching step 3 — skip entirely for group bookings
  useEffect(() => {
    if (step !== 3 || !supabase || !product) return;
    if (grupoEvt) {
      // Si el grupo YA es "VIP Pass (Bebida + Impuesto de Muelle)", no ofrecerlo como upsell
      if (grupoEvt.tipo === "VIP Pass (Bebida + Impuesto de Muelle)") {
        setUpsells([]);
        setLoadingUps(false);
        return;
      }
      // Para otros tipos de grupo, ofrecer VIP PASS como upsell con precio desde DB
      supabase.from("pasadias")
        .select("precio, precio_nino")
        .eq("id", "PAS-1775870973208")
        .maybeSingle()
        .then(({ data: vipPas }) => {
          const VIP_A = vipPas?.precio      || 380000;
          const VIP_N = vipPas?.precio_nino || 270000;
          const vipTotal = (paxA * VIP_A) + (paxN * VIP_N);
          const vipDesc  = paxN > 0
            ? `Bebida incluida · Impuesto de Muelle incluido · ${paxA} adulto${paxA !== 1 ? "s" : ""} × ${COP(VIP_A)} + ${paxN} niño${paxN !== 1 ? "s" : ""} × ${COP(VIP_N)}`
            : `Bebida incluida · Impuesto de Muelle incluido`;

          setUpsells([{
            id:          "vip_pass_grupo",
            nombre:      "VIP Pass",
            descripcion: vipDesc,
            precio:      vipTotal,
            por_persona: false,
            emoji:       "🌴",
            tipo:        "addon",
          }]);
          setLoadingUps(false);
        });
      return;
    }
    setLoadingUps(true);
    supabase.from("upsells").select("id, nombre, descripcion, precio, foto_url, emoji, tipo, upgrade_slug, por_persona, aplica_a, condicion_no_ninos, orden").eq("activo", true).order("orden").then(({ data }) => {
      const filtered = (data || []).filter(u => {
        if (u.aplica_a?.length > 0 && !u.aplica_a.includes(product.slug)) return false;
        if (u.condicion_no_ninos && paxN > 0) return false;
        return true;
      });
      setUpsells(filtered);
      setLoadingUps(false);
    });
  }, [step, product?.slug, paxA, paxN]);

  function selectProduct(p) {
    setProduct(p);
    setPaxA(p.minA);
    setPaxN(0);
    setPaxI(0);
    setSelDate("");
    setSelSalida(null);
    setStep(1);
    gtmViewItem(p);
    AtolanTrack.evento("product_view", { producto: p.tipo, precio: p.precio, pax: p.minA }, "booking");
    AtolanTrack.embudo_paso(3, { producto: p.tipo, package_type: p.tipo, pax: p.minA });
  }

  // When switching to noNinos product, clear children counts
  useEffect(() => {
    if (product?.noNinos) { setPaxN(0); setPaxI(0); }
  }, [product]);

  async function handleSelectDate(iso) {
    // Double-check cierre directly in DB (handles stale cache)
    if (supabase) {
      const { data: cierreCheck } = await supabase.from("cierres")
        .select("tipo").eq("fecha", iso).eq("activo", true).limit(1).maybeSingle();
      if (cierreCheck) return; // date is closed (total or partial) — block silently
    }
    setSelDate(iso);
    setSelSalida(null);
    AtolanTrack.evento("availability_search", { fecha: iso, producto: product?.tipo, pax: paxA + paxN }, "booking");
    AtolanTrack.embudo_paso(2, { fecha: iso, producto: product?.tipo, package_type: product?.tipo });
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
    AtolanTrack.evento("calendario_navegar", { direccion: "prev" }, "booking");
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
    AtolanTrack.evento("calendario_navegar", { direccion: "next" }, "booking");
  }

  function isDateDisabled(iso) {
    if (iso < today) return true;
    if (cierres.includes(iso)) return true;
    if (dispon[iso] !== undefined && dispon[iso] < (paxA + paxN)) return true;
    return false;
  }

  function validateForm() {
    const e = {};
    if (!form.nombre.trim()) e.nombre = isEN ? "Required" : "Campo requerido";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = isEN ? "Valid email required" : "Email inválido";
    if (!form.telefono.trim() || !/^[\d\s+\-()\\.]{7,}$/.test(form.telefono))
      e.telefono = isEN ? "Valid phone required" : "Teléfono inválido";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      AtolanTrack.evento("form_error", { fields: Object.keys(e), paso: step }, "booking");
    }
    return Object.keys(e).length === 0;
  }

  async function handleReservar(method = "wompi") {
    // Final guard: verify date is not closed before creating reservation
    if (supabase && selDate) {
      const { data: cierreCheck } = await supabase.from("cierres")
        .select("tipo").eq("fecha", selDate).eq("activo", true).limit(1).maybeSingle();
      if (cierreCheck?.tipo === "total") {
        setSaving(false);
        return;
      }
    }
    setSaving(true);
    const reservaId  = `WEB-${Date.now()}`;
    const linkExpira = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const grandTotal = totalA + totalN + selUpsells.reduce((s, u) => s + (u.por_persona ? u.precio * (paxA + paxN) : u.precio), 0);
    let   payUrl     = "";

    const redirectBase = `${window.location.origin}/pago?reserva=${reservaId}${leadId ? `&lead=${leadId}` : ""}`;

    if (method === "wompi") {
      payUrl = await wompiCheckoutUrl({ referencia: reservaId, totalCOP: grandTotal, email: form.email, redirectUrl: redirectBase });
    } else if (method === "stripe") {
      // "stripe" en la UI significa "tarjeta internacional" — ruteamos por el helper
      // que decide entre Stripe y Zoho Pay según configuracion.merchant_internacional
      try {
        const { crearSesionPago, getMerchantInternacional } = await import("../lib/internacional");
        const merchantInfo = await getMerchantInternacional();
        console.log("[Pago internacional] Merchant activo:", merchantInfo);
        // Convertir COP a USD (monto que usa Zoho/Stripe)
        const tasa = 4200; // fallback, el backend lee la tasa real si es necesario
        const amountUSD = Math.ceil(grandTotal / tasa);
        console.log("[Pago internacional] Llamando crearSesionPago", { amount: amountUSD, reference: reservaId });
        const session = await crearSesionPago({
          amount: amountUSD,
          currency: "USD",
          reference: reservaId,
          description: `${product.tipo} — ${selDate || ""}`,
          email: form.email,
          nombre: form.nombre,
          fecha: selDate,
          context: "reserva",
          context_id: reservaId,
        });
        console.log("[Pago internacional] Session OK:", session);
        payUrl = session.url;
      } catch (err) {
        console.error("[Pago internacional] Error:", err);
        AtolanTrack.paymentError("internacional", "session_create_failed", err?.message || "", grandTotal);
        alert(`Error pago internacional:\n${err?.message || err}\n\nIntenta con tarjeta nacional.`);
        setSaving(false);
        return;
      }
    }

    if (supabase) {
      await supabase.from("reservas").insert({
        id: reservaId,
        fecha:          selDate,
        salida_id:      selSalida?.id || grupoEvt?.salida_id || "S2",
        tipo:           product.tipo,
        canal:          grupoEvt ? "GRUPO" : "WEB",
        aliado_id:      grupoEvt?.aliado_id || null,
        grupo_id:       grupoEvt?.id || null,
        nombre:         form.nombre,
        email:          form.email,
        telefono:       form.telefono || null,
        contacto:       form.email,
        pax:            paxA + paxN,
        pax_a:          paxA,
        pax_n:          paxN,
        precio_u:       product.precio,
        total:          grandTotal,
        abono:          0,
        saldo:          grandTotal,
        estado:         "pendiente_pago",
        forma_pago:     method === "stripe" ? "tarjeta_internacional" : method,
        link_pago:      payUrl,
        link_expira_at: linkExpira,
        notas:          [
          embarcacion ? `Embarcación: ${embarcacion}` : null,
          horaLlegada ? `Llegada estimada: ${horaLlegada}` : null,
          paxI > 0 ? `Infants: ${paxI}` : null,
          edadesNinos.filter(e => e !== "").length > 0 ? `Edades niños: ${edadesNinos.filter(e => e !== "").join(", ")}` : null,
          selUpsells.length > 0 ? `Extras: ${selUpsells.map(u => u.nombre).join(", ")}` : null,
          form.notas || null,
        ].filter(Boolean).join(" | ") || null,
        qr_code:        `ATOLON-WEB-${Date.now()}`,
        lead_id:        leadId || null,
      });
    }
    // Track payment attempt (enriched)
    AtolanTrack.evento("payment_attempt", {
      metodo:        method,
      monto:         grandTotal,
      producto:      product?.tipo,
      pax_adultos:   paxA,
      pax_ninos:     paxN,
      pax_total:     paxTotal,
      fecha_visita:  selDate,
      salida:        selSalida?.hora || null,
      upsells:       selUpsells.map(u => u.nombre),
    }, "conversion");

    // AtolanTrack: full conversion with commercial data
    await AtolanTrack.conversion(reservaId, grandTotal, {
      metodo_pago:  method,
      package_type: product?.tipo,
      adultos:      paxA,
      ninos:        paxN,
      fecha:        selDate,
      salida:       selSalida?.hora || null,
      monto_bruto:  grandTotal,
    });

    // Abandoned Cart: vincular cart_id con reserva_id para recuperación
    if (acCartIdRef.current && supabase) {
      supabase.from("ac_carts").update({
        reserva_id:  reservaId,
        valor_total: grandTotal,
        updated_at:  new Date().toISOString(),
      }).eq("id", acCartIdRef.current).then(() => {}).catch(() => {});
    }

    setSaving(false);
    window.location.href = payUrl;
  }

  // ─── Shared UI helpers ──────────────────────────────────────────────────────
  function PaxRow({ label, sub, val, onDec, onInc, min = 0 }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${C.divider}` }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</div>
          {sub && <div style={{ fontSize: 12, color: C.textLight, marginTop: 1 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onDec} disabled={val <= min}
            style={{ width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${val <= min ? C.border : C.primary}`, background: "white", color: val <= min ? C.border : C.primary, fontSize: 18, lineHeight: 1, cursor: val <= min ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>−</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, minWidth: 20, textAlign: "center" }}>{val}</span>
          <button onClick={onInc}
            style={{ width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${C.primary}`, background: "white", color: C.primary, fontSize: 18, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>+</button>
        </div>
      </div>
    );
  }

  // ─── Step 0: Product selector ───────────────────────────────────────────────
  function ProductSelector() {
    return (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>
          {isEN ? "Select your experience" : "Selecciona tu experiencia"}
        </h2>
        <p style={{ fontSize: 13, color: C.textMid, marginBottom: 20 }}>
          Atolon Beach Club — Isla Tierra Bomba, Cartagena
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {PRODUCTS.filter(p => p.slug !== "vip-pass-grupo").map(p => (
            <div key={p.slug} onClick={() => selectProduct(p)}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 12, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.bgHover; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: C.bgCard, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{p.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{p.tipo}</div>
                <div style={{ fontSize: 12, color: C.textMid, marginTop: 2, lineHeight: 1.4 }}>{(isEN ? p.desc_en : p.desc).split("·")[0].trim()}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.accent }}>{COP(p.precio)}</div>
                <div style={{ fontSize: 11, color: C.textLight }}>{isEN ? "per person" : "por persona"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Step 1: Booking (participants + calendar + summary) ────────────────────
  function BookingStep() {
    const months = isEN ? MONTH_EN : MONTH_ES;
    const dows   = isEN ? DOW_EN : DOW_ES;
    const days   = daysInMonth(calYear, calMonth);
    const offset = firstDow(calYear, calMonth);
    const isPast = calYear < new Date().getFullYear() || (calYear === new Date().getFullYear() && calMonth < new Date().getMonth());

    const allPhotos = [fotoPrincipal, ...fotosExtra].filter(Boolean);

    // Modo organizador: solo mostrar mensaje de bloqueo
    if (grupoEvt?.modalidad_pago === "organizador") {
      return (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>💳</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 10 }}>
            {isEN ? "Group payment handled by organizer" : "Pago centralizado por el organizador"}
          </div>
          <div style={{ fontSize: 14, color: C.textMid, lineHeight: 1.7, maxWidth: 340, margin: "0 auto" }}>
            {isEN
              ? "The organizer of this group has already handled payment for all spots. Individual booking is not available."
              : "El organizador de este grupo ya gestionó el pago de todos los cupos. Las reservas individuales no están disponibles."}
          </div>
        </div>
      );
    }

    return (
      <div>
        {/* Photo gallery */}
        {allPhotos.length > 0 && (
          <div style={{ marginBottom: 20, borderRadius: 12, overflow: "hidden", position: "relative" }}>
            {/* Main image */}
            <div style={{ width: "100%", height: 220, position: "relative", background: C.bgCard, overflow: "hidden" }}>
              <img src={allPhotos[fotoActiva]} alt="pasadia"
                style={{ width: "100%", height: "100%", objectFit: "cover", transition: "opacity 0.25s" }} />
              {allPhotos.length > 1 && (
                <>
                  <button onClick={() => setFotoActiva(i => (i - 1 + allPhotos.length) % allPhotos.length)}
                    style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", color: "white", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                  <button onClick={() => setFotoActiva(i => (i + 1) % allPhotos.length)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", color: "white", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                  <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 5 }}>
                    {allPhotos.map((_, i) => (
                      <button key={i} onClick={() => setFotoActiva(i)}
                        style={{ width: i === fotoActiva ? 20 : 8, height: 8, borderRadius: 4, background: i === fotoActiva ? "white" : "rgba(255,255,255,0.5)", border: "none", cursor: "pointer", padding: 0, transition: "all 0.2s" }} />
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Thumbnails */}
            {allPhotos.length > 1 && (
              <div style={{ display: "flex", gap: 6, padding: "8px 0 0" }}>
                {allPhotos.map((url, i) => (
                  <button key={i} onClick={() => setFotoActiva(i)}
                    style={{ width: 56, height: 40, borderRadius: 6, overflow: "hidden", border: `2px solid ${i === fotoActiva ? C.accent : "transparent"}`, padding: 0, cursor: "pointer", flexShrink: 0, transition: "border-color 0.15s" }}>
                    <img src={url} alt={`thumb-${i}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Group event banner */}
        {grupoEvt && (
          <div style={{ background: "#EEF2FF", borderRadius: 10, padding: "12px 16px", marginBottom: 16, border: "1.5px solid #C7D2FE" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{isEN ? "Group Reservation" : "Reserva de Grupo"}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{grupoEvt.nombre}</div>
            <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>
              📅 {fmtDate(grupoEvt.fecha, langQ)}
              {(grupoEvt.salidas_grupo||[]).length > 0 && <> &nbsp;·&nbsp; ⛵ {[...grupoEvt.salidas_grupo].sort((a,b)=>a.hora.localeCompare(b.hora)).map(s => {
                const sal = salidas.find(x => x.id === s.id);
                return s.hora + (sal?.hora_regreso ? ` → ${sal.hora_regreso}` : "");
              }).join(" · ")}</>}
            </div>
          </div>
        )}


        {/* Product header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Atolon Beach Club · Isla Tierra Bomba</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>{product.icon}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{isEN && product.tipo_en ? product.tipo_en : product.tipo}</span>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{COP(product.precio)}</div>
              <div style={{ fontSize: 11, color: C.textLight }}>{isEN ? "per person" : "por persona"}</div>
            </div>
          </div>
        </div>

        {/* What's included — fallback a product.includes si la BD no tiene datos */}
        {(() => {
          const items = incluye.length > 0
            ? incluye.map(it => ({ es: it.descripcion, en: it.descripcion_en || it.descripcion }))
            : (isEN ? (product.includes_en || product.includes || []) : (product.includes || []))
                .map(txt => ({ es: txt, en: txt }));
          if (items.length === 0) return null;
          return (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: C.bgCard, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{isEN ? "What's included" : "Qué incluye"}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                {items.map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.textMid, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ color: C.success, fontWeight: 700 }}>✓</span> {isEN ? item.en : item.es}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Participants */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{isEN ? "Participants" : "Participantes"}</h3>
          <div style={{ borderTop: `1px solid ${C.divider}` }}>
            <PaxRow
              label={isEN ? "Adults" : "Adultos"}
              sub={isEN ? "Age 13+" : "Mayores de 12 años"}
              val={paxA}
              onDec={() => setPaxA(a => Math.max(product.minA, a - 1))}
              onInc={() => setPaxA(a => Math.min(50, a + 1))}
              min={product.minA}
            />
            {!product.noNinos && (
              <>
                <PaxRow
                  label={isEN ? "Children" : "Niños"}
                  sub={`${isEN ? "Up to 11 years" : "Hasta 11 años"} · ${COP(product.precioNino)}${product.ninoNota ? " · " + (isEN ? (product.ninoNota_en || product.ninoNota) : product.ninoNota) : ""}`}
                  val={paxN}
                  onDec={() => { setPaxN(n => Math.max(0, n - 1)); setEdadesNinos(e => e.slice(0, Math.max(0, paxN - 1))); }}
                  onInc={() => { setPaxN(n => Math.min(30, n + 1)); setEdadesNinos(e => [...e, ""]); }}
                />
                {paxN > 0 && (
                  <div style={{ padding: "10px 14px", background: "rgba(200,185,154,0.06)", borderRadius: 10, border: "1px solid rgba(200,185,154,0.15)" }}>
                    <div style={{ fontSize: 11, color: "#C8B99A", marginBottom: 8, fontWeight: 600 }}>
                      {isEN ? "Age of each child" : "Edad de cada niño"} <span style={{ opacity: 0.6 }}>({isEN ? "over 11 pays as adult" : "+11 se cobra como adulto"})</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
                      {Array.from({ length: paxN }).map((_, i) => (
                        <div key={i}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>{isEN ? `Child ${i + 1}` : `Niño ${i + 1}`}</div>
                          <input type="number" min="0" max="17"
                            value={edadesNinos[i] ?? ""}
                            onChange={e => {
                              const v = e.target.value;
                              const newArr = [...edadesNinos];
                              while (newArr.length < paxN) newArr.push("");
                              newArr[i] = v;
                              setEdadesNinos(newArr);
                              // Si la edad es > 11, mover a adulto automáticamente
                              if (Number(v) > 11) {
                                alert(isEN
                                  ? `A ${v} year old pays as adult (added to adults)`
                                  : `Un niño de ${v} años se cobra como adulto (movido a adultos)`);
                                setPaxA(a => a + 1);
                                setPaxN(n => Math.max(0, n - 1));
                                setEdadesNinos(prev => prev.filter((_, idx) => idx !== i));
                              }
                            }}
                            placeholder={isEN ? "Age" : "Edad"}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "#0D1B3E", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 13, textAlign: "center" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <PaxRow
                  label={isEN ? "Infants" : "Infantes"}
                  sub={isEN ? "Age 0 – 2 (free)" : "Edad 0 – 2 (sin costo)"}
                  val={paxI}
                  onDec={() => setPaxI(i => Math.max(0, i - 1))}
                  onInc={() => setPaxI(i => Math.min(10, i + 1))}
                />
              </>
            )}
          </div>
        </div>

        {/* Calendar — hidden when date is locked by group */}
        <div style={{ marginBottom: 24, display: grupoLock ? "none" : "block" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>{isEN ? "Select a date" : "Selecciona una fecha"}</h3>
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={prevMonth} disabled={isPast}
              style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "white", cursor: isPast ? "not-allowed" : "pointer", color: isPast ? C.border : C.primary, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{months[calMonth]} {calYear}</span>
            </div>
            <button onClick={nextMonth}
              style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "white", cursor: "pointer", color: C.primary, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </div>

          {/* Day of week headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
            {dows.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: C.textLight, padding: "4px 0", textTransform: "uppercase" }}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {Array(offset).fill(null).map((_, i) => <div key={`e${i}`} />)}
            {Array(days).fill(null).map((_, i) => {
              const day  = i + 1;
              const iso  = isoDate(calYear, calMonth, day);
              const past = iso < today;
              const closed = cierres.includes(iso);
              const full = dispon[iso] !== undefined && dispon[iso] < (paxA + paxN);
              const disabled = past || closed || full;
              const selected = iso === selDate;
              const isToday = iso === today;

              return (
                <button key={iso} onClick={() => !disabled && handleSelectDate(iso)}
                  disabled={disabled}
                  style={{
                    padding: "7px 2px",
                    borderRadius: 8,
                    border: selected ? `2px solid ${C.accent}` : isToday ? `2px solid ${C.textLight}` : "2px solid transparent",
                    background: selected ? C.accent : "transparent",
                    color: disabled ? C.border : selected ? "white" : C.text,
                    fontSize: 13,
                    fontWeight: selected ? 700 : 400,
                    cursor: disabled ? "not-allowed" : "pointer",
                    textDecoration: closed ? "line-through" : "none",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { if (!disabled && !selected) e.currentTarget.style.background = C.bgHover; }}
                  onMouseLeave={e => { if (!disabled && !selected) e.currentTarget.style.background = "transparent"; }}>
                  {day}
                </button>
              );
            })}
          </div>
          {selDate && (
            <div style={{ marginTop: 10, fontSize: 13, color: C.accent, fontWeight: 600, textAlign: "center" }}>
              ✓ {fmtDate(selDate, langQ)}
            </div>
          )}
        </div>

        {/* Salidas — group mode: solo buy-out groups necesitan seleccionar salida */}
        {grupoLock && grupoEvt?.buy_out && grupoEvt?.salidas_grupo?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              {isEN ? "Select departure time" : "Selecciona tu horario de salida"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...grupoEvt.salidas_grupo].sort((a,b) => a.hora.localeCompare(b.hora)).map(s => {
                const isSel = selSalida?.hora === s.hora;
                return (
                  <div key={s.hora} onClick={() => setSelSalida(s)}
                    style={{ padding: "14px 16px", borderRadius: 10, border: `2px solid ${isSel ? C.accent : C.border}`, background: isSel ? C.accentLight : C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isSel ? C.accent : C.text }}>
                        ⛵ {isEN ? "Departure" : "Salida"} {s.hora}
                      </div>
                      {(() => { const sal = salidas.find(x => x.id === s.id); return sal?.hora_regreso ? (
                        <div style={{ fontSize: 12, color: isSel ? C.accent : C.textMid, marginTop: 2 }}>
                          🔁 {isEN ? "Return" : "Regreso"}: <strong>{sal.hora_regreso}</strong>
                        </div>
                      ) : null; })()}
                    </div>
                    {isSel && <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>✓ {isEN ? "Selected" : "Seleccionado"}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* After Island — vessel name + arrival time instead of salida */}
        {product?.noSalida && !grupoLock && selDate && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              {isEN ? "Vessel details" : "Detalles de la embarcación"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 5 }}>
                  {isEN ? "Vessel / boat name" : "Nombre de la embarcación"}
                </label>
                <input
                  value={embarcacion}
                  onChange={e => setEmbarcacion(e.target.value)}
                  placeholder={isEN ? "e.g. Sea Breeze" : "Ej: Sea Breeze"}
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 5 }}>
                  {isEN ? "Estimated arrival time" : "Hora aproximada de llegada"}
                </label>
                <input
                  type="time"
                  value={horaLlegada}
                  onChange={e => setHoraLlegada(e.target.value)}
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Salidas (departure times) — regular mode */}
        {!grupoLock && !product?.noSalida && selDate && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              {isEN ? "Select departure time" : "Selecciona el horario de salida"}
            </h3>
            {loadingSal ? (
              <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: C.textLight }}>
                {isEN ? "Checking availability..." : "Verificando disponibilidad..."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {salidas.filter(s => disponSal[s.id] !== -1).length === 0 ? (
                  <div style={{ padding: "16px", background: "#FFF8F8", border: `1px solid #FEE2E2`, borderRadius: 10, fontSize: 13, color: C.danger, textAlign: "center" }}>
                    {isEN ? "No availability for this date. Please select another day." : "Sin disponibilidad para esta fecha. Por favor elige otro día."}
                  </div>
                ) : (
                  salidas.map(s => {
                    const spots    = disponSal[s.id];
                    const esGrupo  = (paxA + paxN) >= 10;
                    // Hide unavailable salidas unless it's a group (10+)
                    if ((spots === -1 || spots === undefined) && !esGrupo) return null;
                    const isSelected = selSalida?.id === s.id;
                    const salidaFull = !esGrupo && spots !== undefined && spots < (paxA + paxN);

                    return (
                      <div key={s.id}
                        onClick={() => !salidaFull && setSelSalida(s)}
                        style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "14px 16px", borderRadius: 10, cursor: salidaFull ? "not-allowed" : "pointer",
                          border: `2px solid ${isSelected ? C.accent : C.border}`,
                          background: isSelected ? C.accentLight : salidaFull ? C.bgCard : C.bg,
                          opacity: salidaFull ? 0.5 : 1, transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { if (!salidaFull && !isSelected) e.currentTarget.style.borderColor = C.accent; }}
                        onMouseLeave={e => { if (!salidaFull && !isSelected) e.currentTarget.style.borderColor = C.border; }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: isSelected ? C.accent : C.bgCard, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                          <span style={{ fontSize: 20 }}>{salidaFull ? "🚫" : "⛵"}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: isSelected ? C.accent : C.text }}>
                            {isEN ? "Departure" : "Salida"} {s.hora || s.id}
                          </div>
                          <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>
                            🕐 {isEN ? "Departure" : "Salida"}: <strong>{s.hora || "—"}</strong>
                            &nbsp;&nbsp;→&nbsp;&nbsp;
                            🔁 {isEN ? "Return" : "Regreso"}: <strong>{s.hora_regreso || s.regreso || "—"}</strong>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {salidaFull ? (
                            <span style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>{isEN ? "Full" : "Agotado"}</span>
                          ) : isSelected ? (
                            <div style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>✓ {isEN ? "Selected" : "Seleccionado"}</div>
                          ) : (
                            <div style={{ fontSize: 12, color: C.success, fontWeight: 600 }}>
                              {isEN ? "Available" : "Disponible"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Order summary */}
        <div style={{ background: C.bgCard, borderRadius: 12, padding: "16px 18px", marginBottom: 20, border: `1px solid ${C.border}` }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, borderBottom: `2px solid ${C.accent}`, paddingBottom: 8, display: "inline-block" }}>{isEN ? "Order summary" : "Comprobar el pedido"}</h3>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>{isEN && product.tipo_en ? product.tipo_en : product.tipo}</div>
          {[
            selDate && [isEN ? "Date" : "Fecha", fmtDate(selDate, langQ)],
            selSalida && [isEN ? "Departure" : "Salida", `${isEN ? "Departure" : "Salida"} ${selSalida.hora || selSalida.id}`],
            [isEN ? `Adults (${paxA}×)` : `Adultos (${paxA}×)`, COP(product.precio * paxA)],
            (!product.noNinos && paxN > 0) && [isEN ? `Children (${paxN}×)` : `Niños (${paxN}×)`, COP((product.precioNino || 0) * paxN)],
            (!product.noNinos && paxI > 0) && [isEN ? `Infants (${paxI}×)` : `Infantes (${paxI}×)`, isEN ? "Free" : "Gratis"],
          ].filter(Boolean).map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMid, padding: "4px 0" }}>
              <span>{k}</span><span>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Total:</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>{COP(total)}</span>
          </div>
          <div style={{ fontSize: 11, color: C.textLight, marginTop: 6 }}>{isEN ? "Prices in COP (Colombian Peso)" : "Precios en COP (Peso colombiano)"}</div>
        </div>

        {/* CTA button */}
        {(() => {
          const afterOk = product.noSalida ? (embarcacion.trim() && horaLlegada) : true;
          const ready = selDate && (selSalida || grupoLock || product.noSalida) && paxA >= product.minA && afterOk;
          return (
            <>
              <button
                onClick={() => { if (ready) { gtmBeginCheckout(product, paxTotal, total); setStep(2); AtolanTrack.evento("begin_checkout", { producto: product?.tipo, fecha: selDate, pax: paxTotal, valor: total }, "booking"); AtolanTrack.setCurrentStep(2); } }}
                disabled={!ready}
                style={{
                  width: "100%", padding: "15px 0", borderRadius: 10, border: "none",
                  background: ready ? C.primary : C.border,
                  color: ready ? "white" : C.textLight,
                  fontSize: 15, fontWeight: 700, cursor: ready ? "pointer" : "not-allowed",
                  letterSpacing: "0.03em", transition: "all 0.15s",
                }}>
                {isEN ? "Book Now →" : "Reservar →"}
              </button>
              {!selDate && (
                <p style={{ textAlign: "center", fontSize: 12, color: C.textLight, marginTop: 8 }}>
                  {isEN ? "Please select a date to continue" : "Selecciona una fecha para continuar"}
                </p>
              )}
              {selDate && !selSalida && !loadingSal && (
                <p style={{ textAlign: "center", fontSize: 12, color: C.textLight, marginTop: 8 }}>
                  {isEN ? "Please select a departure time" : "Selecciona un horario de salida"}
                </p>
              )}
            </>
          );
        })()}
      </div>
    );
  }

  // ─── Step 2: Personal info ───────────────────────────────────────────────────
  function InfoStep() {
    return (
      <div>
        <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: C.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 20, display: "flex", alignItems: "center", gap: 4 }}>
          ← {isEN ? "Back" : "Volver"}
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 18 }}>
          {isEN ? "Your information" : "Tus datos"}
        </h2>

        {/* Order recap */}
        <div style={{ background: C.bgCard, borderRadius: 10, padding: "12px 16px", marginBottom: 20, border: `1px solid ${C.border}`, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: C.textMid }}>{product.tipo}</span>
            <span style={{ fontWeight: 700, color: C.accent }}>{COP(total)}</span>
          </div>
          <div style={{ color: C.textMid }}>
            📅 {fmtDate(selDate, langQ)}
            {selSalida && <> &nbsp;·&nbsp; ⛵ {isEN ? "Departure" : "Salida"} {selSalida.hora || selSalida.id}</>}
            &nbsp;·&nbsp; 👥 {paxA + paxN} {isEN ? `person${paxA + paxN !== 1 ? "s" : ""}` : `persona${paxA + paxN !== 1 ? "s" : ""}`}{paxI > 0 ? ` + ${paxI} infante${paxI !== 1 ? "s" : ""}` : ""}
          </div>
        </div>

        {[
          { key: "nombre",   label: isEN ? "Full name" : "Nombre completo",     type: "text",  placeholder: isEN ? "John Smith" : "Juan García" },
          { key: "email",    label: isEN ? "Email" : "Correo electrónico",      type: "email", placeholder: "correo@ejemplo.com" },
          { key: "telefono", label: isEN ? "Phone" : "Teléfono / WhatsApp",     type: "tel",   placeholder: "+57 300 000 0000" },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
            <input
              type={type}
              value={form[key]}
              placeholder={placeholder}
              onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: null })); }}
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 8,
                border: `1.5px solid ${errors[key] ? C.danger : C.border}`,
                fontSize: 14, color: C.text, background: C.bg, outline: "none", boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = errors[key] ? C.danger : C.border}
            />
            {errors[key] && <div style={{ fontSize: 11, color: C.danger, marginTop: 3 }}>{errors[key]}</div>}
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{isEN ? "Notes / special requests (optional)" : "Notas / solicitudes especiales (opcional)"}</label>
          <textarea
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            rows={2}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg, outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>

        {/* T&C */}
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>
            {isEN ? "By continuing, I accept the terms and conditions." : "Al continuar, acepto los términos y condiciones."}
          </span>
        </div>

        <button onClick={async () => {
          if (!validateForm()) return;
          AtolanTrack.evento("guest_info_completed", { producto: product?.tipo, pax: paxTotal, fecha: selDate }, "booking");
          // Crear lead en Comercial con stage "Nuevo"
          if (supabase) {
            const lid = `LEAD-WEB-${Date.now()}`;
            const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
            await supabase.from("leads").insert({
              id:             lid,
              nombre:         form.nombre,
              contacto:       form.nombre,
              email:          form.email,
              tel:            form.telefono,
              canal:          grupoEvt ? "GRUPO" : "WEB",
              vendedor:       grupoEvt?.vendedor || "Web",
              stage:          "Nuevo",
              valor_est:      total,
              fecha_creacion: hoy,
              ultimo_contacto:hoy,
              notas:          grupoEvt
                ? `GRUPO: ${grupoEvt.nombre} · ${product.tipo} · ${selDate} · ${paxA + paxN} pax`
                : `${product.tipo} · ${selDate} · ${paxA + paxN} pax · Inicio de compra online`,
              etiquetas:      grupoEvt ? ["grupo", product.slug, grupoEvt.id] : ["web", product.slug],
            });
            setLeadId(lid);
          }
          setStep(3);
        }}
          style={{ width: "100%", padding: "15px 0", borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.03em", marginBottom: 10 }}>
          {isEN ? "Continue →" : "Continuar →"}
        </button>
        <div style={{ textAlign: "center", fontSize: 11, color: C.textLight }}>
          🔒 {isEN ? "Secure payment · Cancellation policy applies" : "Pago seguro · Aplica política de cancelación"}
        </div>

        {/* Hidden — payment buttons moved to upsell step */}
        <div style={{ display: "none" }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {isEN ? "Select payment method" : "Método de pago"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Tarjeta Nacional → Wompi */}
            <button onClick={() => handleReservar("wompi")} disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 18px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: saving ? "wait" : "pointer", textAlign: "left", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#5B4CF5"; e.currentTarget.style.background = "#F5F3FF"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, color: "white", fontSize: 16 }}>W</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{isEN ? "National Card" : "Tarjeta Nacional"}</div>
                <div style={{ fontSize: 12, color: C.textMid }}>PSE · Nequi · Bancolombia · Visa / Mastercard Colombia</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#5B4CF5" }}>{COP(total)}</div>
            </button>

            {/* Tarjeta Internacional → Stripe */}
            <button onClick={() => handleReservar("stripe")} disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 18px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: saving ? "wait" : "pointer", textAlign: "left", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#635BFF"; e.currentTarget.style.background = "#F5F3FF"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#635BFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, color: "white", fontSize: 16 }}>S</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{isEN ? "International Card" : "Tarjeta Internacional"}</div>
                <div style={{ fontSize: 12, color: C.textMid }}>Visa · Mastercard · Amex · Apple Pay · Google Pay</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#635BFF" }}>{COP(total)}</div>
            </button>
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#FFF7E6", border: "1px solid #F5C842", borderRadius: 8, fontSize: 11, color: "#92400E", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ fontSize: 14 }}>💳</span>
              <span>
                {isEN
                  ? <>The international card charge will appear on your statement as <strong>X Travel Group</strong>.</>
                  : <>El cargo con tarjeta internacional aparecerá en tu estado de cuenta a nombre de <strong>X Travel Group</strong>.</>}
              </span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: C.textLight }}>
          🔒 {isEN ? "Secure payment · No refunds policy" : "Pago seguro · Política de no reembolso"}
        </div>
        </div>{/* end hidden */}
      </div>
    );
  }

  // ─── Step 3: Upsells ────────────────────────────────────────────────────────
  function UpsellStep() {
    const toggleAddon = (u) => {
      setSelUpsells(prev =>
        prev.find(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u]
      );
    };

    const doUpgrade = (u) => {
      const newProd = PRODUCTS.find(p => p.slug === u.upgrade_slug);
      if (!newProd) return;
      if (newProd.noNinos) { setPaxN(0); setPaxI(0); }
      setSelUpsells([]);
      setUpsells([]);  // clear so the new product's upsells load
      setProduct(newProd);
    };

    const grandTotal = totalA + totalN + selUpsells.reduce((s, u) => s + (u.por_persona ? u.precio * (paxA + paxN) : u.precio), 0);

    return (
      <div>
        <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: C.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 20, display: "flex", alignItems: "center", gap: 4 }}>
          ← {isEN ? "Back" : "Volver"}
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          {grupoEvt ? (isEN ? "Complete your booking" : "Completa tu reserva") : (isEN ? "Complete your experience" : "Completa tu experiencia")}
        </h2>
        {!grupoEvt && (
          <p style={{ fontSize: 13, color: C.textMid, marginBottom: 22 }}>
            {isEN ? "Add extras before paying" : "Agrega opciones especiales antes de pagar"}
          </p>
        )}

        {loadingUps ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: C.textLight, fontSize: 13 }}>...</div>
        ) : upsells.length === 0 ? null : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {upsells.map(u => {
              const isUpg      = u.tipo === "upgrade";
              const isSelected = selUpsells.find(x => x.id === u.id);
              const uPrice     = u.por_persona ? u.precio * (paxA + paxN) : u.precio;

              return (
                <div key={u.id} style={{
                  borderRadius: 12, overflow: "hidden",
                  border: `2px solid ${isSelected ? C.accent : isUpg ? "#7C3AED44" : C.border}`,
                  background: isSelected ? C.accentLight : isUpg ? "#F5F3FF" : C.bg,
                  transition: "all 0.15s",
                }}>
                  {u.foto_url && (
                    <div style={{ height: 130, overflow: "hidden" }}>
                      <img src={u.foto_url} alt={u.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <div style={{ padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                    {!u.foto_url && <div style={{ width: 48, height: 48, borderRadius: 12, background: isUpg ? "#EDE9FE" : C.bgCard, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{u.emoji}</div>}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: isUpg ? "#5B21B6" : C.text }}>{u.nombre}</span>
                        {isUpg && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "#DDD6FE", color: "#5B21B6", fontWeight: 700 }}>UPGRADE</span>}
                      </div>
                      {u.descripcion && <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5, marginBottom: 6 }}>{u.descripcion}</div>}
                      <div style={{ fontSize: 14, fontWeight: 800, color: isUpg ? "#5B21B6" : C.accent }}>
                        +{COP(uPrice)}
                        <span style={{ fontSize: 11, fontWeight: 400, color: C.textLight, marginLeft: 4 }}>
                          {u.por_persona ? `(${paxA + paxN} persona${paxA + paxN !== 1 ? "s" : ""})` : "precio fijo"}
                        </span>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {isUpg ? (
                        <button onClick={() => doUpgrade(u)}
                          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#5B21B6", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                          {isEN ? "Upgrade →" : "Hacer Upgrade →"}
                        </button>
                      ) : (
                        <button onClick={() => toggleAddon(u)}
                          style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${isSelected ? C.accent : C.border}`, background: isSelected ? C.accent : "white", color: isSelected ? "white" : C.text, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}>
                          {isSelected ? "✓ Agregado" : (isEN ? "Add" : "Agregar")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Order total preview */}
        <div style={{ background: C.bgCard, borderRadius: 10, padding: "12px 16px", marginBottom: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 8 }}>{isEN ? "Order summary" : "Resumen"}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMid, marginBottom: 4 }}>
            <span>{product.tipo} × {paxA + paxN}</span>
            <span>{COP(totalA + totalN)}</span>
          </div>
          {selUpsells.map(u => (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.accent, marginBottom: 4 }}>
              <span>+ {u.nombre}</span>
              <span>{COP(u.por_persona ? u.precio * (paxA + paxN) : u.precio)}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Total:</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: C.accent }}>{COP(grandTotal)}</span>
          </div>
        </div>

        {/* Payment method buttons */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {isEN ? "Select payment method" : "Método de pago"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Wompi — show if integrity key configured */}
            {import.meta.env.VITE_WOMPI_INTEGRITY_KEY && (
              <button onClick={() => { gtmAddPaymentInfo("wompi", grandTotal); AtolanTrack.evento("payment_method_selected", { metodo: "wompi", monto: grandTotal }, "conversion"); handleReservar("wompi"); }} disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 18px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: saving ? "wait" : "pointer", textAlign: "left", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#5B4CF5"; e.currentTarget.style.background = "#F5F3FF"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, color: "white", fontSize: 16 }}>W</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{isEN ? "National Card" : "Tarjeta Nacional"}</div>
                  <div style={{ fontSize: 12, color: C.textMid }}>PSE · Nequi · Bancolombia · Visa / Mastercard Colombia</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#5B4CF5" }}>{COP(grandTotal)}</div>
              </button>
            )}

            {/* Stripe — tarjeta internacional */}
            <button onClick={() => { gtmAddPaymentInfo("stripe", grandTotal); AtolanTrack.evento("payment_method_selected", { metodo: "stripe", monto: grandTotal }, "conversion"); handleReservar("stripe"); }} disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 18px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: saving ? "wait" : "pointer", textAlign: "left", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#635BFF"; e.currentTarget.style.background = "#F5F3FF"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#635BFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, color: "white", fontSize: 16 }}>S</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{isEN ? "International Card" : "Tarjeta Internacional"}</div>
                <div style={{ fontSize: 12, color: C.textMid }}>Visa · Mastercard · Amex · Apple Pay · Google Pay</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#635BFF" }}>{COP(grandTotal)}</div>
            </button>
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#FFF7E6", border: "1px solid #F5C842", borderRadius: 8, fontSize: 11, color: "#92400E", display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ fontSize: 14 }}>💳</span>
              <span>
                {isEN
                  ? <>The international card charge will appear on your statement as <strong>X Travel Group</strong>.</>
                  : <>El cargo con tarjeta internacional aparecerá en tu estado de cuenta a nombre de <strong>X Travel Group</strong>.</>}
              </span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: C.textLight }}>
          🔒 {isEN ? "Secure payment · No refunds policy" : "Pago seguro · Política de no reembolso"}
        </div>
      </div>
    );
  }

  // ─── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Segoe UI', Arial, sans-serif", color: C.text, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px 60px" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>

        {/* Brand header */}
        <div style={{ position: "relative", textAlign: "center", marginBottom: 20 }}>
          <a href="https://www.atoloncartagena.com" target="_blank" rel="noopener noreferrer">
            <img src="/atolon-peces.png" alt="Atolon Beach Club" style={{ height: 195, objectFit: "contain", display: "block", margin: "0 auto" }} />
          </a>
          <div style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)", display: "flex", gap: 4 }}>
            {["es","en"].map(l => (
              <button key={l} onClick={() => switchLang(l)}
                style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: langQ === l ? C.primary : "white", color: langQ === l ? "white" : C.textMid, border: `1px solid ${langQ === l ? C.primary : C.border}`, cursor: "pointer" }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Main card */}
        <div style={{ background: C.bg, borderRadius: 16, padding: "24px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.07)", border: `1px solid ${C.border}` }}>
          {step === 0 && ProductSelector()}
          {step === 1 && product && BookingStep()}
          {step === 2 && product && InfoStep()}
          {step === 3 && product && UpsellStep()}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.textLight, lineHeight: 1.9 }}>
          <div>Atolon Beach Club</div>
          <div>
            <a href="mailto:reservas@atoloncartagena.com" style={{ color: C.primary, textDecoration: "none" }}>reservas@atoloncartagena.com</a>
          </div>
          <div>
            <a href="https://www.atoloncartagena.com" target="_blank" rel="noopener noreferrer" style={{ color: C.primary, textDecoration: "none" }}>www.atoloncartagena.com</a>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 10 }}>
          <a href="/" style={{ fontSize: 11, color: C.textLight, textDecoration: "none", opacity: 0.5 }}>
            Portal Agencias
          </a>
          <a href="/login" style={{ fontSize: 11, color: C.textLight, textDecoration: "none", opacity: 0.5 }}>
            Colaborador Login
          </a>
        </div>
      </div>
    </div>
  );
}
