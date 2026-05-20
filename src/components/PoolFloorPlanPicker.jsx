// PoolFloorPlanPicker — Componente visual reusable del Floor Plan de Piscina.
// Lo usan: FloorPlan.jsx (admin, gestiona estado de spots) y PoolService.jsx
// (meseros, eligen spot para crear pedido).
//
// Props:
//   - fecha:           "YYYY-MM-DD" (default: hoy Bogotá)
//   - selectedSpotId:  string — spot resaltado (color highlight)
//   - onSelectSpot:    (spot, asignacion) => void — callback al click
//   - showEstadoColor: bool — si true, color del spot refleja estado (libre/ocupado/etc)
//                       si false, usa color neutro y solo highlight para seleccionado
//   - showLabels:      bool — mostrar headers "PISCINA DERECHA" etc. (default true)

import { useEffect, useMemo, useState } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";

const ESTADOS = {
  libre:      { color: B.success,  bg: B.success + "22", icon: "○" },
  reservado:  { color: B.sky,      bg: B.sky + "22",     icon: "⏰" },
  ocupado:    { color: B.danger,   bg: B.danger + "22",  icon: "●" },
  limpieza:   { color: B.warning,  bg: B.warning + "22", icon: "✧" },
  bloqueado:  { color: B.muted,    bg: B.navyLight,      icon: "✕" },
};

function todayBogota() {
  return new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).slice(0, 10);
}

