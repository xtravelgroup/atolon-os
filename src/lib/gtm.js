/**
 * AtolanTrack GTM/GA4/Meta Pixel Bridge
 * Fires standard ecommerce events to:
 *   1. Google Tag Manager → GA4 (via dataLayer)
 *   2. Meta Pixel (fbq)
 *
 * Config: set VITE_GTM_ID and VITE_META_PIXEL_ID in .env.local
 * Example: VITE_GTM_ID=GTM-XXXXXXX
 *          VITE_META_PIXEL_ID=1234567890
 */

const GTM_ID   = import.meta.env.VITE_GTM_ID        || null;
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID  || null;

let gtmInitialized   = false;
let pixelInitialized = false;

// ─── Init GTM ────────────────────────────────────────────────────────────────

export function initGTM() {
  if (!GTM_ID || gtmInitialized) return;
  gtmInitialized = true;

  // dataLayer init
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });

  // GTM script
  const s = document.createElement("script");
  s.async = true;
  s.src   = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(s);

  // GTM noscript iframe (append to body when ready)
  const noscript = document.createElement("noscript");
  const iframe   = document.createElement("iframe");
  iframe.src    = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
  iframe.height = "0";
  iframe.width  = "0";
  iframe.style.display    = "none";
  iframe.style.visibility = "hidden";
  noscript.appendChild(iframe);
  document.body ? document.body.prepend(noscript)
    : document.addEventListener("DOMContentLoaded", () => document.body.prepend(noscript));
}

// ─── Init Meta Pixel ─────────────────────────────────────────────────────────

export function initMetaPixel() {
  if (!PIXEL_ID || pixelInitialized) return;
  pixelInitialized = true;

  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s);
  }(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
}

// ─── dataLayer Push ──────────────────────────────────────────────────────────

function dl(event, data = {}) {
  if (!GTM_ID) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
}

function fbTrack(event, data = {}) {
  if (!PIXEL_ID || typeof window.fbq !== "function") return;
  window.fbq("track", event, data);
}

function fbCustom(event, data = {}) {
  if (!PIXEL_ID || typeof window.fbq !== "function") return;
  window.fbq("trackCustom", event, data);
}

// ─── Page View ───────────────────────────────────────────────────────────────

export function gtmPageView(path, title) {
  dl("page_view", { page_path: path || window.location.pathname, page_title: title || document.title });
  fbTrack("PageView");
}

// ─── Booking Funnel Events (GA4 ecommerce schema) ────────────────────────────

export function gtmViewItem(product) {
  dl("view_item", {
    ecommerce: {
      currency: "COP",
      value: product.precio || 0,
      items: [{
        item_id:       product.slug || product.tipo,
        item_name:     product.tipo,
        item_category: "Pasadía",
        price:         product.precio || 0,
        quantity:      1,
      }],
    },
  });
  fbCustom("ViewContent", {
    content_type:     "product",
    content_ids:      [product.slug || product.tipo],
    content_name:     product.tipo,
    value:            product.precio || 0,
    currency:         "COP",
  });
}

export function gtmBeginCheckout(product, pax, monto) {
  dl("begin_checkout", {
    ecommerce: {
      currency: "COP",
      value:    monto,
      items: [{
        item_id:       product?.slug || product?.tipo,
        item_name:     product?.tipo,
        item_category: "Pasadía",
        price:         product?.precio || 0,
        quantity:      pax || 1,
      }],
    },
  });
  fbCustom("InitiateCheckout", {
    value:    monto,
    currency: "COP",
    num_items: pax,
    content_ids: [product?.slug || product?.tipo],
  });
}

export function gtmAddPaymentInfo(method, monto) {
  dl("add_payment_info", {
    ecommerce: {
      currency:       "COP",
      value:          monto,
      payment_type:   method,
    },
  });
  fbCustom("AddPaymentInfo", { value: monto, currency: "COP" });
}

export function gtmPurchase(reservaId, monto, product, adultos, ninos, fecha) {
  dl("purchase", {
    ecommerce: {
      transaction_id: reservaId,
      currency:       "COP",
      value:          monto,
      items: [{
        item_id:       product?.slug || product?.tipo || "pasadia",
        item_name:     product?.tipo || "Pasadía",
        item_category: "Pasadía",
        price:         monto / Math.max((adultos || 1) + (ninos || 0), 1),
        quantity:      (adultos || 1) + (ninos || 0),
      }],
    },
  });
  fbTrack("Purchase", {
    value:       monto,
    currency:    "COP",
    content_ids: [product?.slug || product?.tipo || "pasadia"],
    content_type: "product",
    num_items:   (adultos || 1) + (ninos || 0),
  });
}

export function gtmPaymentError(method, errorCode) {
  dl("payment_error", { payment_method: method, error_code: errorCode });
  fbCustom("PaymentError", { method, error_code: errorCode });
}

export function gtmAbandon(step, monto) {
  fbCustom("AbandonCheckout", { paso: step, value: monto || 0, currency: "COP" });
}

export function gtmWhatsApp(source) {
  dl("whatsapp_click", { source });
  fbCustom("Contact", { method: "whatsapp", source });
}

export function gtmExitIntent(step) {
  fbCustom("ExitIntent", { paso: step });
}

export function gtmScrollDepth(pct) {
  dl("scroll", { percent_scrolled: pct });
}

// ─── Auto-init on import ──────────────────────────────────────────────────────
initGTM();
initMetaPixel();
