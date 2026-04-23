// Fase 6 · Vista Muelle Contratistas
// ─────────────────────────────────────────────────────────────────────────────
// Operacional — el personal de seguridad escanea el QR del certificado SST del
// trabajador al llegar al muelle. La vista resuelve el código, aplica reglas de
// verificación (contratista aprobado, curso vigente, PILA reciente) y muestra
// un resultado verde/amarillo/rojo con motivos específicos. Al presionar
// "Registrar ingreso" inserta una fila en `contratistas_ingresos_muelle` y
// actualiza `contratistas_trabajadores.ultimo_ingreso`.
//
// Inputs aceptados:
// - URL completa `https://www.atolon.co/verificar/CERT-XXX` → extrae el código
// - Código de certificado plano `ATL-DDMMYYYY-XXXXXXXX` o `CERT-…`
// - Cédula (solo dígitos, 5-15) → busca al trabajador y su certificado más
//   reciente.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { C } from "./contratistas/constants";
import { useBreakpoint } from "../lib/responsive";
import QRScanner from "./contratistas/muelle/QRScanner";
import VerificationResult from "./contratistas/muelle/VerificationResult";

const PILA_DIAS_OK   = 45;   // dentro de 45d → ok
const PILA_DIAS_WARN = 40;   // si faltan <5d para vencer → advertencia

