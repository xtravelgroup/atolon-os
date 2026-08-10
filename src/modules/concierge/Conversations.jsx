import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, IS, TAG, EMPTY, BTN } from "./_shared.jsx";

export default function Conversations({ tenantId }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [customerReservas, setCustomerReservas] = useState([]);

  const load = useCallback(async () => {
    let q = supabase.from("ai_conversations").select("*").eq("tenant_id", tenantId).order("ultimo_mensaje_at", { ascending: false, nullsFirst: false }).limit(200);
    if (filter === "needs_reply") q = q.eq("estado", "needs_reply");
    if (filter === "handoff")     q = q.eq("estado", "handoff");
    // Filtro B2B: conversaciones que llegan del canal WA B2B (metadata.canal_tipo='b2b')
    if (filter === "b2b")         q = q.filter("metadata->>canal_tipo", "eq", "b2b");
    // Filtro Confirm: respuestas al WA principal (post-confirmación de reserva, etc.)
    if (filter === "confirm")     q = q.filter("metadata->>canal_tipo", "eq", "confirm");
    if (search) q = q.ilike("contact_nombre", `%${search}%`);
    const { data } = await q;
    setRows(data || []);
  }, [tenantId, filter, search]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setMessages([]); setCustomerReservas([]); return; }
    supabase.from("ai_messages").select("*").eq("conversation_id", selected.id).order("created_at").then(({ data }) => setMessages(data || []));
    // Cargar reservas activas del cliente (por últimos 10 dígitos del tel).
    // Aplica principalmente a Confirm y B2B (donde contact_id es el WA), pero
    // no hace daño para otros canales — simplemente no matchea.
    const tel10 = String(selected.contact_id || "").replace(/\D/g, "").slice(-10);
    if (tel10.length >= 7) {
      const today = new Date().toISOString().slice(0, 10);
      supabase.from("reservas")
        .select("id, nombre, fecha, tipo, canal, pax, pax_a, pax_n, salida_id, nombre_embarcacion, estado, forma_pago, total, abono, saldo, aliado_id")
        .neq("estado", "cancelado")
        .gte("fecha", today)
        .or(`telefono.ilike.%${tel10},contacto.ilike.%${tel10}`)
        .order("fecha", { ascending: true })
        .limit(10)
        .then(({ data }) => setCustomerReservas(data || []));
    } else {
      setCustomerReservas([]);
    }
  }, [selected]);

  const abrirReserva = (reservaId) => {
    window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "reservas", reservaId } }));
  };
  const abrirAliadoB2B = (aliadoId) => {
    window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "b2b", aliadoId } }));
  };

  const fmtCOP = (n) => Number(n || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const fmtFecha = (f) => {
    if (!f) return "";
    const d = String(f).slice(0, 10);
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const enviarReply = async () => {
    if (!reply.trim() || !selected) return;
    const texto = reply;
    setReply("");
    const { data: { user } } = await supabase.auth.getUser();
    // Llamar al edge function que ADEMÁS de guardar el mensaje lo envía por
    // WhatsApp al cliente vía Meta Graph API.
    const { data, error } = await supabase.functions.invoke("concierge-send-manual", {
      body: {
        conversation_id: selected.id,
        contenido: texto,
        autor_email: user?.email || null,
      },
    });
    if (error || data?.ok === false) {
      alert("⚠ El mensaje se guardó pero NO llegó por WhatsApp: " + (data?.error || error?.message || "error desconocido"));
    }
    load();
    supabase.from("ai_messages").select("*").eq("conversation_id", selected.id).order("created_at").then(({ data }) => setMessages(data || []));
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
      <HEADER title="💬 Conversaciones" subtitle={`${rows.length} conversaciones`} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["all","All"],["needs_reply","Needs reply"],["handoff","Handoff"],["b2b","🏢 B2B"],["confirm","✅ Confirm"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ ...BTN(filter===k?B.sky:B.navyLight, filter===k?B.navy:"#fff"), fontSize: 11 }}>{l}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar contactos" style={{ ...IS, maxWidth: 280 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: selected ? "360px 1fr" : "1fr", gap: 12, flex: 1, overflow: "hidden" }}>
        <div style={{ ...CARD, overflowY: "auto", padding: 0 }}>
          {rows.length === 0 ? <EMPTY icon="💬" text="Sin conversaciones aún" /> : (
            rows.map(r => (
              <div key={r.id} onClick={() => setSelected(r)}
                style={{ padding: 12, borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", background: selected?.id === r.id ? B.navy : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 13 }}>{r.contact_nombre || r.contact_id}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{r.ultimo_mensaje_at ? new Date(r.ultimo_mensaje_at).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}) : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  {r.channel_tipo && TAG(B.sky, r.channel_tipo)}
                  {r.metadata?.canal_tipo === "b2b" && TAG("#a88530", `🏢 ${r.metadata?.aliado_nombre || "B2B"}`)}
                  {r.metadata?.canal_tipo === "confirm" && TAG("#22c55e", "✅ Confirm")}
                  {r.estado !== "live" && TAG(r.estado === "handoff" ? B.danger : B.warning, r.estado)}
                  {r.fuente === "meta_ad" && TAG("#a78bfa", "Meta ad")}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.ultimo_mensaje}
                </div>
              </div>
            ))
          )}
        </div>
        {selected && (
          <div style={{ ...CARD, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ borderBottom: `1px solid ${B.navyLight}`, paddingBottom: 10, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{selected.contact_nombre || selected.contact_id}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{selected.contact_id} · {selected.channel_tipo}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {selected.metadata?.canal_tipo === "b2b" && selected.metadata?.aliado_id && (
                  <button onClick={() => abrirAliadoB2B(selected.metadata.aliado_id)} style={BTN("#a88530")}>
                    🏢 Abrir perfil B2B
                  </button>
                )}
                <button onClick={async () => { await supabase.from("ai_conversations").update({ estado: "resolved" }).eq("id", selected.id); setSelected(null); load(); }} style={BTN(B.success)}>✓ Resolver</button>
                <button onClick={async () => { await supabase.from("ai_conversations").update({ estado: "handoff" }).eq("id", selected.id); load(); }} style={BTN(B.warning)}>🙋 Handoff</button>
              </div>
            </div>

            {/* Panel de reservas del cliente — aparece si tiene reservas activas */}
            {customerReservas.length > 0 && (
              <div style={{ background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
                  ⚓ Reservas activas ({customerReservas.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {customerReservas.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", background: B.navyMid, borderRadius: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.nombre} · {r.tipo}
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                          {fmtFecha(r.fecha)} · {r.pax}p · {r.estado}
                          {r.saldo > 0 && <span style={{ color: B.warning, marginLeft: 6 }}>· saldo {fmtCOP(r.saldo)}</span>}
                        </div>
                      </div>
                      <button onClick={() => abrirReserva(r.id)}
                        style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Abrir →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
              {messages.map(m => {
                // Detectar media adjunta: contenido tiene formato "[IMAGEN|DOCUMENTO... — VER: <url>]"
                const urlMatch = String(m.contenido || "").match(/VER:\s*(https?:\/\/[^\s\]]+)/i);
                const mediaUrl = urlMatch?.[1];
                const isImg = mediaUrl && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(mediaUrl);
                const isPdf = mediaUrl && /\.(pdf)(\?|$)/i.test(mediaUrl);
                return (
                <div key={m.id} style={{ display: "flex", justifyContent: m.rol === "user" ? "flex-start" : "flex-end" }}>
                  <div style={{ maxWidth: "80%", background: m.rol === "user" ? B.navy : (m.origen === "human" ? B.success : B.sky), color: m.rol === "user" ? "#fff" : B.navy, padding: "8px 12px", borderRadius: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>
                    {mediaUrl && isImg && (
                      <a href={mediaUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: 6 }}>
                        <img src={mediaUrl} alt="adjunto" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 6, display: "block" }} />
                      </a>
                    )}
                    {mediaUrl && !isImg && (
                      <a href={mediaUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "6px 10px", background: "rgba(255,255,255,0.2)", borderRadius: 6, color: "inherit", textDecoration: "none", marginBottom: 6, fontSize: 11 }}>
                        {isPdf ? "📄 Abrir PDF" : "📎 Abrir adjunto"}
                      </a>
                    )}
                    {!mediaUrl && m.contenido}
                    {mediaUrl && (
                      <div style={{ fontSize: 10, opacity: 0.7 }}>{String(m.contenido || "").replace(/\s*—?\s*VER:\s*https?:\/\/\S+/i, "").replace(/[\[\]]/g, "")}</div>
                    )}
                    <div style={{ fontSize: 9, marginTop: 4, opacity: 0.6 }}>
                      {m.origen === "human" ? "👤 " + (m.autor_email?.split("@")[0] || "humano") : m.rol === "assistant" ? "🤖 bot" : "usuario"} · {new Date(m.created_at).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === "Enter" && enviarReply()} placeholder="Escribe una respuesta manual…" style={IS} />
              <button onClick={enviarReply} style={BTN(B.success)}>➤</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
