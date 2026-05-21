// BookingPopup.jsx — Embeddable booking widget (light theme)
// Route: /booking?tipo=vip-pass&lang=es
// Or: /booking (shows product selector first)

import { useState, useEffect, useRef } from "react";
import { COP } from "../brand";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";
import AtolanTrack from "../lib/AtolanTrack";
import { gtmViewItem, gtmBeginCheckout, gtmAddPaymentInfo, gtmAbandon } from "../lib/gtm";
// FacturaElectronicaForm + Toggle: en mobile se renderizan dentro del step 2
// (UX original). En desktop la captura se movió a la pantalla post-pago.
import FacturaElectronicaForm, { FacturaElectronicaToggle, FE_EMPTY, fePayload } from "../lib/FacturaElectronicaForm.jsx";
import ZohoPaymentWidget from "../components/ZohoPaymentWidget.jsx";
import { crearSesionPago, getMerchantInternacional } from "../lib/internacional";
import { useBreakpoint } from "../lib/responsive";

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
  const { isDesktop: breakpointIsDesktop } = useBreakpoint();
  const params  = new URLSearchParams(window.location.search);

  // ── view=full → fuerza el layout legacy (single-column 480px) ──
  // Los redirects /wa/* (WhatsApp) añaden ?view=full al destino para que el
  // usuario que llega por un link compartido vea el booking original (mobile-style),
  // no la versión 2-col compacta optimizada para el iframe de Sky.
  // Mobile preservó la UX original (commit 796ec4c), así que con isDesktop=false
  // el componente cae automáticamente a la rama "original" en todos los ternarios.
  const viewFull = params.get("view") === "full";
  const isDesktop = viewFull ? false : breakpointIsDesktop;

  // ── Detección de modo embebido (iframe) ──
  // Si estamos dentro de un iframe (e.g. atoloncartagena.com en Webflow),
  // el layout cambia: altura adaptable al iframe, scroll interno por columna,
  // sin logo grande ni footer, header reducido al toggle ES|EN. Esto evita
  // tener que ajustar pixeles uno por uno cada vez que el contenido crece.
  const [isEmbedded] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.self !== window.top; } catch { return true; /* cross-origin → asumimos embebido */ }
  });

  // Layout iframe-fit: solo en desktop. En mobile (aunque esté embebido)
  // mantenemos la UX original con scroll de página completo, logo grande,
  // padding generoso. Ningún cambio de hoy aplica a mobile.
  const iframeFit = isEmbedded && isDesktop;

  // ── Auto-resize del iframe en el parent (Webflow / atoloncartagena) ──
  // Cuando NO usamos altura adaptable (iframe con height fijo legacy), el
  // parent puede escuchar `atolon-booking-height` para ajustar el iframe.
  // Con el nuevo layout (height: 100vh) este postMessage queda como fallback
  // por si algún parent aún no migró a height calc(100vh - X).
  useEffect(() => {
    if (!isEmbedded) return;
    const post = () => {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      window.parent.postMessage({ type: "atolon-booking-height", height: h }, "*");
    };
    post();
    const ro = new ResizeObserver(() => post());
    ro.observe(document.body);
    window.addEventListener("load", post);
    return () => { ro.disconnect(); window.removeEventListener("load", post); };
  }, [isEmbedded]);

  // En modo iframe-fit (desktop embebido), fijar html/body a 100vh sin
  // scroll para que el iframe dicte la altura y nuestro layout flex-fill
  // se acomode adentro. NO se aplica en mobile (aunque esté embebido):
  // ahí queremos preservar el scroll natural de página para que el usuario
  // pueda navegar todo el contenido del widget con swipe.
  useEffect(() => {
    if (!iframeFit) return;
    const prev = { html: document.documentElement.style.cssText, body: document.body.style.cssText };
    document.documentElement.style.cssText += ";height:100%;overflow:hidden;";
    document.body.style.cssText += ";height:100%;overflow:hidden;margin:0;";
    return () => {
      document.documentElement.style.cssText = prev.html;
      document.body.style.cssText = prev.body;
    };
  }, [iframeFit]);

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
  const [form,      setForm]      = useState({ nombre: "", email: "", telefono: "", notas: "", ...FE_EMPTY });
  const setFE = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Abandoned Cart state ─────────────────────────────────────────────────
  const acCartIdRef  = useRef(null);  // ID del cart en ac_carts
  const [errors,    setErrors]    = useState({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [linkPago,  setLinkPago]  = useState("");
  const [zohoWidget, setZohoWidget] = useState(null); // { session, address, description, onSuccess }
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
      // Asocia el slug del pasadía a la sesión para que el bridge
      // postMessageBridge pueda incluirlo en cada evento al window padre.
      if (typeof AtolanTrack.setPasadiaSlug === "function") {
        AtolanTrack.setPasadiaSlug(product?.slug || null);
      }
      AtolanTrack.evento("booking_widget_visto", { lang: langQ, slug: product?.slug }, "booking");
      AtolanTrack.embudo_paso(1, { lang: langQ }).then(() => {
        // Deep-link con producto ya seleccionado (?tipo=/slug, p.ej. los
        // links rastreados de WhatsApp/marketing): el cliente NO pasa por
        // el selector de paquete, así que "Eligió paquete" (paso_3) nunca
        // se registraba (salía 0). Lo registramos aquí. Grupo tiene su
        // propio efecto que ya hace esto.
        if (matchedProduct && !grupoQ) {
          AtolanTrack.embudo_paso(3, {
            producto: matchedProduct.tipo, package_type: matchedProduct.tipo, pax: matchedProduct.minA,
          });
        }
      });
      AtolanTrack.setCurrentStep(1);
      if (langQ !== "es") AtolanTrack.setLang(langQ);
    });
  }, [product?.slug]);

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

  // ── Abandoned Cart: crear/actualizar registro tan pronto haya señales ──
  // Cambios 2026-05:
  //   1. Captura temprana — antes esperábamos email; ahora capturamos cart
  //      apenas haya producto+fecha (estado=browsing) y enriquecemos con
  //      email/nombre/tel cuando lleguen. Esto recupera la atribución de
  //      usuarios que abandonan en step 2/3 sin ingresar email.
  //   2. AtolanTrack.sesionId / .utms (antes _sesionId / _utms — campos
  //      privados que NO existen → siempre null/{} → cero atribución).
  //   3. Errores client-side ahora se loggean en `ac_errors` server-side
  //      para diagnóstico. Antes solo iban a la consola del usuario.
  const _acLogError = async (fase, err, ctx) => {
    if (!supabase) return;
    try {
      await supabase.from("ac_errors").insert({
        id: `acerr_${Date.now()}_${acNanoid(6)}`,
        cart_id: acCartIdRef.current || null,
        email:   form.email?.toLowerCase().trim() || null,
        fase,
        mensaje: String(err?.message || err || "unknown").slice(0, 1000),
        contexto: ctx || null,
        user_agent: (navigator.userAgent || "").slice(0, 500),
        url: window.location.href.slice(0, 500),
      });
    } catch (_) { /* fallback: silencio si hasta el log falla */ }
  };

  useEffect(() => {
    if (!supabase) return;
    // Disparar el upsert si hay AL MENOS:
    //   • producto seleccionado (paso 1+) — guarda intent básico
    //   • o email válido — sigue capturando como antes
    const emailOk    = form.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
    const hasProduct = !!product?.slug;
    if (!emailOk && !hasProduct) return;

    clearTimeout(_acDebounceRef.current);
    _acDebounceRef.current = setTimeout(async () => {
      try {
        const now    = new Date().toISOString();
        const sesId  = AtolanTrack.sesionId ?? null;
        const isMob  = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
        const deviceType = isMob ? "mobile" : "desktop";
        // UTMs desde sessionStorage / AtolanTrack
        const utms     = AtolanTrack._utms     ?? {};
        const clickIds = AtolanTrack._clickIds ?? {};
        const landing  = sessionStorage.getItem("ac_landing") || window.location.origin + "/booking";

        // Primer fetch: si tenemos email, intentar reutilizar cart existente.
        if (!acCartIdRef.current && emailOk) {
          const lookup = await supabase
            .from("ac_carts")
            .select("id, estado")
            .eq("email", form.email.toLowerCase().trim())
            .not("estado", "in", "(recovered,unsubscribed,expired,stopped)")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lookup.error) {
            _acLogError("lookup", lookup.error, { email: form.email });
          } else if (lookup.data) {
            acCartIdRef.current = lookup.data.id;
          }
        }
        if (!acCartIdRef.current) {
          acCartIdRef.current = `AC-${Date.now()}-${acNanoid(8)}`;
        }

        // Estado: "browsing" si aún no hay email; "checkout_started" cuando ya
        // ingresó email válido. NUNCA degradamos: si ya pasó a checkout_started
        // no volvemos a browsing.
        const estado = emailOk ? "checkout_started" : "browsing";

        const cartData = {
          id:                   acCartIdRef.current,
          sesion_id:            sesId,
          email:                emailOk ? form.email.toLowerCase().trim() : null,
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
          // Click-IDs (atribución plataforma de ads)
          fbclid:               clickIds.fbclid    || null,
          gclid:                clickIds.gclid     || null,
          wbraid:               clickIds.wbraid    || null,
          gbraid:               clickIds.gbraid    || null,
          ttclid:               clickIds.ttclid    || null,
          msclkid:              clickIds.msclkid   || null,
          li_fat_id:            clickIds.li_fat_id || null,
          // Contexto técnico (para Meta CAPI / GA4 server-side)
          user_agent:           navigator.userAgent || null,
          landing_page:         landing,
          checkout_url:         window.location.href,
          estado,
          // Solo setear checkout_started_at la primera vez que es checkout_started
          ...(emailOk ? { checkout_started_at: now } : {}),
          updated_at:           now,
        };

        const ins = await supabase.from("ac_carts").upsert(cartData, { onConflict: "id" });
        if (ins.error) {
          _acLogError("upsert", ins.error, {
            cartId: acCartIdRef.current,
            estado,
            hasEmail: emailOk,
            hasProduct,
          });
        }
      } catch (err) {
        _acLogError("upsert_throw", err, { cartId: acCartIdRef.current });
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
      // El link de grupo auto-fija paquete y fecha (grupoLock=true). El cliente
      // SÍ entra al widget y sigue los pasos, así que registramos esos pasos
      // del embudo como completados al abrir (orden real: paquete → fecha).
      // Secuenciado para no crear filas de embudo duplicadas en carrera.
      if (prod) {
        AtolanTrack.embudo_paso(3, { producto: prod.tipo, package_type: prod.tipo, pax: prod.minA })
          .then(() => {
            if (data.fecha) AtolanTrack.embudo_paso(2, { fecha: data.fecha, producto: prod.tipo, package_type: prod.tipo });
          });
      } else if (data.fecha) {
        AtolanTrack.embudo_paso(2, { fecha: data.fecha });
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

    // Migrado al availability-engine (single source of truth con admin).
    // Antes: queries directas a reservas+cierres+salidas con cap base sumada
    // y SIN leer salidas_override.extra_embarcaciones — eso causaba que
    // overrides "Sin Lancha (+N)" agregados desde el admin no se reflejaran
    // en el motor de reserva, mostrando "Agotado" cuando el admin ya había
    // expandido cupo manualmente.
    Promise.all([
      import("../lib/availability.js").then(mod => mod.checkDisponibilidadMonth(y, m + 1)),
      supabase.from("salidas").select("id, hora, hora_regreso, nombre, capacidad_total, auto_apertura, orden").eq("activo", true).order("orden"),
    ]).then(([monthData, salR]) => {
      setSalidas(salR.data || []);
      const dias = monthData?.dias || {};
      const avail = {};
      const closedDates = [];
      for (const [iso, info] of Object.entries(dias)) {
        // El engine ya aplica overrides + cierres + auto-apertura por día.
        avail[iso] = info.cupos_max_salida ?? info.cupos ?? 0;
        if (info.cierre === "total") closedDates.push(iso);
      }
      setDispon(avail);
      setCierres(closedDates);
    }).catch(err => console.error("[BookingPopup] availability-engine month error:", err));
  }, [calYear, calMonth, product]);

  // Load salida-level availability when date changes.
  // Migrado al availability-engine con client_view=true: aplica cutoff 45min,
  // overrides abrir/cerrar, extra_embarcaciones (capacidad ampliada manualmente),
  // cierres parciales y cascada auto_apertura (S3/S4 visibles solo si la
  // anterior llegó a 75%). Convención: cupos_restantes=-1 si la salida NO
  // es visible al cliente (mismo contrato que la lógica anterior).
  useEffect(() => {
    if (!supabase || !selDate || salidas.length === 0) return;
    setLoadingSal(true);
    setSelSalida(null);
    import("../lib/availability.js")
      .then(mod => mod.checkDisponibilidadDetailed(selDate, null, { clientView: true }))
      .then((detail) => {
        const result = {};
        for (const o of (detail.opciones || [])) {
          result[o.salida_id] = o.visible ? o.cupos_restantes : -1;
        }
        setDisponSal(result);
        setLoadingSal(false);
      })
      .catch((err) => {
        console.error("[BookingPopup] availability-engine detailed error:", err);
        setDisponSal({});
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
    // Final guard: respetar el mínimo de personas del paquete (ej. Exclusive
    // Pass = mín. 2 adultos). El gate del paso 1 ya lo valida en la UI, pero
    // esto evita que un deep-link / cambio de idioma / estado raro cree una
    // reserva por debajo del mínimo (caso real: Exclusive Pass con 1 pax).
    const _minA = product?.minA || 1;
    if (product && paxA < _minA) {
      alert(isEN
        ? `${product.tipo} requires a minimum of ${_minA} adults. Please add more guests.`
        : `${product.tipo} requiere mínimo ${_minA} personas. Agrega más pasajeros.`);
      setSaving(false);
      return;
    }
    setSaving(true);
    const reservaId  = `WEB-${Date.now()}`;
    const linkExpira = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const grandTotal = totalA + totalN + selUpsells.reduce((s, u) => s + (u.por_persona ? u.precio * (paxA + paxN) : u.precio), 0);
    let   payUrl     = "";

    const redirectBase = `${window.location.origin}/pago?reserva=${reservaId}${leadId ? `&lead=${leadId}` : ""}`;

    let zohoSession = null; // si el merchant es Zoho con widget embebido
    if (method === "wompi") {
      payUrl = await wompiCheckoutUrl({ referencia: reservaId, totalCOP: grandTotal, email: form.email, redirectUrl: redirectBase });
    } else if (method === "stripe") {
      // "stripe" en la UI significa "tarjeta internacional" — ruteamos por el helper
      // que decide entre Stripe y Zoho Pay según configuracion.merchant_internacional
      try {
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
        if (session.payments_session_id && session.widget?.account_id) {
          // Nuevo flujo: widget embebido. NO redirigimos — abrimos el widget aquí.
          zohoSession = session;
        } else {
          // Compat: viejo flujo de Payment Links
          payUrl = session.url;
        }
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
        // Si el visitante llegó con link de grupo (?grupo=EVT-xxx), atribuir
        // SIEMPRE a "GRUPO" aunque el registro del evento no haya cargado
        // (evento borrado/renombrado, RLS, error de red). Así la reserva queda
        // consistente con la sesión (que ya se marca "grupo" por el param URL).
        canal:          (grupoEvt || grupoQ) ? "GRUPO" : "WEB",
        aliado_id:      grupoEvt?.aliado_id || null,
        grupo_id:       grupoEvt?.id || grupoQ || null,
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
        ...fePayload(form),
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

    // Si es flujo widget Zoho → abrir el widget en lugar de redirigir
    if (zohoSession) {
      setZohoWidget({
        session: zohoSession,
        address: { name: form.nombre, email: form.email, phone: form.telefono || "" },
        description: `${product.tipo} — ${selDate || ""}`,
        invoiceNumber: reservaId,
        onSuccess: (paymentData) => {
          console.log("[Zoho widget] payment success:", paymentData);
          AtolanTrack.evento("payment_success", { metodo: "zoho_widget", monto: grandTotal, payment_id: paymentData?.payment_id }, "conversion");
          setZohoWidget(null);
          // Redirigir a la página de confirmación. El webhook de Zoho confirmará la reserva.
          window.location.href = `${window.location.origin}/pago/exito?reserva=${reservaId}`;
        },
        onError: (err) => {
          console.error("[Zoho widget] error:", err);
          AtolanTrack.paymentError("zoho_widget", "payment_failed", err?.message || JSON.stringify(err), grandTotal);
          setZohoWidget(null);
          alert("El pago no se pudo procesar. Por favor intenta de nuevo o usa tarjeta nacional.");
        },
        onClose: () => {
          // Usuario cerró el widget sin pagar — la reserva queda como pendiente_pago
          setZohoWidget(null);
        },
      });
      return;
    }

    window.location.href = payUrl;
  }

  // ─── Shared UI helpers ──────────────────────────────────────────────────────
  function PaxRow({ label, sub, val, onDec, onInc, min = 0 }) {
    // En desktop: versión compacta (padding 7px, fuentes 13/11, botones 28px).
    // En mobile: versión original con padding 13px, fuentes 14/12, botones 32px.
    const compact = isDesktop;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: compact ? "7px 0" : "13px 0", borderBottom: `1px solid ${C.divider}` }}>
        <div>
          <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600, color: C.text }}>{label}</div>
          {sub && <div style={{ fontSize: compact ? 11 : 12, color: C.textLight, marginTop: 1 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 12 : 14 }}>
          <button onClick={onDec} disabled={val <= min}
            style={{ width: compact ? 28 : 32, height: compact ? 28 : 32, borderRadius: "50%", border: `1.5px solid ${val <= min ? C.border : C.primary}`, background: "white", color: val <= min ? C.border : C.primary, fontSize: compact ? 16 : 18, lineHeight: 1, cursor: val <= min ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>−</button>
          <span style={{ fontSize: compact ? 15 : 16, fontWeight: 700, color: C.text, minWidth: compact ? 18 : 20, textAlign: "center" }}>{val}</span>
          <button onClick={onInc}
            style={{ width: compact ? 28 : 32, height: compact ? 28 : 32, borderRadius: "50%", border: `1.5px solid ${C.primary}`, background: "white", color: C.primary, fontSize: compact ? 16 : 18, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>+</button>
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

    // Layout 2-col en desktop: flex con dos columnas independientes (cada
    // columna fluye en su propio block-axis, sin compartir altura de filas).
    // Esto elimina el dead-space que CSS grid causaba cuando la columna
    // izquierda tenía bloques mucho más cortos que la derecha (calendar +
    // salidas dictaban la altura de la fila y dejaban huecos a la izquierda).
    // En mobile (flexDirection: column): primero columna izq, luego derecha,
    // luego CTA — flujo lineal.
    return (
      <div style={{
        // En modo embebido: ocupa toda la altura del card padre (que a su vez
        // ocupa 100vh del iframe). Flex column con overflow hidden para que el
        // área de columnas tome el espacio restante después del CTA fijo.
        // En standalone: height auto, sin overflow hidden — contenido fluye.
        ...(iframeFit ? { height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" } : {}),
      }}>
        <div style={{
          display: "flex", flexDirection: isDesktop ? "row" : "column",
          gap: isDesktop ? 20 : 0, alignItems: "stretch",
          ...(iframeFit ? { flex: 1, minHeight: 0, overflow: "hidden" } : {}),
        }}>

          {/* ═════════ LEFT COLUMN ═════════
              Carousel → What's Included → Producto + precio → Participants → Order Summary */}
          <div style={{
            flex: 1, minWidth: 0, width: isDesktop ? undefined : "100%",
            display: "flex", flexDirection: "column",
            ...(iframeFit ? { overflowY: "auto", paddingRight: isDesktop ? 4 : 0 } : {}),
          }}>

        {/* Photo gallery — solo en mobile. En desktop ocupaba ~340px que no
            tenemos en el iframe Sky de 680px; las fotos pueden vivir en la
            página padre (Webflow) que ya tiene su propio carrusel arriba. */}
        {!isDesktop && allPhotos.length > 0 && (
          <div style={{ marginBottom: 20, borderRadius: 12, overflow: "hidden", position: "relative" }}>
            {/* Main image — protagonista en desktop (~290px, aspect 16:9) */}
            <div style={{ width: "100%", height: isDesktop ? 290 : 220, position: "relative", background: C.bgCard, overflow: "hidden" }}>
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

        {/* What's included — solo en mobile. En desktop esta info ya vive en
            la landing de Webflow arriba del widget; mostrarla aquí ocuparía
            ~80px que necesitamos para que todo entre en el iframe de 680px. */}
        {(() => {
          if (isDesktop) return null;
          const items = incluye.length > 0
            ? incluye.map(it => ({ es: it.descripcion, en: it.descripcion_en || it.descripcion }))
            : (isEN ? (product.includes_en || product.includes || []) : (product.includes || []))
                .map(txt => ({ es: txt, en: txt }));
          if (items.length === 0) return null;
          return (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: C.bgCard, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: isDesktop ? 4 : 8 }}>{isEN ? "What's included" : "Qué incluye"}</div>
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

        {/* Product header (título + precio) — bloque reutilizable.
            En MOBILE va arriba de Participants (col única).
            En DESKTOP se renderiza arriba del calendar en la columna derecha
            (no aquí en la izquierda). */}
        {!isDesktop && (
          <div style={{ marginBottom: 16, paddingBottom: 0, borderBottom: "none" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Atolon Beach Club · Isla Tierra Bomba</div>
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
        )}

        {/* Foto principal — solo desktop, arriba de Participants.
            Mobile ya tiene el carousel completo más arriba. */}
        {isDesktop && allPhotos.length > 0 && (
          <div style={{ marginBottom: 12, borderRadius: 10, overflow: "hidden", aspectRatio: "16 / 9", background: C.bgCard }}>
            <img src={allPhotos[0]} alt={isEN && product.tipo_en ? product.tipo_en : product.tipo}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        )}

        {/* Participants */}
        <div style={{ marginBottom: isDesktop ? 24 : 24 }}>
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
                {/* Edad por niño: en DESKTOP la removimos del widget (la
                    pregunta se hace por WhatsApp/check-in). En MOBILE
                    restauramos el grid original para preservar la UX previa. */}
                {!isDesktop && paxN > 0 && (
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

        {/* Order summary
            Desktop: versión compactada (header en una línea, sin label COP).
            Mobile: layout original con h3 + nombre de producto + label "Precios en COP". */}
        {isDesktop ? (
          <div style={{ background: C.bgCard, borderRadius: 10, padding: "8px 12px", marginBottom: 0, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingBottom: 4, borderBottom: `1.5px solid ${C.accent}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{isEN ? "Order summary" : "Resumen"}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textMid }}>{isEN && product.tipo_en ? product.tipo_en : product.tipo}</span>
            </div>
            {[
              selDate && [isEN ? "Date" : "Fecha", fmtDate(selDate, langQ)],
              selSalida && [isEN ? "Departure" : "Salida", `${selSalida.hora || selSalida.id}`],
              [isEN ? `Adults (${paxA}×)` : `Adultos (${paxA}×)`, COP(product.precio * paxA)],
              (!product.noNinos && paxN > 0) && [isEN ? `Children (${paxN}×)` : `Niños (${paxN}×)`, COP((product.precioNino || 0) * paxN)],
              (!product.noNinos && paxI > 0) && [isEN ? `Infants (${paxI}×)` : `Infantes (${paxI}×)`, isEN ? "Free" : "Gratis"],
            ].filter(Boolean).map(([k, v], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.textMid, padding: "2px 0" }}>
                <span>{k}</span><span>{v}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Total:</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.accent }}>{COP(total)}</span>
            </div>
          </div>
        ) : (
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
        )}

          </div>{/* /LEFT COLUMN */}

          {/* ═════════ RIGHT COLUMN ═════════
              Producto + precio (desktop) → Group banner (si aplica) → Calendar → Salidas (condicional) */}
          <div style={{
            flex: 1, minWidth: 0, width: isDesktop ? undefined : "100%",
            display: "flex", flexDirection: "column",
            ...(iframeFit ? { overflowY: "auto", paddingRight: isDesktop ? 4 : 0 } : {}),
          }}>

        {/* Product header + Qué incluye — solo desktop y solo cuando NO hay
            fecha seleccionada. Al elegir fecha, ambos bloques desaparecen para
            dejarle espacio al calendar + horarios disponibles. */}
        {isDesktop && !selDate && (
          <>
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.divider}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Atolon Beach Club · Isla Tierra Bomba</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{product.icon}</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{isEN && product.tipo_en ? product.tipo_en : product.tipo}</span>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>{COP(product.precio)}</div>
                  <div style={{ fontSize: 11, color: C.textLight }}>{isEN ? "per person" : "por persona"}</div>
                </div>
              </div>
            </div>

            {/* Qué incluye — usa data de BD (pasadia_incluye) o el fallback de product.includes */}
            {(() => {
              const items = incluye.length > 0
                ? incluye.map(it => ({ es: it.descripcion, en: it.descripcion_en || it.descripcion }))
                : (isEN ? (product.includes_en || product.includes || []) : (product.includes || []))
                    .map(txt => ({ es: txt, en: txt }));
              if (items.length === 0) return null;
              return (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: C.bgCard, borderRadius: 10, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{isEN ? "What's included" : "Qué incluye"}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: C.textMid, display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ color: C.success, fontWeight: 700 }}>✓</span> {isEN ? item.en : item.es}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Group event banner */}
        {grupoEvt && (
          <div style={{ background: "#EEF2FF", borderRadius: 10, padding: "12px 16px", marginBottom: 12, border: "1.5px solid #C7D2FE" }}>
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

        {/* Calendar */}
        <div style={{ marginBottom: isDesktop ? 10 : 24, display: grupoLock ? "none" : "block" }}>
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
          <div style={{ marginBottom: isDesktop ? 10 : 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              {isEN ? "Select departure time" : "Selecciona tu horario de salida"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...grupoEvt.salidas_grupo].sort((a,b) => a.hora.localeCompare(b.hora)).map(s => {
                const isSel = selSalida?.hora === s.hora;
                const sal = salidas.find(x => x.id === s.id);
                return (
                  <div key={s.hora} onClick={() => setSelSalida(s)}
                    style={{ padding: "8px 12px", borderRadius: 8, border: `2px solid ${isSel ? C.accent : C.border}`, background: isSel ? C.accentLight : C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isSel ? C.accent : C.text }}>
                        ⛵ {isEN ? "Departure" : "Salida"} {s.hora}{sal?.hora_regreso ? <span style={{ fontWeight: 400, color: C.textMid, marginLeft: 6 }}>→ {sal.hora_regreso}</span> : null}
                      </div>
                    </div>
                    {isSel && <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>✓</div>}
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

        {/* Salidas (departure times) — regular mode.
            Desktop: cards compactas ~48px (icono inline + una línea).
            Mobile: cards originales con icon-box 44px + 2 líneas. */}
        {!grupoLock && !product?.noSalida && selDate && (
          <div style={{ marginBottom: isDesktop ? 10 : 24 }}>
            <h3 style={{ fontSize: isDesktop ? 14 : 15, fontWeight: 700, color: C.text, marginBottom: isDesktop ? 8 : 12 }}>
              {isEN ? "Select departure time" : "Selecciona el horario de salida"}
            </h3>
            {loadingSal ? (
              <div style={{ textAlign: "center", padding: isDesktop ? "12px 0" : "20px 0", fontSize: isDesktop ? 12 : 13, color: C.textLight }}>
                {isEN ? "Checking availability..." : "Verificando disponibilidad..."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: isDesktop ? 6 : 8 }}>
                {salidas.filter(s => disponSal[s.id] !== -1).length === 0 ? (
                  <div style={{ padding: isDesktop ? "12px" : "16px", background: "#FFF8F8", border: `1px solid #FEE2E2`, borderRadius: isDesktop ? 8 : 10, fontSize: isDesktop ? 12 : 13, color: C.danger, textAlign: "center" }}>
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

                    if (isDesktop) {
                      // Desktop compacto (~48px de alto)
                      return (
                        <div key={s.id}
                          onClick={() => !salidaFull && setSelSalida(s)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 12px", borderRadius: 8, cursor: salidaFull ? "not-allowed" : "pointer",
                            border: `2px solid ${isSelected ? C.accent : C.border}`,
                            background: isSelected ? C.accentLight : salidaFull ? C.bgCard : C.bg,
                            opacity: salidaFull ? 0.5 : 1, transition: "all 0.15s",
                          }}
                          onMouseEnter={e => { if (!salidaFull && !isSelected) e.currentTarget.style.borderColor = C.accent; }}
                          onMouseLeave={e => { if (!salidaFull && !isSelected) e.currentTarget.style.borderColor = C.border; }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>{salidaFull ? "🚫" : "⛵"}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? C.accent : C.text }}>
                              {isEN ? "Departure" : "Salida"} {s.hora || s.id}
                              <span style={{ fontSize: 11, color: C.textMid, fontWeight: 400, marginLeft: 8 }}>
                                → {isEN ? "Return" : "Regreso"} {s.hora_regreso || s.regreso || "—"}
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            {salidaFull ? (
                              <span style={{ fontSize: 11, color: C.danger, fontWeight: 600 }}>{isEN ? "Full" : "Agotado"}</span>
                            ) : isSelected ? (
                              <div style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>✓</div>
                            ) : (
                              <div style={{ fontSize: 11, color: C.success, fontWeight: 600 }}>
                                {isEN ? "Available" : "Disponible"}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Mobile: layout original (icon box 44px + 2 líneas, ~76px de alto)
                    return (
                      <div key={s.id}
                        onClick={() => !salidaFull && setSelSalida(s)}
                        style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "14px 16px", borderRadius: 10, cursor: salidaFull ? "not-allowed" : "pointer",
                          border: `2px solid ${isSelected ? C.accent : C.border}`,
                          background: isSelected ? C.accentLight : salidaFull ? C.bgCard : C.bg,
                          opacity: salidaFull ? 0.5 : 1, transition: "all 0.15s",
                        }}>
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

          </div>{/* /RIGHT COLUMN */}
        </div>{/* /FLEX 2-COL */}

        {/* CTA button — full width, debajo de las dos columnas. En modo
            embebido es flex-shrink: 0 (siempre visible al fondo del card),
            en standalone fluye normal después del 2-col. */}
        {(() => {
          const afterOk = product.noSalida ? (embarcacion.trim() && horaLlegada) : true;
          const ready = selDate && (selSalida || grupoLock || product.noSalida) && paxA >= product.minA && afterOk;
          return (
            <div style={{
              marginTop: isDesktop ? 10 : 8,
              ...(iframeFit ? { flexShrink: 0, paddingTop: 8, borderTop: `1px solid ${C.border}` } : {}),
            }}>
              <button
                onClick={() => { if (ready) { gtmBeginCheckout(product, paxTotal, total); setStep(2); AtolanTrack.evento("begin_checkout", { producto: product?.tipo, fecha: selDate, pax: paxTotal, valor: total }, "booking"); AtolanTrack.setCurrentStep(2); } }}
                disabled={!ready}
                style={{
                  width: "100%", padding: isDesktop ? "11px 0" : "15px 0", borderRadius: 10, border: "none",
                  background: ready ? C.primary : C.border,
                  color: ready ? "white" : C.textLight,
                  fontSize: 15, fontWeight: 700, cursor: ready ? "pointer" : "not-allowed",
                  letterSpacing: "0.03em", transition: "all 0.15s",
                }}>
                {isEN ? "Book Now →" : "Reservar →"}
              </button>
              {!selDate && (
                <p style={{ textAlign: "center", fontSize: 11, color: C.textLight, marginTop: 6, marginBottom: 0 }}>
                  {isEN ? "Please select a date to continue" : "Selecciona una fecha para continuar"}
                </p>
              )}
              {selDate && !selSalida && !loadingSal && (
                <p style={{ textAlign: "center", fontSize: 11, color: C.textLight, marginTop: 6, marginBottom: 0 }}>
                  {isEN ? "Please select a departure time" : "Selecciona un horario de salida"}
                </p>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  // ─── Step 2: Personal info ───────────────────────────────────────────────────
  function InfoStep() {
    // En mobile: layout original (sin flex column, márgenes 20/18, textarea
    // rows=2, bloque FE de toggle + form). En desktop iframe: layout
    // TOP/MIDDLE/BOTTOM con CTA fijo al fondo + FE movida a post-pago.
    return (
      <div style={iframeFit ? { height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" } : {}}>
        {/* ════ TOP zone — siempre visible ════ */}
        <div style={iframeFit ? { flexShrink: 0 } : {}}>
          <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: C.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: isDesktop ? 10 : 20, display: "flex", alignItems: "center", gap: 4 }}>
            ← {isEN ? "Back" : "Volver"}
          </button>

          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: isDesktop ? 10 : 18 }}>
            {isEN ? "Your information" : "Tus datos"}
          </h2>

          {/* Order recap — siempre visible al tope */}
          <div style={{ background: C.bgCard, borderRadius: 10, padding: isDesktop ? "10px 14px" : "12px 16px", marginBottom: isDesktop ? 10 : 20, border: `1px solid ${C.border}`, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: isDesktop ? 2 : 4 }}>
              <span style={{ color: C.textMid }}>{product.tipo}</span>
              <span style={{ fontWeight: 700, color: C.accent }}>{COP(total)}</span>
            </div>
            <div style={{ color: C.textMid }}>
              📅 {fmtDate(selDate, langQ)}
              {selSalida && <> &nbsp;·&nbsp; ⛵ {isEN ? "Departure" : "Salida"} {selSalida.hora || selSalida.id}</>}
              &nbsp;·&nbsp; 👥 {paxA + paxN} {isEN ? `person${paxA + paxN !== 1 ? "s" : ""}` : `persona${paxA + paxN !== 1 ? "s" : ""}`}{paxI > 0 ? ` + ${paxI} infante${paxI !== 1 ? "s" : ""}` : ""}
            </div>
          </div>
        </div>

        {/* ════ MIDDLE zone — form fields scroll si excede (desktop) ════ */}
        <div style={iframeFit ? { flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 } : {}}>
          {[
            { key: "nombre",   label: isEN ? "Full name" : "Nombre completo",     type: "text",  placeholder: isEN ? "John Smith" : "Juan García" },
            { key: "email",    label: isEN ? "Email" : "Correo electrónico",      type: "email", placeholder: "correo@ejemplo.com" },
            { key: "telefono", label: isEN ? "Phone" : "Teléfono / WhatsApp",     type: "tel",   placeholder: "+57 300 000 0000" },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key} style={{ marginBottom: isDesktop ? 12 : 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: isDesktop ? 4 : 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
              <input
                type={type}
                value={form[key]}
                placeholder={placeholder}
                onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: null })); }}
                style={{
                  width: "100%", padding: isDesktop ? "10px 14px" : "11px 14px", borderRadius: 8,
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

          <div style={{ marginBottom: isDesktop ? 12 : 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: isDesktop ? 4 : 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{isEN ? "Notes / special requests (optional)" : "Notas / solicitudes especiales (opcional)"}</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={isDesktop ? 1 : 2}
              style={{ width: "100%", padding: isDesktop ? "8px 14px" : "11px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg, outline: "none", resize: isDesktop ? "vertical" : "none", boxSizing: "border-box", fontFamily: "inherit", minHeight: isDesktop ? 36 : undefined }}
            />
          </div>

          {/* Facturación electrónica — solo en MOBILE (UX original).
              En desktop la captura se hace post-pago en PagoCliente. */}
          {!isDesktop && (
            <div style={{ marginBottom: 20 }}>
              <FacturaElectronicaToggle checked={form.factura_electronica} onChange={v => setFE("factura_electronica", v)} theme="light" />
              {form.factura_electronica && <FacturaElectronicaForm form={form} set={setFE} editing={true} theme="light" />}
            </div>
          )}
        </div>

        {/* ════ BOTTOM zone — T&C + Continue siempre visibles ════ */}
        <div style={iframeFit ? { flexShrink: 0, paddingTop: 10, borderTop: `1px solid ${C.border}`, marginTop: 8 } : {}}>
          {/* T&C */}
          <div style={{ marginBottom: isDesktop ? 10 : 20, textAlign: "center" }}>
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
              canal:          (grupoEvt || grupoQ) ? "GRUPO" : "WEB",
              vendedor:       grupoEvt?.vendedor || "Web",
              stage:          "Nuevo",
              valor_est:      total,
              fecha_creacion: hoy,
              ultimo_contacto:hoy,
              notas:          grupoEvt
                ? `GRUPO: ${grupoEvt.nombre} · ${product.tipo} · ${selDate} · ${paxA + paxN} pax`
                : grupoQ
                  ? `GRUPO ${grupoQ} (evento no cargado) · ${product.tipo} · ${selDate} · ${paxA + paxN} pax`
                  : `${product.tipo} · ${selDate} · ${paxA + paxN} pax · Inicio de compra online`,
              etiquetas:      grupoEvt ? ["grupo", product.slug, grupoEvt.id]
                              : grupoQ  ? ["grupo", product.slug, grupoQ]
                              : ["web", product.slug],
            });
            setLeadId(lid);
          }
          setStep(3);
        }}
          style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: C.primary, color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.03em", marginBottom: 8 }}>
          {isEN ? "Continue →" : "Continuar →"}
        </button>
        <div style={{ textAlign: "center", fontSize: 11, color: C.textLight }}>
          🔒 {isEN ? "Secure payment · Cancellation policy applies" : "Pago seguro · Aplica política de cancelación"}
        </div>
        </div>{/* /BOTTOM zone */}

        {/* Hidden legacy — payment buttons moved to upsell step. Mantengo
            display:none por compatibilidad pero ya no se renderiza nada útil. */}
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
      <div style={iframeFit ? { height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" } : {}}>
        {/* ════ TOP zone — Back + título + subtítulo ════ */}
        <div style={iframeFit ? { flexShrink: 0 } : {}}>
          <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: C.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: isDesktop ? 10 : 20, display: "flex", alignItems: "center", gap: 4 }}>
            ← {isEN ? "Back" : "Volver"}
          </button>

          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            {grupoEvt ? (isEN ? "Complete your booking" : "Completa tu reserva") : (isEN ? "Complete your experience" : "Completa tu experiencia")}
          </h2>
          {!grupoEvt && (
            <p style={{ fontSize: 13, color: C.textMid, marginBottom: isDesktop ? 14 : 22 }}>
              {isEN ? "Add extras before paying" : "Agrega opciones especiales antes de pagar"}
            </p>
          )}
        </div>

        {/* ════ MIDDLE zone — extras + summary + payment methods ════ */}
        <div style={iframeFit ? { flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 } : {}}>

        {loadingUps ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: C.textLight, fontSize: 13 }}>...</div>
        ) : upsells.length === 0 ? null : isDesktop ? (
          // DESKTOP: todos los upsells en grid 3-col responsive (sin scroll vertical).
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            {upsells.map(u => {
              const isUpg      = u.tipo === "upgrade";
              const isSelected = selUpsells.find(x => x.id === u.id);
              const uPrice     = u.por_persona ? u.precio * (paxA + paxN) : u.precio;
              const accent     = isUpg ? "#5B21B6" : C.accent;
              return (
                <div key={u.id} style={{
                  borderRadius: 10, overflow: "hidden",
                  border: `2px solid ${isSelected ? C.accent : isUpg ? "#7C3AED44" : C.border}`,
                  background: isSelected ? C.accentLight : isUpg ? "#F5F3FF" : C.bg,
                  transition: "all 0.15s",
                  display: "flex", flexDirection: "column",
                }}>
                  {u.foto_url && (
                    <div style={{ height: 80, overflow: "hidden" }}>
                      <img src={u.foto_url} alt={u.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      {!u.foto_url && <div style={{ width: 28, height: 28, borderRadius: 7, background: isUpg ? "#EDE9FE" : C.bgCard, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{u.emoji}</div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: isUpg ? "#5B21B6" : C.text, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{u.nombre}</span>
                        {isUpg && <span style={{ display: "inline-block", marginTop: 3, fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#DDD6FE", color: "#5B21B6", fontWeight: 700, letterSpacing: "0.05em" }}>UPGRADE</span>}
                      </div>
                    </div>
                    {u.descripcion && <div style={{ fontSize: 10, color: C.textMid, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>{u.descripcion}</div>}
                    <div style={{ fontSize: 12, fontWeight: 800, color: accent }}>
                      +{COP(uPrice)}
                      <span style={{ fontSize: 9, fontWeight: 400, color: C.textLight, marginLeft: 3 }}>
                        {u.por_persona ? `(${paxA + paxN}p)` : "fijo"}
                      </span>
                    </div>
                    {isUpg ? (
                      <button onClick={() => doUpgrade(u)}
                        style={{ marginTop: "auto", padding: "7px 0", borderRadius: 7, border: "none", background: "#5B21B6", color: "white", fontWeight: 700, fontSize: 11, cursor: "pointer", width: "100%" }}>
                        {isEN ? "Upgrade →" : "Upgrade →"}
                      </button>
                    ) : (
                      <button onClick={() => toggleAddon(u)}
                        style={{ marginTop: "auto", padding: "7px 0", borderRadius: 7, border: `2px solid ${isSelected ? C.accent : C.border}`, background: isSelected ? C.accent : "white", color: isSelected ? "white" : C.text, fontWeight: 700, fontSize: 11, cursor: "pointer", transition: "all 0.15s", width: "100%" }}>
                        {isSelected ? "✓ " + (isEN ? "Added" : "Agregado") : (isEN ? "Add" : "Agregar")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // MOBILE: layout original full-width stacked (cada upsell ocupa su fila).
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

        </div>{/* /MIDDLE zone */}

        {/* ════ BOTTOM zone — métodos de pago + warning + secure note ════
            Desktop: layout compacto en grid 2-col (Wompi | Stripe lado a lado).
            Mobile: layout original stacked vertical con precio visible en cada
            card, padding generoso. */}
        <div style={iframeFit ? { flexShrink: 0, paddingTop: 10, borderTop: `1px solid ${C.border}`, marginTop: 8 } : { marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {isEN ? "Select payment method" : "Método de pago"}
          </div>
          {isDesktop ? (
            // DESKTOP: 2-col compacto, sin precio repetido
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 8 }}>
              {import.meta.env.VITE_WOMPI_INTEGRITY_KEY && (
                <button onClick={() => { gtmAddPaymentInfo("wompi", grandTotal); AtolanTrack.evento("payment_method_selected", { metodo: "wompi", monto: grandTotal }, "conversion"); handleReservar("wompi"); }} disabled={saving}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: saving ? "wait" : "pointer", textAlign: "left", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#5B4CF5"; e.currentTarget.style.background = "#F5F3FF"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, color: "white", fontSize: 13 }}>W</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{isEN ? "National Card" : "Tarjeta Nacional"}</div>
                  </div>
                  <div style={{ fontSize: 10, color: C.textMid, lineHeight: 1.35 }}>PSE · Nequi · Bancolombia · Visa/MC Col.</div>
                </button>
              )}
              <button onClick={() => { gtmAddPaymentInfo("stripe", grandTotal); AtolanTrack.evento("payment_method_selected", { metodo: "stripe", monto: grandTotal }, "conversion"); handleReservar("stripe"); }} disabled={saving}
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: saving ? "wait" : "pointer", textAlign: "left", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#635BFF"; e.currentTarget.style.background = "#F5F3FF"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: "#635BFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, color: "white", fontSize: 13 }}>S</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{isEN ? "International Card" : "Tarjeta Internacional"}</div>
                </div>
                <div style={{ fontSize: 10, color: C.textMid, lineHeight: 1.35 }}>Visa · Mastercard · Amex · Apple/Google Pay</div>
              </button>
            </div>
          ) : (
            // MOBILE: layout original stacked vertical con precio en cada card
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
              {import.meta.env.VITE_WOMPI_INTEGRITY_KEY && (
                <button onClick={() => { gtmAddPaymentInfo("wompi", grandTotal); AtolanTrack.evento("payment_method_selected", { metodo: "wompi", monto: grandTotal }, "conversion"); handleReservar("wompi"); }} disabled={saving}
                  style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 18px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: saving ? "wait" : "pointer", textAlign: "left", transition: "all 0.15s" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, color: "white", fontSize: 16 }}>W</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{isEN ? "National Card" : "Tarjeta Nacional"}</div>
                    <div style={{ fontSize: 12, color: C.textMid }}>PSE · Nequi · Bancolombia · Visa / Mastercard Colombia</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#5B4CF5" }}>{COP(grandTotal)}</div>
                </button>
              )}
              <button onClick={() => { gtmAddPaymentInfo("stripe", grandTotal); AtolanTrack.evento("payment_method_selected", { metodo: "stripe", monto: grandTotal }, "conversion"); handleReservar("stripe"); }} disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 18px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, cursor: saving ? "wait" : "pointer", textAlign: "left", transition: "all 0.15s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#635BFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, color: "white", fontSize: 16 }}>S</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{isEN ? "International Card" : "Tarjeta Internacional"}</div>
                  <div style={{ fontSize: 12, color: C.textMid }}>Visa · Mastercard · Amex · Apple Pay · Google Pay</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#635BFF" }}>{COP(grandTotal)}</div>
              </button>
            </div>
          )}
          <div style={{ padding: isDesktop ? "6px 10px" : "8px 12px", background: "#FFF7E6", border: "1px solid #F5C842", borderRadius: 8, fontSize: isDesktop ? 10 : 11, color: "#92400E", display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>💳</span>
            <span>
              {isEN
                ? <>The international card charge will appear on your statement as <strong>X Travel Group</strong>.</>
                : <>El cargo con tarjeta internacional aparecerá en tu estado de cuenta a nombre de <strong>X Travel Group</strong>.</>}
            </span>
          </div>
          <div style={{ textAlign: "center", marginTop: isDesktop ? 0 : 8, fontSize: 11, color: C.textLight }}>
            🔒 {isEN ? "Secure payment · No refunds policy" : "Pago seguro · Política de no reembolso"}
          </div>
        </div>
      </div>
    );
  }

  // ─── Layout ─────────────────────────────────────────────────────────────────
  const LangToggle = (props = {}) => (
    <div style={{ display: "flex", gap: 4, ...(props.style || {}) }}>
      {["es","en"].map(l => (
        <button key={l} onClick={() => switchLang(l)}
          style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: langQ === l ? C.primary : "white", color: langQ === l ? "white" : C.textMid, border: `1px solid ${langQ === l ? C.primary : C.border}`, cursor: "pointer" }}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );

  const stepContent = (
    <>
      {step === 0 && ProductSelector()}
      {step === 1 && product && BookingStep()}
      {step === 2 && product && InfoStep()}
      {step === 3 && product && UpsellStep()}
    </>
  );

  const zohoBlock = zohoWidget ? (
    <ZohoPaymentWidget
      session={zohoWidget.session}
      address={zohoWidget.address}
      description={zohoWidget.description}
      invoiceNumber={zohoWidget.invoiceNumber}
      business="Atolón Beach Club"
      onSuccess={zohoWidget.onSuccess}
      onError={zohoWidget.onError}
      onClose={zohoWidget.onClose}
    />
  ) : null;

  // ── Modo EMBEDDED (iframe Webflow / atoloncartagena.com) ──
  // El widget toma 100vh del iframe y reparte: mini-header + área principal
  // con scroll interno + (CTA fijo lo maneja cada step internamente con
  // flex: 1 + overflow hidden en el contenedor padre). Esto hace que el
  // contenido se adapte a la altura que sea (680px, 760px, 900px, etc.)
  // sin tweaks de pixel.
  // Solo aplicamos el modo iframe-fit en DESKTOP. En mobile (incluso si está
  // embebido en un iframe), preservamos el layout original con scroll de
  // página completo, logo grande, footer — sin alterar la UX mobile previa.
  if (isEmbedded && isDesktop) {
    return (
      <div style={{ height: "100vh", background: "#F1F5F9", fontFamily: "'Segoe UI', Arial, sans-serif", color: C.text, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Mini header — solo lang toggle, ~36px */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "6px 12px", background: "white", borderBottom: `1px solid ${C.border}` }}>
          <LangToggle />
        </div>
        {/* Card principal — fills remaining height. Cada step maneja su propio
            patrón TOP / MIDDLE-scroll / BOTTOM fijo, así que aquí siempre
            overflow: hidden y el step internamente decide qué scrollea.
            maxWidth + margin auto deja un margen visible a cada lado en
            pantallas anchas (en lugar de extenderse edge-to-edge en el iframe). */}
        <div style={{ flex: 1, minHeight: 0, padding: 10, boxSizing: "border-box", overflow: "hidden", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 1100, height: "100%", background: C.bg, borderRadius: 12, padding: isDesktop ? "12px 14px" : "10px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {stepContent}
          </div>
        </div>
        {zohoBlock}
      </div>
    );
  }

  // ── Modo STANDALONE (URL directa atolon.co/booking/<slug>) ──
  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Segoe UI', Arial, sans-serif", color: C.text, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isDesktop ? "6px 12px 6px" : "24px 16px 60px" }}>
      <div style={{ width: "100%", maxWidth: isDesktop ? 1000 : 480 }}>

        {/* Brand header — en desktop sin logo, en mobile con logo grande */}
        {isDesktop ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6, height: 28 }}>
            <LangToggle />
          </div>
        ) : (
          <div style={{ position: "relative", textAlign: "center", marginBottom: 20 }}>
            <a href="https://www.atoloncartagena.com" target="_blank" rel="noopener noreferrer">
              <img src="/atolon-peces.png" alt="Atolon Beach Club" style={{ height: 195, objectFit: "contain", display: "block", margin: "0 auto" }} />
            </a>
            <LangToggle style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)" }} />
          </div>
        )}

        {/* Main card */}
        <div style={{ background: C.bg, borderRadius: 16, padding: isDesktop ? "12px 16px" : "24px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.07)", border: `1px solid ${C.border}` }}>
          {stepContent}
        </div>

        {/* Footer — solo en mobile */}
        {!isDesktop && (
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.textLight, lineHeight: 1.9 }}>
            <div>Atolon Beach Club</div>
            <div>
              <a href="mailto:reservas@atoloncartagena.com" style={{ color: C.primary, textDecoration: "none" }}>reservas@atoloncartagena.com</a>
            </div>
            <div>
              <a href="https://www.atoloncartagena.com" target="_blank" rel="noopener noreferrer" style={{ color: C.primary, textDecoration: "none" }}>www.atoloncartagena.com</a>
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 10 }}>
          <a href="/" style={{ fontSize: 11, color: C.textLight, textDecoration: "none", opacity: 0.5 }}>
            Portal Agencias
          </a>
          <a href="/login" style={{ fontSize: 11, color: C.textLight, textDecoration: "none", opacity: 0.5 }}>
            Colaborador Login
          </a>
        </div>
      </div>

      {zohoBlock}
    </div>
  );
}
