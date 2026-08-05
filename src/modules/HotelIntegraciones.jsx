// Panel para conectar Atolón OS con Cloudbeds (OAuth + estado sync).
// También leer/reintentar syncs manuales y ver el log reciente.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useMobile } from "../lib/useMobile";

const CB_CLIENT_ID  = import.meta.env.VITE_CLOUDBEDS_CLIENT_ID || "";
const CB_REDIRECT   = import.meta.env.VITE_CLOUDBEDS_REDIRECT_URI
                    || "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/cloudbeds-oauth-callback";
const CB_AUTH_URL   = "https://hotels.cloudbeds.com/api/v1.1/oauth";
const SCOPES = [
  "read:reservation","write:reservation",
  "read:guest","write:guest",
  "read:hotel","read:room","read:roomType",
  "read:rate","write:rate",
  "read:dashboard",
].join(" ");

export default function HotelIntegraciones() {
  const { isMobile } = useMobile();
  const [creds, setCreds] = useState([]);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ""));
    const p = new URLSearchParams(window.location.search);
    if (p.get("cb_connected")) setMsg(`✅ Cloudbeds conectado (${p.get("cb_connected")} propiedad(es))`);
    if (p.get("cb_error"))     setMsg(`❌ ${p.get("cb_error")}`);
    load();
  }, []);

  const load = async () => {
    const [c, l] = await Promise.all([
      supabase.from("cloudbeds_credentials").select("*").order("created_at", { ascending: false }),
      supabase.from("cloudbeds_sync_log").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setCreds(c.data || []); setLog(l.data || []);
  };

  const iniciarOAuth = () => {
    if (!CB_CLIENT_ID) {
      alert("Falta configurar VITE_CLOUDBEDS_CLIENT_ID en el frontend.\n\n" +
            "1) Ve a https://hotels.cloudbeds.com/api/marketplace/apps y crea una app.\n" +
            "2) Copia el Client ID y agrégalo como env var en Vercel + Supabase edge functions.\n" +
            "3) Copia también el Client Secret solo en Supabase (CLOUDBEDS_CLIENT_SECRET).");
      return;
    }
    const state = encodeURIComponent(email || "system");
    const url = `${CB_AUTH_URL}/authorize?client_id=${CB_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(CB_REDIRECT)}` +
      `&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${state}`;
    window.location.href = url;
  };

  const sync = async (property_id) => {
    setBusy(property_id); setMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("cloudbeds-sync-reservations", {
        body: { property_id },
      });
      if (error) throw error;
      const r = data?.results?.[0];
      if (r?.ok) setMsg(`✅ ${r.registros_new} nuevas · ${r.registros_up} actualizadas · ${r.registros_in} leídas`);
      else       setMsg(`❌ ${r?.error || "error"}`);
    } catch (e) { setMsg("❌ " + (e.message || e)); }
    setBusy(""); load();
  };
  const toggle = async (c) => {
    await supabase.from("cloudbeds_credentials").update({ activo: !c.activo }).eq("property_id", c.property_id);
    load();
  };
  const desconectar = async (c) => {
    if (!confirm(`¿Desconectar ${c.property_nombre || c.property_id}? Se perderán los tokens y habrá que volver a autorizar.`)) return;
    await supabase.from("cloudbeds_credentials").delete().eq("property_id", c.property_id);
    load();
  };

  const CARD = { background: B.navyMid, borderRadius: 12, padding: 20, border: `1px solid ${B.navyLight}`, marginBottom: 14 };
  const BTN = (bg, color="#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });

  return (
    <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 800, color: "#fff" }}>🔌 Integraciones Hotel</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>Cloudbeds ↔ Atolón OS · sync bidireccional</div>
        </div>
        <button onClick={iniciarOAuth} style={BTN(B.sky, B.navy)}>+ Conectar Cloudbeds</button>
      </div>
      {msg && <div style={{ ...CARD, borderLeft: `4px solid ${msg.startsWith("✅") ? B.success : B.danger}`, marginBottom: 14 }}>{msg}</div>}

      <div style={CARD}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 12 }}>Propiedades conectadas</div>
        {creds.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 20 }}>
            Sin propiedades conectadas. Haz click en "+ Conectar Cloudbeds" arriba.
          </div>
        ) : (
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ color: B.sand, textTransform: "uppercase", fontSize: 10, textAlign: "left" }}>
                <th style={{ padding: 8 }}>Propiedad</th><th>Último sync</th><th>Status</th><th>Activo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {creds.map(c => (
                <tr key={c.property_id} style={{ borderTop: `1px solid ${B.navyLight}`, color: "#fff" }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{c.property_nombre || "(sin nombre)"}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{c.property_id}</div>
                  </td>
                  <td style={{ fontSize: 11 }}>{c.last_sync_at ? new Date(c.last_sync_at).toLocaleString("es-CO") : "—"}</td>
                  <td>
                    <span style={{ background: (c.last_sync_status === "ok" ? B.success : c.last_sync_status === "error" ? B.danger : B.warning) + "22",
                                   color: c.last_sync_status === "ok" ? B.success : c.last_sync_status === "error" ? B.danger : B.warning,
                                   padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                      {c.last_sync_status || "pending"}
                    </span>
                    {c.last_error && <div style={{ fontSize: 10, color: B.danger, marginTop: 4, maxWidth: 240 }}>{c.last_error}</div>}
                  </td>
                  <td><input type="checkbox" checked={c.activo} onChange={() => toggle(c)} /></td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => sync(c.property_id)} disabled={busy === c.property_id} style={{ ...BTN(B.sky, B.navy), marginRight: 6, fontSize: 11 }}>
                      {busy === c.property_id ? "…" : "🔄 Sync"}
                    </button>
                    <button onClick={() => desconectar(c)} style={{ ...BTN(B.danger), fontSize: 11 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={CARD}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 12 }}>Log de sync reciente</div>
        {log.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Aún no hay corridas.</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {log.map(l => (
              <div key={l.id} style={{ display: "flex", gap: 10, fontSize: 11, padding: "6px 0", borderBottom: `1px solid ${B.navyLight}` }}>
                <span style={{ color: "rgba(255,255,255,0.4)", minWidth: 130 }}>{new Date(l.created_at).toLocaleString("es-CO")}</span>
                <span style={{ color: B.sand, minWidth: 80 }}>{l.tipo}</span>
                <span style={{ color: "rgba(255,255,255,0.6)", flex: 1 }}>
                  {l.registros_in ? `${l.registros_new || 0} new / ${l.registros_up || 0} up / ${l.registros_in} in` : ""}
                  {l.duracion_ms ? ` · ${l.duracion_ms}ms` : ""}
                </span>
                <span style={{ color: l.status === "ok" ? B.success : B.danger, minWidth: 40 }}>{l.status}</span>
                {l.error && <span style={{ color: B.danger, maxWidth: 300 }}>{l.error.slice(0, 100)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...CARD, borderLeft: `4px solid ${B.warning}` }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: B.warning, marginBottom: 8 }}>🛠️ Setup manual requerido (una sola vez)</div>
        <ol style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, paddingLeft: 22 }}>
          <li>Aplica tu app en <a href="https://hotels.cloudbeds.com/api/marketplace/apps" target="_blank" rel="noreferrer" style={{ color: B.sky }}>Cloudbeds Marketplace</a> (Register your App). Redirect URI: <code style={{ background: B.navy, padding: "2px 6px", borderRadius: 4 }}>{CB_REDIRECT}</code></li>
          <li>Toma <b>Client ID</b> y <b>Client Secret</b> aprobados.</li>
          <li>En Supabase → Edge Function Secrets, agrega: <code>CLOUDBEDS_CLIENT_ID</code>, <code>CLOUDBEDS_CLIENT_SECRET</code>, <code>CLOUDBEDS_REDIRECT_URI</code>, <code>APP_URL=https://www.atolon.co</code></li>
          <li>En Vercel → env vars, agrega: <code>VITE_CLOUDBEDS_CLIENT_ID</code> (mismo valor que el de arriba, solo el ID, sin secret).</li>
          <li>Redeploy Vercel y las 4 edge functions (cloudbeds-oauth-callback, cloudbeds-sync-reservations, cloudbeds-webhook, cloudbeds-push-reservation).</li>
          <li>Aquí click "+ Conectar Cloudbeds" y autoriza la app desde Cloudbeds.</li>
          <li>En Cloudbeds → Marketplace → tu app → Webhooks, apunta a: <code style={{ background: B.navy, padding: "2px 6px", borderRadius: 4 }}>https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/cloudbeds-webhook</code> con eventos: reservation/created, updated, cancelled, checked_in, checked_out.</li>
        </ol>
      </div>
    </div>
  );
}
