// TrackExterno — vista pública de AtolonTrack (solo Web+Mkt y WhatsApp),
// protegida con una clave propia (independiente del login admin).
// Ruta pública: /track
import { useState, lazy, Suspense, useEffect } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";

const Analitica = lazy(() => import("./Analitica.jsx"));

// Clave configurable en Vercel (VITE_TRACK_CLAVE). Fallback por defecto.
const CLAVE = import.meta.env.VITE_TRACK_CLAVE || "Sky";
const LS_KEY = "atolon_track_externo_ok";

export default function TrackExterno() {
  // Título neutral (marca propia) — no exponer nombres internos.
  useEffect(() => { document.title = "Atolón · Analítica"; }, []);
  const [ok, setOk] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const [vista, setVista] = useState("analitica"); // analitica | config

  const entrar = () => {
    if (val.trim() === CLAVE) {
      try { localStorage.setItem(LS_KEY, "1"); } catch { /* noop */ }
      setOk(true);
    } else {
      setErr(true);
    }
  };

  if (ok) {
    const tabBtn = (k, label) => (
      <button onClick={() => setVista(k)} style={{
        padding: "8px 16px", borderRadius: 999, border: "none", cursor: "pointer",
        fontSize: 13, fontWeight: 700,
        background: vista === k ? B.sand : B.navyLight,
        color: vista === k ? B.navy : B.text,
      }}>{label}</button>
    );
    return (
      <div style={{ minHeight: "100vh", background: B.navy }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px 0", flexWrap: "wrap" }}>
          <img src="/atolon-logo-white.png" alt="Atolón" style={{ height: 34, width: "auto", marginRight: 6 }} />
          {tabBtn("analitica", "📊 Analítica")}
          {tabBtn("config", "⚙️ Configuración")}
        </div>
        {vista === "config" ? (
          <TrackConfig />
        ) : (
          <Suspense fallback={
            <div style={{ minHeight: "60vh", color: B.sand, display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 13 }}>Cargando…</div>
          }>
            <Analitica externo />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: B.navy, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        background: B.navyMid, borderRadius: 16, padding: 32, width: "100%",
        maxWidth: 380, border: `1px solid ${B.navyLight}`,
      }}>
        <img src="/atolon-logo-white.png" alt="Atolón" style={{ height: 44, width: "auto", display: "block", marginBottom: 14 }} />
        <div style={{ fontSize: 13, color: B.muted, marginBottom: 22 }}>
          Analítica — Web + Marketing y WhatsApp
        </div>
        <label style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
          Clave de acceso
        </label>
        <input
          type="password"
          value={val}
          autoFocus
          onChange={e => { setVal(e.target.value); setErr(false); }}
          onKeyDown={e => { if (e.key === "Enter") entrar(); }}
          placeholder="••••••••"
          style={{
            width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 14,
            background: B.navyLight, border: `1px solid ${err ? B.danger || "#F87171" : B.navyLight}`,
            color: "#fff", outline: "none", boxSizing: "border-box",
          }} />
        {err && <div style={{ fontSize: 12, color: B.danger || "#F87171", marginTop: 8 }}>Clave incorrecta.</div>}
        <button onClick={entrar} style={{
          width: "100%", marginTop: 16, padding: "12px 18px", borderRadius: 10,
          border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
          background: B.sand, color: B.navy,
        }}>
          Entrar
        </button>
      </div>
    </div>
  );
}

// ─── Tab Configuración: píxeles / tracking de terceros ───────────────────────
const CAMPOS = [
  { k: "gtm_id",          label: "Google Tag Manager",  ph: "GTM-XXXXXXX",
    hint: "Comodín: dentro de tu GTM agregas cualquier tag (Meta CAPI, Google Ads, LinkedIn, TikTok…) sin tocar el sitio." },
  { k: "meta_pixel_id",   label: "Meta / Facebook Pixel ID", ph: "1234567890123456",
    hint: "Solo el ID numérico del píxel. Dispara PageView, ViewContent, InitiateCheckout, Purchase." },
  { k: "ga4_id",          label: "Google Analytics 4 (Measurement ID)", ph: "G-XXXXXXXXXX",
    hint: "Eventos ecommerce (page_view, purchase) directo a GA4." },
  { k: "google_ads_id",   label: "Google Ads (Conversion ID)", ph: "AW-XXXXXXXXXX",
    hint: "Envía la conversión de compra a Google Ads para campañas." },
  { k: "tiktok_pixel_id", label: "TikTok Pixel ID", ph: "CXXXXXXXXXXXXXXXXXX",
    hint: "Dispara Pageview y CompletePayment." },
];

function TrackConfig() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("configuracion")
      .select("meta_pixel_id, gtm_id, ga4_id, google_ads_id, tiktok_pixel_id")
      .eq("id", "atolon").single()
      .then(({ data }) => { setForm(data || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const guardar = async () => {
    setSaving(true); setMsg("");
    const payload = {};
    CAMPOS.forEach(c => { payload[c.k] = (form[c.k] || "").trim() || null; });
    const { error } = await supabase.from("configuracion").update(payload).eq("id", "atolon");
    setSaving(false);
    setMsg(error ? "Error al guardar: " + error.message : "✓ Guardado. Se aplicará en el sitio de reservas.");
  };

  return (
    <div style={{ padding: 24, maxWidth: 640, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "8px 0 4px" }}>⚙️ Configuración de Tracking</h1>
      <div style={{ fontSize: 13, color: B.muted, marginBottom: 20 }}>
        Tus píxeles cargan en el sitio de reservas (booking/pago) para retargeting,
        carritos abandonados y ventas por campaña. Guarda solo los IDs.
      </div>
      {loading ? (
        <div style={{ color: B.sand, fontSize: 13 }}>Cargando…</div>
      ) : (
        <>
          {CAMPOS.map(c => (
            <div key={c.k} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#fff", fontWeight: 700, display: "block", marginBottom: 4 }}>{c.label}</label>
              <input
                value={form[c.k] || ""}
                onChange={e => setForm(f => ({ ...f, [c.k]: e.target.value }))}
                placeholder={c.ph}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14,
                  background: B.navyLight, border: `1px solid ${B.navyLight}`,
                  color: "#fff", outline: "none", boxSizing: "border-box",
                }} />
              <div style={{ fontSize: 11, color: B.muted, marginTop: 4 }}>{c.hint}</div>
            </div>
          ))}
          <button onClick={guardar} disabled={saving} style={{
            marginTop: 6, padding: "12px 22px", borderRadius: 10, border: "none",
            cursor: "pointer", fontWeight: 700, fontSize: 14,
            background: B.sand, color: B.navy, opacity: saving ? 0.6 : 1,
          }}>{saving ? "Guardando…" : "Guardar"}</button>
          {msg && <div style={{ marginTop: 12, fontSize: 13, color: msg.startsWith("✓") ? B.success : (B.danger || "#F87171") }}>{msg}</div>}
          <div style={{ marginTop: 24, fontSize: 11, color: B.muted, lineHeight: 1.6 }}>
            ¿Necesitas otro tipo de tracking (LinkedIn, Meta CAPI, etc.)? Úsalo dentro de
            tu Google Tag Manager — con el GTM configurado arriba puedes agregar cualquier
            etiqueta sin cambios en el sitio.
          </div>
        </>
      )}
    </div>
  );
}