export default function PoolFloorPlanPicker({
  fecha = todayBogota(),
  selectedSpotId = null,
  onSelectSpot,
  showEstadoColor = true,
  showLabels = true,
  // size = "lg" hace que los spots sean grandes (para que el mesero ubique
  // visualmente). "sm" para vistas compactas (admin / tooltips).
  size = "lg",
}) {
  const { isMobile } = useBreakpoint();
  const [spots, setSpots] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [loading, setLoading] = useState(true);

  // Load spots (once) — trae area=piscina Y area=playa.
  useEffect(() => {
    if (!supabase) return;
    supabase.from("floorplan_spots")
      .select("*").in("area", ["piscina", "playa"]).eq("activo", true)
      .order("zona").order("fila").order("orden")
      .then(({ data }) => setSpots(data || []));
  }, []);

  // Load asignaciones por fecha
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

  // Agrupamos por POSICIÓN (no por tipo de mobiliario):
  //   - "exterior" → camas en la pared (IDs que empiezan con "C")
  //   - "poolside" → camas pegadas a la piscina (IDs que empiezan con "PS")
  //   - "central"  → camas detrás de la piscina (IDs PS31–PS34)
  // Todas son camas físicamente. La distinción es ubicación, no mobiliario.
  // Playa: agrupa por `fila` (1=frente piscina, 2=central, 3=frente mar).
  const grouped = useMemo(() => {
    const g = {
      piscina_derecha:    { exterior: [], poolside: [] },
      piscina_izquierda:  { poolside: [], exterior: [] },
      piscina_central:    { central: [] },
      playa:              { fila1: [], fila2: [], fila3: [] },
    };
    for (const s of spots) {
      if (s.zona === "playa") {
        const k = s.fila === 1 ? "fila1" : s.fila === 2 ? "fila2" : "fila3";
        g.playa[k].push(s);
        continue;
      }
      const z = g[s.zona]; if (!z) continue;
      if (s.zona === "piscina_central") {
        z.central.push(s);
        continue;
      }
      // C11/C12... → exterior; PS11/PS12... → poolside
      const key = s.id.startsWith("PS") ? "poolside" : "exterior";
      if (z[key]) z[key].push(s);
    }
    return g;
  }, [spots]);

  const tienePlaya = (grouped.playa.fila1.length + grouped.playa.fila2.length + grouped.playa.fila3.length) > 0;

  const handleClick = (spot) => {
    if (!onSelectSpot) return;
    onSelectSpot(spot, asignaciones[spot.id]);
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 30, color: B.muted }}>Cargando…</div>;
  }

  // Tamaños proporcionales — todas las camas tienen mismo tamaño.
  // En TELÉFONO (95% del uso real: meseros con iPhone/Samsung/Motorola) usamos
  // un perfil compacto que mete TODO el plano espacial en ~360px de ancho sin
  // scroll horizontal — el mesero reconoce la ubicación física aunque sea chico.
  const isLg = size === "lg";
  const SIZES = isMobile
    ? { camaW: 40,  camaH: 44, gap: 4,  pad: 8,  poolH: 260, fontSpot: 9,  fontHuesped: 0  }
    : isLg
    ? { camaW: 100, camaH: 76, gap: 10, pad: 24, poolH: 480, fontSpot: 16, fontHuesped: 11 }
    : { camaW: 60,  camaH: 50, gap: 6,  pad: 16, poolH: 340, fontSpot: 11, fontHuesped: 9  };

  return (
    <div style={{
      background: B.navy, borderRadius: 14, padding: SIZES.pad,
      border: `2px dashed ${B.success}44`,
      maxWidth: 1400, margin: "0 auto",
      width: "100%", boxSizing: "border-box", overflowX: "hidden",
    }}>
      {/* PISCINA CENTRAL — fila top */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: isMobile ? SIZES.gap : SIZES.gap * 1.5, marginBottom: SIZES.gap }}>
        <div />
        <div>
          {showLabels && <SectionLabel size={size} mobile={isMobile}>{isMobile ? "CENTRAL" : "PISCINA CENTRAL"}</SectionLabel>}
          <div style={{ display: "flex", gap: SIZES.gap, justifyContent: "center", padding: `${SIZES.gap}px 0` }}>
            {grouped.piscina_central.central.map(s => (
              <Spot key={s.id} spot={s} asign={asignaciones[s.id]}
                selected={selectedSpotId === s.id}
                showEstadoColor={showEstadoColor}
                sizes={SIZES}
                onClick={handleClick} />
            ))}
          </div>
        </div>
        <div />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: isMobile ? SIZES.gap : SIZES.gap * 1.5 }}>
        {/* DERECHA: camas exteriores (C1x) | camas poolside (PS1x) */}
        <div>
          {showLabels && <SectionLabel size={size} mobile={isMobile}>{isMobile ? "DER." : "PISCINA DERECHA"}</SectionLabel>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SIZES.gap, padding: `${SIZES.gap}px 0` }}>
            <div style={{ display: "flex", flexDirection: "column", gap: SIZES.gap }}>
              {grouped.piscina_derecha.exterior.map(s => (
                <Spot key={s.id} spot={s} asign={asignaciones[s.id]}
                  selected={selectedSpotId === s.id}
                  showEstadoColor={showEstadoColor}
                  sizes={SIZES}
                  onClick={handleClick} />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: SIZES.gap }}>
              {grouped.piscina_derecha.poolside.map(s => (
                <Spot key={s.id} spot={s} asign={asignaciones[s.id]}
                  selected={selectedSpotId === s.id}
                  showEstadoColor={showEstadoColor}
                  sizes={SIZES}
                  onClick={handleClick} />
              ))}
            </div>
          </div>
        </div>

        {/* La piscina visual */}
        <div style={{
          background: "linear-gradient(180deg, #67e8f9 0%, #38bdf8 30%, #0ea5e9 65%, #0284c7 100%)",
          borderRadius: 16, minHeight: SIZES.poolH, margin: `${SIZES.gap}px 0`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.7)",
          fontSize: isMobile ? 11 : isLg ? 24 : 13, fontWeight: 800,
          letterSpacing: isMobile ? "0.05em" : "0.25em",
          textShadow: "0 2px 6px rgba(0,0,0,0.35)",
          boxShadow: "inset 0 6px 30px rgba(0,0,0,0.25), 0 2px 12px rgba(14,165,233,0.3)",
          position: "relative",
          overflow: "hidden",
        }}>
          {isLg && (
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: "radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(255,255,255,0.1) 0%, transparent 50%)",
              pointerEvents: "none",
            }} />
          )}
          <span style={{ position: "relative", zIndex: 1 }}>🌊 PISCINA</span>
        </div>

        {/* IZQUIERDA: camas poolside (PS2x) | camas exteriores (C2x) */}
        <div>
          {showLabels && <SectionLabel size={size} mobile={isMobile}>{isMobile ? "IZQ." : "PISCINA IZQUIERDA"}</SectionLabel>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SIZES.gap, padding: `${SIZES.gap}px 0` }}>
            <div style={{ display: "flex", flexDirection: "column", gap: SIZES.gap }}>
              {grouped.piscina_izquierda.poolside.map(s => (
                <Spot key={s.id} spot={s} asign={asignaciones[s.id]}
                  selected={selectedSpotId === s.id}
                  showEstadoColor={showEstadoColor}
                  sizes={SIZES}
                  onClick={handleClick} />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: SIZES.gap }}>
              {grouped.piscina_izquierda.exterior.map(s => (
                <Spot key={s.id} spot={s} asign={asignaciones[s.id]}
                  selected={selectedSpotId === s.id}
                  showEstadoColor={showEstadoColor}
                  sizes={SIZES}
                  onClick={handleClick} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════ ZONA PLAYA ════════════
          Se renderiza debajo del bloque de piscina. 3 filas horizontales con
          orden ascendente (P11/P31/P52 a la izquierda). Termina con una
          banda "MAR" estilizada simulando el agua del Caribe. */}
      {tienePlaya && (
        <div style={{ marginTop: SIZES.gap * 3, paddingTop: SIZES.gap * 2, borderTop: `2px dashed ${B.sand}33` }}>
          {showLabels && (
            <div style={{ textAlign: "center", marginBottom: SIZES.gap * 1.5 }}>
              <SectionLabel size={size} mobile={isMobile}>
                {isMobile ? "🏖️ PLAYA" : "🏖️ PLAYA"}
              </SectionLabel>
            </div>
          )}
          {/* Fila 1 — frente a la piscina */}
          <PlayaRow camas={grouped.playa.fila1} sizes={SIZES} {...{ selectedSpotId, showEstadoColor, asignaciones, handleClick, isMobile }} />
          {/* Fila 2 — central */}
          <PlayaRow camas={grouped.playa.fila2} sizes={SIZES} {...{ selectedSpotId, showEstadoColor, asignaciones, handleClick, isMobile }} />
          {/* Fila 3 — frente al mar */}
          <PlayaRow camas={grouped.playa.fila3} sizes={SIZES} {...{ selectedSpotId, showEstadoColor, asignaciones, handleClick, isMobile }} />
          {/* Banda MAR — gradiente turquesa con onda y emoji */}
          <div style={{
            marginTop: SIZES.gap * 1.5,
            background: "linear-gradient(180deg, #67e8f9 0%, #38bdf8 50%, #0284c7 100%)",
            borderRadius: 12,
            padding: `${isMobile ? 10 : 16}px 0`,
            textAlign: "center",
            fontSize: isMobile ? 12 : isLg ? 18 : 14,
            fontWeight: 800,
            color: "rgba(255,255,255,0.9)",
            letterSpacing: isMobile ? "0.1em" : "0.3em",
            textShadow: "0 2px 6px rgba(0,0,0,0.3)",
            boxShadow: "inset 0 4px 16px rgba(0,0,0,0.15), 0 2px 8px rgba(14,165,233,0.3)",
          }}>
            ≈≈ 🌊 MAR ≈≈
          </div>
        </div>
      )}
    </div>
  );
}

// Renderiza una fila de camas de playa. Usa flex-wrap para que en móvil
// las filas largas (P31-P42 = 12 camas) se envuelvan suavemente.
function PlayaRow({ camas, sizes, selectedSpotId, showEstadoColor, asignaciones, handleClick, isMobile }) {
  if (!camas || camas.length === 0) return null;
  return (
    <div style={{
      display: "flex",
      flexWrap: isMobile ? "wrap" : "nowrap",
      gap: sizes.gap,
      justifyContent: "center",
      marginBottom: sizes.gap,
      overflowX: isMobile ? "visible" : "auto",
    }}>
      {camas.map(s => (
        <Spot key={s.id} spot={s} asign={asignaciones[s.id]}
          selected={selectedSpotId === s.id}
          showEstadoColor={showEstadoColor}
          sizes={sizes}
          onClick={handleClick} />
      ))}
    </div>
  );
}

function Spot({ spot, asign, selected, showEstadoColor, onClick, sizes }) {
  const estado = asign?.estado || "libre";
  const cfg = ESTADOS[estado] || ESTADOS.libre;
  const SZ = sizes || { camaW: 60, camaH: 50, fontSpot: 11, fontHuesped: 9 };

  // Todas son camas físicamente. La diferencia C/PS solo indica posición:
  // - C (C11-C25) → cama en el borde exterior (pared)
  // - PS (PS11-PS34) → cama Pool Side (pegada al agua)
  const posicion = spot.id.startsWith("PS") ? "Pool Side" : "Exterior";

  // Si showEstadoColor=false, usar color neutro (selección via highlight)
  const baseColor = showEstadoColor ? cfg.color : B.navyLight;
  const baseBg    = showEstadoColor ? cfg.bg    : B.navyMid;
  const borderColor = selected ? B.sand : baseColor;
  const bg          = selected ? B.sand + "33" : baseBg;

  return (
    <div
      onClick={() => onClick(spot)}
      title={`${spot.id} · Cama ${posicion} · cap ${spot.capacidad}${asign?.huesped ? " · " + asign.huesped : ""}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: SZ.fontSpot > 13 ? "10px 6px" : "8px 4px",
        background: bg,
        border: `${selected ? 3 : 2}px solid ${borderColor}`,
        borderRadius: 10,
        cursor: "pointer",
        minWidth: SZ.camaW,
        minHeight: SZ.camaH,
        transition: "transform 0.1s, box-shadow 0.1s",
        boxShadow: selected ? `0 0 0 4px ${B.sand}66, 0 4px 16px ${B.sand}44` : "none",
        position: "relative",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "scale(1.06)";
        if (!selected) e.currentTarget.style.boxShadow = `0 6px 16px ${baseColor}66`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = selected ? `0 0 0 4px ${B.sand}66, 0 4px 16px ${B.sand}44` : "none";
      }}
    >
      {SZ.fontSpot > 13 && (
        <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 2 }}>🛋</div>
      )}
      <div style={{ fontSize: SZ.fontSpot, fontWeight: 800, color: showEstadoColor ? cfg.color : B.white, letterSpacing: "0.04em" }}>
        {spot.id}
      </div>
      {/* Nombre del huésped — oculto en teléfono (fontHuesped=0): no hay espacio
          a 40px de ancho. El badge de estado en la esquina ya indica ocupación. */}
      {asign?.huesped && SZ.fontHuesped > 0 && (
        <div style={{
          fontSize: SZ.fontHuesped, color: B.white, marginTop: 2,
          maxWidth: SZ.camaW - 8,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          👤 {asign.huesped}
        </div>
      )}
      {/* Badge de estado en la esquina cuando no es libre */}
      {showEstadoColor && estado !== "libre" && (
        <div style={{
          position: "absolute", top: -6, right: -6,
          background: cfg.color, color: B.navy,
          borderRadius: "50%", width: 16, height: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        }}>
          {cfg.icon}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children, size, mobile }) {
  const isLg = size === "lg";
  return (
    <div style={{
      background: B.navyMid, color: B.white,
      padding: mobile ? "3px 4px" : isLg ? "8px 14px" : "5px 10px",
      borderRadius: 6, textAlign: "center",
      fontSize: mobile ? 8 : isLg ? 13 : 10,
      fontWeight: 700, letterSpacing: mobile ? "0.02em" : "0.08em",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    }}>
      {children}
    </div>
  );
}
