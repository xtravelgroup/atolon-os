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

// Si recibe lanchaId, filtra TODOS los datos a esa lancha específica.
// Si no, muestra agregado de toda la flota (modo legacy).
export default function CostosFlotaTab({ lanchaId = null } = {}) {
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
        .select("fecha, hora_zarpe, embarcacion, motivo, pax_a, pax_n, costo_operativo, motores_horas")
        .gte("fecha", desde).limit(2000),
      supabase.from("muelle_llegadas")
        .select("fecha, hora_llegada, embarcacion_nombre, tipo, pax_a, pax_n, costo_operativo, motores_horas")
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

  // Si llega lanchaId, filtrar TODA la data a esa lancha. Esto incluye:
  // bitacora por lancha_id directo, zarpes/llegadas por nombre normalizado,
  // capitanes por lancha_id, y lanchas a solo la elegida.
  const normNombre = (s) => (s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(.)\1+/g, "$1").trim();
  const lanchaActiva = lanchaId ? (lanchas.find(l => l.id === lanchaId) || null) : null;
  const lanchaActivaNombreNorm = lanchaActiva ? normNombre(lanchaActiva.nombre) : null;
  // tipo_uso="servicio" significa que la lancha NO transporta pasajeros
  // (Castillete) — se reportan costos por viaje, no por pax.
  const esServicio = lanchaActiva?.tipo_uso === "servicio";

  // Vistas filtradas (memoizadas en función del filtro y datos)
  const lanchasView   = lanchaId ? lanchas.filter(l => l.id === lanchaId)               : lanchas;
  const bitacoraView  = lanchaId ? bitacora.filter(b => b.lancha_id === lanchaId)        : bitacora;
  const zarpesView    = lanchaId ? zarpes.filter(z => normNombre(z.embarcacion) === lanchaActivaNombreNorm) : zarpes;
  const llegadasView  = lanchaId ? llegadas.filter(x => normNombre(x.embarcacion_nombre) === lanchaActivaNombreNorm) : llegadas;
  const capitanesView = lanchaId ? capitanes.filter(c => c.lancha_id === lanchaId)       : capitanes;

  // ── Cálculos del mes seleccionado ─────────────────────────────────────────
  // Reglas (consensuadas con dirección):
  // 1. Solo se cuentan LLEGADAS para el cálculo de costo/pasadía
  // 2. Staff se EXCLUYE — solo cuentan pax pagantes (pax_a + pax_n)
  // 3. Combustible es costo REAL de bitácora (no estimado por horas)
  // 4. Mantenimiento es costo REAL del periodo
  // 5. Costo total = combustible + mantenimiento + marina + capitanes
  //    + reserva motores (NO se incluye "viajes flota" porque era estimación)
  const data = useMemo(() => {
    const filterMes = (arr, key = "fecha") => arr.filter(r => (r[key] || "").startsWith(mes));
    const bMes = filterMes(bitacoraView);
    const zMes = filterMes(zarpesView);
    const lMes = filterMes(llegadasView);

    const costoComb        = bMes.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const galones          = bMes.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.galones || 0), 0);
    const costoMant        = bMes.filter(b => ["mantenimiento", "reparacion", "inspeccion", "limpieza"].includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const costoMarina      = bMes.filter(b => b.tipo === "marina").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const costoCapTerceros = bMes.filter(b => b.tipo === "capitanes").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const costoCapNomina   = capitanesView.filter(c => c.tipo === "nomina").reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
    const costoCapitanes   = costoCapTerceros + costoCapNomina;

    // ── Reserva motores: horas de uso del mes × $/hora por lancha ─────────
    // Fuente: motores_horas (jsonb {babor, estribor, centro}) en zarpes_flota
    // y muelle_llegadas. Se toma el delta entre la primera y última lectura
    // del mes. Suma babor+estribor+centro = horas de motor (acumula los
    // motores múltiples — para Yamaha F350 dual son ~2 motores que se
    // reemplazan independientemente, así que sumar es correcto para reserva).
    const normN = (s) => (s || "").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/(.)\1+/g, "$1").trim();
    const sumH = (h) => Number(h?.babor || 0) + Number(h?.estribor || 0) + Number(h?.centro || 0);
    const horasUsoPorLancha = {};
    lanchasView.forEach(l => {
      const target = normN(l.nombre);
      const reads = [
        ...zMes.filter(z => z.motores_horas && normN(z.embarcacion) === target)
              .map(z => ({ fecha: z.fecha, hora: z.hora_zarpe, motores_horas: z.motores_horas })),
        ...lMes.filter(x => x.motores_horas && normN(x.embarcacion_nombre) === target)
              .map(x => ({ fecha: x.fecha, hora: x.hora_llegada, motores_horas: x.motores_horas })),
      ].sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")));
      if (reads.length < 2) {
        horasUsoPorLancha[l.id] = 0;
        return;
      }
      const first = sumH(reads[0].motores_horas);
      const last  = sumH(reads[reads.length - 1].motores_horas);
      horasUsoPorLancha[l.id] = Math.max(0, last - first);
    });
    const reservaMotores = lanchasView.reduce((s, l) => s + (horasUsoPorLancha[l.id] || 0) * Number(l.motor_reserva_por_hora || 0), 0);
    // Compatibilidad: aún calculamos viajes pero NO se suma al total
    const costoSalidas     = zMes.reduce((s, z) => s + Number(z.costo_operativo || 0), 0);
    const costoLlegadas    = lMes.reduce((s, l) => s + Number(l.costo_operativo || 0), 0);
    const costoViajes      = costoSalidas + costoLlegadas;
    // TOTAL: solo costos REALES + reserva motores
    const costosTotales    = costoComb + costoMant + costoMarina + costoCapitanes + reservaMotores;

    // PAX: solo llegadas, sin staff (staff va en notas, no en pax_a/n)
    const paxLlegada  = lMes.reduce((s, l) => s + Number(l.pax_a || 0) + Number(l.pax_n || 0), 0);
    const paxSalida   = zMes.reduce((s, z) => s + Number(z.pax_a || 0) + Number(z.pax_n || 0), 0);
    const pax = paxLlegada; // ← solo llegadas
    const numSalidas    = zMes.length;
    const numLlegadas   = lMes.length;
    const numMediosViajes = numSalidas + numLlegadas;
    const numViajesCompletos = Math.floor(numMediosViajes / 2);

    // 💰 KPI principal: costo total / pax que llegaron (sin staff)
    const costoPorPasadia    = pax > 0 ? costosTotales / pax : 0;
    // Desglose: costo combustible + mantenimiento por pasadía (los más relevantes)
    const costoCombMant      = costoComb + costoMant;
    const costoCombMantPorPax = pax > 0 ? costoCombMant / pax : 0;
    // Compatibilidad: el cálculo viejo era pax (llegadas + salidas), pero
    // la dirección lo simplificó a solo llegadas
    const costoPorPax        = costoPorPasadia;
    const costoPorMedioViaje = numMediosViajes > 0 ? costoViajes / numMediosViajes : 0;

    // Por embarcación
    const porEmb = lanchasView.map(l => {
      const bL = bMes.filter(b => b.lancha_id === l.id);
      const zL = zMes.filter(z => z.embarcacion === l.nombre);
      const llL = lMes.filter(x => (x.embarcacion_nombre || "").toLowerCase() === l.nombre.toLowerCase());
      const cN = capitanesView.filter(c => c.lancha_id === l.id && c.tipo === "nomina")
                  .reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
      const lComb = bL.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0);
      const lMant = bL.filter(b => ["mantenimiento", "reparacion", "inspeccion", "limpieza"].includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
      const lMar  = bL.filter(b => b.tipo === "marina").reduce((s, b) => s + Number(b.costo_total || 0), 0);
      const lCap  = bL.filter(b => b.tipo === "capitanes").reduce((s, b) => s + Number(b.costo_total || 0), 0) + cN;
      const lSal = zL.reduce((s, z) => s + Number(z.costo_operativo || 0), 0);
      const lLleg = llL.reduce((s, x) => s + Number(x.costo_operativo || 0), 0);
      const lViaj = lSal + lLleg;
      // Pax solo de llegadas (sin staff, sin doble-conteo con zarpes)
      const lPax = llL.reduce((s, x) => s + Number(x.pax_a || 0) + Number(x.pax_n || 0), 0);
      const lSalidas   = zL.length;
      const lLlegadasN = llL.length;
      const lMediosViajes = lSalidas + lLlegadasN;
      const lViajesCompletos = Math.floor(lMediosViajes / 2);
      // Reserva motores por lancha = horas usadas × $/hora
      const lHorasUso = horasUsoPorLancha[l.id] || 0;
      const lReservaMot = lHorasUso * Number(l.motor_reserva_por_hora || 0);
      const totalLancha = lComb + lMant + lMar + lCap + lReservaMot;
      return {
        id: l.id, nombre: l.nombre, capacidad: l.capacidad_pax || 0,
        comb: lComb, mant: lMant, marina: lMar, capitanes: lCap, viajes: lViaj,
        salidas: lSalidas, llegadas: lLlegadasN, mediosViajes: lMediosViajes,
        viajesCompletos: lViajesCompletos,
        horasUso: lHorasUso, reservaMotores: lReservaMot,
        tarifaHora: Number(l.motor_reserva_por_hora || 0),
        pax: lPax, total: totalLancha,
        costoPorPax: lPax > 0 ? totalLancha / lPax : 0,
        costoPorMedioViaje: lMediosViajes > 0 ? lViaj / lMediosViajes : 0,
        ocupacionProm: l.capacidad_pax && lLlegadasN > 0 ? (lPax / (lLlegadasN * l.capacidad_pax)) * 100 : 0,
      };
    });

    const horasMotorMes = Object.values(horasUsoPorLancha).reduce((s, h) => s + h, 0);
    return { costoComb, galones, costoMant, costoMarina, costoCapitanes, costoCapNomina, costoCapTerceros,
             reservaMotores, horasMotorMes,
             costoSalidas, costoLlegadas, costoViajes, costosTotales,
             pax, paxLlegada, paxSalida,
             numSalidas, numLlegadas, numMediosViajes, numViajesCompletos,
             costoPorPasadia, costoCombMant, costoCombMantPorPax,
             costoPorPax, costoPorMedioViaje, porEmb };
  }, [mes, bitacoraView, zarpesView, llegadasView, lanchasView, capitanesView]);

  // ── Gráfico 6 meses (solo costos apilados) ────────────────────────────────
  const meses6 = useMemo(() => {
    const arr = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      arr.push(d.toISOString().slice(0, 7));
    }
    const capNomMensual = capitanesView.filter(c => c.tipo === "nomina").reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
    const normN6 = (s) => (s || "").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/(.)\1+/g, "$1").trim();
    const sumH6 = (h) => Number(h?.babor || 0) + Number(h?.estribor || 0) + Number(h?.centro || 0);
    return arr.map(ym => {
      const b = bitacoraView.filter(x => (x.fecha || "").startsWith(ym));
      const comb   = b.filter(x => x.tipo === "combustible").reduce((s, x) => s + Number(x.costo_total || 0), 0);
      const mant   = b.filter(x => ["mantenimiento", "reparacion", "inspeccion", "limpieza"].includes(x.tipo)).reduce((s, x) => s + Number(x.costo_total || 0), 0);
      const marina = b.filter(x => x.tipo === "marina").reduce((s, x) => s + Number(x.costo_total || 0), 0);
      const cap    = b.filter(x => x.tipo === "capitanes").reduce((s, x) => s + Number(x.costo_total || 0), 0) + capNomMensual;
      // Reserva motores por mes = sum(horas mes × $/hora) por lancha
      const reserva = lanchasView.reduce((sum, l) => {
        const target = normN6(l.nombre);
        const reads = [
          ...zarpesView.filter(z => z.motores_horas && (z.fecha || "").startsWith(ym) && normN6(z.embarcacion) === target).map(z => ({ fecha: z.fecha, hora: z.hora_zarpe, mh: z.motores_horas })),
          ...llegadasView.filter(x => x.motores_horas && (x.fecha || "").startsWith(ym) && normN6(x.embarcacion_nombre) === target).map(x => ({ fecha: x.fecha, hora: x.hora_llegada, mh: x.motores_horas })),
        ].sort((a, b2) => (a.fecha + (a.hora || "")).localeCompare(b2.fecha + (b2.hora || "")));
        if (reads.length < 2) return sum;
        const horas = Math.max(0, sumH6(reads[reads.length - 1].mh) - sumH6(reads[0].mh));
        return sum + horas * Number(l.motor_reserva_por_hora || 0);
      }, 0);
      return { mes: ym, comb, mant, marina, cap, reserva, total: comb + mant + marina + cap + reserva };
    });
  }, [bitacoraView, lanchasView, capitanesView, zarpesView, llegadasView]);

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
        <Kpi label="Reserva motores" valor={fmtCOP(data.reservaMotores)} color="#a78bfa"
             sub={data.horasMotorMes > 0 ? `${data.horasMotorMes.toFixed(1)} h motor × tarifa por lancha` : "Sin lecturas de motor este mes"} />
        <Kpi label="Costo total mes" valor={fmtCOP(data.costosTotales)} color={B.danger} grande
             sub="Comb + Mant + Marina + Capitanes + Reserva" />
      </div>

      {/* KPI destacado: Costo por Pasadía o por Viaje según tipo_uso */}
      {esServicio ? (
        // ── Lancha de SERVICIO (Castillete) — costo por viaje ───────────
        <div style={{ background: `linear-gradient(135deg, ${B.sky}22 0%, ${B.navy} 100%)`, border: `2px solid ${B.sky}55`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>
            🚤 Costo por Viaje
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 200}px, 1fr))`, gap: 14, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
                {fmtCOP(data.numViajesCompletos > 0 ? data.costosTotales / data.numViajesCompletos : 0)}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                Total operativo ÷ {data.numViajesCompletos} viaje{data.numViajesCompletos !== 1 ? "s" : ""} ida+vuelta
              </div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {fmtCOP(data.numViajesCompletos > 0 ? (data.costoComb + data.costoMant) / data.numViajesCompletos : 0)}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                Solo combustible + mantenimiento por viaje
              </div>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              <div>🚤 Lancha de <strong style={{ color: B.sky }}>servicio</strong> — no transporta pasajeros</div>
              <div>📊 Costo por <strong style={{ color: B.sky }}>viaje</strong> (ida + vuelta)</div>
              <div>⛽ Combustible <strong style={{ color: B.sky }}>real</strong> de bitácora</div>
            </div>
          </div>
        </div>
      ) : (
        // ── Lancha de PASAJEROS (Naturalle) — costo por pasadía ─────────
        <div style={{ background: `linear-gradient(135deg, ${B.sand}22 0%, ${B.navy} 100%)`, border: `2px solid ${B.sand}55`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>
            💰 Costo por Pasadía (real)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 200}px, 1fr))`, gap: 14, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
                {fmtCOP(data.costoPorPasadia)}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                Total operativo ÷ {data.pax} pax que llegaron
              </div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {fmtCOP(data.costoCombMantPorPax)}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                Solo combustible + mantenimiento real
              </div>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              <div>📊 Solo cuenta <strong style={{ color: B.sand }}>llegadas</strong> (no zarpes)</div>
              <div>👥 Sin <strong style={{ color: B.sand }}>staff</strong> — solo pax pagantes</div>
              <div>⛽ Combustible <strong style={{ color: B.sand }}>real</strong> de bitácora</div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs unitarios secundarios */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 200}px, 1fr))`, gap: 10, marginBottom: 18 }}>
        {esServicio ? (
          <>
            <Kpi label="Viajes ida+vuelta" valor={data.numViajesCompletos} color={B.sky} small sub={`${data.numLlegadas}🛬 + ${data.numSalidas}🛫`} />
            <Kpi label="Combustible / viaje" valor={fmtCOP(data.numViajesCompletos > 0 ? data.costoComb / data.numViajesCompletos : 0)} color={B.warning} small />
            <Kpi label="Mantenimiento / viaje" valor={fmtCOP(data.numViajesCompletos > 0 ? data.costoMant / data.numViajesCompletos : 0)} color="#a78bfa" small />
          </>
        ) : (
          <>
            <Kpi label="Pax llegadas (sin staff)" valor={data.paxLlegada}                color="#a78bfa" small sub={`${data.numLlegadas} llegadas`} />
            <Kpi label="Pax zarpes (referencia)"  valor={data.paxSalida}                 color="rgba(255,255,255,0.4)" small sub={`${data.numSalidas} zarpes (no se usa)`} />
            <Kpi label="Combustible / pax"        valor={fmtCOP(data.pax > 0 ? data.costoComb / data.pax : 0)} color={B.warning} small />
            <Kpi label="Mantenimiento / pax"      valor={fmtCOP(data.pax > 0 ? data.costoMant / data.pax : 0)} color={B.sky} small />
          </>
        )}
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
                  <div style={{ background: "#a78bfa", height: h("reserva"), minHeight: m.reserva > 0 ? 3 : 0 }} title={`Reserva motores: ${fmtCOP(m.reserva)}`} />
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
          <span>▪ <span style={{ color: "#a78bfa" }}>Reserva motores</span></span>
        </div>
      </div>

      {/* Tabla por embarcación — solo visible cuando se ve la flota completa.
          Cuando se filtra por una sola lancha, el hero + KPIs ya tienen
          toda la info (y la tabla de 1 fila sería redundante + tendría
          columnas $/pax que no aplican a Castillete que es servicio). */}
      {!lanchaId && (
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
      )}
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
