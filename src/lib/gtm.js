/**
 * AtolanTrack → GTM / GA4 / Meta Pixel / Google Ads / TikTok bridge
 *
 * Los IDs vienen de la tabla `configuracion` (editables por la agencia en
 * el portal AtolonTrack → pestaña Tracking & Pixels), NO de variables de
 * entorno. AtolanTrack.init() llama initTracking(cfg) una sola vez.
 *
 * Los eventos disparados ANTES de que cargue la config se encolan y se
 * reproducen al inicializar, así no se pierde ningún Purchase.
 */

let CFG = {
  meta_pixel_id:    null,
  gtm_id:           null,
  ga4_id:           null,
  google_ads_id:    null,
  google_ads_label: null,
  tiktok_pixel_id:  null,
};
let ready = false;
const queue = [];

function run(fn) {
  if (ready) { try { fn(); } catch (_) { /* noop */ } }
  else queue.push(fn);
}

function loadScript(src) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
  return s;
}

// ─── Init (idempotente) ──────────────────────────────────────────────────────

export function initTracking(cfg = {}) {
  if (ready) return;
  CFG = {
    meta_pixel_id:    cfg.meta_pixel_id    || null,
    gtm_id:           cfg.gtm_id           || null,
    ga4_id:           cfg.ga4_id           || null,
    google_ads_id:    cfg.google_ads_id    || null,
    google_ads_label: cfg.google_ads_label || null,
    tiktok_pixel_id:  cfg.tiktok_pixel_id  || null,
  };

  // ── Google Tag Manager ──────────────────────────────────────────────
  if (CFG.gtm_id) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    loadScript(`https://www.googletagmanager.com/gtm.js?id=${CFG.gtm_id}`);
    const ns  = document.createElement("noscript");
    const ifr = document.createElement("iframe");
    ifr.src = `https://www.googletagmanager.com/ns.html?id=${CFG.gtm_id}`;
    ifr.height = "0"; ifr.width = "0";
    ifr.style.display = "none"; ifr.style.visibility = "hidden";
    ns.appendChild(ifr);
    (document.body || document.documentElement).prepend(ns);
  }

  // ── GA4 + Google Ads (gtag.js compartido) ───────────────────────────
  if (CFG.ga4_id || CFG.google_ads_id) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${CFG.ga4_id || CFG.google_ads_id}`);
    window.gtag("js", new Date());
    if (CFG.ga4_id)        window.gtag("config", CFG.ga4_id);
    if (CFG.google_ads_id) window.gtag("config", CFG.google_ads_id);
  }

  // ── Meta Pixel ──────────────────────────────────────────────────────
  if (CFG.meta_pixel_id) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", CFG.meta_pixel_id);
  }

  // ── TikTok Pixel ────────────────────────────────────────────────────
  if (CFG.tiktok_pixel_id) {
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t;
      const ttq = w[t] = w[t] || [];
      ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
      ttq.setAndDefer = function (e, n) { e[n] = function () { e.push([n].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (e) { const n = ttq._i[e] || []; for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(n, ttq.methods[i]); return n; };
      ttq.load = function (e, n) {
        const r = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r;
        ttq._t = ttq._t || {}; ttq._t[e] = +new Date();
        ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        const s = d.createElement("script");
        s.type = "text/javascript"; s.async = !0;
        s.src = r + "?sdkid=" + e + "&lib=" + t;
        const a = d.getElementsByTagName("script")[0];
        a.parentNode.insertBefore(s, a);
      };
      ttq.load(CFG.tiktok_pixel_id);
    }(window, document, "ttq");
  }

  ready = true;
  while (queue.length) { const fn = queue.shift(); try { fn(); } catch (_) { /* noop */ } }
}

export function isTrackingReady() { return ready; }

// ─── Emisores por plataforma ─────────────────────────────────────────────────

function dl(event, data = {}) {
  if (!CFG.gtm_id) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
}
function fbTrack(event, data = {}) {
  if (!CFG.meta_pixel_id || typeof window.fbq !== "function") return;
  window.fbq("track", event, data);
}
function fbCustom(event, data = {}) {
  if (!CFG.meta_pixel_id || typeof window.fbq !== "function") return;
  window.fbq("trackCustom", event, data);
}
function ga(event, params = {}) {
  if (!CFG.ga4_id || typeof window.gtag !== "function") return;
  window.gtag("event", event, params);
}
function tt(event, params = {}) {
  if (!CFG.tiktok_pixel_id || !window.ttq || typeof window.ttq.track !== "function") return;
  window.ttq.track(event, params);
}
function adsConversion(value, txId) {
  if (!CFG.google_ads_id || typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", {
    send_to: CFG.google_ads_label ? `${CFG.google_ads_id}/${CFG.google_ads_label}` : CFG.google_ads_id,
    value,
    currency: "COP",
    transaction_id: txId,
  });
}

// ─── Page View ───────────────────────────────────────────────────────────────

export function gtmPageView(path, title) {
  run(() => {
    const p = path || window.location.pathname;
    const t = title || document.title;
    dl("page_view", { page_path: p, page_title: t });
    fbTrack("PageView");
    if (window.ttq && typeof window.ttq.page === "function") window.ttq.page();
  });
}

// ─── Booking Funnel Events (GA4 ecommerce schema) ────────────────────────────

export function gtmViewItem(product) {
  run(() => {
    const value = product?.precio || 0;
    const id = product?.slug || product?.tipo;
    dl("view_item", {
      ecommerce: {
        currency: "COP", value,
        items: [{ item_id: id, item_name: product?.tipo, item_category: "Pasadía", price: value, quantity: 1 }],
      },
    });
    ga("view_item", { currency: "COP", value, items: [{ item_id: id, item_name: product?.tipo, price: value }] });
    fbCustom("ViewContent", { content_type: "product", content_ids: [id], content_name: product?.tipo, value, currency: "COP" });
    tt("ViewContent", { content_id: id, content_type: "product", value, currency: "COP" });
  });
}

export function gtmBeginCheckout(product, pax, monto) {
  run(() => {
    const id = product?.slug || product?.tipo;
    dl("begin_checkout", {
      ecommerce: {
        currency: "COP", value: monto,
        items: [{ item_id: id, item_name: product?.tipo, item_category: "Pasadía", price: product?.precio || 0, quantity: pax || 1 }],
      },
    });
    ga("begin_checkout", { currency: "COP", value: monto, items: [{ item_id: id, item_name: product?.tipo, quantity: pax || 1 }] });
    fbCustom("InitiateCheckout", { value: monto, currency: "COP", num_items: pax, content_ids: [id] });
    tt("InitiateCheckout", { content_id: id, value: monto, currency: "COP", quantity: pax || 1 });
  });
}

export function gtmAddPaymentInfo(method, monto) {
  run(() => {
    dl("add_payment_info", { ecommerce: { currency: "COP", value: monto, payment_type: method } });
    ga("add_payment_info", { currency: "COP", value: monto, payment_type: method });
    fbCustom("AddPaymentInfo", { value: monto, currency: "COP" });
    tt("AddPaymentInfo", { value: monto, currency: "COP" });
  });
}

export function gtmPurchase(reservaId, monto, product, adultos, ninos, fecha) {
  run(() => {
    const qty = (adultos || 1) + (ninos || 0);
    const id  = product?.slug || product?.tipo || "pasadia";
    dl("purchase", {
      ecommerce: {
        transaction_id: reservaId, currency: "COP", value: monto,
        items: [{ item_id: id, item_name: product?.tipo || "Pasadía", item_category: "Pasadía", price: monto / Math.max(qty, 1), quantity: qty }],
      },
    });
    ga("purchase", {
      transaction_id: reservaId, currency: "COP", value: monto,
      items: [{ item_id: id, item_name: product?.tipo || "Pasadía", price: monto / Math.max(qty, 1), quantity: qty }],
    });
    fbTrack("Purchase", { value: monto, currency: "COP", content_ids: [id], content_type: "product", num_items: qty });
    tt("CompletePayment", { content_id: id, value: monto, currency: "COP", quantity: qty });
    adsConversion(monto, reservaId);
  });
}

export function gtmPaymentError(method, errorCode) {
  run(() => {
    dl("payment_error", { payment_method: method, error_code: errorCode });
    fbCustom("PaymentError", { method, error_code: errorCode });
  });
}

export function gtmAbandon(step, monto) {
  run(() => fbCustom("AbandonCheckout", { paso: step, value: monto || 0, currency: "COP" }));
}

export function gtmWhatsApp(source) {
  run(() => {
    dl("whatsapp_click", { source });
    fbCustom("Contact", { method: "whatsapp", source });
    tt("Contact", { source });
  });
}

export function gtmExitIntent(step) {
  run(() => fbCustom("ExitIntent", { paso: step }));
}

export function gtmScrollDepth(pct) {
  run(() => dl("scroll", { percent_scrolled: pct }));
}
