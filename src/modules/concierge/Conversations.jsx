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

  const load = useCallback(async () => {
    let q = supabase.from("ai_conversations").select("*").eq("tenant_id", tenantId).order("ultimo_mensaje_at", { ascending: false, nullsFirst: false }).limit(200);
    if (filter === "needs_reply") q = q.eq("estado", "needs_reply");
    if (filter === "handoff")     q = q.eq("estado", "handoff");
    // Filtro B2B: conversaciones que llegan del canal WA B2B (metadata.canal_tipo='b2b')
    if (filter === "b2b")         q = q.filter("metadata->>canal_tipo", "eq", "b2b");
    if (search) q = q.ilike("contact_nombre", `%${search}%`);
    const { data } = await q;
    setRows(data || []);
  }, [tenantId, filter, search]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) return setMessages([]);
    supabase.from("ai_messages").select("*").eq("conversation_id", selected.id).order("created_at").then(({ data }) => setMessages(data || []));
  }, [selected]);

  const enviarReply = async () => {
    if (!reply.trim() || !selected) return;
    const id = `MSG-${Date.now()}`;
    await supabase.from("ai_messages").insert({
      id, conversation_id: selected.id, tenant_id: tenantId,
      rol: "assistant", contenido: reply, origen: "human",
    });
    await supabase.from("ai_conversations").update({
      estado: "live", ultimo_mensaje: reply, ultimo_mensaje_at: new Date().toISOString(),
    }).eq("id", selected.id);
    setReply(""); load();
    supabase.from("ai_messages").select("*").eq("conversation_id", selected.id).order("created_at").then(({ data }) => setMessages(data || []));
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
      <HEADER title="💬 Conversaciones" subtitle={`${rows.length} conversaciones`} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["all","All"],["needs_reply","Needs reply"],["handoff","Handoff"],["b2b","🏢 B2B"]].map(([k,l]) => (
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
                <button onClick={async () => { await supabase.from("ai_conversations").update({ estado: "resolved" }).eq("id", selected.id); setSelected(null); load(); }} style={BTN(B.success)}>✓ Resolver</button>
                <button onClick={async () => { await supabase.from("ai_conversations").update({ estado: "handoff" }).eq("id", selected.id); load(); }} style={BTN(B.warning)}>🙋 Handoff</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
              {messages.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: m.rol === "user" ? "flex-start" : "flex-end" }}>
                  <div style={{ maxWidth: "80%", background: m.rol === "user" ? B.navy : (m.origen === "human" ? B.success : B.sky), color: m.rol === "user" ? "#fff" : B.navy, padding: "8px 12px", borderRadius: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>
                    {m.contenido}
                    <div style={{ fontSize: 9, marginTop: 4, opacity: 0.6 }}>
                      {m.origen === "human" ? "👤 " + (m.autor_email?.split("@")[0] || "humano") : m.rol === "assistant" ? "🤖 bot" : "usuario"} · {new Date(m.created_at).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                </div>
              ))}
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
