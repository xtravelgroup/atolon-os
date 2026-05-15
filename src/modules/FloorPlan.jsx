// FloorPlan — Piscina. Render visual + estado por día (libre/reservado/ocupado/limpieza/bloqueado).
// Source of truth: tabla `floorplan_spots` (catálogo) + `floorplan_asignaciones` (estado por fecha).
//
// Nomenclatura (fija):
//   PISCINA DERECHA:   C11–C15 (camas)  + PS11–PS14 (pool seats)
//   PISCINA CENTRAL:   PS31–PS34 (pool seats, fila top frente a la piscina)
//   PISCINA IZQUIERDA: PS21–PS24 (pool seats) + C21–C25 (camas)

import { useEffect, useMemo, useState } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";

// ── Configuración de estado ────────────────────────────────────────────────
const ESTADOS = {
  libre:      { label: "Libre",      color: B.success,   bg: B.success + "22", icon: "○" },
  reservado:  { label: "Reservado",  color: B.sky,       bg: B.sky + "22",     icon: "⏰" },
  ocupado:    { label: "Ocupado",    color: B.danger,    bg: B.danger + "22",  icon: "●" },
  limpieza:   { label: "Limpieza",   color: B.warning,   bg: B.warning + "22", icon: "✧" },
  bloqueado:  { label: "Bloqueado",  color: B.muted,     bg: B.navyLight,      icon: "✕" },
};
const ESTADO_KEYS = Object.keys(ESTADOS);

function todayBogota() {
  const fmt = new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" });
  return fmt.slice(0, 10);
}

