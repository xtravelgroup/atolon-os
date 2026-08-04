import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER } from "./_shared.jsx";

export default function Insights({ tenantId }) {
  const [usage, setUsage] = useState([]);
  useEffect(() => {
    const desde = new Date(Date.now() - 30*864e5).toISOString().slice(0,10);
    supabase.from("ai_usage").select("*").eq("tenant_id", tenantId).gte("fecha", desde).order("fecha")
      .then(({ data }) => setUsage(data || []));
  }, [tenantId]);
  const total = usage.reduce((s,u) => ({ tin: s.tin+(u.tokens_in||0), tout: s.tout+(u.tokens_out||0), c: s.c+Number(u.cost_usd||0), conv: s.conv+(u.conversations||0) }), { tin:0, tout:0, c:0, conv:0 });
  return (
    <div style={{ padding: 20 }}>
      <HEADER title="📊 Insights" subtitle="Uso y desempeño del agente (últimos 30 días)" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={{ ...CARD, borderLeft: `4px solid ${B.sky}` }}>
          <div style={{ fontSize: 10, color: B.sky, textTransform: "uppercase" }}>Conversaciones</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>{total.conv}</div>
        </div>
        <div style={{ ...CARD, borderLeft: `4px solid #a78bfa` }}>
          <div style={{ fontSize: 10, color: "#a78bfa", textTransform: "uppercase" }}>Tokens IN</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>{total.tin.toLocaleString("es-CO")}</div>
        </div>
        <div style={{ ...CARD, borderLeft: `4px solid #a78bfa` }}>
          <div style={{ fontSize: 10, color: "#a78bfa", textTransform: "uppercase" }}>Tokens OUT</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>{total.tout.toLocaleString("es-CO")}</div>
        </div>
        <div style={{ ...CARD, borderLeft: `4px solid ${B.sand}` }}>
          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase" }}>Costo Anthropic</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>${total.c.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ ...CARD, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
        📈 Gráficos por día, canal y conversión próximamente
      </div>
    </div>
  );
}
