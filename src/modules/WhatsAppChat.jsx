// WhatsAppChat — Bandeja de conversaciones de WhatsApp con cliente.
// 3 columnas: lista de chats | chat activo | contexto del cliente.
// Permite: ver historial, alternar IA on/off, tomar control humano,
// enviar respuesta libre.

import { useState, useEffect, useRef, useCallback } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function WhatsAppChat() {
  const { isMobile } = useBreakpoint();
  const [conversaciones, setConversaciones] = useState([]);
  const [activeId,        setActiveId]        = useState(null);
  const [mensajes,        setMensajes]        = useState([]);
  const [reservasCliente, setReservasCliente] = useState([]);
  const [loadingConvs,    setLoadingConvs]    = useState(true);
  const [search,          setSearch]          = useState("");
  const [composer,        setComposer]        = useState("");
  const [sending,         setSending]         = useState(false);
  const [aiTesting,       setAiTesting]       = useState(false);
  const messagesEndRef = useRef(null);

  // ── Cargar lista de conversaciones ─────────────────────────────────
  const fetchConversaciones = useCallback(async () => {
    if (!supabase) return;
    setLoadingConvs(true);
    const { data } = await supabase
      .from("wa_conversaciones")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(100);
    setConversaciones(data || []);
    setLoadingConvs(false);
  }, []);

  useEffect(() => { fetchConversaciones(); }, [fetchConversaciones]);

  // Realtime: escuchar nuevas mensajes/conversaciones
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel("wa-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_conversaciones" },
        () => fetchConversaciones())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_mensajes" },
        (p) => { if (p.new.conversacion_id === activeId) loadMensajes(activeId); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, fetchConversaciones]);

  // ── Cargar mensajes de la conversación activa ──────────────────────
  const loadMensajes = useCallback(async (id) => {
    if (!id || !supabase) return;
    const { data } = await supabase
      .from("wa_mensajes")
      .select("*")
      .eq("conversacion_id", id)
      .order("sent_at", { ascending: true })
      .limit(200);
    setMensajes(data || []);
    // Marcar como leídas
    supabase.from("wa_conversaciones").update({ unread_count: 0 }).eq("id", id);
  }, []);

  useEffect(() => { if (activeId) loadMensajes(activeId); }, [activeId, loadMensajes]);

  // ── Cargar reservas del cliente activo ────────────────────────────
  useEffect(() => {
    if (!activeId || !supabase) { setReservasCliente([]); return; }
    const conv = conversaciones.find(c => c.id === activeId);
    if (!conv) return;
    supabase.from("reservas")
      .select("id, fecha, tipo, estado, pax, total")
      .or(`telefono.eq.${conv.telefono},contacto.eq.${conv.telefono}`)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setReservasCliente(data || []));
  }, [activeId, conversaciones]);

  // Auto-scroll al final
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const activeConv = conversaciones.find(c => c.id === activeId);
  const filteredConvs = conversaciones.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.nombre || "").toLowerCase().includes(q) || (c.telefono || "").includes(q);
  });

  // ── Enviar texto libre como admin ─────────────────────────────────
  const enviarTexto = async () => {
    if (!composer.trim() || !activeConv || sending) return;
    setSending(true);
    try {
      const userEmail = (await supabase.auth.getUser()).data?.user?.email || "admin";
      // 1. Enviar vía send-whatsapp/send-text
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp/send-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON}`,
          "apikey": SUPABASE_ANON,
        },
        body: JSON.stringify({ to: activeConv.telefono, body: composer.trim() }),
      });
      const data = await r.json();
      const messageId = data?.messages?.[0]?.id || null;

      // 2. Guardar en wa_mensajes
      await supabase.from("wa_mensajes").insert({
        conversacion_id: activeConv.id,
        wa_message_id:   messageId,
        direction:       "out",
        type:            "text",
        content:         composer.trim(),
        sender:          userEmail,
        status:          messageId ? "sent" : "error",
        raw:             data,
      });

      setComposer("");
      loadMensajes(activeConv.id);
    } catch (err) {
      alert("Error enviando: " + err.message);
    }
    setSending(false);
  };

  // ── Toggle IA on/off para esta conversación ───────────────────────
  const toggleAI = async () => {
    if (!activeConv) return;
    await supabase.from("wa_conversaciones").update({
      ai_enabled: !activeConv.ai_enabled,
      ai_paused_until: null,
      taken_over_by: !activeConv.ai_enabled ? null : (await supabase.auth.getUser()).data?.user?.email,
      taken_over_at: !activeConv.ai_enabled ? null : new Date().toISOString(),
    }).eq("id", activeConv.id);
    fetchConversaciones();
  };

  // ── Pedir a IA que responda manualmente ───────────────────────────
  const triggerAI = async () => {
    if (!activeConv || aiTesting) return;
    setAiTesting(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-ai/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON}`,
          "apikey": SUPABASE_ANON,
        },
        body: JSON.stringify({ conversacion_id: activeConv.id }),
      });
      const data = await r.json();
      if (data?.error) alert("AI error: " + data.error);
      loadMensajes(activeConv.id);
    } catch (err) {
      alert("Error: " + err.message);
    }
    setAiTesting(false);
  };

  // ── UI ──────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: isMobile ? "column" : "row", gap: 0, background: B.navy, color: B.white, overflow: "hidden" }}>

      {/* COLUMNA 1: lista de chats */}
      {(!isMobile || !activeId) && (
        <div style={{ width: isMobile ? "100%" : 320, borderRight: `1px solid ${B.navyLight}`, display: "flex", flexDirection: "column", background: B.navyMid }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>💬 WhatsApp</div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre o teléfono..."
              style={{ width: "100%", padding: "8px 12px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loadingConvs ? (
              <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando...</div>
            ) : filteredConvs.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                Aún no hay conversaciones.<br/>
                <span style={{ fontSize: 11 }}>Cuando un cliente te escriba a +1 786 917 3131 aparecerá aquí.</span>
              </div>
            ) : (
              filteredConvs.map(c => (
                <ChatRow key={c.id} conv={c} active={c.id === activeId} onClick={() => setActiveId(c.id)} />
              ))
            )}
          </div>
        </div>
      )}

      {/* COLUMNA 2: mensajes */}
      {(activeConv && (!isMobile || activeId)) && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${B.navyLight}`, background: B.navyMid, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {isMobile && (
              <button onClick={() => setActiveId(null)} style={{ background: "none", border: "none", color: B.sand, fontSize: 16, cursor: "pointer" }}>←</button>
            )}
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{activeConv.nombre || "Sin nombre"}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{activeConv.telefono}</div>
            </div>
            <button onClick={triggerAI} disabled={aiTesting}
              style={{ padding: "6px 12px", background: B.sky + "22", color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {aiTesting ? "⏳ IA pensando..." : "🤖 Responder con IA"}
            </button>
            <button onClick={toggleAI}
              style={{ padding: "6px 12px",
                background: activeConv.ai_enabled ? B.success + "22" : B.warning + "22",
                color: activeConv.ai_enabled ? B.success : B.warning,
                border: `1px solid ${activeConv.ai_enabled ? B.success : B.warning}44`,
                borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {activeConv.ai_enabled ? "🤖 IA ON" : "🙋 Manual"}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 14, background: B.navy }}>
            {mensajes.map(m => <MessageBubble key={m.id} msg={m} />)}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div style={{ padding: 12, borderTop: `1px solid ${B.navyLight}`, background: B.navyMid, display: "flex", gap: 8 }}>
            <input value={composer} onChange={e => setComposer(e.target.value)}
              onKeyDown={e => e.key === "Enter" && enviarTexto()}
              placeholder="Escribe una respuesta como admin..."
              style={{ flex: 1, padding: "10px 14px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, fontSize: 13, outline: "none" }} />
            <button onClick={enviarTexto} disabled={sending || !composer.trim()}
              style={{ padding: "10px 18px", background: "#25D366", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: sending ? "default" : "pointer" }}>
              {sending ? "..." : "Enviar"}
            </button>
          </div>
        </div>
      )}

      {/* COLUMNA 3: contexto del cliente */}
      {activeConv && !isMobile && (
        <div style={{ width: 280, borderLeft: `1px solid ${B.navyLight}`, padding: 16, background: B.navyMid, overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Contexto</div>

          <div style={{ background: B.navy, padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
            <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>📱 Teléfono</div>
            <div style={{ fontFamily: "monospace" }}>{activeConv.telefono}</div>
          </div>

          {activeConv.taken_over_by && (
            <div style={{ background: B.warning + "15", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 11, color: B.warning, border: `1px solid ${B.warning}33` }}>
              🙋 Tomado por: {activeConv.taken_over_by}
            </div>
          )}

          {activeConv.ai_paused_until && new Date(activeConv.ai_paused_until) > new Date() && (
            <div style={{ background: B.warning + "15", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 11, color: B.warning, border: `1px solid ${B.warning}33` }}>
              ⏸️ IA pausada hasta: {new Date(activeConv.ai_paused_until).toLocaleString("es-CO")}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 16, marginBottom: 8 }}>Reservas</div>
          {reservasCliente.length === 0 ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Sin reservas asociadas</div>
          ) : (
            reservasCliente.map(r => (
              <div key={r.id} style={{ background: B.navy, padding: 10, borderRadius: 8, marginBottom: 6, fontSize: 11 }}>
                <div style={{ fontWeight: 600 }}>{r.tipo}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{r.fecha} · {r.pax} pax</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4,
                    background: r.estado === "confirmado" ? B.success + "22" : B.warning + "22",
                    color: r.estado === "confirmado" ? B.success : B.warning }}>{r.estado}</span>
                  <span style={{ color: B.sand, fontWeight: 600 }}>${(r.total || 0).toLocaleString("es-CO")}</span>
                </div>
              </div>
            ))
          )}

          {activeConv.tags && activeConv.tags.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 16, marginBottom: 8 }}>Tags</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {activeConv.tags.map(t => (
                  <span key={t} style={{ fontSize: 10, padding: "2px 8px", background: B.navy, borderRadius: 10, color: B.sand }}>#{t}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChatRow({ conv, active, onClick }) {
  const last = conv.last_message_at ? new Date(conv.last_message_at) : null;
  const tiempo = last ? formatTime(last) : "";
  const hayUnread = (conv.unread_count || 0) > 0;
  return (
    <div onClick={onClick}
      style={{ padding: "12px 14px", borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer",
        background: active ? B.navy : "transparent",
        borderLeft: `3px solid ${active ? B.sand : "transparent"}` }}
      onMouseEnter={e => !active && (e.currentTarget.style.background = B.navy + "55")}
      onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 13, fontWeight: hayUnread ? 700 : 500 }}>
            {conv.nombre || conv.telefono}
          </span>
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{tiempo}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 6 }}>
          {conv.last_direction === "in" ? "↘ " : "↗ "}{conv.telefono}
        </span>
        {hayUnread && (
          <span style={{ background: B.sand, color: B.navy, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10, minWidth: 18, textAlign: "center" }}>
            {conv.unread_count}
          </span>
        )}
        {!conv.ai_enabled && (
          <span style={{ background: B.warning + "22", color: B.warning, fontSize: 9, padding: "1px 6px", borderRadius: 10, marginLeft: 4 }}>
            🙋 Manual
          </span>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isOut = msg.direction === "out";
  const isAI = msg.sender === "ai";
  const bg = isOut ? (isAI ? B.sky + "22" : "#25D36622") : B.navyMid;
  const border = isOut ? (isAI ? B.sky : "#25D366") : B.navyLight;
  return (
    <div style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div style={{ maxWidth: "75%", padding: "8px 12px", borderRadius: 10, background: bg, border: `1px solid ${border}33`, fontSize: 13, lineHeight: 1.5 }}>
        {isOut && (
          <div style={{ fontSize: 9, color: isAI ? B.sky : "#25D366", marginBottom: 3, fontWeight: 700, letterSpacing: "0.05em" }}>
            {isAI ? "🤖 IA" : (msg.sender || "ATOLÓN")}
          </div>
        )}
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content || `[${msg.type}]`}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
          <span>{new Date(msg.sent_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
          {isOut && msg.status && (
            <span>{msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : msg.status === "sent" ? "✓" : msg.status === "failed" ? "✕" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(d) {
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
