// RentabilidadFlota.jsx — Dashboard de rentabilidad de flota
// Cruza ingresos (reservas confirmadas) vs costos directos (combustible,
// mantenimiento, viajes operativos) por mes, con desglose por embarcación.

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useMobile } from "../lib/useMobile";

const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtPct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : "—");
const mesLabel = (ym) => {
  const d = new Date(ym + "-01T12:00:00");
  return d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
};
const mesLargo = (ym) => {
  const d = new Date(ym + "-01T12:00:00");
  return d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
};
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function RentabilidadFlota() {
  const { isMobile } = useMobile();
  const [mes, setMes] = useState(thisMonth());
  const [reservas, setReservas]     = useState([]);
  const [bitacora, setBitacora]     = useState([]);
  const [zarpes, setZarpes]         = useState([]);
  const [lanchas, setLanchas]       = useState([]);
  const [loading, setLoading]       = useState(true);

  // Cargar últimos 6 meses para gráfico + el mes seleccionado completo
  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const seisAtras = new Date(); seisAtras.setMonth(seisAtras.getMonth() - 5);
    const desde = seisAtras.toISOString().slice(0, 10);
    const [{ data: lch }, { data: bit }, { data: zfl }, { data: res }] = await Promise.all([
      supabase.from("lanchas").select("*").eq("activo", true).order("nombre"),
      supabase.from("lancha_bitacora")
        .select("lancha_id, lancha_nombre, fecha, tipo, costo_total, galones")
        .gte("fecha", desde)
        .limit(2000),
      supabase.from("muelle_zarpes_flota")
        .select("fecha, embarcacion, motivo, pax_a, pax_n, costo_operativo")
        .gte("fecha", desde)
        .limit(2000),
      supabase.from("reservas")
        .select("fecha, total, abono, estado, tipo")
        .gte("fecha", desde)
        .eq("estado", "confirmado")
        .limit(5000),
    ]);
    setLanchas(lch || []);
    setBitacora(bit || []);
    setZarpes(zfl || []);
    setReservas(res || []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Cálculos del mes seleccionado ─────────────────────────────────────────
  const data = useMemo(() => {
    const filterMes = (arr, key = "fecha") => arr.filter(r => (r[key] || "").startsWith(mes));
    const rMes = filterMes(reservas);
    const bMes = filterMes(bitacora);
    const zMes = filterMes(zarpes);

    const ingresos = rMes.reduce((s, r) => s + Number(r.total || 0), 0);
    const cobrado  = rMes.reduce((s, r) => s + Number(r.abono || 0), 0);

    const costoComb   = bMes.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const galones     = bMes.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.galones || 0), 0);
    const costoMant   = bMes.filter(b => ["mantenimiento", "reparacion"].includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const costoViajes = zMes.reduce((s, z) => s + Number(z.costo_operativo || 0), 0);
    const costosTotales = costoComb + costoMant + costoViajes;
    const margen = ingresos - costosTotales;
    const margenPct = ingresos > 0 ? (margen / ingresos) * 100 : NaN;

    const pax = zMes.reduce((s, z) => s + Number(z.pax_a || 0) + Number(z.pax_n || 0), 0);
    const numZarpes = zMes.length;
    const costoPorPax = pax > 0 ? costoViajes / pax : 0;
    const costoPorZarpe = numZarpes > 0 ? costoViajes / numZarpes : 0;

    // Desglose por embarcación
    const porEmb = lanchas.map(l => {
      const bL = bMes.filter(b => b.lancha_id === l.id);
      const zL = zMes.filter(z => z.embarcacion === l.nombre);
      const lComb = bL.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0);
      const lGal  = bL.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.galones || 0), 0);
      const lMant = bL.filter(b => ["mantenimiento", "reparacion"].includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
      const lViaj = zL.reduce((s, z) => s + Number(z.costo_operativo || 0), 0);
      const lPax  = zL.reduce((s, z) => s + Number(z.pax_a || 0) + Number(z.pax_n || 0), 0);
      const lZarp = zL.length;
      const totalLancha = lComb + lMant + lViaj;
      return {
        id: l.id, nombre: l.nombre, capacidad: l.capacidad_pax || 0,
        comb: lComb, gal: lGal, mant: lMant, viajes: lViaj,
        zarpes: lZarp, pax: lPax, total: totalLancha,
        costoPorPax: lPax > 0 ? lViaj / lPax : 0,
        costoPorZarpe: lZarp > 0 ? lViaj / lZarp : 0,
        ocupacionProm: l.capacidad_pax && lZarp > 0 ? (lPax / (lZarp * l.capacidad_pax)) * 100 : 0,
      };
    });

    return {
      ingresos, cobrado, costoComb, galones, costoMant, costoViajes, costosTotales,
      margen, margenPct, pax, numZarpes, costoPorPax, costoPorZarpe, porEmb,
    };
  }, [mes, reservas, bitacora, zarpes, lanchas]);

  // ── Gráfico 6 meses ───────────────────────────────────────────────────────
  const meses6 = useMemo(() => {
    const arr = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      arr.push(d.toISOString().slice(0, 7));
    }
    return arr.map(ym => {
      const r = reservas.filter(x => (x.fecha || "").startsWith(ym));
      const b = bitacora.filter(x => (x.fecha || "").startsWith(ym));
      const z = zarpes.filter(x => (x.fecha || "").startsWith(ym));
      const ingresos = r.reduce((s, x) => s + Number(x.total || 0), 0);
      const costos = b.filter(x => x.tipo === "combustible").reduce((s, x) => s + Number(x.costo_total || 0), 0)
                   + b.filter(x => ["mantenimiento", "reparacion"].includes(x.tipo)).reduce((s, x) => s + Number(x.costo_total || 0), 0)
                   + z.reduce((s, x) => s + Number(x.costo_operativo || 0), 0);
      return { mes: ym, ingresos, costos, margen: ingresos - costos };
    });
  }, [reservas, bitacora, zarpes]);

  const maxMes = Math.max(1, ...meses6.flatMap(m => [m.ingresos, m.costos]));

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;
  }

  const mesesOpts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    mesesOpts.push(d.toISOString().slice(0, 7));
  }

  return (
    <div style={{ padding: isMobile ? 14 : 22, color: "#fff", minHeight: "100vh", background: B.navy, fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800 }}>💰 Rentabilidad de Flota</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            Ingresos vs combustible · mantenimiento · viajes operativos.
          </div>
        </div>
        <div>
          <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>Mes</label>
          <select value={mes} onChange={e => setMes(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, minWidth: 180 }}>
            {mesesOpts.map(m => <option key={m} value={m}>{mesLargo(m)}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs grandes */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 180}px, 1fr))`, gap: 12, marginBottom: 18 }}>
        <KpiCard label="Ingresos del mes"      valor={fmtCOP(data.ingresos)}    color={B.success} sub={`Cobrado: ${fmtCOP(data.cobrado)}`} />
        <KpiCard label="Combustible"           valor={fmtCOP(data.costoComb)}   color={B.warning} sub={`${data.galones.toFixed(1)} gal`} />
        <KpiCard label="Mantenimiento"         valor={fmtCOP(data.costoMant)}   color={B.sky} />
        <KpiCard label="Viajes operativos"     valor={fmtCOP(data.costoViajes)} color="#a78bfa" sub={`${data.numZarpes} zarpes`} />
        <KpiCard label="Costos totales"        valor={fmtCOP(data.costosTotales)} color={B.danger} />
        <KpiCard label="Margen bruto"          valor={fmtCOP(data.margen)}      color={data.margen >= 0 ? B.success : B.danger}
                 sub={`${fmtPct(data.margenPct)} de ingresos`} />
      </div>

      {/* KPIs operativos */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 200}px, 1fr))`, gap: 12, marginBottom: 22 }}>
        <KpiCard label="Pasajeros transportados" valor={data.pax}                      color="#a78bfa" small />
        <KpiCard label="Costo por pasajero"      valor={fmtCOP(data.costoPorPax)}      color="#a78bfa" small />
        <KpiCard label="Costo por zarpe"         valor={fmtCOP(data.costoPorZarpe)}    color="#a78bfa" small />
      </div>

      {/* Gráfico 6 meses */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Ingresos vs costos · últimos 6 meses</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 200 }}>
          {meses6.map(m => {
            const altoIng = (m.ingresos / maxMes) * 160;
            const altoCos = (m.costos / maxMes) * 160;
            const margenPositivo = m.margen >= 0;
            return (
              <div key={m.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 165, width: "100%", justifyContent: "center" }}>
                  <div style={{ width: "40%", minWidth: 12, maxWidth: 28, background: B.success, height: altoIng, minHeight: m.ingresos > 0 ? 3 : 0, borderRadius: "3px 3px 0 0" }}
                       title={`Ingresos: ${fmtCOP(m.ingresos)}`} />
                  <div style={{ width: "40%", minWidth: 12, maxWidth: 28, background: B.danger, height: altoCos, minHeight: m.costos > 0 ? 3 : 0, borderRadius: "3px 3px 0 0" }}
                       title={`Costos: ${fmtCOP(m.costos)}`} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{mesLabel(m.mes)}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: margenPositivo ? B.success : B.danger }}>
                  {margenPositivo ? "+" : ""}{fmtCOP(m.margen)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.6)", justifyContent: "center" }}>
          <span>▪ <span style={{ color: B.success }}>Ingresos</span></span>
          <span>▪ <span style={{ color: B.danger }}>Costos</span></span>
          <span>· margen abajo</span>
        </div>
      </div>

      {/* Desglose por embarcación */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Desglose por embarcación · {mesLargo(mes)}</div>
        {data.porEmb.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin lanchas activas.</div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.porEmb.map(e => <EmbCard key={e.id} e={e} />)}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: B.navyLight }}>
                  {["Embarcación", "Zarpes", "Pasajeros", "Ocup. prom.", "Combustible", "Mant./Rep.", "Viajes", "Total costos", "$/pax", "$/zarpe"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "Embarcación" ? "left" : "right", fontWeight: 700, color: "rgba(255,255,255,0.6)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.porEmb.map(e => (
                  <tr key={e.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "12px", fontWeight: 700 }}>⛵ {e.nombre}</td>
                    <td style={{ padding: "12px", textAlign: "right" }}>{e.zarpes}</td>
                    <td style={{ padding: "12px", textAlign: "right" }}>{e.pax}</td>
                    <td style={{ padding: "12px", textAlign: "right", color: e.ocupacionProm >= 70 ? B.success : e.ocupacionProm >= 40 ? B.warning : "rgba(255,255,255,0.5)" }}>
                      {e.capacidad ? fmtPct(e.ocupacionProm) : "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", color: B.warning }}>{fmtCOP(e.comb)}</td>
                    <td style={{ padding: "12px", textAlign: "right", color: B.sky }}>{fmtCOP(e.mant)}</td>
                    <td style={{ padding: "12px", textAlign: "right", color: "#a78bfa" }}>{fmtCOP(e.viajes)}</td>
                    <td style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: B.danger }}>{fmtCOP(e.total)}</td>
                    <td style={{ padding: "12px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{e.pax > 0 ? fmtCOP(e.costoPorPax) : "—"}</td>
                    <td style={{ padding: "12px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{e.zarpes > 0 ? fmtCOP(e.costoPorZarpe) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 14, padding: 12, background: B.navy, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
          ℹ️ Los <strong>ingresos</strong> son del pool global (reservas confirmadas del mes), no se atribuyen a una embarcación específica
          porque las reservas no siempre se asignan a una lancha. La rentabilidad por embarcación se evalúa por
          <strong> eficiencia operativa</strong> (costo por pasajero, ocupación, costo por zarpe).
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, valor, color, sub, small }) {
  return (
    <div style={{ background: B.navyMid, padding: small ? 12 : 14, borderRadius: 10, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: small ? 16 : 20, fontWeight: 800, color, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EmbCard({ e }) {
  return (
    <div style={{ background: B.navy, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>⛵ {e.nombre}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{e.zarpes} zarpes · {e.pax} pax</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
        <Row k="⛽ Combustible" v={fmtCOP(e.comb)} c={B.warning} />
        <Row k="🔧 Mant./Rep." v={fmtCOP(e.mant)} c={B.sky} />
        <Row k="⛵ Viajes"     v={fmtCOP(e.viajes)} c="#a78bfa" />
        <Row k="📊 Ocupación"  v={e.capacidad ? fmtPct(e.ocupacionProm) : "—"} c="rgba(255,255,255,0.7)" />
        <Row k="$ por pax"     v={e.pax > 0 ? fmtCOP(e.costoPorPax) : "—"} c="rgba(255,255,255,0.7)" />
        <Row k="$ por zarpe"   v={e.zarpes > 0 ? fmtCOP(e.costoPorZarpe) : "—"} c="rgba(255,255,255,0.7)" />
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total costos</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: B.danger }}>{fmtCOP(e.total)}</span>
      </div>
    </div>
  );
}

function Row({ k, v, c }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: c, marginTop: 2 }}>{v}</div>
    </div>
  );
}