// ── Componente: Spot individual (todas las del área piscina son camas) ────
function Spot({ spot, asign, onClick, compact }) {
  const estado = asign?.estado || "libre";
  const cfg = ESTADOS[estado] || ESTADOS.libre;
  return (
    <div
      onClick={() => onClick(spot, asign)}
      title={`${spot.id} · Cama ${spot.id.startsWith("PS") ? "Pool Side" : "Exterior"} · ${cfg.label}${asign?.huesped ? " · " + asign.huesped : ""}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: compact ? "6px 4px" : "10px 6px",
        background: cfg.bg,
        border: `2px solid ${cfg.color}`,
        borderRadius: 8,
        cursor: "pointer",
        minWidth: 64,
        minHeight: 56,
        transition: "transform 0.1s, box-shadow 0.1s",
        position: "relative",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = `0 4px 12px ${cfg.color}44`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: cfg.color, letterSpacing: "0.05em" }}>
        {spot.id}
      </div>
      {asign?.huesped && (
        <div style={{ fontSize: 9, color: B.white, marginTop: 2, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {asign.huesped}
        </div>
      )}
      {asign?.pax > 0 && (
        <div style={{ fontSize: 9, color: B.white, opacity: 0.7 }}>
          {asign.pax} pax
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────
export default function FloorPlan() {
  const { isMobile } = useBreakpoint();
  const [fecha, setFecha] = useState(todayBogota());
  const [spots, setSpots] = useState([]);
  const [asignaciones, setAsignaciones] = useState({}); // spot_id → asignacion row
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(null); // { spot, asign }
  const [savingDrawer, setSavingDrawer] = useState(false);

  // Load spots once
  useEffect(() => {
    if (!supabase) return;
    supabase.from("floorplan_spots")
      .select("*").eq("area", "piscina").eq("activo", true)
      .order("zona").order("fila").order("orden")
      .then(({ data }) => setSpots(data || []));
  }, []);

  // Load asignaciones per fecha
  useEffect(() => {
    if (!supabase || !fecha) return;
    setLoading(true);
    supabase.from("floorplan_asignaciones")
      .select("*").eq("fecha", fecha)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(a => { map[a.spot_id] = a; });
        setAsignaciones(map);
        setLoading(false);
      });
  }, [fecha]);

  // Group spots by zona+tipo for layout
  // Agrupamos por POSICIÓN, no por tipo de mobiliario (todas son camas):
  //   exterior → IDs que empiezan con "C" (en la pared, lejos del agua)
  //   poolside → IDs que empiezan con "PS" (pegadas al borde de la piscina)
  //   central  → PS31–PS34 (detrás de la piscina, fila top)
  const grouped = useMemo(() => {
    const g = {
      piscina_derecha:    { exterior: [], poolside: [] },
      piscina_izquierda:  { poolside: [], exterior: [] },
      piscina_central:    { central: [] },
    };
    for (const s of spots) {
      const zona = g[s.zona];
      if (!zona) continue;
      if (s.zona === "piscina_central") { zona.central.push(s); continue; }
      const key = s.id.startsWith("PS") ? "poolside" : "exterior";
      if (zona[key]) zona[key].push(s);
    }
    return g;
  }, [spots]);

  // KPIs
  const kpis = useMemo(() => {
    const total = spots.length;
    const byEstado = { libre: 0, reservado: 0, ocupado: 0, limpieza: 0, bloqueado: 0 };
    for (const s of spots) {
      const est = asignaciones[s.id]?.estado || "libre";
      byEstado[est] = (byEstado[est] || 0) + 1;
    }
    return { total, ...byEstado };
  }, [spots, asignaciones]);

  // ── Save drawer changes ────────────────────────────────────────────────
  async function guardarAsignacion(form) {
    if (!supabase || !drawer) return;
    setSavingDrawer(true);
    const existing = drawer.asign;
    const payload = {
      spot_id:  drawer.spot.id,
      fecha,
      estado:   form.estado,
      huesped:  form.huesped?.trim() || null,
      pax:      Number(form.pax) || 0,
      notas:    form.notas?.trim() || null,
      reserva_id: form.reserva_id?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      await supabase.from("floorplan_asignaciones").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("floorplan_asignaciones").insert({
        id: `FPA-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString(),
      });
    }

    // Si el operador editó el mapeo a Loggro, persistirlo en el catálogo del spot
    // (no en la asignación diaria — el mapeo es estructural, vive con el spot).
    if (form.loggro_mesa_id !== undefined && form.loggro_mesa_id !== drawer.spot.loggro_mesa_id) {
      await supabase.from("floorplan_spots").update({
        loggro_mesa_id: form.loggro_mesa_id?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", drawer.spot.id);
      // Refresh spots para que el siguiente click tenga el nuevo valor
      const { data: refreshed } = await supabase.from("floorplan_spots")
        .select("*").eq("area", "piscina").eq("activo", true)
        .order("zona").order("fila").order("orden");
      setSpots(refreshed || []);
    }

    // Refresh asignaciones
    const { data } = await supabase.from("floorplan_asignaciones").select("*").eq("fecha", fecha);
    const map = {};
    (data || []).forEach(a => { map[a.spot_id] = a; });
    setAsignaciones(map);
    setSavingDrawer(false);
    setDrawer(null);
  }

  // ── Reset diario ────────────────────────────────────────────────────────
  async function resetDia() {
    if (!supabase) return;
    if (!confirm(`¿Reset estado de todos los spots para ${fecha}? Esto borra todas las asignaciones del día.`)) return;
    await supabase.from("floorplan_asignaciones").delete().eq("fecha", fecha);
    setAsignaciones({});
  }

  return (
    <div style={{ padding: isMobile ? 12 : 20, color: B.text }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: B.white }}>▦ Floor Plan — Piscina</h1>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>22 camas · 10 en pared (C) · 12 pool side (PS)</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 13 }} />
          <button onClick={resetDia}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.danger}44`, background: "transparent", color: B.danger, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Reset día
          </button>
        </div>
      </div>

      {/* KPIs por estado */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 5}, 1fr)`, gap: 8, marginBottom: 20 }}>
        {ESTADO_KEYS.map(k => {
          const cfg = ESTADOS[k];
          const count = kpis[k] || 0;
          const pct = kpis.total ? Math.round((count / kpis.total) * 100) : 0;
          return (
            <div key={k} style={{ background: B.navyMid, borderRadius: 10, padding: 14, borderLeft: `4px solid ${cfg.color}` }}>
              <div style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                {cfg.icon} {cfg.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: B.white }}>{count}</div>
              <div style={{ fontSize: 10, color: B.muted }}>{pct}% del total</div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 14, marginBottom: 20, fontSize: 11, flexWrap: "wrap", color: B.muted }}>
        {ESTADO_KEYS.map(k => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: ESTADOS[k].bg, border: `2px solid ${ESTADOS[k].color}` }} />
            {ESTADOS[k].label}
          </span>
        ))}
      </div>

      {/* Plano */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: B.muted }}>Cargando spots…</div>
      ) : (
        <PoolLayout grouped={grouped} asignaciones={asignaciones} onClickSpot={(spot, asign) => setDrawer({ spot, asign })} isMobile={isMobile} />
      )}

      {/* Drawer para editar spot */}
      {drawer && (
        <DrawerSpot
          spot={drawer.spot}
          asign={drawer.asign}
          onClose={() => setDrawer(null)}
          onSave={guardarAsignacion}
          saving={savingDrawer}
        />
      )}
    </div>
  );
}

