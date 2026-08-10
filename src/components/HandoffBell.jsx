import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

// Campana de notificaciones de handoff en la topbar. Cuenta las
// ai_conversations con estado='handoff' del tenant Atolón, se refresca
// cada 30s + suscripción realtime, muestra badge rojo con contador,
// dropdown con los últimos 10 y suena un beep suave cuando llega uno nuevo.
// Al click en una conversación, dispara atolon-navigate a
// 'conversaciones_ai' con conversation_id → el módulo la abre directo.
const TENANT_ID = "T-ATOLON";

export default function HandoffBell({ isLight = false }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const prevCountRef = useRef(0);
  const soundedForRef = useRef(new Set()); // IDs para los que ya sonamos

  const load = useCallback(async () => {
    const { data, count: total } = await supabase.from("ai_conversations")
      .select("id, contact_id, contact_nombre, ultimo_mensaje, ultimo_mensaje_at, metadata, channel_tipo", { count: "exact" })
      .eq("tenant_id", TENANT_ID).eq("estado", "handoff")
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false }).limit(10);
    const newList = data || [];
    // Sonido: si aparece un id nuevo que no habíamos visto → beep
    const nuevos = newList.filter(x => !soundedForRef.current.has(x.id));
    if (prevCountRef.current > 0 && nuevos.length > 0) beep();
    newList.forEach(x => soundedForRef.current.add(x.id));
    prevCountRef.current = total || 0;
    setCount(total || 0);
    setItems(newList);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    // Realtime: escuchar cambios en ai_conversations del tenant
    const ch = supabase.channel("handoff-bell")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "ai_conversations", filter: `tenant_id=eq.${TENANT_ID}` },
        () => load()
      ).subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const abrir = (conv) => {
    window.dispatchEvent(new CustomEvent("atolon-navigate", {
      detail: { modulo: "conversaciones_ai", conversationId: conv.id },
    }));
    setOpen(false);
  };

  const hasHandoffs = count > 0;
  const iconBg = isLight
    ? (hasHandoffs ? B.danger + "22" : "#F5F5F5")
    : (hasHandoffs ? B.danger + "33" : B.navyLight);
  const iconColor = isLight ? (hasHandoffs ? B.danger : "#666") : "#fff";

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}
        title={hasHandoffs ? `${count} handoff${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"}` : "Sin handoffs"}
        style={{
          width: 32, height: 32, borderRadius: 16, background: iconBg,
          border: "none", cursor: "pointer", fontSize: 15, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: iconColor,
        }}>
        {hasHandoffs ? "🔔" : "🔕"}
        {hasHandoffs && (
          <span style={{
            position: "absolute", top: -4, right: -4, minWidth: 16, height: 16,
            padding: "0 4px", borderRadius: 8, background: B.danger, color: "#fff",
            fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}>{count > 99 ? "99+" : count}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 1000,
          width: 340, maxHeight: 420, overflowY: "auto",
          background: "#FFF", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          border: `1px solid #E0E0E0`,
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #EEF2F6", fontSize: 13, fontWeight: 800, color: B.navy, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>🙋 Handoffs pendientes</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#7A8B99" }}>{count} total</span>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7A8B99", fontSize: 12 }}>
              Sin handoffs pendientes 🎉
            </div>
          ) : items.map(x => {
            const h = x.metadata?.handoff || {};
            return (
              <button key={x.id} onClick={() => abrir(x)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", borderBottom: "1px solid #F5F8FB", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => e.currentTarget.style.background = "#F7FAFC"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {x.contact_nombre || x.contact_id}
                  </div>
                  <div style={{ fontSize: 10, color: "#7A8B99", flexShrink: 0 }}>
                    {x.ultimo_mensaje_at ? new Date(x.ultimo_mensaje_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, padding: "2px 6px", background: B.danger + "22", color: B.danger, borderRadius: 4, fontWeight: 700 }}>
                    {h.tema || "handoff"}
                  </span>
                  {x.metadata?.canal_tipo === "confirm" && <span style={{ fontSize: 10, padding: "2px 6px", background: "#22c55e22", color: "#22c55e", borderRadius: 4, fontWeight: 700 }}>✅ Confirm</span>}
                  {x.metadata?.canal_tipo === "b2b" && <span style={{ fontSize: 10, padding: "2px 6px", background: "#a8853022", color: "#a88530", borderRadius: 4, fontWeight: 700 }}>🏢 B2B</span>}
                </div>
                {h.motivo && (
                  <div style={{ fontSize: 11, color: "#4a5568", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.motivo}
                  </div>
                )}
                {x.ultimo_mensaje && (
                  <div style={{ fontSize: 11, color: "#7A8B99", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>
                    {x.ultimo_mensaje}
                  </div>
                )}
              </button>
            );
          })}
          <div style={{ padding: "10px 14px", borderTop: "1px solid #EEF2F6", textAlign: "center" }}>
            <button onClick={() => { window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "conversaciones_ai" } })); setOpen(false); }}
              style={{ background: "transparent", border: "none", color: B.sky, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              Ver todas las conversaciones →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Beep suave sin archivos (WebAudio API).
function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 300);
  } catch { /* ignore */ }
}
