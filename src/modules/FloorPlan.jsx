import { useState } from "react";
import { B } from "../brand";

const ZONES = [
  { id: "pool", name: "Piscina Infinita", x: 15, y: 25, w: 25, h: 18, cap: 30, occ: 12, color: B.sky },
  { id: "bar", name: "Beach Bar", x: 45, y: 20, w: 18, h: 14, cap: 20, occ: 8, color: B.sand },
  { id: "beach", name: "Playa Norte", x: 10, y: 55, w: 35, h: 20, cap: 40, occ: 22, color: B.sand },
  { id: "beach2", name: "Playa Sur", x: 55, y: 55, w: 30, h: 20, cap: 35, occ: 5, color: B.sand },
  { id: "dock", name: "Muelle Principal", x: 70, y: 15, w: 20, h: 12, cap: 0, occ: 0, color: B.navyLight },
  { id: "restaurant", name: "Restaurante", x: 45, y: 40, w: 22, h: 14, cap: 50, occ: 18, color: B.pink },
  { id: "spa", name: "Zona Spa", x: 72, y: 35, w: 18, h: 16, cap: 12, occ: 4, color: B.pink },
  { id: "vip", name: "Cabanas VIP", x: 10, y: 80, w: 30, h: 14, cap: 16, occ: 10, color: "#D4AF37" },
];

export default function FloorPlan() {
  const [selected, setSelected] = useState(null);
  const zone = ZONES.find(z => z.id === selected);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>Floor Plan — Atolon Beach Club</h2>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: B.success, marginRight: 6 }} />Disponible</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: B.warning, marginRight: 6 }} />Media</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: B.danger, marginRight: 6 }} />Lleno</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        {/* Map */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, position: "relative", minHeight: 500 }}>
          <div style={{ position: "relative", width: "100%", paddingBottom: "65%", background: `linear-gradient(180deg, ${B.navy} 0%, #0a2555 50%, #1a4a7a 100%)`, borderRadius: 8, overflow: "hidden" }}>
            {/* Water texture hint */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(180deg, transparent, rgba(142,202,230,0.1))" }} />
            {ZONES.map(z => {
              const pct = z.cap > 0 ? z.occ / z.cap : 0;
              const statusColor = pct > 0.8 ? B.danger : pct > 0.5 ? B.warning : B.success;
              return (
                <div key={z.id} onClick={() => setSelected(z.id === selected ? null : z.id)}
                  style={{
                    position: "absolute", left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`,
                    background: selected === z.id ? `${z.color}33` : `${z.color}1a`,
                    border: `2px solid ${selected === z.id ? z.color : z.color + "66"}`,
                    borderRadius: 8, cursor: "pointer", transition: "all 0.2s",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: B.white, textAlign: "center", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>{z.name}</div>
                  {z.cap > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor }} />
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{z.occ}/{z.cap}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 16, color: B.sand, marginBottom: 12 }}>Resumen General</h3>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>Total zonas: <strong>{ZONES.length}</strong></div>
              <div>Capacidad total: <strong>{ZONES.reduce((s, z) => s + z.cap, 0)}</strong></div>
              <div>Ocupacion actual: <strong>{ZONES.reduce((s, z) => s + z.occ, 0)}</strong></div>
              <div>Disponible: <strong>{ZONES.reduce((s, z) => s + z.cap - z.occ, 0)}</strong></div>
            </div>
          </div>

          {zone && (
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, borderLeft: `4px solid ${zone.color}` }}>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>{zone.name}</h3>
              {zone.cap > 0 ? (
                <>
                  <div style={{ fontSize: 13, lineHeight: 2, marginBottom: 12 }}>
                    <div>Capacidad: <strong>{zone.cap}</strong></div>
                    <div>Ocupados: <strong>{zone.occ}</strong></div>
                    <div>Disponibles: <strong>{zone.cap - zone.occ}</strong></div>
                  </div>
                  <div style={{ background: B.navy, borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${(zone.occ / zone.cap) * 100}%`, height: "100%", background: zone.occ / zone.cap > 0.8 ? B.danger : zone.occ / zone.cap > 0.5 ? B.warning : B.success, borderRadius: 6, transition: "width 0.3s" }} />
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Zona operativa (sin cupo de huespedes)</div>
              )}
            </div>
          )}

          <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 16, color: B.sand, marginBottom: 12 }}>Flota en Muelle</h3>
            {[
              { name: "Coral II", status: "En isla", color: B.success },
              { name: "Atolon III", status: "En muelle", color: B.sky },
              { name: "Caribe I", status: "En isla", color: B.success },
              { name: "Palmera", status: "En muelle", color: B.sky },
              { name: "Sunrise", status: "Mantenimiento", color: B.danger },
            ].map(b => (
              <div key={b.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${B.navyLight}` }}>
                <span style={{ fontSize: 13 }}>{b.name}</span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: b.color + "22", color: b.color }}>{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
