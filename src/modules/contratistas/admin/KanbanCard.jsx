// Card de contratista para vista Kanban.
import { B } from "../../../brand";

function fmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }); }
  catch { return d; }
}

function isPilaVigente(fechaPila) {
  if (!fechaPila) return null;
  try {
    const diffDays = (Date.now() - new Date(fechaPila).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 45;
  } catch { return null; }
}

export default function KanbanCard({ c, onClick }) {
  const isEmp = c.tipo === "empresa";
  const pila = isEmp ? isPilaVigente(c.emp_fecha_pila) : null;
  return (
    <div
      onClick={onClick}
      style={{
        background: B.navyMid, border: `1px solid ${B.navyLight}`,
        borderRadius: 8, padding: 12, cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = B.sky; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = B.navyLight; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
        <span style={{
          padding: "2px 7px", borderRadius: 10,
          background: (isEmp ? B.sky : B.pink) + "22",
          color: isEmp ? B.sky : B.pink,
          fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8,
        }}>
          {isEmp ? "Empresa" : "Natural"}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
          {c.radicado?.replace("ATL-", "")}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: B.white, lineHeight: 1.25, marginBottom: 6 }}>
        {c.nombre_display}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
        <span>{fmt(c.submitted_at || c.created_at)}</span>
        {isEmp && c.num_trabajadores && (
          <span>👷 {c.num_trabajadores}</span>
        )}
      </div>
      {isEmp && pila !== null && (
        <div style={{ marginTop: 6 }}>
          <span style={{
            padding: "2px 8px", borderRadius: 10, fontSize: 9, fontWeight: 700,
            background: (pila ? B.success : B.danger) + "22",
            color: pila ? B.success : B.danger,
            textTransform: "uppercase", letterSpacing: 0.8,
          }}>
            PILA {pila ? "vigente" : "vencida"}
          </span>
        </div>
      )}
    </div>
  );
}
