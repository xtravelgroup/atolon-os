import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, BTN } from "./_shared.jsx";

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

export default function Home({ tenantId, activeTenant, setTab }) {
  const [stats, setStats] = useState({ conv7: 0, msgs7: 0, resolved: 0, needsReply: 0, handoff: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 });

  useEffect(() => {
    (async () => {
      const desde = new Date(Date.now() - 7 * 864e5).toISOString();
      const [conv, msgs, needs, hand, usage] = await Promise.all([
        supabase.from("ai_conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", desde),
        supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", desde),
        supabase.from("ai_conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("estado", "needs_reply"),
        supabase.from("ai_conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("estado", "handoff"),
        supabase.from("ai_usage").select("tokens_in, tokens_out, cost_usd").eq("tenant_id", tenantId).gte("fecha", desde.slice(0,10)),
      ]);
      const u = (usage.data || []).reduce((s, r) => ({ tin: s.tin + (r.tokens_in||0), tout: s.tout + (r.tokens_out||0), cost: s.cost + Number(r.cost_usd||0) }), { tin: 0, tout: 0, cost: 0 });
      setStats({
        conv7: conv.count || 0, msgs7: msgs.count || 0,
        needsReply: needs.count || 0, handoff: hand.count || 0,
        resolved: 0, tokensIn: u.tin, tokensOut: u.tout, costUsd: u.cost
      });
    })();
  }, [tenantId]);

  const kpis = [
    { l: "Conversaciones · 7d", v: stats.conv7, color: B.sky },
    { l: "Mensajes · 7d", v: stats.msgs7, color: B.success },
    { l: "Necesitan respuesta", v: stats.needsReply, color: B.warning, onClick: () => setTab("convos") },
    { l: "En handoff", v: stats.handoff, color: B.danger, onClick: () => setTab("convos") },
    { l: "Tokens IN · 7d", v: stats.tokensIn.toLocaleString("es-CO"), color: "#a78bfa" },
    { l: "Tokens OUT · 7d", v: stats.tokensOut.toLocaleString("es-CO"), color: "#a78bfa" },
    { l: "Costo Anthropic · 7d", v: "$" + stats.costUsd.toFixed(2), color: B.sand },
  ];

  return (
    <div style={{ padding: 20 }}>
      <HEADER title={`🏠 ${activeTenant?.nombre || "Home"}`} subtitle="Panorama del Concierge en los últimos 7 días" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.l} onClick={k.onClick} style={{ ...CARD, cursor: k.onClick ? "pointer" : "default", borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: 10, color: k.color, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{k.l}</div>
            <div style={{ fontSize: 26, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: "#fff", marginTop: 4 }}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={{ ...CARD, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: B.sky, fontWeight: 700, marginBottom: 8 }}>✨ You're all caught up</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>El Concierge está manejando las conversaciones. Ve a Playground para probarlo o a Channels para conectar WhatsApp / Instagram.</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
          <button onClick={() => setTab("playground")} style={BTN(B.sky, B.navy)}>🧪 Probar en Playground</button>
          <button onClick={() => setTab("channels")} style={BTN(B.success)}>📡 Conectar canal</button>
        </div>
      </div>
    </div>
  );
}
