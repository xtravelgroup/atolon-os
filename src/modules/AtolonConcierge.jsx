// AtolonConcierge — Panel del agente de IA conversacional (tipo Visito.ai)
// Multi-tenant, canales WA/IG/Web, tool-use, RAG, campañas WA.
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useMobile } from "../lib/useMobile";
import AtolonConciergeConversations from "./concierge/Conversations.jsx";
import AtolonConciergePlayground   from "./concierge/Playground.jsx";
import AtolonConciergePersonalization from "./concierge/Personalization.jsx";
import AtolonConciergeKB           from "./concierge/KnowledgeBase.jsx";
import AtolonConciergeHandoff      from "./concierge/HandoffRules.jsx";
import AtolonConciergeChannels     from "./concierge/Channels.jsx";
import AtolonConciergeIntegrations from "./concierge/Integrations.jsx";
import AtolonConciergeTools        from "./concierge/Tools.jsx";
import AtolonConciergeCampaigns    from "./concierge/Campaigns.jsx";
import AtolonConciergeInsights     from "./concierge/Insights.jsx";
import AtolonConciergeFollowups    from "./concierge/Followups.jsx";
import AtolonConciergeHome         from "./concierge/Home.jsx";

const NAV = [
  { grupo: "Operación", items: [
    { k: "home",     l: "Home",          icon: "🏠" },
    { k: "convos",   l: "Conversaciones", icon: "💬", badge: "count_needs_reply" },
    { k: "followups",l: "Follow-ups",    icon: "🔄" },
    { k: "insights", l: "Insights",      icon: "📊" },
  ]},
  { grupo: "Agente",    items: [
    { k: "playground",l: "Playground",   icon: "🧪" },
    { k: "personal",  l: "Personalización", icon: "🎨" },
    { k: "kb",        l: "Knowledge Base",  icon: "📚" },
    { k: "handoff",   l: "Handoff Rules",   icon: "🙋" },
  ]},
  { grupo: "Conexiones", items: [
    { k: "channels",  l: "Canales",       icon: "📡" },
    { k: "integ",     l: "Integraciones", icon: "🔌" },
    { k: "tools",     l: "Tools",         icon: "🛠️" },
  ]},
  { grupo: "Growth",    items: [
    { k: "campaigns", l: "Campañas WA",   icon: "📢" },
  ]},
];

export default function AtolonConcierge({ initialTab = "home", standalone = false } = {}) {
  const { isMobile } = useMobile();
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState(localStorage.getItem("concierge_tenant") || "T-ATOLON");
  const [tab, setTab] = useState(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [needsReply, setNeedsReply] = useState(0);

  useEffect(() => {
    supabase.from("ai_tenants").select("*").eq("activo", true).order("nombre")
      .then(({ data }) => setTenants(data || []));
  }, []);

  useEffect(() => { localStorage.setItem("concierge_tenant", tenantId); }, [tenantId]);

  const reloadCounters = useCallback(async () => {
    const { count } = await supabase.from("ai_conversations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("estado", "needs_reply");
    setNeedsReply(count || 0);
  }, [tenantId]);
  useEffect(() => { reloadCounters(); }, [reloadCounters]);

  const activeTenant = tenants.find(t => t.id === tenantId);
  const commonProps = { tenantId, activeTenant, isMobile, onReload: reloadCounters };

  const content = (
    tab === "home"      ? <AtolonConciergeHome {...commonProps} setTab={setTab} /> :
    tab === "convos"    ? <AtolonConciergeConversations {...commonProps} /> :
    tab === "followups" ? <AtolonConciergeFollowups    {...commonProps} /> :
    tab === "insights"  ? <AtolonConciergeInsights     {...commonProps} /> :
    tab === "playground"? <AtolonConciergePlayground   {...commonProps} /> :
    tab === "personal"  ? <AtolonConciergePersonalization {...commonProps} /> :
    tab === "kb"        ? <AtolonConciergeKB           {...commonProps} /> :
    tab === "handoff"   ? <AtolonConciergeHandoff      {...commonProps} /> :
    tab === "channels"  ? <AtolonConciergeChannels     {...commonProps} /> :
    tab === "integ"     ? <AtolonConciergeIntegrations {...commonProps} /> :
    tab === "tools"     ? <AtolonConciergeTools        {...commonProps} /> :
    tab === "campaigns" ? <AtolonConciergeCampaigns    {...commonProps} /> :
    null
  );

  // Modo standalone (ej. entrada desde el menú Comercial → Conversaciones):
  // renderizar solo la vista, sin el sidebar interno del Concierge.
  if (standalone) {
    return <div style={{ minHeight: "calc(100vh - 120px)" }}>{content}</div>;
  }

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 120px)", position: "relative" }}>
      {/* Sidebar interno tipo Visito */}
      {(!isMobile || sidebarOpen) && (
        <aside style={{
          width: 224, background: B.navy, borderRight: `1px solid ${B.navyLight}`,
          padding: "16px 12px", flexShrink: 0, borderRadius: 12, marginRight: 14,
          position: isMobile ? "fixed" : "static",
          inset: isMobile ? "0 auto 0 0" : "auto",
          zIndex: isMobile ? 50 : "auto",
          height: isMobile ? "100vh" : "auto",
          overflowY: "auto",
        }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
              🤖 Concierge AI
            </div>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Powered by Claude</div>
          </div>
          {tenants.length > 1 && (
            <select value={tenantId} onChange={e => setTenantId(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, marginBottom: 12 }}>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          )}
          {NAV.map(g => (
            <div key={g.grupo} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, padding: "6px 8px", fontWeight: 700 }}>{g.grupo}</div>
              {g.items.map(it => {
                const active = tab === it.k;
                const b = it.badge === "count_needs_reply" ? needsReply : 0;
                return (
                  <button key={it.k} type="button" onClick={() => { setTab(it.k); if (isMobile) setSidebarOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", borderRadius: 8, border: "none", background: active ? B.sky + "22" : "transparent", color: active ? B.sky : "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: active ? 700 : 500, textAlign: "left", cursor: "pointer", marginBottom: 2 }}>
                    <span>{it.icon}</span>
                    <span style={{ flex: 1 }}>{it.l}</span>
                    {b > 0 && <span style={{ background: B.danger, color: "#fff", fontSize: 10, padding: "1px 7px", borderRadius: 10, fontWeight: 800 }}>{b}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${B.navyLight}`, marginTop: 12, paddingTop: 12 }}>
            <button type="button" onClick={() => setTab("billing")}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 11, cursor: "pointer" }}>
              <span>💳</span> Billing & Usage
            </button>
          </div>
        </aside>
      )}
      {isMobile && (
        <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ position: "fixed", bottom: 20, left: 20, zIndex: 51, background: B.sky, color: B.navy, border: "none", borderRadius: "50%", width: 48, height: 48, fontSize: 22, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
          {sidebarOpen ? "✕" : "🤖"}
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {content}
      </div>
    </div>
  );
}
