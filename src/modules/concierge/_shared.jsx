// Estilos y helpers compartidos por todos los subpanels del Concierge AI.
import { B } from "../../brand";

export const CARD = { background: B.navyMid, borderRadius: 12, padding: 20, border: `1px solid ${B.navyLight}` };
export const IS   = { width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
export const LS   = { fontSize: 11, color: B.sand, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };
export const BTN  = (bg="", color="#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg || B.sky, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
export const TAG  = (color, text) => (
  <span style={{ background: color + "22", color, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{text}</span>
);
export const HEADER = ({ title, subtitle, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
    <div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800, color: "#fff" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right && <div>{right}</div>}
  </div>
);
export const EMPTY = ({ icon="📭", text }) => (
  <div style={{ ...CARD, textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>
    <div style={{ fontSize: 40, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontSize: 13 }}>{text}</div>
  </div>
);