// Extrae un código de cert desde URL o texto libre
function extractCode(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  // URL con /verificar/<code>
  const m = s.match(/verificar\/([^/?#\s]+)/i);
  if (m) return m[1].toUpperCase();
  return s.toUpperCase();
}

const isOnlyDigits = s => /^\d{5,15}$/.test(String(s || "").trim());

function daysBetween(aISO, bISO) {
  const a = new Date(aISO).getTime(), b = new Date(bISO).getTime();
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}
function fmtTime(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

// CSV export helper
function toCSV(rows) {
  if (!rows.length) return "";
  const headers = ["Hora", "Nombre", "Cédula", "Empresa", "Resultado", "Motivo", "Código", "Verificado por"];
  const body = rows.map(r => [
    new Date(r.created_at).toLocaleString("es-CO"),
    r.nombre || "",
    r.cedula || "",
    r.empresa || "",
    r.resultado || "",
    (r.motivo || "").replace(/\n/g, " "),
    r.codigo_certificado || "",
    r.verificado_por || "",
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [headers.join(","), ...body].join("\n");
}

export default function ContratistasMuelle() {
  const { isMobile } = useBreakpoint();

  const [now, setNow]           = useState(new Date());
  const [inputCode, setInputCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [result, setResult]     = useState(null); // { verdict, motivos, trabajador, contratista, certificado, rawCode }
  const [ingresos, setIngresos] = useState([]);
  const [kpi, setKpi]           = useState({ ingresosHoy: 0, pendientes: 0, rechazosHoy: 0 });
  const [error, setError]       = useState("");

  const userEmail = useRef(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { userEmail.current = data?.user?.email || null; });
  }, []);

  // Reloj (auto-refresh cada 30s también refresca la tabla y KPIs)
  useEffect(() => {
    const id = setInterval(() => { setNow(new Date()); loadIngresosHoy(); loadKpis(); }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIngresosHoy = useCallback(async () => {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("contratistas_ingresos_muelle")
      .select("id, created_at, trabajador_id, contratista_id, cedula, nombre, codigo_certificado, resultado, motivo, verificado_por")
      .or("origen.eq.muelle_bodeguita,origen.is.null") // backward compat para registros sin origen
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });
    // Hidrata con el nombre_display del contratista
    const ids = Array.from(new Set((data || []).map(r => r.contratista_id).filter(Boolean)));
    let empresaMap = {};
    if (ids.length) {
      const { data: cs } = await supabase.from("contratistas").select("id, nombre_display").in("id", ids);
      (cs || []).forEach(c => { empresaMap[c.id] = c.nombre_display; });
    }
    setIngresos((data || []).map(r => ({ ...r, empresa: empresaMap[r.contratista_id] || "" })));
  }, []);

  const loadKpis = useCallback(async () => {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const [{ data: hoyRows }, { count: pend }] = await Promise.all([
      supabase.from("contratistas_ingresos_muelle")
        .select("id, resultado").gte("created_at", since.toISOString()),
      supabase.from("contratistas_trabajadores")
        .select("id, contratistas!inner(estado)", { count: "exact", head: true })
        .eq("contratistas.estado", "aprobado")
        .is("ultimo_ingreso", null),
    ]);
    const ingresosHoy = (hoyRows || []).filter(r => r.resultado !== "rechazado").length;
    const rechazosHoy = (hoyRows || []).filter(r => r.resultado === "rechazado").length;
    setKpi({ ingresosHoy, rechazosHoy, pendientes: pend || 0 });
  }, []);

  useEffect(() => { loadIngresosHoy(); loadKpis(); }, [loadIngresosHoy, loadKpis]);

  // ── Verificación ──────────────────────────────────────────────────────────
  const runVerification = useCallback(async (rawInput) => {
    setError(""); setResult(null);
    const code = extractCode(rawInput);
    if (!code) { setError("Ingresa un código o cédula."); return; }
    setLoading(true);

    let trabajador = null, contratista = null, certificado = null;
    const motivos = [];

    try {
      if (isOnlyDigits(code)) {
        // Lookup por cédula
        const { data: t } = await supabase
          .from("contratistas_trabajadores")
          .select("id, nombre, cedula, cargo, arl, contratista_id, ultimo_ingreso")
          .eq("cedula", code)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        trabajador = t;
        if (trabajador?.contratista_id) {
          const { data: c } = await supabase.from("contratistas")
            .select("id, nombre_display, estado, emp_razon_social, nat_nombre, emp_fecha_pila, tipo")
            .eq("id", trabajador.contratista_id).maybeSingle();
          contratista = c;
        }
        if (trabajador?.id) {
          const { data: cert } = await supabase.from("certificados_curso")
            .select("id, codigo, score, passed, expires_at, issued_at, trabajador_id, contratista_id, nombre, cedula")
            .eq("trabajador_id", trabajador.id)
            .order("issued_at", { ascending: false })
            .limit(1).maybeSingle();
          certificado = cert;
        }
      } else {
        // Lookup por código de certificado
        const { data: cert } = await supabase.from("certificados_curso")
          .select("id, codigo, score, passed, expires_at, issued_at, trabajador_id, contratista_id, nombre, cedula")
          .eq("codigo", code).maybeSingle();
        certificado = cert;
        if (cert?.trabajador_id) {
          const { data: t } = await supabase.from("contratistas_trabajadores")
            .select("id, nombre, cedula, cargo, arl, contratista_id, ultimo_ingreso")
            .eq("id", cert.trabajador_id).maybeSingle();
          trabajador = t;
        }
        const cid = cert?.contratista_id || trabajador?.contratista_id;
        if (cid) {
          const { data: c } = await supabase.from("contratistas")
            .select("id, nombre_display, estado, emp_razon_social, nat_nombre, emp_fecha_pila, tipo")
            .eq("id", cid).maybeSingle();
          contratista = c;
        }
      }

      // ── Reglas de verificación ──────────────────────────────────────────
      let verdict = "permitido";

      if (!trabajador && !certificado) {
        verdict = "rechazado";
        motivos.push(`Código no encontrado: ${code}`);
      } else {
        // Contratista aprobado?
        if (!contratista) {
          verdict = "rechazado";
          motivos.push("No se pudo determinar el contratista asociado.");
        } else if (contratista.estado !== "aprobado") {
          verdict = "rechazado";
          motivos.push(`El contratista no está aprobado (estado: ${contratista.estado || "—"}).`);
        }

        // Certificado SST
        if (!certificado) {
          verdict = "rechazado";
          motivos.push("Certificado de curso SST nunca emitido para este trabajador.");
        } else {
          if (!certificado.passed) {
            verdict = "rechazado";
            motivos.push("El curso SST no fue aprobado.");
          }
          if (certificado.expires_at && new Date(certificado.expires_at) < new Date()) {
            verdict = "rechazado";
            motivos.push(`Certificado de curso vencido el ${fmtDate(certificado.expires_at)}.`);
          }
        }

        // PILA del empleador (solo empresa)
        if (contratista?.tipo === "empresa" && contratista.emp_fecha_pila) {
          const dias = daysBetween(contratista.emp_fecha_pila, new Date().toISOString());
          if (dias != null && dias > PILA_DIAS_OK) {
            verdict = "rechazado";
            motivos.push(`PILA vencida (último pago hace ${dias} días, máximo ${PILA_DIAS_OK}).`);
          } else if (dias != null && dias > PILA_DIAS_WARN && verdict !== "rechazado") {
            verdict = "advertencia";
            const restan = PILA_DIAS_OK - dias;
            motivos.push(`PILA vence en ${restan} día${restan === 1 ? "" : "s"}.`);
          }
        }
      }

      setResult({ verdict, motivos, trabajador, contratista, certificado, rawCode: code });
    } catch (e) {
      setError(e?.message || "Error al verificar.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onManualVerify = () => runVerification(inputCode);

  const onScanned = (data) => {
    setScanning(false);
    setInputCode(data);
    runVerification(data);
  };

  const registrarIngreso = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const row = {
        trabajador_id:  result.trabajador?.id  || null,
        contratista_id: result.contratista?.id || null,
        cedula:         result.trabajador?.cedula  || result.certificado?.cedula  || null,
        nombre:         result.trabajador?.nombre  || result.certificado?.nombre  || null,
        codigo_certificado: result.certificado?.codigo || null,
        resultado:      result.verdict,   // permitido | advertencia
        motivo:         result.motivos.length ? result.motivos.join(" · ") : null,
        verificado_por: userEmail.current || null,
        origen:         "muelle_bodeguita",
      };
      const { error: insErr } = await supabase.from("contratistas_ingresos_muelle").insert(row);
      if (insErr) throw insErr;
      if (result.trabajador?.id) {
        await supabase.from("contratistas_trabajadores")
          .update({ ultimo_ingreso: new Date().toISOString() })
          .eq("id", result.trabajador.id);
      }
      setResult(null); setInputCode("");
      await Promise.all([loadIngresosHoy(), loadKpis()]);
    } catch (e) {
      setError(e?.message || "No se pudo registrar el ingreso.");
    } finally {
      setSaving(false);
    }
  };

  const registrarRechazo = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const row = {
        trabajador_id:  result.trabajador?.id  || null,
        contratista_id: result.contratista?.id || null,
        cedula:         result.trabajador?.cedula  || result.certificado?.cedula  || null,
        nombre:         result.trabajador?.nombre  || result.certificado?.nombre  || null,
        codigo_certificado: result.certificado?.codigo || result.rawCode || null,
        resultado:      "rechazado",
        motivo:         result.motivos.length ? result.motivos.join(" · ") : "Rechazado en muelle",
        verificado_por: userEmail.current || null,
        origen:         "muelle_bodeguita",
      };
      const { error: insErr } = await supabase.from("contratistas_ingresos_muelle").insert(row);
      if (insErr) throw insErr;
      // Bitácora contratista (si existe)
      if (result.contratista?.id) {
        await supabase.from("contratistas_bitacora").insert({
          contratista_id: result.contratista.id,
          evento: "rechazo_muelle",
          descripcion: row.motivo,
          metadata: { cedula: row.cedula, nombre: row.nombre },
          usuario_nombre: userEmail.current,
        });
      }
      setResult(null); setInputCode("");
      await Promise.all([loadIngresosHoy(), loadKpis()]);
    } catch (e) {
      setError(e?.message || "No se pudo registrar el rechazo.");
    } finally {
      setSaving(false);
    }
  };

  const onSiguiente = () => { setResult(null); setInputCode(""); setError(""); };

  const exportCSV = () => {
    const csv = toCSV(ingresos);
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `muelle_contratistas_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const fechaStr = useMemo(
    () => now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    [now]
  );
  const horaStr = useMemo(
    () => now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    [now]
  );

  return (
    <div style={{
      minHeight: "100%", background: C.cream,
      padding: isMobile ? 12 : 24,
      fontFamily: "'Inter', sans-serif",
      color: C.navy,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.sand, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
          Atolón Beach Club · Operaciones
        </div>
        <h1 style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: isMobile ? 26 : 34, fontWeight: 800, color: C.navy,
          margin: "4px 0 8px", letterSpacing: "0.01em",
        }}>Ingreso de Contratistas · Muelle</h1>
        <div style={{ fontSize: 13, color: "#555", textTransform: "capitalize" }}>
          {fechaStr} · <strong style={{ color: C.navy }}>{horaStr}</strong>
        </div>
      </div>

      {/* KPI row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(3, minmax(160px, 220px))",
        gap: isMobile ? 8 : 12,
        marginBottom: 20,
      }}>
        <Kpi label="Ingresos hoy"   value={kpi.ingresosHoy} color={C.success} />
        <Kpi label="Pendientes"     value={kpi.pendientes}  color={C.sky} hint="Aprobados no llegados" />
        <Kpi label="Rechazos hoy"   value={kpi.rechazosHoy} color={C.error} />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: C.errorBg, border: `1px solid ${C.error}55`,
          color: C.error, borderRadius: 10, padding: "10px 14px",
          fontSize: 13, marginBottom: 16,
        }}>{error}</div>
      )}

      {/* Scanner / Result */}
      <div style={{ marginBottom: 24 }}>
        {!result ? (
          <div style={{
            background: "#fff", borderRadius: 16,
            padding: isMobile ? 18 : 28,
            boxShadow: "0 8px 32px rgba(13,27,62,0.08)",
            border: `1px solid ${C.border}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 13, color: C.sand, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
              Verificar trabajador
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 28, fontWeight: 800, color: C.navy, marginBottom: 16,
            }}>Escanear código QR</div>

            <button
              onClick={() => setScanning(true)}
              style={{
                minHeight: 56, padding: "14px 28px",
                background: C.navy, color: "#fff",
                border: "none", borderRadius: 14,
                fontSize: 17, fontWeight: 800, letterSpacing: "0.02em",
                cursor: "pointer",
                boxShadow: "0 8px 20px rgba(13,27,62,0.25)",
                width: isMobile ? "100%" : "auto", minWidth: 280,
              }}
            >📷  Escanear código</button>

            {/* Manual */}
            <div style={{
              marginTop: 24, paddingTop: 20,
              borderTop: `1px dashed ${C.border}`,
            }}>
              <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>
                o ingresa el código manualmente
              </div>
              <div style={{
                display: "flex", gap: 8,
                flexDirection: isMobile ? "column" : "row",
                maxWidth: 560, margin: "0 auto",
              }}>
                <input
                  value={inputCode}
                  onChange={e => setInputCode(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") onManualVerify(); }}
                  placeholder="CERT-XXXXXXXX-ABC  ·  o cédula"
                  style={{
                    flex: 1, minHeight: 48, padding: "12px 14px",
                    background: "#fff", color: C.navy,
                    border: `1.5px solid ${C.border}`, borderRadius: 10,
                    fontSize: 15, outline: "none",
                    fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={onManualVerify}
                  disabled={loading || !inputCode.trim()}
                  style={{
                    minHeight: 48, padding: "12px 24px",
                    background: loading || !inputCode.trim() ? C.sand : C.sky, color: C.navy,
                    border: "none", borderRadius: 10,
                    fontSize: 15, fontWeight: 800,
                    cursor: loading || !inputCode.trim() ? "default" : "pointer",
                  }}
                >{loading ? "Verificando…" : "Verificar"}</button>
              </div>
            </div>
          </div>
        ) : (
          <VerificationResult
            verdict={result.verdict}
            motivos={result.motivos}
            trabajador={result.trabajador}
            contratista={result.contratista}
            certificado={result.certificado}
            rawCode={result.rawCode}
            saving={saving}
            onRegistrarIngreso={registrarIngreso}
            onRegistrarRechazo={registrarRechazo}
            onSiguiente={onSiguiente}
          />
        )}
      </div>

      {/* Registro del día */}
      <div style={{
        background: "#fff", borderRadius: 16,
        padding: isMobile ? 14 : 20,
        boxShadow: "0 8px 32px rgba(13,27,62,0.06)",
        border: `1px solid ${C.border}`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 14, flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontSize: 11, color: C.sand, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}>
              Registro del día
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 22, fontWeight: 800, color: C.navy,
            }}>{ingresos.length} verificación{ingresos.length === 1 ? "" : "es"}</div>
          </div>
          <button
            onClick={exportCSV}
            disabled={!ingresos.length}
            style={{
              minHeight: 40, padding: "8px 18px",
              background: ingresos.length ? C.navy : C.sand, color: "#fff",
              border: "none", borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: ingresos.length ? "pointer" : "default",
            }}
          >Exportar CSV</button>
        </div>

        {ingresos.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "32px 16px",
            color: "#888", fontSize: 13,
          }}>Aún no hay verificaciones registradas hoy.</div>
        ) : isMobile ? (
          // Lista mobile
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ingresos.map(r => <IngresoCard key={r.id} r={r} />)}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#666", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
                  <th style={TH}>Hora</th>
                  <th style={TH}>Nombre</th>
                  <th style={TH}>Cédula</th>
                  <th style={TH}>Empresa</th>
                  <th style={TH}>Resultado</th>
                  <th style={TH}>Motivo</th>
                  <th style={TH}>Verificado por</th>
                </tr>
              </thead>
              <tbody>
                {ingresos.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={TD}>{fmtTime(r.created_at)}</td>
                    <td style={{ ...TD, fontWeight: 700, color: C.navy }}>{r.nombre || "—"}</td>
                    <td style={TD}>{r.cedula || "—"}</td>
                    <td style={TD}>{r.empresa || "—"}</td>
                    <td style={TD}><ResultadoBadge r={r.resultado} /></td>
                    <td style={{ ...TD, color: "#555", maxWidth: 280 }}>{r.motivo || "—"}</td>
                    <td style={{ ...TD, color: "#555" }}>{r.verificado_por || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {scanning && <QRScanner onResult={onScanned} onClose={() => setScanning(false)} />}

      {/* mantiene B importado usado aquí abajo por consistencia de estilo con resto del OS */}
      <div style={{ display: "none" }}>{B.navy}</div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────
function Kpi({ label, value, color, hint }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14,
      padding: "14px 16px",
      border: `1px solid ${C.border}`,
      boxShadow: "0 4px 16px rgba(13,27,62,0.05)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1, fontFamily: "'Barlow Condensed', sans-serif" }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 10, color: "#999" }}>{hint}</div>}
    </div>
  );
}

function ResultadoBadge({ r }) {
  const map = {
    permitido:   { bg: C.successBg, fg: C.success, label: "✓ Permitido" },
    advertencia: { bg: C.warnBg,    fg: C.warn,    label: "! Advertencia" },
    rechazado:   { bg: C.errorBg,   fg: C.error,   label: "✗ Rechazado" },
  };
  const s = map[r] || { bg: "#eee", fg: "#555", label: r || "—" };
  return (
    <span style={{
      background: s.bg, color: s.fg,
      padding: "3px 10px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

function IngresoCard({ r }) {
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      border: `1px solid ${C.border}`, background: "#fff",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: 14 }}>{r.nombre || "—"}</div>
        <ResultadoBadge r={r.resultado} />
      </div>
      <div style={{ fontSize: 12, color: "#666" }}>
        {fmtTime(r.created_at)} · CC {r.cedula || "—"}
      </div>
      <div style={{ fontSize: 12, color: "#666" }}>{r.empresa || "—"}</div>
      {r.motivo && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 6, lineHeight: 1.5 }}>{r.motivo}</div>
      )}
    </div>
  );
}

const TH = { textAlign: "left", padding: "8px 10px", fontWeight: 700 };
const TD = { padding: "10px", verticalAlign: "middle" };
