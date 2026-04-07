import { useState, useEffect, useCallback } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navyLight, border: `1px solid rgba(255,255,255,0.1)`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

const fmtHora = (h) => h ? h.slice(0, 5) : "—";

// Departure times per salida
const HORARIO_REGRESO = {
  S1: "15:30",
  S2: "16:30",
  S3: "17:30",
  S4: "18:30",
};

// ─── Tarjeta de reserva individual ───────────────────────────────────────────
function ReservaRow({ r, isMobile }) {
  const emb = r.embarcacion_asignada;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
        {r.estado === "check_in" || r.checkin_at ? "✓" : "·"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.nombre}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1, display: "flex", gap: 10 }}>
          <span>👥 {r.pax_a || r.pax || 1}A{r.pax_n > 0 ? ` + ${r.pax_n}N` : ""}</span>
          {r.canal && <span>· {r.canal}</span>}
          {r.aliado_id && <span>· 🤝 Agencia</span>}
        </div>
      </div>
      {emb && (
        <div style={{ fontSize: 11, background: B.sky + "22", color: B.sky, padding: "3px 10px", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
          ⛵ {emb}
        </div>
      )}
    </div>
  );
}

// ─── Bloque por salida ────────────────────────────────────────────────────────
function SalidaBloque({ salida, reservas, zarpoAt, onZarpo, isMobile }) {
  const horaRegreso = salida.hora_regreso || HORARIO_REGRESO[salida.id] || "—";
  const paxTotal = reservas.reduce((t, r) => t + (r.pax_a || r.pax || 1) + (r.pax_n || 0), 0);
  const conCheckin = reservas.filter(r => r.checkin_at || r.estado === "check_in").length;

  // Agrupar por embarcacion asignada
  const embGrupos = {};
  reservas.forEach(r => {
    const k = r.embarcacion_asignada || "__sin__";
    if (!embGrupos[k]) embGrupos[k] = [];
    embGrupos[k].push(r);
  });
  const embarcaciones = Object.keys(embGrupos).filter(k => k !== "__sin__");
  const sinEmb = embGrupos["__sin__"] || [];

  const zarpado = !!zarpoAt;
  const ahoraMin = (() => {
    const now = new Date();
    const bog = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
    return bog.getHours() * 60 + bog.getMinutes();
  })();
  const [hh, mm] = (horaRegreso || "99:99").split(":").map(Number);
  const minRegreso = hh * 60 + mm;
  const proxima = Math.abs(ahoraMin - minRegreso) <= 30 && !zarpado;

  return (
    <div style={{
      background: B.navyMid,
      borderRadius: 16,
      marginBottom: 20,
      border: zarpado
        ? `1px solid ${B.success}33`
        : proxima
          ? `1px solid ${B.warning}66`
          : "1px solid rgba(255,255,255,0.07)",
      overflow: "hidden",
    }}>
      {/* Cabecera */}
      <div style={{
        padding: "16px 20px",
        background: zarpado ? B.success + "18" : proxima ? B.warning + "12" : "rgba(255,255,255,0.03)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 18, fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: 0.5, color: zarpado ? B.success : "#fff" }}>
              {zarpado ? "✓ " : proxima ? "🔔 " : "⛵ "}{salida.nombre}
            </span>
            {proxima && !zarpado && (
              <span style={{ fontSize: 11, background: B.warning + "33", color: B.warning, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>PRÓXIMA SALIDA</span>
            )}
            {zarpado && (
              <span style={{ fontSize: 11, background: B.success + "33", color: B.success, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>ZARPÓ ✓</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>⛵ Sale del muelle: <strong style={{ color: B.sky }}>{salida.hora}</strong></span>
            <span>🏠 Regresa a muelle: <strong style={{ color: zarpado ? B.success : B.sand }}>{horaRegreso}</strong></span>
            <span>👥 {paxTotal} pax{reservas.length > 1 ? ` · ${reservas.length} reservas` : ""}</span>
            {conCheckin > 0 && <span style={{ color: B.success }}>✓ {conCheckin} con check-in</span>}
            {embarcaciones.length > 0 && <span>⛵ {embarcaciones.join(", ")}</span>}
          </div>
        </div>

        {!zarpado ? (
          <button
            onClick={onZarpo}
            style={{
              padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
              background: proxima ? B.warning : B.success,
              color: proxima ? B.navy : "#fff",
              fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", flexShrink: 0,
            }}>
            ✓ Marcar zarpado
          </button>
        ) : (
          <div style={{ fontSize: 11, color: B.success, fontWeight: 600 }}>
            Zarpó {zarpoAt ? `a las ${fmtHora(zarpoAt)}` : ""}
          </div>
        )}
      </div>

      {/* Lista de clientes */}
      <div>
        {/* Por embarcación */}
        {embarcaciones.map(emb => (
          <div key={emb}>
            <div style={{ padding: "8px 14px 4px", fontSize: 10, color: B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", background: B.sky + "08" }}>
              ⛵ {emb} · {embGrupos[emb].reduce((t, r) => t + (r.pax_a || r.pax || 1) + (r.pax_n || 0), 0)} pax
            </div>
            {embGrupos[emb].map(r => <ReservaRow key={r.id} r={r} isMobile={isMobile} />)}
          </div>
        ))}

        {/* Sin embarcacion asignada */}
        {sinEmb.length > 0 && (
          <div>
            {embarcaciones.length > 0 && (
              <div style={{ padding: "8px 14px 4px", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Sin embarcación asignada
              </div>
            )}
            {sinEmb.map(r => <ReservaRow key={r.id} r={r} isMobile={isMobile} />)}
          </div>
        )}

        {reservas.length === 0 && (
          <div style={{ padding: "16px 20px", fontSize: 12, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
            Sin reservas para esta salida
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN MODULE ─────────────────────────────────────────────────────────────
export default function MuelleSalidas() {
  const { isMobile } = useMobile();
  const [fecha, setFecha] = useState(todayStr());

  const [salidas,  setSalidas]  = useState([]);
  const [reservas, setReservas] = useState([]);
  const [zarpos,   setZarpos]   = useState({}); // { salida_id: hora_real }
  const [loading,  setLoading]  = useState(false);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [{ data: sals }, { data: res }, { data: zrps }] = await Promise.all([
      supabase.from("salidas").select("id, nombre, hora, hora_regreso, activo").eq("activo", true).order("hora"),
      supabase.from("reservas")
        .select("id, nombre, salida_id, pax, pax_a, pax_n, estado, canal, aliado_id, checkin_at, embarcacion_asignada")
        .eq("fecha", fecha)
        .neq("estado", "cancelado")
        .order("nombre"),
      supabase.from("muelle_salidas").select("salida_id, hora_real, estado").eq("fecha", fecha).eq("estado", "zarpo"),
    ]);
    setSalidas(sals || []);
    setReservas(res || []);
    // Build zarpos map { salida_id → hora_real }
    const zm = {};
    (zrps || []).forEach(z => { zm[z.salida_id] = z.hora_real || true; });
    setZarpos(zm);
    setLoading(false);
  }, [fecha]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const marcarZarpo = async (salidaId) => {
    if (!supabase) return;
    const horaReal = new Date().toTimeString().slice(0, 5);
    // Upsert — one record per salida/date
    const id = `MS-${salidaId}-${fecha}`;
    await supabase.from("muelle_salidas").upsert({
      id,
      fecha,
      salida_id: salidaId,
      hora_real: horaReal,
      estado: "zarpo",
      pax_a: 0, pax_n: 0, pax_total: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    setZarpos(prev => ({ ...prev, [salidaId]: horaReal }));
  };

  // Salidas that have reservas today (or all if no reservas yet)
  const reservasPorSalida = {};
  (reservas || []).forEach(r => {
    if (!reservasPorSalida[r.salida_id]) reservasPorSalida[r.salida_id] = [];
    reservasPorSalida[r.salida_id].push(r);
  });

  const salidasConRes = (salidas || []).filter(s => reservasPorSalida[s.id]?.length > 0);
  const salidasVacias = (salidas || []).filter(s => !reservasPorSalida[s.id]?.length);

  // KPIs
  const totalPax    = reservas.reduce((t, r) => t + (r.pax_a || r.pax || 1) + (r.pax_n || 0), 0);
  const conCheckin  = reservas.filter(r => r.checkin_at || r.estado === "check_in").length;
  const nZarpos     = Object.keys(zarpos).length;
  const pendientes  = salidasConRes.filter(s => !zarpos[s.id]).length;

  return (
    <div style={{ padding: isMobile ? "16px 12px" : "24px", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#e2e8f0", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#fff" }}>⛵ Salidas de Isla</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Programación automática de zarpes · Tierra Bomba</div>
        </div>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          style={{ ...IS, width: "auto", fontSize: 14, padding: "8px 14px" }} />
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 10, marginBottom: 24 }}>
        {[
          { label: "Pax en isla",    value: totalPax,    color: B.sky },
          { label: "Con check-in",   value: conCheckin,  color: B.success },
          { label: "Grupos zarpados", value: nZarpos,    color: B.sand },
          { label: "Pendientes",      value: pendientes, color: pendientes > 0 ? B.warning : "rgba(255,255,255,0.3)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando...</div>
      ) : (
        <>
          {salidasConRes.length === 0 && (
            <div style={{ textAlign: "center", padding: "50px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⛵</div>
              No hay reservas para este día
            </div>
          )}

          {salidasConRes.map(sal => (
            <SalidaBloque
              key={sal.id}
              salida={sal}
              reservas={reservasPorSalida[sal.id] || []}
              zarpoAt={zarpos[sal.id]}
              onZarpo={() => marcarZarpo(sal.id)}
              isMobile={isMobile}
            />
          ))}

          {/* Salidas sin reservas (colapsadas) */}
          {salidasVacias.length > 0 && salidasConRes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Sin reservas hoy</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {salidasVacias.map(s => (
                  <div key={s.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
                    {s.nombre} · {s.hora_regreso || HORARIO_REGRESO[s.id] || s.hora}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
