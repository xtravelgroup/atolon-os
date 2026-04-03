import { useState, useEffect, useCallback } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

// ── Shared input styles ────────────────────────────────────────────────────────
const IS = {
  background: B.navy,
  border: `1px solid ${B.navyLight}`,
  color: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  outline: "none",
  fontFamily: "Lato, sans-serif",
};

const LS = {
  fontSize: 11,
  color: B.sand,
  display: "block",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function fmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-CO", { timeZone: "America/Bogota" });
}

function shortEmail(email) {
  if (!email) return "—";
  return email.split("@")[0];
}

function actionColor(accion) {
  if (!accion) return B.warning;
  if (accion.startsWith("crear_")) return B.success;
  if (
    accion.startsWith("editar_") ||
    accion.startsWith("cambiar_") ||
    accion.startsWith("registrar_")
  )
    return B.sky;
  if (accion.startsWith("cancelar_")) return B.danger;
  if (accion.startsWith("check_in") || accion.startsWith("despachar_"))
    return B.sand;
  if (accion === "cierre_caja") return "#f5c842";
  return B.warning;
}

function Badge({ label, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        background: color + "22",
        color: color,
        border: `1px solid ${color}44`,
        whiteSpace: "nowrap",
        letterSpacing: "0.03em",
      }}
    >
      {label}
    </span>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div
      style={{
        background: B.navyMid,
        borderRadius: 12,
        padding: "16px 20px",
        flex: "1 1 160px",
        border: `1px solid ${B.navyLight}`,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: B.sand,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          color: "#fff",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Historial() {
  const isMobile = useMobile();
  const today = todayStr();

  // Filters
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [filterEmail, setFilterEmail] = useState("todos");
  const [filterModulo, setFilterModulo] = useState("todos");
  const [searchText, setSearchText] = useState("");

  // Data
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Fetch ──────────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const desdeIso = `${desde}T00:00:00`;
    const hastaIso = `${hasta}T23:59:59`;

    let q = supabase
      .from("historial_acciones")
      .select(
        "id, usuario_email, modulo, accion, tabla, registro_id, datos_antes, datos_despues, notas, created_at"
      )
      .gte("created_at", desdeIso)
      .lte("created_at", hastaIso)
      .order("created_at", { ascending: false })
      .limit(500);

    if (filterModulo !== "todos") q = q.eq("modulo", filterModulo);

    const { data, error } = await q;
    if (!error && data) setRows(data);
    setLoading(false);
  }, [desde, hasta, filterModulo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived ────────────────────────────────────────────────────────────────────
  const todayRows = rows.filter((r) => r.created_at?.startsWith(today));
  const todayCount = todayRows.length;
  const uniqueUsersToday = new Set(todayRows.map((r) => r.usuario_email)).size;
  const moduleCounts = todayRows.reduce((acc, r) => {
    acc[r.modulo] = (acc[r.modulo] || 0) + 1;
    return acc;
  }, {});
  const topModule =
    Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  const distinctEmails = ["todos", ...new Set(rows.map((r) => r.usuario_email).filter(Boolean))];

  // Client-side filters
  const filtered = rows.filter((r) => {
    if (filterEmail !== "todos" && r.usuario_email !== filterEmail) return false;
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase();
      const inId = r.registro_id?.toString().toLowerCase().includes(s);
      const inNotes = r.notas?.toLowerCase().includes(s);
      if (!inId && !inNotes) return false;
    }
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: B.navy,
        color: "#fff",
        fontFamily: "Lato, sans-serif",
        padding: isMobile ? "16px 12px" : "24px 32px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: isMobile ? 24 : 30,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "0.02em",
          }}
        >
          Historial de Acciones
        </h1>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            background: B.navyLight,
            border: `1px solid ${B.navyLight}`,
            color: "#fff",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "Lato, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Cargando…" : "↻ Actualizar"}
        </button>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <KpiCard label="Acciones hoy" value={todayCount} color={B.sky} />
        <KpiCard label="Usuarios activos hoy" value={uniqueUsersToday} color={B.success} />
        <KpiCard label="Módulo más activo" value={topModule} color={B.sand} />
      </div>

      {/* Filter bar */}
      <div
        style={{
          background: B.navyMid,
          borderRadius: 12,
          padding: "16px 20px",
          border: `1px solid ${B.navyLight}`,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          {/* Desde */}
          <div style={{ flex: "1 1 140px" }}>
            <label style={LS}>Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              style={{ ...IS, width: "100%", boxSizing: "border-box" }}
            />
          </div>

          {/* Hasta */}
          <div style={{ flex: "1 1 140px" }}>
            <label style={LS}>Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              style={{ ...IS, width: "100%", boxSizing: "border-box" }}
            />
          </div>

          {/* Usuario */}
          <div style={{ flex: "1 1 180px" }}>
            <label style={LS}>Usuario</label>
            <select
              value={filterEmail}
              onChange={(e) => setFilterEmail(e.target.value)}
              style={{ ...IS, width: "100%", boxSizing: "border-box" }}
            >
              {distinctEmails.map((em) => (
                <option key={em} value={em}>
                  {em === "todos" ? "Todos" : shortEmail(em)}
                </option>
              ))}
            </select>
          </div>

          {/* Módulo */}
          <div style={{ flex: "1 1 160px" }}>
            <label style={LS}>Módulo</label>
            <select
              value={filterModulo}
              onChange={(e) => setFilterModulo(e.target.value)}
              style={{ ...IS, width: "100%", boxSizing: "border-box" }}
            >
              <option value="todos">Todos</option>
              <option value="reservas">Reservas</option>
              <option value="checkin">Check-in</option>
              <option value="comercial">Comercial</option>
              <option value="cierre_caja">Cierre de Caja</option>
            </select>
          </div>

          {/* Search */}
          <div style={{ flex: "2 1 220px" }}>
            <label style={LS}>Buscar (ID / Notas)</label>
            <input
              type="text"
              placeholder="Registro ID o nota…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ ...IS, width: "100%", boxSizing: "border-box" }}
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: "rgba(255,255,255,0.4)",
            fontSize: 15,
          }}
        >
          Cargando historial…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: "rgba(255,255,255,0.35)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15 }}>Sin registros para los filtros seleccionados</div>
        </div>
      ) : (
        <div
          style={{
            background: B.navyMid,
            borderRadius: 12,
            border: `1px solid ${B.navyLight}`,
            overflow: "hidden",
          }}
        >
          {/* Table header — hide on mobile */}
          {!isMobile && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "170px 130px 120px 110px 90px 1fr",
                gap: 0,
                padding: "10px 16px",
                borderBottom: `1px solid ${B.navyLight}`,
                fontSize: 11,
                color: B.sand,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 700,
              }}
            >
              <span>Fecha / Hora</span>
              <span>Usuario</span>
              <span>Acción</span>
              <span>Módulo</span>
              <span>Registro</span>
              <span>Notas</span>
            </div>
          )}

          {/* Rows */}
          {filtered.map((row) => {
            const isExpanded = expandedId === row.id;
            const aColor = actionColor(row.accion);
            const mColor = B.sky;

            return (
              <div key={row.id}>
                {/* Main row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  style={{
                    display: isMobile ? "block" : "grid",
                    gridTemplateColumns: isMobile
                      ? undefined
                      : "170px 130px 120px 110px 90px 1fr",
                    gap: 0,
                    padding: isMobile ? "12px 14px" : "11px 16px",
                    borderBottom: `1px solid ${B.navyLight}`,
                    cursor: "pointer",
                    background: isExpanded ? B.navyLight + "55" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded)
                      e.currentTarget.style.background = B.navyLight + "33";
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  {isMobile ? (
                    // Mobile layout
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Badge label={row.accion || "—"} color={aColor} />
                          <Badge label={row.modulo || "—"} color={mColor} />
                        </div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {fmtTs(row.created_at)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          fontSize: 12,
                          color: "rgba(255,255,255,0.7)",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ color: B.sand, fontWeight: 600 }}>
                          {shortEmail(row.usuario_email)}
                        </span>
                        {row.registro_id && (
                          <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>
                            #{row.registro_id}
                          </span>
                        )}
                        {row.notas && (
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 220,
                            }}
                          >
                            {row.notas}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Desktop layout
                    <>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", alignSelf: "center" }}>
                        {fmtTs(row.created_at)}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: B.sand,
                          fontWeight: 600,
                          alignSelf: "center",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {shortEmail(row.usuario_email)}
                      </span>
                      <span style={{ alignSelf: "center" }}>
                        <Badge label={row.accion || "—"} color={aColor} />
                      </span>
                      <span style={{ alignSelf: "center" }}>
                        <Badge label={row.modulo || "—"} color={mColor} />
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "monospace",
                          color: "rgba(255,255,255,0.45)",
                          alignSelf: "center",
                        }}
                      >
                        {row.registro_id ?? "—"}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.6)",
                          alignSelf: "center",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          paddingRight: 8,
                        }}
                      >
                        {row.notas || "—"}
                      </span>
                    </>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    style={{
                      background: B.navy,
                      borderBottom: `1px solid ${B.navyLight}`,
                      padding: "16px 20px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Datos antes */}
                      <div style={{ flex: "1 1 280px" }}>
                        <div
                          style={{
                            fontSize: 11,
                            color: B.sand,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            marginBottom: 8,
                            fontWeight: 700,
                          }}
                        >
                          Datos antes
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            padding: "12px 14px",
                            background: B.navyMid,
                            borderRadius: 8,
                            border: `1px solid ${B.navyLight}`,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.7)",
                            fontFamily: "monospace",
                            overflowX: "auto",
                            maxHeight: 260,
                            overflowY: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {row.datos_antes
                            ? JSON.stringify(row.datos_antes, null, 2)
                            : "null"}
                        </pre>
                      </div>

                      {/* Datos después */}
                      <div style={{ flex: "1 1 280px" }}>
                        <div
                          style={{
                            fontSize: 11,
                            color: B.sky,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            marginBottom: 8,
                            fontWeight: 700,
                          }}
                        >
                          Datos después
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            padding: "12px 14px",
                            background: B.navyMid,
                            borderRadius: 8,
                            border: `1px solid ${B.navyLight}`,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.7)",
                            fontFamily: "monospace",
                            overflowX: "auto",
                            maxHeight: 260,
                            overflowY: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {row.datos_despues
                            ? JSON.stringify(row.datos_despues, null, 2)
                            : "null"}
                        </pre>
                      </div>
                    </div>

                    {/* Extra metadata */}
                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 12,
                        color: "rgba(255,255,255,0.4)",
                        display: "flex",
                        gap: 20,
                        flexWrap: "wrap",
                      }}
                    >
                      {row.tabla && (
                        <span>
                          Tabla:{" "}
                          <span style={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>
                            {row.tabla}
                          </span>
                        </span>
                      )}
                      <span>
                        ID:{" "}
                        <span style={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>
                          {row.id}
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "rgba(255,255,255,0.3)",
            textAlign: "right",
          }}
        >
          {filtered.length} registro{filtered.length !== 1 ? "s" : ""} mostrado
          {filtered.length !== 1 ? "s" : ""}
          {filtered.length < rows.length ? ` (de ${rows.length} en rango)` : ""}
        </div>
      )}
    </div>
  );
}
