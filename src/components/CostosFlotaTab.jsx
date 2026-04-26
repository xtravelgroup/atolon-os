// CostosFlotaTab.jsx — Tab de costos consolidados de flota dentro de Lancha.
// La flota es un COSTO de los pasadías (no genera ingreso propio), por eso
// este tab muestra estructura de costos, no rentabilidad.

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useMobile } from "../lib/useMobile";

const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtPct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : "—");
const mesLabel = (ym) => new Date(ym + "-01T12:00:00").toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
const mesLargo = (ym) => new Date(ym + "-01T12:00:00").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function CostosFlotaTab() {
  const { isMobile } = useMobile();
  const [mes, setMes] = useState(thisMonth());
  const [bitacora, setBitacora]     = useState([]);
  const [zarpes, setZarpes]         = useState([]);
  const [llegadas, setLlegadas]     = useState([]); // llegadas a Atolón = medio viaje
  const [lanchas, setLanchas]       = useState([]);
  const [capitanes, setCapitanes]   = useState([]); // nómina (referencia)
  const [loading, setLoading]       = useState(true);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const seisAtras = new Date(); seisAtras.setMonth(seisAtras.getMonth() - 5);
    const desde = seisAtras.toISOString().slice(0, 10);
    const [{ data: lch }, { data: bit }, { data: zfl }, { data: lleg }, { data: caps }] = await Promise.all([
      supabase.from("lanchas").select("*").eq("activo", true).order("nombre"),
      supabase.from("lancha_bitacora")
        .select("lancha_id, lancha_nombre, fecha, tipo, costo_total, galones, proveedor")
        .gte("fecha", desde).limit(2000),
      supabase.from("muelle_zarpes_flota")
        .select("fecha, embarcacion, motivo, pax_a, pax_n, costo_operativo")
        .gte("fecha", desde).limit(2000),
      supabase.from("muelle_llegadas")
        .select("fecha, embarcacion_nombre, tipo, pax_a, pax_n, costo_operativo")
        .gte("fecha", desde)
        .in("tipo", ["lancha_atolon", "lanchas_atolon"])
        .limit(2000),
      supabase.from("capitanes_flota").select("*").eq("activo", true),
    ]);
    setLanchas(lch || []);
    setBitacora(bit || []);
    setZarpes(zfl || []);
    setLlegadas(lleg || []);
    setCapitanes(caps || []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Cálculos del mes seleccionado ─────────────────────────────────────────
  const data = useMemo(() => {
    const filterMes = (arr, key = "fecha") => arr.filter(r => (r[key] || "").startsWith(mes));
    const bMes = filterMes(bitacora);
    const zMes = filterMes(zarpes);
    const lMes = filterMes(llegadas);

    const costoComb        = bMes.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const galones          = bMes.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.galones || 0), 0);
    const costoMant        = bMes.filter(b => ["mantenimiento", "reparacion", "inspeccion", "limpieza"].includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const costoMarina      = bMes.filter(b => b.tipo === "marina").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const costoCapTerceros = bMes.filter(b => b.tipo === "capitanes").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    // Capitanes nómina: NO están en bitácora, leídos de capitanes_flota como referencia
    const costoCapNomina   = capitanes.filter(c => c.tipo === "nomina").reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
    const costoCapitanes   = costoCapTerceros + costoCapNomina;
    // Costo de viajes: cada salida + cada llegada = 1 medio viaje
    const costoSalidas     = zMes.reduce((s, z) => s + Number(z.costo_operativo || 0), 0);
    const costoLlegadas    = lMes.reduce((s, l) => s + Number(l.costo_operativo || 0), 0);
    const costoViajes      = costoSalidas + costoLlegadas;
    const costosTotales    = costoComb + costoMant + costoMarina + costoCapitanes + costoViajes;

    const paxSalida   = zMes.reduce((s, z) => s + Number(z.pax_a || 0) + Number(z.pax_n || 0), 0);
    const paxLlegada  = lMes.reduce((s, l) => s + Number(l.pax_a || 0) + Number(l.pax_n || 0), 0);
    const pax = paxSalida + paxLlegada;
    const numSalidas    = zMes.length;
    const numLlegadas   = lMes.length;
    const numMediosViajes = numSalidas + numLlegadas;
    const numViajesCompletos = Math.floor(numMediosViajes / 2);
    const costoPorPax       = pax > 0 ? costosTotales / pax : 0;
    const costoPorMedioViaje = numMediosViajes > 0 ? costoViajes / numMediosViajes : 0;

    // Por embarcación
    const porEmb = lanchas.map(l => {
      const bL = bMes.filter(b => b.lancha_id === l.id);
      const zL = zMes.filter(z => z.embarcacion === l.nombre);
      const llL = lMes.filter(x => (x.embarcacion_nombre || "").toLowerCase() === l.nombre.toLowerCase());
      const cN = capitanes.filter(c => c.lancha_id === l.id && c.tipo === "nomina")
                  .reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
      const lComb = bL.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0);
      const lMant = bL.filter(b => ["mantenimiento", "reparacion", "inspeccion", "limpieza"].includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
      const lMar  = bL.filter(b => b.tipo === "marina").reduce((s, b) => s + Number(b.costo_total || 0), 0);
      const lCap  = bL.filter(b => b.tipo === "capitanes").reduce((s, b) => s + Number(b.costo_total || 0), 0) + cN;
      const lSal = zL.reduce((s, z) => s + Number(z.costo_operativo || 0), 0);
      const lLleg = llL.reduce((s, x) => s + Number(x.costo_operativo || 0), 0);
      const lViaj = lSal + lLleg;
      const lPax  = zL.reduce((s, z) => s + Number(z.pax_a || 0) + Number(z.pax_n || 0), 0)
                  + llL.reduce((s, x) => s + Number(x.pax_a || 0) + Number(x.pax_n || 0), 0);
      const lSalidas   = zL.length;
      const lLlegadasN = llL.length;
      const lMediosViajes = lSalidas + lLlegadasN;
      const lViajesCompletos = Math.floor(lMediosViajes / 2);
      const totalLancha = lComb + lMant + lMar + lCap + lViaj;
      return {
        id: l.id, nombre: l.nombre, capacidad: l.capacidad_pax || 0,
        comb: lComb, mant: lMant, marina: lMar, capitanes: lCap, viajes: lViaj,
        salidas: lSalidas, llegadas: lLlegadasN, mediosViajes: lMediosViajes,
        viajesCompletos: lViajesCompletos,
        pax: lPax, total: totalLancha,
        costoPorPax: lPax > 0 ? totalLancha / lPax : 0,
        costoPorMedioViaje: lMediosViajes > 0 ? lViaj / lMediosViajes : 0,
        ocupacionProm: l.capacidad_pax && lMediosViajes > 0 ? (lPax / (lMediosViajes * l.capacidad_pax)) * 100 : 0,
      };
    });

    return { costoComb, galones, costoMant, costoMarina, costoCapitanes, costoCapNomina, costoCapTerceros,
             costoSalidas, costoLlegadas, costoViajes, costosTotales,
             pax, numSalidas, numLlegadas, numMediosViajes, numViajesCompletos,
             costoPorPax, costoPorMedioViaje, porEmb };
  }, [mes, bitacora, zarpes, llegadas, lanchas, capitanes]);

  // ── Gráfico 6 meses (solo costos apilados) ────────────────────────────────
  const meses6 = useMemo(() => {
    const arr = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      arr.push(d.toISOString().slice(0, 7));
    }
    const capNomMensual = capitanes.filter(c => c.tipo === "nomina").reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
    return arr.map(ym => {
      const b = bitacora.filter(x => (x.fecha || "").startsWith(ym));
      const z = zarpes.filter(x => (x.fecha || "").startsWith(ym));
      const ll = llegadas.filter(x => (x.fecha || "").startsWith(ym));
      const comb   = b.filter(x => x.tipo === "combustible").reduce((s, x) => s + Number(x.costo_total || 0), 0);
      const mant   = b.filter(x => ["mantenimiento", "reparacion", "inspeccion", "limpieza"].includes(x.tipo)).reduce((s, x) => s + Number(x.costo_total || 0), 0);
      const marina = b.filter(x => x.tipo === "marina").reduce((s, x) => s + Number(x.costo_total || 0), 0);
      const cap    = b.filter(x => x.tipo === "capitanes").reduce((s, x) => s + Number(x.costo_total || 0), 0) + capNomMensual;
      const viajes = z.reduce((s, x) => s + Number(x.costo_operativo || 0), 0)
                   + ll.reduce((s, x) => s + Number(x.costo_operativo || 0), 0);
      return { mes: ym, comb, mant, marina, cap, viajes, total: comb + mant + marina + cap + viajes };
    });
  }, [bitacora, zarpes, llegadas, capitanes]);

  const maxMes = Math.max(1, ...meses6.map(m => m.total));

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;

  const mesesOpts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    mesesOpts.push(d.toISOString().slice(0, 7));
  }

  return (
    <div>
      {/* Header con selector de mes */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Estructura de costos</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
            La flota es un costo del pasadía (no genera ingreso directo). Aquí ves cuánto cuesta operarla.
          </div>
        </div>
        <select value={mes} onChange={e => setMes(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, minWidth: 160 }}>
          {mesesOpts.map(m => <option key={m} value={m}>{mesLargo(m)}</option>)}
        </select>
      </div>

      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 170}px, 1fr))`, gap: 10, marginBottom: 16 }}>
        <Kpi label="Combustible"     valor={fmtCOP(data.costoComb)}   color={B.warning} sub={`${data.galones.toFixed(1)} gal`} />
        <Kpi label="Mantenimiento"   valor={fmtCOP(data.costoMant)}   color={B.sky} />
        <Kpi label="Marina/parqueo"  valor={fmtCOP(data.costoMarina)} color="#22d3ee" />
        <Kpi label="Capitanes"       valor={fmtCOP(data.costoCapitanes)} color="#fb923c"
             sub={`${fmtCOP(data.costoCapNomina)} nómina + ${fmtCOP(data.costoCapTerceros)} terc.`} />
        <Kpi label="Viajes flota"    valor={fmtCOP(data.costoViajes)} color="#a78bfa"
             sub={`${data.numMediosViajes} medios = ${data.numViajesCompletos} ida+vuelta`} />
        <Kpi label="Costo total mes" valor={fmtCOP(data.costosTotales)} color={B.danger} grande />
      </div>

      {/* KPIs unitarios */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 200}px, 1fr))`, gap: 10, marginBottom: 18 }}>
        <Kpi label="Pasajeros transportados" valor={data.pax}                          color="#a78bfa" small sub={`${data.numLlegadas} llegadas + ${data.numSalidas} salidas`} />
        <Kpi label="Costo por pasajero"      valor={fmtCOP(data.costoPorPax)}          color="#a78bfa" small />
        <Kpi label="Costo por medio viaje"   valor={fmtCOP(data.costoPorMedioViaje)}   color="#a78bfa" small />
      </div>

      {/* Gráfico 6 meses (costos apilados) */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Costos por mes · últimos 6 meses</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 200 }}>
          {meses6.map(m => {
            const h = (cat) => maxMes ? (m[cat] / maxMes) * 160 : 0;
            return (
              <div key={m.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column-reverse", width: "100%", maxWidth: 36, height: 165, alignItems: "stretch" }}>
                  <div style={{ background: B.warning, height: h("comb"),   minHeight: m.comb   > 0 ? 3 : 0 }} title={`Combustible: ${fmtCOP(m.comb)}`} />
                  <div style={{ background: B.sky,     height: h("mant"),   minHeight: m.mant   > 0 ? 3 : 0 }} title={`Mant.: ${fmtCOP(m.mant)}`} />
                  <div style={{ background: "#22d3ee", height: h("marina"), minHeight: m.marina > 0 ? 3 : 0 }} title={`Marina: ${fmtCOP(m.marina)}`} />
                  <div style={{ background: "#fb923c", height: h("cap"),    minHeight: m.cap    > 0 ? 3 : 0 }} title={`Capitanes: ${fmtCOP(m.cap)}`} />
                  <div style={{ background: "#a78bfa", height: h("viajes"), minHeight: m.viajes > 0 ? 3 : 0 }} title={`Viajes: ${fmtCOP(m.viajes)}`} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{mesLabel(m.mes)}</div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{fmtCOP(m.total)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.6)", flexWrap: "wrap", justifyContent: "center" }}>
          <span>▪ <span style={{ color: B.warning }}>Combustible</span></span>
          <span>▪ <span style={{ color: B.sky }}>Mantenimiento</span></span>
          <span>▪ <span style={{ color: "#22d3ee" }}>Marina</span></span>
          <span>▪ <span style={{ color: "#fb923c" }}>Capitanes</span></span>
          <span>▪ <span style={{ color: "#a78bfa" }}>Viajes</span></span>
        </div>
      </div>

      {/* Tabla por embarcación */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Costos por embarcación · {mesLargo(mes)}</div>
        {data.porEmb.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin lanchas activas.</div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{data.porEmb.map(e => <EmbCard key={e.id} e={e} />)}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: B.navyLight }}>
                  {["Embarcación", "Llegadas", "Salidas", "Ida+Vuelta", "Pasajeros", "Ocup. prom.", "Combustible", "Mant./Rep.", "Marina", "Capitanes", "Viajes", "TOTAL", "$/pax", "$/medio"].map(h => (
                    <th key={h} style={{ padding: "10px 10px", textAlign: h === "Embarcación" ? "left" : "right", fontWeight: 700, color: "rgba(255,255,255,0.6)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.porEmb.map(e => (
                  <tr key={e.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "10px", fontWeight: 700 }}>⛵ {e.nombre}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{e.llegadas}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{e.salidas}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: e.viajesCompletos > 0 ? B.success : "rgba(255,255,255,0.4)" }}>{e.viajesCompletos}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{e.pax}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: e.ocupacionProm >= 70 ? B.success : e.ocupacionProm >= 40 ? B.warning : "rgba(255,255,255,0.5)" }}>
                      {e.capacidad ? fmtPct(e.ocupacionProm) : "—"}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right", color: B.warning }}>{fmtCOP(e.comb)}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: B.sky }}>{fmtCOP(e.mant)}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: "#22d3ee" }}>{fmtCOP(e.marina)}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: "#fb923c" }}>{fmtCOP(e.capitanes)}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: "#a78bfa" }}>{fmtCOP(e.viajes)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: B.danger }}>{fmtCOP(e.total)}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{e.pax > 0 ? fmtCOP(e.costoPorPax) : "—"}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{e.mediosViajes > 0 ? fmtCOP(e.costoPorMedioViaje) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 14, padding: 12, background: B.navy, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
          ℹ️ El <strong>costo por pasajero</strong> de este tab alimenta automáticamente el componente "Transporte" del módulo
          <strong> Costeo Productos</strong>, donde se calcula el COGS de cada pasadía.
          Los capitanes <strong>nómina</strong> se incluyen como referencia (su pago real va por RRHH/Nómina, no se duplica).
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, valor, color, sub, grande, small }) {
  return (
    <div style={{ background: B.navyMid, padding: small ? 10 : grande ? 16 : 12, borderRadius: 10, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: small ? 15 : grande ? 22 : 18, fontWeight: 800, color, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EmbCard({ e }) {
  return (
    <div style={{ background: B.navy, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>⛵ {e.nombre}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{e.llegadas}🛬 + {e.salidas}🛫 = {e.viajesCompletos} ida+vuelta · {e.pax} pax</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
        <Row k="⛽ Combustible" v={fmtCOP(e.comb)} c={B.warning} />
        <Row k="🔧 Mant./Rep." v={fmtCOP(e.mant)} c={B.sky} />
        <Row k="🅿️ Marina"     v={fmtCOP(e.marina)} c="#22d3ee" />
        <Row k="👨‍✈️ Capitanes" v={fmtCOP(e.capitanes)} c="#fb923c" />
        <Row k="⛵ Viajes"     v={fmtCOP(e.viajes)} c="#a78bfa" />
        <Row k="📊 Ocupación"  v={e.capacidad ? fmtPct(e.ocupacionProm) : "—"} c="rgba(255,255,255,0.7)" />
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total costos</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: B.danger }}>{fmtCOP(e.total)}</span>
      </div>
      {e.pax > 0 && (
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>$ por pasajero</span>
          <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>{fmtCOP(e.costoPorPax)}</span>
        </div>
      )}
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
