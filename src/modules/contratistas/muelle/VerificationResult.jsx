// Card de resultado de verificación en muelle. Muestra:
// - Permitido (verde) / Advertencia (amarillo) / Rechazado (rojo)
// - Datos del trabajador + empresa/contratista + certificado
// - Lista específica de motivos
// - Acciones: Registrar ingreso / Registrar rechazo / Escanear siguiente
import { C } from "../constants";

function fmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function VerificationResult({
  verdict,            // "permitido" | "advertencia" | "rechazado"
  motivos = [],
  trabajador,
  contratista,
  certificado,
  rawCode,
  saving,
  onRegistrarIngreso,
  onRegistrarRechazo,
  onSiguiente,
}) {
  const color =
    verdict === "permitido"   ? C.success :
    verdict === "advertencia" ? C.warn    :
                                C.error;
  const bg =
    verdict === "permitido"   ? C.successBg :
    verdict === "advertencia" ? C.warnBg    :
                                C.errorBg;

  const icon =
    verdict === "permitido"   ? "✓" :
    verdict === "advertencia" ? "!" :
                                "✗";

  const title =
    verdict === "permitido"   ? "PERMITIDO" :
    verdict === "advertencia" ? "PERMITIDO CON OBSERVACIONES" :
                                "NO AUTORIZADO";

  const nombre  = trabajador?.nombre  || certificado?.nombre  || "—";
  const cedula  = trabajador?.cedula  || certificado?.cedula  || "—";
  const cargo   = trabajador?.cargo   || "—";
  const empresa = contratista?.nombre_display
               || contratista?.emp_razon_social
               || contratista?.nat_nombre
               || "—";

  return (
    <div style={{
      background: "#fff", borderRadius: 16, overflow: "hidden",
      boxShadow: "0 12px 48px rgba(13,27,62,0.18)",
      border: `3px solid ${color}`,
    }}>
      {/* Banner */}
      <div style={{
        background: bg, padding: "24px 20px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: color, color: "#fff",
          fontSize: 44, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color, letterSpacing: 2, fontWeight: 700 }}>RESULTADO</div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 28, fontWeight: 800, color, lineHeight: 1.1,
            letterSpacing: "0.02em",
          }}>{title}</div>
        </div>
      </div>

      {/* Datos */}
      <div style={{ padding: "20px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.navy, marginBottom: 4 }}>
          {nombre}
        </div>
        <div style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
          CC {cedula}{cargo !== "—" ? ` · ${cargo}` : ""}
        </div>

        <dl style={{ margin: 0, fontSize: 13 }}>
          {[
            ["Empresa / contratista", empresa],
            ["Estado contratista", contratista?.estado || "—"],
            ["Certificado SST", certificado?.codigo || "—"],
            ["Vence", fmt(certificado?.expires_at)],
            ["Puntaje", certificado?.score != null ? `${certificado.score}%` : "—"],
            ["ARL trabajador", trabajador?.arl || "—"],
            ["PILA empresa", fmt(contratista?.emp_fecha_pila)],
            ["Código escaneado", rawCode || "—"],
          ].map(([k, v]) => (
            <div key={k} style={{
              display: "flex", justifyContent: "space-between", gap: 12,
              padding: "8px 0", borderBottom: `1px solid ${C.border}`,
            }}>
              <dt style={{ color: "#666", fontWeight: 600 }}>{k}</dt>
              <dd style={{ margin: 0, color: C.navy, fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{v}</dd>
            </div>
          ))}
        </dl>

        {/* Motivos */}
        {motivos.length > 0 && (
          <div style={{
            marginTop: 16, padding: "12px 14px",
            background: bg, border: `1px solid ${color}55`,
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
              {verdict === "rechazado" ? "MOTIVOS DE RECHAZO" : "OBSERVACIONES"}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.navy, lineHeight: 1.6 }}>
              {motivos.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {verdict !== "rechazado" && (
          <button
            onClick={onRegistrarIngreso}
            disabled={saving}
            style={{
              minHeight: 56, padding: "14px 20px",
              background: saving ? C.sand : C.success, color: "#fff",
              border: "none", borderRadius: 12,
              fontSize: 17, fontWeight: 800, letterSpacing: "0.02em",
              cursor: saving ? "default" : "pointer",
            }}
          >{saving ? "Registrando…" : "Registrar ingreso ✓"}</button>
        )}
        {verdict === "rechazado" && (
          <button
            onClick={onRegistrarRechazo}
            disabled={saving}
            style={{
              minHeight: 56, padding: "14px 20px",
              background: saving ? C.sand : C.error, color: "#fff",
              border: "none", borderRadius: 12,
              fontSize: 17, fontWeight: 800, letterSpacing: "0.02em",
              cursor: saving ? "default" : "pointer",
            }}
          >{saving ? "Registrando…" : "Registrar rechazo en bitácora"}</button>
        )}
        <button
          onClick={onSiguiente}
          style={{
            minHeight: 48, padding: "12px 20px",
            background: "#fff", color: C.navy,
            border: `2px solid ${C.border}`, borderRadius: 12,
            fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}
        >Escanear siguiente →</button>
      </div>
    </div>
  );
}
