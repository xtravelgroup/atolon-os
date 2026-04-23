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

// Calcula qué campos obligatorios faltan en un borrador
function faltantes(c) {
  const isEmp = c.tipo === "empresa";
  const check = (v) => !v || String(v).trim() === "";
  const req = isEmp
    ? [
        ["Razón social", c.emp_razon_social],
        ["NIT", c.emp_nit],
        ["Rep. legal", c.emp_rl_nombre],
        ["Cédula RL", c.emp_rl_cedula],
        ["Correo RL", c.emp_rl_correo],
        ["ARL", c.emp_arl],
        ["PILA", c.emp_fecha_pila],
        ["SST", c.emp_sst_nombre],
        ["Trabajadores", c.num_trabajadores],
        ["Servicio", c.servicio_desc],
        ["Fecha inicio", c.fecha_inicio],
        ["Firma", c.firma_nombre],
      ]
    : [
        ["Nombre", c.nat_nombre],
        ["Cédula", c.nat_cedula],
        ["Celular", c.nat_celular],
        ["Correo", c.nat_correo],
        ["EPS", c.nat_eps],
        ["ARL", c.nat_arl],
        ["Contacto emerg.", c.nat_emerg_nombre],
        ["Tel emerg.", c.nat_emerg_tel],
        ["Servicio", c.servicio_desc],
        ["Fecha inicio", c.fecha_inicio],
        ["Firma", c.firma_nombre],
      ];
  return req.filter(([_, v]) => check(v)).map(([label]) => label);
}

export default function KanbanCard({ c, onClick }) {
  const isEmp = c.tipo === "empresa";
  const pila = isEmp ? isPilaVigente(c.emp_fecha_pila) : null;
  const esBorrador = c.estado === "borrador";
  const falt = esBorrador ? faltantes(c) : [];
  const reqTotal = isEmp ? 12 : 11;
  const completados = reqTotal - falt.length;
  const pct = Math.round((completados / reqTotal) * 100);
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
        <span>{fmt(c.updated_at || c.submitted_at || c.created_at)}</span>
        {isEmp && c.num_trabajadores && (
          <span>👷 {c.num_trabajadores}</span>
        )}
      </div>

      {/* Barra de progreso + faltantes para borradores */}
      {esBorrador && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${B.navyLight}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, marginBottom: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {completados}/{reqTotal} campos
            </span>
            <span style={{ color: pct >= 80 ? B.success : pct >= 40 ? B.warning : "#F97316", fontWeight: 800 }}>
              {pct}%
            </span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? B.success : pct >= 40 ? B.warning : "#F97316", transition: "width 0.3s" }} />
          </div>
          {falt.length > 0 && falt.length <= 6 && (
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
              Falta: {falt.join(" · ")}
            </div>
          )}
          {falt.length > 6 && (
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
              Falta: {falt.slice(0, 5).join(" · ")} · <strong>+{falt.length - 5} más</strong>
            </div>
          )}
        </div>
      )}
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
