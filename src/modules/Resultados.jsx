// Resultados.jsx — Dashboard de Resultados para Socios y Junta Directiva
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const COP = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);

// Fecha actual en hora Colombia (UTC-5, sin horario de verano)
function fechaColombia(offsetDias = 0) {
  const ahora = new Date();
  const bogota = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  bogota.setDate(bogota.getDate() + offsetDias);
  const y = bogota.getFullYear();
  const m = String(bogota.getMonth() + 1).padStart(2, "0");
  const d = String(bogota.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function finMes() {
  const ahora = new Date();
  const bogota = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const ultimo = new Date(bogota.getFullYear(), bogota.getMonth() + 1, 0);
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, "0")}-${String(ultimo.getDate()).padStart(2, "0")}`;
}

function hoy()       { return fechaColombia(0); }
function ayer()      { return fechaColombia(-1); }
function semanaIni() {
  const ahora = new Date();
  const bogota = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const dow = bogota.getDay(); // 0=dom, 1=lun...
  const diasAtras = dow === 0 ? 6 : dow - 1; // lunes como inicio de semana
  bogota.setDate(bogota.getDate() - diasAtras);
  const y = bogota.getFullYear();
  const m = String(bogota.getMonth() + 1).padStart(2, "0");
  const d = String(bogota.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function mesIni()    {
  const ahora = new Date();
  const bogota = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  return `${bogota.getFullYear()}-${String(bogota.getMonth() + 1).padStart(2, "0")}-01`;
}

// PERIODOS se genera dinámicamente en cargar() para que hoy() sea siempre fresco
function getPeriodos() {
  const hoyStr = hoy();
  return [
    { key: "ayer",   label: "Ayer",   desde: ayer(),      hasta: ayer()   },
    { key: "hoy",    label: "Hoy",    desde: hoyStr,      hasta: hoyStr   },
    { key: "semana", label: "Semana", desde: semanaIni(), hasta: hoyStr   },
    { key: "mes",    label: "Mes",    desde: mesIni(),    hasta: hoyStr   },
  ];
}
// Para el render de la tabla (labels de columnas) — se recalcula en cada render
const PERIODOS = getPeriodos();

// ─── Tabla de Proyecciones ───────────────────────────────────────────────────
function TablaProyeccion({ titulo, icono, color, real, proyectado, loading, cantLabel = "Cantidad" }) {
  const totalMonto   = (real?.monto    || 0) + (proyectado?.monto    || 0);
  const totalCantidad = (real?.cantidad || 0) + (proyectado?.cantidad || 0);

  const col = (label, value, sub, highlight) => (
    <div style={{ textAlign: "center", padding: "14px 12px", borderLeft: `1px solid ${B.navyLight}` }}>
      {loading ? (
        <div style={{ height: 26, background: B.navyLight, borderRadius: 6, margin: "0 8px", animation: "pulse 1.5s infinite" }} />
      ) : (
        <>
          <div style={{ fontSize: 22, fontWeight: 900, color: highlight || B.white, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{value}</div>
          {sub != null && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{sub}</div>}
        </>
      )}
    </div>
  );

  return (
    <div style={{ background: B.navyMid, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>{icono}</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: B.white }}>{titulo}</span>
      </div>
      {/* Grid: label | Real (va del mes) | Futuro reservado | Total proyectado */}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 1fr" }}>
        {/* Col headers */}
        <div style={{ padding: "8px 16px", background: B.navy, borderBottom: `1px solid ${B.navyLight}` }} />
        {[
          { key: "real",  label: "Va del mes",       sub: `hasta hoy`,           color: B.sky },
          { key: "fut",   label: "Reservado futuro",  sub: "resto del mes",       color: "#fbbf24" },
          { key: "total", label: "Proyección total",  sub: "fin de mes",          color: color },
        ].map(c => (
          <div key={c.key} style={{ padding: "8px 12px", background: B.navy, borderBottom: `1px solid ${B.navyLight}`, textAlign: "center", borderLeft: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: c.color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{c.label}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{c.sub}</div>
          </div>
        ))}

        {/* Fila cantidad */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{cantLabel}</span>
        </div>
        {col(null, real?.cantidad ?? "—", null, B.sky)}
        {col(null, proyectado?.cantidad ?? "—", null, "#fbbf24")}
        {col(null, totalCantidad, null, color)}

        {/* Fila monto */}
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Monto</span>
        </div>
        {col(null, COP(real?.monto), null, B.sky)}
        {col(null, COP(proyectado?.monto), null, "#fbbf24")}
        {col(null, COP(totalMonto), null, color)}
      </div>
    </div>
  );
}

// ─── Tabla de métricas ────────────────────────────────────────────────────────
function TablaMetricas({ titulo, icono, color, datos, loading, cantLabel = "Cantidad", hideCant = false }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{icono}</span>
        <div style={{ fontSize: 17, fontWeight: 800, color: B.white }}>{titulo}</div>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "160px repeat(4, 1fr)", minWidth: 0 }}>
        {/* Col headers */}
        <div style={{ padding: "10px 20px", background: B.navy, borderBottom: `1px solid ${B.navyLight}` }} />
        {PERIODOS.map(p => (
          <div key={p.key} style={{ padding: "10px 16px", background: B.navy, borderBottom: `1px solid ${B.navyLight}`, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{p.label}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              {p.desde === p.hasta ? p.desde.slice(5).replace("-", "/") : `${p.desde.slice(5).replace("-", "/")} - ${p.hasta.slice(5).replace("-", "/")}`}
            </div>
          </div>
        ))}

        {/* Fila: Cantidad (opcional) */}
        {!hideCant && <>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{cantLabel}</span>
          </div>
          {PERIODOS.map(p => (
            <div key={p.key} style={{ padding: "16px 16px", borderBottom: `1px solid ${B.navyLight}`, textAlign: "center", borderLeft: `1px solid ${B.navyLight}` }}>
              {loading ? (
                <div style={{ height: 28, background: B.navyLight, borderRadius: 6, animation: "pulse 1.5s infinite" }} />
              ) : (
                <div style={{ fontSize: 26, fontWeight: 800, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {datos?.[p.key]?.cantidad ?? "—"}
                </div>
              )}
            </div>
          ))}
        </>}

        {/* Fila: Monto */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Monto</span>
        </div>
        {PERIODOS.map(p => (
          <div key={p.key} style={{ padding: "16px 16px", textAlign: "center", borderLeft: `1px solid ${B.navyLight}` }}>
            {loading ? (
              <div style={{ height: 22, background: B.navyLight, borderRadius: 6, animation: "pulse 1.5s infinite" }} />
            ) : (
              <div style={{ fontSize: 15, fontWeight: 700, color: color, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {COP(datos?.[p.key]?.monto ?? 0)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
export default function Resultados() {
  const [tab,        setTab]        = useState("resultados");
  const [loading,    setLoading]    = useState(true);
  const [updatedAt,  setUpdatedAt]  = useState(null);
  const [pasadias,   setPasadias]   = useState(null);
  const [grupos,     setGrupos]     = useState(null);
  const [eventos,    setEventos]    = useState(null);
  const [ayb,        setAyb]        = useState(null);
  // Proyecciones: reservas futuras del mes (mañana → fin de mes)
  const [proyPasadias, setProyPasadias] = useState(null);
  const [proyGrupos,   setProyGrupos]   = useState(null);
  const [proyEventos,  setProyEventos]  = useState(null);
  // Lista detallada de eventos/grupos próximos del mes
  const [proximos,     setProximos]     = useState([]);
  // Flujo de Caja: registros diarios del mes
  const [flujoDias,    setFlujoDias]    = useState([]);
  const [flujoMes,     setFlujoMes]     = useState(null); // {ingresos, egresos, neto}

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    // Recalcular fechas frescas en cada carga (evita que queden congeladas si la página se deja abierta)
    const periodos = getPeriodos();
    const hoyStr   = hoy(); // tope máximo — nunca mostrar fechas futuras

    // Fetch paralelo para los 4 períodos × categorías
    // lte("fecha", hoyStr) garantiza que nunca entren fechas futuras en semana/mes
    const queries = periodos.flatMap(p => [
      // Pasadías directas (sin aliado, sin grupo) — excluye cancelados y reservas de grupo
      supabase.from("reservas")
        .select("id, total, pax, estado")
        .gte("fecha", p.desde).lte("fecha", p.hasta <= hoyStr ? p.hasta : hoyStr)
        .neq("estado", "cancelado")
        .is("aliado_id", null)
        .is("grupo_id", null)
        .then(r => ({ periodo: p.key, cat: "pasadias", data: r.data || [] })),

      // Pasadías B2B (con aliado, sin grupo) — excluye cancelados y reservas de grupo
      supabase.from("reservas")
        .select("id, total, pax, estado")
        .gte("fecha", p.desde).lte("fecha", p.hasta <= hoyStr ? p.hasta : hoyStr)
        .neq("estado", "cancelado")
        .not("aliado_id", "is", null)
        .is("grupo_id", null)
        .then(r => ({ periodo: p.key, cat: "pasadias_b2b", data: r.data || [] })),

      // Grupos (categoria = grupo) — solo Realizado para fechas pasadas, Confirmado+Realizado para hoy
      supabase.from("eventos")
        .select("id, valor, valor_extras, pax, pasadias_org, categoria, servicios_contratados")
        .gte("fecha", p.desde).lte("fecha", p.hasta <= hoyStr ? p.hasta : hoyStr)
        .in("stage", ["Confirmado", "Realizado"])
        .eq("categoria", "grupo")
        .then(r => ({ periodo: p.key, cat: "grupos", data: r.data || [] })),

      // Eventos (categoria = evento)
      supabase.from("eventos")
        .select("id, valor, valor_extras, pax, pasadias_org, categoria, servicios_contratados")
        .gte("fecha", p.desde).lte("fecha", p.hasta <= hoyStr ? p.hasta : hoyStr)
        .in("stage", ["Confirmado", "Realizado"])
        .eq("categoria", "evento")
        .then(r => ({ periodo: p.key, cat: "eventos", data: r.data || [] })),

      // A&B: cierres_caja del área ayb
      supabase.from("cierres_caja")
        .select("id, total_ventas, fecha")
        .gte("fecha", p.desde).lte("fecha", p.hasta <= hoyStr ? p.hasta : hoyStr)
        .eq("area", "ayb")
        .then(r => ({ periodo: p.key, cat: "ayb", data: r.data || [] })),
    ]);

    const resultados = await Promise.all(queries);

    // Helper para calcular monto base de un evento/grupo desde pasadias_org o valor
    const montoEvento = (e) => {
      if (e.valor > 0) return e.valor;
      return (e.pasadias_org || [])
        .filter(p => p.tipo !== "Impuesto Muelle")
        .reduce((ss, p) => ss + (Number(p.personas) || 0) * (Number(p.precio) || 0), 0);
    };

    // Helper: suma líneas de cotización incluyendo IVA
    const sumaLineas = (rows) => (rows || []).reduce((s, l) => {
      const sub = (l.cantidad || 1) * (l.noches || 1) * (l.valor_unit || 0);
      return s + sub + sub * ((l.iva || 0) / 100);
    }, 0);

    // Helper: total cotizado — base + extras + servicios contratados
    const totalCotizacion = (e) => {
      const base     = e.valor > 0 ? e.valor : montoEvento(e);
      const extras   = Number(e.valor_extras) || 0;
      const servicios = (e.servicios_contratados || []).reduce((s, x) => s + (Number(x.valor) || 0), 0);
      return base + extras + servicios;
    };

    // Helper para contar pasadías en un grupo (excl. Impuesto Muelle y STAFF)
    const pasadiasGrupo = (rows) =>
      rows.reduce((s, e) => s + (e.pasadias_org || [])
        .filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF")
        .reduce((ss, p) => ss + (Number(p.personas) || 0), 0), 0);

    // Pasadías: directas + B2B
    const pasR = {};
    periodos.forEach(p => {
      const dir  = resultados.find(r => r.cat === "pasadias"     && r.periodo === p.key)?.data || [];
      const b2b  = resultados.find(r => r.cat === "pasadias_b2b" && r.periodo === p.key)?.data || [];
      const all  = [...dir, ...b2b];
      pasR[p.key] = {
        cantidad: all.reduce((s, r) => s + (Number(r.pax) || 0), 0),
        monto:    all.filter(r => r.estado !== "no_show").reduce((s, r) => s + (r.total || 0), 0),
      };
    });

    // Grupos: cantidad = suma de pasajeros (pasadias_org sin impuesto/staff)
    const grpR = {};
    periodos.forEach(p => {
      const rows = resultados.find(r => r.cat === "grupos" && r.periodo === p.key)?.data || [];
      grpR[p.key] = {
        cantidad: pasadiasGrupo(rows),
        monto:    rows.reduce((s, e) => s + totalCotizacion(e), 0),
      };
    });

    // Eventos: cantidad = número de eventos
    const evR = {};
    periodos.forEach(p => {
      const rows = resultados.find(r => r.cat === "eventos" && r.periodo === p.key)?.data || [];
      evR[p.key] = {
        cantidad: rows.length,
        monto:    rows.reduce((s, e) => s + totalCotizacion(e), 0),
      };
    });

    // A&B: viene de cierres_caja (1 cierre por día), cantidad = días con cierre, monto = sum total_ventas
    const aybR = {};
    periodos.forEach(p => {
      const rows = resultados.find(r => r.cat === "ayb" && r.periodo === p.key)?.data || [];
      aybR[p.key] = {
        cantidad: rows.length,
        monto:    rows.reduce((s, r) => s + (r.total_ventas || 0), 0),
      };
    });

    setPasadias(pasR);
    setGrupos(grpR);
    setEventos(evR);
    setAyb(aybR);

    // ── Proyecciones: reservas futuras ya confirmadas del mes ─────────────────
    const manana  = fechaColombia(1);
    const finMesStr = finMes();

    // Lista detallada del mes completo (independiente de si quedan días)
    const mesIniStr = mesIni();
    const prProximos = await supabase.from("eventos")
      .select("id, nombre, tipo, fecha, fecha_fin, pax, valor, valor_extras, stage, categoria, pasadias_org, contacto, vendedor, servicios_contratados")
      .gte("fecha", mesIniStr).lte("fecha", finMesStr)
      .in("stage", ["Consulta", "Cotizado", "Confirmado", "Realizado"])
      .order("fecha", { ascending: true });

    setProximos((prProximos.data || []).map(e => ({
      ...e,
      monto_cotizado: totalCotizacion(e),
    })));

    // Solo proyectar si quedan días en el mes
    if (manana <= finMesStr) {
      const [prRes, prResB2b, prGrp, prEvt] = await Promise.all([
        supabase.from("reservas")
          .select("total, pax, estado")
          .gte("fecha", manana).lte("fecha", finMesStr)
          .neq("estado", "cancelado")
          .is("aliado_id", null),
        supabase.from("reservas")
          .select("total, pax, estado")
          .gte("fecha", manana).lte("fecha", finMesStr)
          .neq("estado", "cancelado")
          .not("aliado_id", "is", null),
        supabase.from("eventos")
          .select("valor, valor_extras, pax, pasadias_org, categoria")
          .gte("fecha", manana).lte("fecha", finMesStr)
          .in("stage", ["Confirmado"])
          .eq("categoria", "grupo"),
        supabase.from("eventos")
          .select("valor, valor_extras, pax, pasadias_org, categoria")
          .gte("fecha", manana).lte("fecha", finMesStr)
          .in("stage", ["Confirmado"])
          .eq("categoria", "evento"),
      ]);

      const pasFuturos = [...(prRes.data || []), ...(prResB2b.data || [])];
      setProyPasadias({
        cantidad: pasFuturos.reduce((s, r) => s + (Number(r.pax) || 0), 0),
        monto:    pasFuturos.filter(r => r.estado !== "no_show").reduce((s, r) => s + (r.total || 0), 0),
      });

      const grpFuturos = prGrp.data || [];
      setProyGrupos({
        cantidad: pasadiasGrupo(grpFuturos),
        monto:    grpFuturos.reduce((s, e) => s + totalCotizacion(e), 0),
      });

      const evFuturos = prEvt.data || [];
      setProyEventos({
        cantidad: evFuturos.length,
        monto:    evFuturos.reduce((s, e) => s + totalCotizacion(e), 0),
      });
    } else {
      setProyPasadias({ cantidad: 0, monto: 0 });
      setProyGrupos({ cantidad: 0, monto: 0 });
      setProyEventos({ cantidad: 0, monto: 0 });
    }

    // ── Flujo de Caja: pagos percibidos por día ───────────────────────────────
    // Regla: fecha = fecha_pago (si está seteada) o created_at en hora Colombia
    // Monto = abono (lo que realmente se cobró ese día, no el total de la reserva)
    // Categoría: grupo_id → buscar en eventos; sin grupo_id → pasadía

    // Helper: convierte timestamp UTC a fecha Colombia (YYYY-MM-DD)
    const fechaColDe = (ts) => {
      if (!ts) return null;
      const bogota = new Date(new Date(ts).toLocaleString("en-US", { timeZone: "America/Bogota" }));
      return `${bogota.getFullYear()}-${String(bogota.getMonth()+1).padStart(2,"0")}-${String(bogota.getDate()).padStart(2,"0")}`;
    };

    // Paso 1: obtener IDs de eventos para categorizar grupo_id
    const [fcEventosIds, fcCierres] = await Promise.all([
      supabase.from("eventos").select("id, categoria"),
      supabase.from("cierres_caja")
        .select("fecha, total_ventas")
        .gte("fecha", mesIni()).lte("fecha", hoyStr)
        .eq("area", "ayb"),
    ]);
    const grupoIdSet  = new Set((fcEventosIds.data || []).filter(e => e.categoria === "grupo").map(e => e.id));
    const eventoIdSet = new Set((fcEventosIds.data || []).filter(e => e.categoria === "evento").map(e => e.id));

    // Paso 2: pagos con fecha_pago manual en el mes
    // Paso 3: pagos sin fecha_pago pero creados este mes (web/Wompi automáticos)
    const [fcPorFecha, fcPorCreated] = await Promise.all([
      supabase.from("reservas")
        .select("fecha_pago, abono, estado, grupo_id")
        .gte("fecha_pago", mesIni()).lte("fecha_pago", hoyStr)
        .gt("abono", 0).neq("estado", "cancelado"),
      supabase.from("reservas")
        .select("created_at, abono, estado, grupo_id")
        .is("fecha_pago", null)
        .gte("created_at", mesIni() + "T00:00:00-05:00")
        .lte("created_at", hoyStr   + "T23:59:59-05:00")
        .gt("abono", 0).neq("estado", "cancelado"),
    ]);

    // Construir mapa por fecha
    const diaMap = {};
    const ensureDia = (f) => {
      if (!diaMap[f]) diaMap[f] = { fecha: f, pasadias: 0, ayb: 0, grupos: 0, eventos: 0 };
    };

    const agregarPago = (r, fecha) => {
      if (!fecha || fecha < mesIni() || fecha > hoyStr) return;
      if (r.estado === "no_show") return;
      ensureDia(fecha);
      const monto = r.abono || 0;
      if (r.grupo_id && grupoIdSet.has(r.grupo_id))  diaMap[fecha].grupos   += monto;
      else if (r.grupo_id && eventoIdSet.has(r.grupo_id)) diaMap[fecha].eventos  += monto;
      else                                             diaMap[fecha].pasadias += monto;
    };

    for (const r of (fcPorFecha.data   || [])) agregarPago(r, r.fecha_pago);
    for (const r of (fcPorCreated.data || [])) agregarPago(r, fechaColDe(r.created_at));

    for (const c of (fcCierres.data || [])) {
      if (!c.fecha || c.fecha < mesIni() || c.fecha > hoyStr) continue;
      ensureDia(c.fecha);
      diaMap[c.fecha].ayb += c.total_ventas || 0;
    }

    // Ordenar y calcular acumulado
    let acumulado = 0;
    const dias = Object.values(diaMap).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(d => {
      const ingresos = d.pasadias + d.ayb + d.grupos + d.eventos;
      acumulado     += ingresos;
      return { ...d, ingresos, acumulado };
    });

    const totMes = dias.reduce((s, d) => ({
      ingresos: s.ingresos + d.ingresos,
      egresos:  0,
      neto:     s.neto + d.ingresos,
    }), { ingresos: 0, egresos: 0, neto: 0 });

    setFlujoDias(dias);
    setFlujoMes(totMes);

    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Totales del mes para el resumen ejecutivo
  const totalMes = (loading || !pasadias || !grupos || !eventos || !ayb) ? null : {
    cantidad: (pasadias.mes?.cantidad || 0) + (grupos.mes?.cantidad || 0) + (eventos.mes?.cantidad || 0) + (ayb.mes?.cantidad || 0),
    monto:    (pasadias.mes?.monto || 0) + (grupos.mes?.monto || 0) + (eventos.mes?.monto || 0) + (ayb.mes?.monto || 0),
  };

  return (
    <div style={{ padding: "24px 0", maxWidth: 960, margin: "0 auto" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingInline: 4 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: B.white, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
            📊 Resultados
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Dashboard para socios y junta directiva
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {updatedAt && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              Actualizado {updatedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={cargar} disabled={loading}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: loading ? B.navyLight : B.navyMid, color: loading ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, cursor: loading ? "default" : "pointer" }}>
            {loading ? "Cargando..." : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, paddingInline: 4 }}>
        {[
          { key: "resultados",   label: "📊 Resultados"   },
          { key: "proyecciones", label: "🔮 Proyecciones" },
          { key: "flujo_caja",   label: "💧 Flujo de Caja" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "9px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
              background: tab === t.key ? B.sky : B.navyMid,
              color:      tab === t.key ? B.navy : "rgba(255,255,255,0.5)",
              transition: "all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB PROYECCIONES ══ */}
      {tab === "proyecciones" && (() => {
        const hoyStr   = hoy();
        const finStr   = finMes();
        const mesLabel = new Date(hoyStr + "T12:00:00").toLocaleString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" });
        const totalProy = {
          monto: (pasadias?.mes?.monto || 0) + (proyPasadias?.monto || 0)
               + (grupos?.mes?.monto   || 0) + (proyGrupos?.monto   || 0)
               + (eventos?.mes?.monto  || 0) + (proyEventos?.monto  || 0)
               + (ayb?.mes?.monto      || 0),
        };
        return (
          <div>
            {/* Banner resumen proyección total */}
            <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 24px", marginBottom: 20, borderLeft: `4px solid #fbbf24`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>🔮 Proyección total — {mesLabel}</div>
                <div style={{ fontSize: 34, fontWeight: 900, color: "#fbbf24", fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(totalProy.monto)}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.8 }}>
                <div>✅ Real hasta hoy: <strong style={{ color: B.sky }}>{COP((pasadias?.mes?.monto||0)+(grupos?.mes?.monto||0)+(eventos?.mes?.monto||0)+(ayb?.mes?.monto||0))}</strong></div>
                <div>📅 Reservado futuro: <strong style={{ color: "#fbbf24" }}>{COP((proyPasadias?.monto||0)+(proyGrupos?.monto||0)+(proyEventos?.monto||0))}</strong></div>
                <div style={{ marginTop: 4, fontSize: 11 }}>Período: {mesIni()} → {finStr}</div>
              </div>
            </div>

            <TablaProyeccion
              titulo="Pasadías" icono="🏖️" color={B.sky}
              real={pasadias?.mes} proyectado={proyPasadias}
              loading={loading} cantLabel="Pasajeros"
            />
            <TablaProyeccion
              titulo="Grupos" icono="👥" color="#34d399"
              real={grupos?.mes} proyectado={proyGrupos}
              loading={loading} cantLabel="Pasajeros"
            />
            <TablaProyeccion
              titulo="Eventos" icono="🎉" color="#a78bfa"
              real={eventos?.mes} proyectado={proyEventos}
              loading={loading} cantLabel="Eventos"
            />
            {/* A&B: solo real, no se puede proyectar (cierres_caja son retroactivos) */}
            <div style={{ background: B.navyMid, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🍽️</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: B.white }}>Ingresos A&B</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 6 }}>· No proyectable (depende de cierres de caja)</span>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Real del mes</span>
                <span style={{ fontSize: 24, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(ayb?.mes?.monto)}</span>
              </div>
            </div>

            {/* ── Tabla de eventos y grupos próximos ──────────────────────── */}
            {proximos.length > 0 && (
              <div style={{ background: B.navyMid, borderRadius: 16, overflow: "hidden", marginTop: 8, marginBottom: 16 }}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>📆</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: B.white }}>Eventos y Grupos — {new Date().toLocaleString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" })}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {COP(proximos.reduce((s, e) => s + e.monto_cotizado, 0))}
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: B.navy }}>
                      {[["Fecha", "120px"], ["Nombre", "auto"], ["Tipo", "90px"], ["Pax", "60px"], ["Stage", "100px"], ["Monto Cotizado", "140px"]].map(([h, w]) => (
                        <th key={h} style={{ padding: "9px 14px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: h === "Monto Cotizado" || h === "Pax" ? "right" : "left", width: w, borderBottom: `1px solid ${B.navyLight}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {proximos.map((e, i) => {
                      const esGrupo = e.categoria === "grupo";
                      const stageColor = e.stage === "Confirmado" ? "#4CAF7D" : e.stage === "Realizado" ? "rgba(255,255,255,0.3)" : e.stage === "Cotizado" ? "#8ECAE6" : "#E8A020";
                      const fechaLabel = (() => {
                        const f = new Date(e.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
                        if (e.fecha_fin && e.fecha_fin !== e.fecha) {
                          const ff = new Date(e.fecha_fin + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
                          return `${f} → ${ff}`;
                        }
                        return f;
                      })();
                      return (
                        <tr key={e.id} style={{ borderBottom: i < proximos.length - 1 ? `1px solid ${B.navyLight}` : "none", background: i % 2 === 0 ? "transparent" : B.navy + "44" }}>
                          <td style={{ padding: "11px 14px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{fechaLabel}</td>
                          <td style={{ padding: "11px 14px" }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{e.nombre}</div>
                            {e.contacto && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{e.contacto}</div>}
                            {e.vendedor  && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>👤 {e.vendedor}</div>}
                          </td>
                          <td style={{ padding: "11px 14px", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {esGrupo ? "👥" : "🎉"} {e.tipo}
                          </td>
                          <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, textAlign: "right" }}>{e.pax || "—"}</td>
                          <td style={{ padding: "11px 14px" }}>
                            <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 8, background: stageColor + "22", color: stageColor, fontWeight: 700 }}>{e.stage}</span>
                          </td>
                          <td style={{ padding: "11px 14px", textAlign: "right" }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: e.monto_cotizado > 0 ? "#fbbf24" : "rgba(255,255,255,0.2)", fontFamily: "'Barlow Condensed', sans-serif" }}>
                              {e.monto_cotizado > 0 ? COP(e.monto_cotizado) : "Sin cotizar"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: B.navy, borderTop: `2px solid ${B.navyLight}` }}>
                      <td colSpan={5} style={{ padding: "10px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase" }}>Total pipeline eventos y grupos</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 17, fontWeight: 900, color: "#fbbf24", fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {COP(proximos.reduce((s, e) => s + e.monto_cotizado, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.2)", lineHeight: 1.8, paddingInline: 4 }}>
              * "Reservado futuro" incluye reservas confirmadas (no canceladas) con fecha entre mañana y fin de mes.<br />
              * La proyección NO incluye nuevas ventas que aún no se han registrado.<br />
              * A&B no se proyecta — el ingreso solo se registra después del cierre diario.<br />
              * "Monto cotizado" usa el total de la cotización si está registrada, o el valor del evento.
            </div>
          </div>
        );
      })()}

      {/* ══ TAB RESULTADOS ══ */}
      {tab === "resultados" && <>

      {/* Resumen ejecutivo del mes */}
      {totalMes && (
        <>
          {/* Cards por categoría */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
            {[
              { label: "Pasadías (mes)",  valor: pasadias?.mes?.monto,  cant: pasadias?.mes?.cantidad,  color: B.sky,      icon: "🏖️", unit: "pasajeros" },
              { label: "Grupos (mes)",    valor: grupos?.mes?.monto,    cant: grupos?.mes?.cantidad,    color: "#34d399",  icon: "👥", unit: "pasajeros" },
              { label: "Eventos (mes)",   valor: eventos?.mes?.monto,   cant: eventos?.mes?.cantidad,   color: "#a78bfa",  icon: "🎉", unit: "eventos" },
              { label: "A&B (mes)",       valor: ayb?.mes?.monto,       cant: ayb?.mes?.cantidad,       color: B.sand,     icon: "🍽️", unit: "días con cierre" },
            ].map(k => (
              <div key={k.label} style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", borderTop: `3px solid ${k.color}` }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{k.icon} {k.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
                  {COP(k.valor)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>{k.cant} {k.unit}</div>
              </div>
            ))}
          </div>

          {/* Banner total del mes */}
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 28px", marginBottom: 28, borderLeft: `5px solid ${B.sky}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                💰 Total ingresos del mes
              </div>
              <div style={{ fontSize: 40, fontWeight: 900, color: B.white, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
                {COP(totalMes.monto)}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 2 }}>
              <div>🏖️ Pasadías: <strong style={{ color: B.sky }}>{COP(pasadias?.mes?.monto)}</strong></div>
              <div>👥 Grupos: <strong style={{ color: "#34d399" }}>{COP(grupos?.mes?.monto)}</strong></div>
              <div>🎉 Eventos: <strong style={{ color: "#a78bfa" }}>{COP(eventos?.mes?.monto)}</strong></div>
              <div>🍽️ A&B: <strong style={{ color: B.sand }}>{COP(ayb?.mes?.monto)}</strong></div>
            </div>
          </div>
        </>
      )}

      {/* Tablas detalladas */}
      <TablaMetricas
        titulo="Pasadías"
        icono="🏖️"
        color={B.sky}
        datos={pasadias}
        loading={loading}
        cantLabel="Pasajeros"
      />

      <TablaMetricas
        titulo="Grupos"
        icono="👥"
        color="#34d399"
        datos={grupos}
        loading={loading}
        cantLabel="Pasajeros"
      />

      <TablaMetricas
        titulo="Eventos"
        icono="🎉"
        color="#a78bfa"
        datos={eventos}
        loading={loading}
      />

      <TablaMetricas
        titulo="Ingresos A&B"
        icono="🍽️"
        color={B.sand}
        datos={ayb}
        loading={loading}
        hideCant
      />

      {/* Fila total combinada por período */}
      {!loading && pasadias && grupos && eventos && ayb && (
        <div style={{ background: B.navyMid, borderRadius: 16, overflow: "hidden", marginBottom: 20, borderTop: `3px solid ${B.white}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px repeat(4, 1fr)", minWidth: 0 }}>
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: B.white, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>💰 Total</span>
            </div>
            {PERIODOS.map(p => {
              const total = (pasadias?.[p.key]?.monto || 0) + (grupos?.[p.key]?.monto || 0) + (eventos?.[p.key]?.monto || 0) + (ayb?.[p.key]?.monto || 0);
              return (
                <div key={p.key} style={{ padding: "16px 16px", textAlign: "center", borderLeft: `1px solid ${B.navyLight}` }}>
                  <div style={{ fontSize: 17, fontWeight: 900, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {COP(total)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nota pie */}
      <div style={{ marginTop: 8, paddingInline: 4, fontSize: 11, color: "rgba(255,255,255,0.2)", lineHeight: 1.8 }}>
        * Pasadías incluye reservas directas y B2B. Excluye cancelados (no-show incluido en cantidad).<br />
        * Grupos: cantidad = pasajeros (excl. Impuesto Muelle/STAFF). Monto desde valor o pasadias_org.<br />
        * Eventos: cantidad = número de eventos confirmados/realizados.<br />
        * A&B: viene de Cierre de Caja (área A&B). Cantidad = días con cierre registrado. Semana = lunes a hoy.
      </div>

      </>} {/* fin tab resultados */}

      {/* ══ TAB FLUJO DE CAJA ══ */}
      {tab === "flujo_caja" && (() => {
        const mesLabel = new Date(mesIni() + "T12:00:00").toLocaleString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" });
        const colStyle = (align = "right") => ({ padding: "10px 12px", textAlign: align, borderLeft: `1px solid ${B.navyLight}`, fontSize: 13 });
        const hdrStyle = (color = "rgba(255,255,255,0.4)") => ({ padding: "8px 12px", textAlign: "right", borderLeft: `1px solid ${B.navyLight}`, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color, background: B.navy, borderBottom: `1px solid ${B.navyLight}` });

        return (
          <div>
            {/* Resumen del mes */}
            {flujoMes && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Pasadías", valor: flujoDias.reduce((s, d) => s + d.pasadias, 0), color: B.sky,     icon: "🏖️" },
                  { label: "Grupos",   valor: flujoDias.reduce((s, d) => s + d.grupos,   0), color: "#34d399", icon: "👥" },
                  { label: "Eventos",  valor: flujoDias.reduce((s, d) => s + d.eventos,  0), color: "#a78bfa", icon: "🎉" },
                  { label: "A&B",      valor: flujoDias.reduce((s, d) => s + d.ayb,      0), color: B.sand,    icon: "🍽️" },
                ].map(k => (
                  <div key={k.label} style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", borderTop: `3px solid ${k.color}` }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{k.icon} {k.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{COP(k.valor)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Total general */}
            {flujoMes && (
              <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 24px", marginBottom: 20, borderLeft: `4px solid ${B.sky}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>💧 Ingresos del mes — {mesLabel}</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(flujoMes.ingresos)}</div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                  {flujoDias.length} días con ingresos registrados
                </div>
              </div>
            )}

            {/* Tabla diaria */}
            {loading ? (
              <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando...</div>
            ) : flujoDias.length === 0 ? (
              <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Sin ingresos registrados este mes.</div>
            ) : (
              <div style={{ background: B.navyMid, borderRadius: 16, overflow: "hidden" }}>
                {/* Header de tabla */}
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 1fr 1fr 1fr 1fr" }}>
                  <div style={{ padding: "8px 12px", background: B.navy, borderBottom: `1px solid ${B.navyLight}`, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.4)" }}>Fecha</div>
                  <div style={hdrStyle(B.sky)}>Pasadías</div>
                  <div style={hdrStyle("#34d399")}>Grupos</div>
                  <div style={hdrStyle("#a78bfa")}>Eventos</div>
                  <div style={hdrStyle(B.sand)}>A&B</div>
                  <div style={hdrStyle(B.white)}>Total</div>
                  <div style={hdrStyle("#fbbf24")}>Acumulado</div>
                </div>

                {/* Filas */}
                {flujoDias.map((d, i) => {
                  const esHoy = d.fecha === hoy();
                  const rowBg = esHoy ? "rgba(56,189,248,0.07)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)";
                  const fechaLabel = new Date(d.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Bogota" });
                  return (
                    <div key={d.fecha} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 1fr 1fr 1fr 1fr", background: rowBg, borderBottom: `1px solid ${B.navyLight}` }}>
                      <div style={{ padding: "10px 12px", fontSize: 12, color: esHoy ? B.sky : "rgba(255,255,255,0.6)", fontWeight: esHoy ? 700 : 400 }}>
                        {fechaLabel}{esHoy && <span style={{ marginLeft: 4, fontSize: 9, background: B.sky, color: B.navy, borderRadius: 4, padding: "1px 5px", fontWeight: 800 }}>HOY</span>}
                      </div>
                      <div style={{ ...colStyle(), color: d.pasadias > 0 ? B.sky : "rgba(255,255,255,0.2)" }}>{d.pasadias > 0 ? COP(d.pasadias) : "—"}</div>
                      <div style={{ ...colStyle(), color: d.grupos > 0 ? "#34d399" : "rgba(255,255,255,0.2)" }}>{d.grupos > 0 ? COP(d.grupos) : "—"}</div>
                      <div style={{ ...colStyle(), color: d.eventos > 0 ? "#a78bfa" : "rgba(255,255,255,0.2)" }}>{d.eventos > 0 ? COP(d.eventos) : "—"}</div>
                      <div style={{ ...colStyle(), color: d.ayb > 0 ? B.sand : "rgba(255,255,255,0.2)" }}>{d.ayb > 0 ? COP(d.ayb) : "—"}</div>
                      <div style={{ ...colStyle(), color: B.white, fontWeight: 700 }}>{COP(d.ingresos)}</div>
                      <div style={{ ...colStyle(), color: "#fbbf24", fontWeight: 700 }}>{COP(d.acumulado)}</div>
                    </div>
                  );
                })}

                {/* Fila total */}
                {flujoMes && (
                  <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 1fr 1fr 1fr 1fr", background: "rgba(56,189,248,0.1)", borderTop: `2px solid ${B.sky}` }}>
                    <div style={{ padding: "12px 12px", fontSize: 12, fontWeight: 800, color: B.white }}>TOTAL</div>
                    <div style={{ ...colStyle(), color: B.sky,     fontWeight: 800 }}>{COP(flujoDias.reduce((s, d) => s + d.pasadias, 0))}</div>
                    <div style={{ ...colStyle(), color: "#34d399", fontWeight: 800 }}>{COP(flujoDias.reduce((s, d) => s + d.grupos,   0))}</div>
                    <div style={{ ...colStyle(), color: "#a78bfa", fontWeight: 800 }}>{COP(flujoDias.reduce((s, d) => s + d.eventos,  0))}</div>
                    <div style={{ ...colStyle(), color: B.sand,    fontWeight: 800 }}>{COP(flujoDias.reduce((s, d) => s + d.ayb,      0))}</div>
                    <div style={{ ...colStyle(), color: B.white,   fontWeight: 900, fontSize: 15 }}>{COP(flujoMes.ingresos)}</div>
                    <div style={{ ...colStyle(), color: "#fbbf24", fontWeight: 900, fontSize: 15 }}>{COP(flujoMes.ingresos)}</div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 10, paddingInline: 4, fontSize: 11, color: "rgba(255,255,255,0.2)", lineHeight: 1.8 }}>
              * Fecha = día en que se recibió el pago (fecha_pago si fue manual, o fecha de creación para pagos web/Wompi).<br />
              * Monto = abono registrado ese día (no el total de la reserva).<br />
              * Pasadías: reservas sin grupo. Grupos/Eventos: pagos de reservas vinculadas a ese tipo de evento.<br />
              * A&B: viene del cierre de caja diario (usa fecha del cierre).<br />
              * Acumulado: suma corrida de ingresos cobrados en el mes hasta ese día.
            </div>
          </div>
        );
      })()}

    </div>
  );
}