// ── Layout visual del plano de Piscina ─────────────────────────────────────
function PoolLayout({ grouped, asignaciones, onClickSpot, isMobile }) {
  return (
    <div style={{
      background: B.navy, borderRadius: 16, padding: isMobile ? 14 : 24,
      border: `2px dashed ${B.success}66`,
      maxWidth: 1200, margin: "0 auto",
    }}>
      {/* PISCINA CENTRAL — fila superior con camas PS31..PS34 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 16, marginBottom: 12, alignItems: "start" }}>
        <div /> {/* spacer izquierdo */}
        <div>
          <SectionLabel>PISCINA CENTRAL</SectionLabel>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "8px 0" }}>
            {grouped.piscina_central.central.map(s => (
              <Spot key={s.id} spot={s} asign={asignaciones[s.id]} onClick={onClickSpot} />
            ))}
          </div>
        </div>
        <div /> {/* spacer derecho */}
      </div>

      {/* Body: derecha + piscina + izquierda */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 16 }}>
        {/* PISCINA DERECHA */}
        <div>
          <SectionLabel>PISCINA DERECHA</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 0" }}>
            {/* Columna externa: camas exteriores (C11..C15) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {grouped.piscina_derecha.exterior.map(s => (
                <Spot key={s.id} spot={s} asign={asignaciones[s.id]} onClick={onClickSpot} />
              ))}
            </div>
            {/* Columna interna: camas Pool Side (PS11..PS14) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {grouped.piscina_derecha.poolside.map(s => (
                <Spot key={s.id} spot={s} asign={asignaciones[s.id]} onClick={onClickSpot} />
              ))}
            </div>
          </div>
        </div>

        {/* La piscina (representación visual) */}
        <div style={{
          background: "linear-gradient(180deg, #38bdf8 0%, #0ea5e9 50%, #0284c7 100%)",
          borderRadius: 14,
          minHeight: 380,
          margin: "8px 0",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.7)",
          fontSize: 14, fontWeight: 700, letterSpacing: "0.2em",
          textShadow: "0 1px 3px rgba(0,0,0,0.3)",
          boxShadow: "inset 0 4px 20px rgba(0,0,0,0.2)",
        }}>
          PISCINA
        </div>

        {/* PISCINA IZQUIERDA */}
        <div>
          <SectionLabel>PISCINA IZQUIERDA</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 0" }}>
            {/* Columna interna: camas Pool Side (PS21..PS24) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {grouped.piscina_izquierda.poolside.map(s => (
                <Spot key={s.id} spot={s} asign={asignaciones[s.id]} onClick={onClickSpot} />
              ))}
            </div>
            {/* Columna externa: camas exteriores (C21..C25) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {grouped.piscina_izquierda.exterior.map(s => (
                <Spot key={s.id} spot={s} asign={asignaciones[s.id]} onClick={onClickSpot} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      background: B.navyMid, color: B.white,
      padding: "6px 12px", borderRadius: 6, textAlign: "center",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    }}>
      {children}
    </div>
  );
}

// ── Drawer lateral para editar un spot ─────────────────────────────────────
function DrawerSpot({ spot, asign, onClose, onSave, saving }) {
  const [estado, setEstado] = useState(asign?.estado || "libre");
  const [huesped, setHuesped] = useState(asign?.huesped || "");
  // Todas son camas → capacidad default 2 pax.
  const [pax, setPax] = useState(asign?.pax || 2);
  const [notas, setNotas] = useState(asign?.notas || "");
  const [reservaId, setReservaId] = useState(asign?.reserva_id || "");
  const [loggroMesaId, setLoggroMesaId] = useState(spot.loggro_mesa_id || "");

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50,
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: B.navyMid, width: 380, height: "100vh", padding: 24,
        overflowY: "auto", borderLeft: `1px solid ${B.navyLight}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 22, color: B.white, fontWeight: 800 }}>
            {spot.id}
          </h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: B.muted, fontSize: 24, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: B.muted, marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          🛋 Cama {spot.id.startsWith("PS") ? "Pool Side" : "Exterior"} · Capacidad {spot.capacidad} pax · Zona {spot.zona.replace("piscina_", "P. ").replace("_", " ")}
        </div>

        {/* Estado */}
        <label style={{ fontSize: 12, color: B.sand, fontWeight: 600 }}>Estado</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6, marginBottom: 16 }}>
          {ESTADO_KEYS.map(k => {
            const cfg = ESTADOS[k];
            const sel = estado === k;
            return (
              <button key={k} onClick={() => setEstado(k)} style={{
                padding: "10px 8px", borderRadius: 8,
                border: `2px solid ${sel ? cfg.color : B.navyLight}`,
                background: sel ? cfg.bg : "transparent",
                color: sel ? cfg.color : B.white,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                textAlign: "left",
              }}>
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Huésped + pax */}
        <label style={{ fontSize: 12, color: B.sand, fontWeight: 600 }}>Huésped</label>
        <input value={huesped} onChange={e => setHuesped(e.target.value)} placeholder="Nombre del cliente"
          style={inputStyle} />

        <label style={{ fontSize: 12, color: B.sand, fontWeight: 600, marginTop: 12, display: "block" }}>Pax</label>
        <input type="number" min={0} max={spot.capacidad * 2} value={pax} onChange={e => setPax(e.target.value)}
          style={inputStyle} />

        <label style={{ fontSize: 12, color: B.sand, fontWeight: 600, marginTop: 12, display: "block" }}>Reserva ID (opcional)</label>
        <input value={reservaId} onChange={e => setReservaId(e.target.value)} placeholder="WEB-… o R-…"
          style={inputStyle} />

        <label style={{ fontSize: 12, color: B.sand, fontWeight: 600, marginTop: 12, display: "block" }}>Notas</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Bebida pedida, alergia, etc."
          style={{ ...inputStyle, resize: "vertical" }} />

        {/* Mapeo a Loggro — necesario para que Pool Service pueda enviar pedidos a cocina */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${B.navyLight}` }}>
          <label style={{ fontSize: 12, color: B.sand, fontWeight: 600, display: "block" }}>
            Mesa Loggro (ID)
          </label>
          <input value={loggroMesaId} onChange={e => setLoggroMesaId(e.target.value)}
            placeholder="ID de mesa en Loggro Restobar"
            style={inputStyle} />
          <div style={{ fontSize: 10, color: B.muted, marginTop: 4 }}>
            {loggroMesaId
              ? "✓ Los pedidos hechos en este spot se enviarán a esta mesa Loggro."
              : "⚠ Sin mapear — los pedidos no se podrán enviar a cocina vía Loggro hasta configurar esto."}
          </div>
        </div>

        <button onClick={() => onSave({ estado, huesped, pax, notas, reserva_id: reservaId, loggro_mesa_id: loggroMesaId })}
          disabled={saving}
          style={{
            width: "100%", marginTop: 20, padding: "12px",
            background: saving ? B.muted : B.sky, color: B.navy,
            border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer",
          }}>
          {saving ? "Guardando…" : asign ? "Actualizar" : "Asignar"}
        </button>

        {asign && (
          <div style={{ fontSize: 11, color: B.muted, textAlign: "center", marginTop: 12 }}>
            Última actualización: {new Date(asign.updated_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", marginTop: 6,
  background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8,
  color: B.white, fontSize: 13, fontFamily: "inherit",
};
