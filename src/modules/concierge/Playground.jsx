import { useState, useRef, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, IS, BTN } from "./_shared.jsx";

export default function Playground({ tenantId, activeTenant }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(`PG-${Date.now()}`);
  const bottom = useRef(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const userMsg = { rol: "user", contenido: input, ts: Date.now() };
    setMessages(m => [...m, userMsg]);
    setInput(""); setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("concierge-turn", {
        body: { tenant_id: tenantId, session_id: sessionId, playground: true, message: userMsg.contenido, history: messages },
      });
      if (error) throw error;
      const reply = { rol: "assistant", contenido: data?.reply || "(sin respuesta)", tool_calls: data?.tool_calls, ts: Date.now() };
      setMessages(m => [...m, reply]);
    } catch (e) {
      setMessages(m => [...m, { rol: "assistant", contenido: `⚠️ Error: ${e.message || e}. La edge function concierge-turn probablemente no está desplegada aún.`, error: true, ts: Date.now() }]);
    } finally { setSending(false); }
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
      <HEADER title="🧪 Playground" subtitle={`Prueba el agente sin afectar producción · ${activeTenant?.nombre || ""}`}
        right={<button onClick={() => setMessages([])} style={BTN(B.navyLight)}>+ Nuevo chat</button>} />
      <div style={{ ...CARD, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", padding: 40, fontSize: 13 }}>
            Envía un mensaje abajo para probar al agente.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.rol === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "75%",
              background: m.rol === "user" ? B.sky : (m.error ? B.danger + "22" : B.navy),
              color: m.rol === "user" ? B.navy : (m.error ? B.danger : "#fff"),
              padding: "10px 14px", borderRadius: 12, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.4,
              border: m.rol === "assistant" ? `1px solid ${B.navyLight}` : "none",
            }}>
              {m.contenido}
              {m.tool_calls?.length > 0 && (
                <div style={{ marginTop: 8, borderTop: `1px solid ${B.navyLight}`, paddingTop: 6, fontSize: 10, color: B.sand }}>
                  🛠️ {m.tool_calls.map(t => t.name).join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, padding: 8 }}>Sofía está escribiendo…</div>}
        <div ref={bottom} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Envía un mensaje…" style={IS} />
        <button onClick={send} disabled={sending || !input.trim()} style={BTN(B.success)}>➤ Enviar</button>
      </div>
    </div>
  );
}
