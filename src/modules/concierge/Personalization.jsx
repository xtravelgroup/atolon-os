import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, IS, LS, BTN } from "./_shared.jsx";

const LINEAS = [
  { key: "general", label: "🌐 General",  desc: "Web, leads, carrito abandonado" },
  { key: "confirm", label: "✅ Confirm",  desc: "Respuestas al WA principal (post-confirmación)" },
  { key: "b2b",     label: "🏢 B2B",      desc: "Agencias y aliados" },
];

export default function Personalization({ tenantId }) {
  const [linea, setLinea] = useState("general");
  const [agent, setAgent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setAgent(null);
    supabase.from("ai_agents").select("*").eq("tenant_id", tenantId).eq("linea", linea).limit(1)
      .then(({ data }) => setAgent(data?.[0] || null));
  }, [tenantId, linea]);

  const set = (patch) => setAgent(a => ({ ...a, ...patch }));

  const guardar = async () => {
    setSaving(true); setMsg("");
    const { error } = await supabase.from("ai_agents").update({
      base_style: agent.base_style, usa_emoji: agent.usa_emoji,
      message_length: agent.message_length, conversation_scope: agent.conversation_scope,
      assistant_name: agent.assistant_name || null,
      custom_instructions: agent.custom_instructions || null,
      model: agent.model, temperature: Number(agent.temperature) || 0.6,
      max_tokens: Number(agent.max_tokens) || 1024,
      updated_at: new Date().toISOString(),
    }).eq("id", agent.id);
    setSaving(false);
    setMsg(error ? "❌ " + error.message : "✅ Guardado");
    setTimeout(() => setMsg(""), 2500);
  };

  return (
    <div style={{ padding: 20 }}>
      <HEADER title="🎨 Personalización" subtitle="Define la voz, tono y comportamiento del agente por línea" right={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith("✅") ? B.success : B.danger }}>{msg}</span>}
          <button onClick={guardar} disabled={saving || !agent} style={BTN(B.success)}>{saving ? "…" : "💾 Guardar"}</button>
        </div>
      } />

      {/* Selector de línea (B2B / Confirm / General) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {LINEAS.map(L => {
          const active = linea === L.key;
          return (
            <button key={L.key} onClick={() => setLinea(L.key)}
              style={{
                background: active ? B.sky : B.navyLight, color: active ? B.navy : "#fff",
                border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer",
                fontWeight: active ? 800 : 500, fontSize: 13, display: "flex", flexDirection: "column",
                alignItems: "flex-start", gap: 2, minWidth: 200,
              }}>
              <span>{L.label}</span>
              <span style={{ fontSize: 10, opacity: active ? 0.75 : 0.6, fontWeight: 500 }}>{L.desc}</span>
            </button>
          );
        })}
      </div>

      {!agent ? (
        <div style={{ ...CARD, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
          Cargando agente para la línea <b style={{ color: "#fff" }}>{linea}</b>…
        </div>
      ) : (
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, maxWidth: 780 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={LS}>Nombre del asistente</label>
            <input value={agent.assistant_name || ""} onChange={e => set({ assistant_name: e.target.value })}
              placeholder="Ej: Sofía · (vacío = sin nombre)" style={IS} />
          </div>
          <div>
            <label style={LS}>Modelo</label>
            <select value={agent.model} onChange={e => set({ model: e.target.value })} style={IS}>
              <option value="claude-sonnet-4-5-20250929">Sonnet 4.5 (recomendado)</option>
              <option value="claude-opus-4-5-20250929">Opus 4.5 (más caro, más capaz)</option>
              <option value="claude-haiku-4-5-20251001">Haiku 4.5 (más rápido/barato)</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <label style={LS}>Estilo base</label>
            <select value={agent.base_style} onChange={e => set({ base_style: e.target.value })} style={IS}>
              <option value="default">Default</option>
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="luxury">Luxury</option>
              <option value="friendly">Friendly</option>
            </select>
          </div>
          <div>
            <label style={LS}>Emoji</label>
            <select value={agent.usa_emoji ? "yes" : "no"} onChange={e => set({ usa_emoji: e.target.value === "yes" })} style={IS}>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label style={LS}>Longitud mensaje</label>
            <select value={agent.message_length} onChange={e => set({ message_length: e.target.value })} style={IS}>
              <option value="short">Corta</option>
              <option value="default">Default</option>
              <option value="long">Larga</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <label style={LS}>Alcance de conversación</label>
            <select value={agent.conversation_scope} onChange={e => set({ conversation_scope: e.target.value })} style={IS}>
              <option value="business">Solo negocio</option>
              <option value="general_business">General + negocio</option>
            </select>
          </div>
          <div>
            <label style={LS}>Temperature ({agent.temperature})</label>
            <input type="range" min="0" max="1" step="0.05" value={agent.temperature}
              onChange={e => set({ temperature: e.target.value })} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={LS}>Max tokens</label>
            <input type="number" min="128" max="4096" value={agent.max_tokens}
              onChange={e => set({ max_tokens: e.target.value })} style={IS} />
          </div>
        </div>
        <div>
          <label style={LS}>Instrucciones personalizadas (system prompt)</label>
          <textarea value={agent.custom_instructions || ""} onChange={e => set({ custom_instructions: e.target.value })}
            rows={12} style={{ ...IS, fontFamily: "monospace", fontSize: 12, lineHeight: 1.5 }}
            placeholder="Ej: Eres Sofía, la concierge de Atolón Beach Club. Habla siempre en primera persona…" />
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Este texto se agrega al system prompt cuando la conversación es de la línea <b style={{ color: "#fff" }}>{linea}</b>.
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
