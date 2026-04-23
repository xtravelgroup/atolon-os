import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

// ─── Datos de inspección ─────────────────────────────────────────────────────
const SECCIONES = [
  {
    id: "A",
    icon: "🚪",
    titulo: "Entrada, Corredor y Clóset",
    color: "#1B2B4B",
    puntos: [
      { id: 1, critico: true,  texto: "Puerta de entrada: sin rayones, bisagras silenciosas, cerradura funcionando correctamente" },
      { id: 2, critico: true,  texto: "Tarjeta de llave programada y funcionando — probar antes del arribo" },
      { id: 3, critico: false, texto: "Pasillo interior: piso sin residuos, sin olor, iluminación al nivel correcto" },
      { id: 4, critico: false, texto: "Armario: perchas suficientes, caja fuerte operativa" },
    ]
  },
  {
    id: "B",
    icon: "🛏️",
    titulo: "Área Principal y Dormitorio",
    color: "#2E7D8F",
    puntos: [
      { id: 5,  critico: true,  texto: "Cama: tendido hospitalario impecable, sin arrugas visibles desde la puerta" },
      { id: 6,  critico: true,  texto: "Colchón y protector: sin manchas, sin hundimientos, sin olor" },
      { id: 7,  critico: true,  texto: "Almohadas: cantidad y tipo correcto según preferencia del huésped registrada" },
      { id: 8,  critico: false, texto: "Ropa de cama: blanca sin pelusa, sin pilling, sin decoloración" },
      { id: 9,  critico: false, texto: "Veladores: lámparas funcionando, sin polvo" },
      { id: 10, critico: true,  texto: "Temperatura de habitación: 22°C exactos — verificar con termómetro de mano" },
      { id: 11, critico: false, texto: "Cortinas/blackout: funcionamiento correcto, sin descosidos, sin luz filtrada al cerrar" },
      { id: 12, critico: false, texto: "TV: encendido y operativo, control remoto con baterías, HDMI disponible" },
      { id: 13, critico: true,  texto: "Aire acondicionado: sin ruido excesivo, filtros sin polvo visible, control operativo" },
    ]
  },
  {
    id: "C",
    icon: "🌺",
    titulo: "Amenidades, Decoración y Clima",
    color: "#3D7A6B",
    puntos: [
      { id: 14, critico: true,  texto: "Detalle de bienvenida: nota manuscrita en posición correcta sobre almohada o mesa de noche" },
      { id: 15, critico: false, texto: "Flores frescas o planta decorativa: sin hojas caídas, sin pétalos marchitos, agua limpia" },
      { id: 16, critico: false, texto: "Minibar: inventario completo, bebidas frías, snacks en fecha, cerradura operativa" },
      { id: 17, critico: true,  texto: "Agua en veladores: botellas precintadas, temperatura ambiente, presentación correcta" },
      { id: 18, critico: false, texto: "Papelería y menú: sin manchas, sin esquinas dobladas, QR de servicios funcionando" },
      { id: 19, critico: false, texto: "Iluminación general: todos los puntos de luz funcionando, dimmers operativos" },
      { id: 20, critico: true,  texto: "Olor de habitación: neutro o aroma corporativo suave — nunca humedad, limpiadores o encierro" },
    ]
  },
  {
    id: "D",
    icon: "🚿",
    titulo: "Baño Completo",
    color: "#1B2B4B",
    puntos: [
      { id: 21, critico: true,  texto: "Inodoro: limpio bajo el aro, sin sarro, descarga correcta, papel doblado en punta" },
      { id: 22, critico: true,  texto: "Lavamanos: sin manchas de agua, sin jabón seco acumulado, sifón sin olor" },
      { id: 23, critico: true,  texto: "Ducha/tina: vidrios sin rayas, silicona sin hongos, drenaje sin obstrucción" },
      { id: 24, critico: true,  texto: "Agua caliente: verificar temperatura mín. 40°C y presión constante" },
      { id: 25, critico: true,  texto: "Toallas: pliegue de presentación correcto, blancas sin manchas amarillas" },
      { id: 26, critico: false, texto: "Tapete de baño: seco, sin olor, sin decoloración en bordes" },
      { id: 27, critico: true,  texto: "Amenidades: productos completos (shampoo, acond., jabón, loción, dental kit), etiqueta al frente" },
      { id: 28, critico: false, texto: "Espejo principal: sin salpicaduras, sin huellas, iluminación perimetral encendida" },
      { id: 30, critico: false, texto: "Extractor de baño: operativo, sin ruido excesivo, rejilla sin polvo" },
    ]
  },
  {
    id: "E",
    icon: "🌊",
    titulo: "Terraza / Balcón",
    color: "#2E7D8F",
    puntos: [
      { id: 31, critico: false, texto: "Muebles de terraza: limpios, secos, sin corrosión, cojines sin humedad" },
      { id: 32, critico: false, texto: "Barandal: fijo, sin movimiento, sin óxido visible, limpio" },
      { id: 33, critico: false, texto: "Piso de terraza: sin algas resbaladizas, sin residuos, sin charcos estancados" },
    ]
  },
  {
    id: "F",
    icon: "✅",
    titulo: "Cierre y Registro en PMS",
    color: "#2C5F2E",
    puntos: [
      { id: 34, critico: true, texto: "Revisión final desde la puerta: panorámica de 10 segundos — ¿entra el estándar al verla?" },
      { id: 35, critico: true, texto: "Estado en Cloudbeds actualizado a 'Limpia e Inspeccionada' con hora registrada" },
    ]
  },
];

const TOTAL = SECCIONES.reduce((s, sec) => s + sec.puntos.length, 0);
const CRITICOS_IDS = SECCIONES.flatMap(s => s.puntos.filter(p => p.critico).map(p => p.id));

const TIPOS_FALLBACK = ["Estándar", "Superior", "Suite Deluxe", "Cabaña VIP"];

function horaActual() {
  return new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

// ─── Estilos globales ────────────────────────────────────────────────────────
const G = {
  navy:  "#1B2B4B",
  sand:  "#C8A96E",
  teal:  "#2E7D8F",
  pink:  "#F4C6D0",
  white: "#FFFFFF",
  bg:    "#F2EFE9",
  card:  "#FFFFFF",
  red:   "#C0392B",
  redBg: "#FFF0EE",
  green: "#1E7A4A",
  greenBg: "#EEF7F1",
  amber: "#B8600A",
  amberBg: "#FFF7ED",
  gray:  "#6B6B6B",
  lgray: "#E8E4DD",
};

// Constante de gris oscuro usada en el JSX
const DGRAY = "#333333";

const labelStyle = {
  display: "block",
  fontSize: 10,
  color: G.gray,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 700,
  marginBottom: 6,
};
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: `1px solid ${G.lgray}`,
  background: G.white,
  fontSize: 14,
  color: DGRAY,
  fontFamily: "'Barlow Condensed', sans-serif",
};

export default function HousekeepingInspection() {
  // ─── Estado ────────────────────────────────────────────────────────────────
  const [form, setForm] = useState(() => {
    let habInicial = "";
    try {
      const params = new URLSearchParams(window.location.search);
      habInicial = params.get("hab") || "";
    } catch {}
    return {
      habitacion: habInicial,
      habitacion_id: "",
      tipo: "",
      inspector: "",
      turno: "Mañana",
    };
  });
  const [savingDB, setSavingDB] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [estados, setEstados] = useState({}); // { [puntoId]: "ok" | "falla" | "na" }
  const [notas, setNotas] = useState({});     // { [puntoId]: string }
  const [colapsadas, setColapsadas] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [horaInicio] = useState(horaActual());
  const [tick, setTick] = useState(0);
  const headerRef = useRef(null);

  const [habitacionesDB, setHabitacionesDB] = useState([]);
  const [tiposDB, setTiposDB] = useState(TIPOS_FALLBACK);

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Cargar habitaciones reales desde la DB
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("hotel_habitaciones")
      .select("id, numero, categoria, estado")
      .eq("estado", "activa")
      .order("numero")
      .then(({ data }) => {
        const habs = (data || []).slice().sort((a, b) =>
          (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true })
        );
        setHabitacionesDB(habs);
        const cats = Array.from(new Set(habs.map(h => h.categoria).filter(Boolean)));
        if (cats.length > 0) setTiposDB(cats);

        // Si la URL trae ?hab=X, autollenar también el tipo y el id según la habitación
        if (form.habitacion) {
          const hab = habs.find(h => (h.numero || "") === form.habitacion);
          if (hab) setForm(f => ({ ...f, habitacion_id: hab.id, tipo: hab.categoria || f.tipo }));
        }
      });
  }, []);

  // ─── Cálculos ──────────────────────────────────────────────────────────────
  const completados = Object.keys(estados).length;
  const progreso = Math.round((completados / TOTAL) * 100);
  const fallasCriticas = CRITICOS_IDS.filter(id => estados[id] === "falla").length;
  const totalFallas = Object.values(estados).filter(v => v === "falla").length;
  const totalOk = Object.values(estados).filter(v => v === "ok").length;
  const totalNa = Object.values(estados).filter(v => v === "na").length;
  const aplicables = TOTAL - totalNa;
  const score = aplicables > 0 ? Math.round((totalOk / aplicables) * 100) : 0;
  const todosCompletos = completados === TOTAL;

  let estadoGlobal = "en-progreso";
  if (todosCompletos) {
    estadoGlobal = fallasCriticas > 0 ? "rechazada" : "aprobada";
  }

  const estadoColor = {
    "aprobada":   G.green,
    "rechazada":  G.red,
    "en-progreso": G.amber,
  }[estadoGlobal];

  const estadoLabel = {
    "aprobada":    "✓ APROBADA",
    "rechazada":   "✗ RECHAZADA",
    "en-progreso": "⏳ EN PROGRESO",
  }[estadoGlobal];

  // ─── Acciones ──────────────────────────────────────────────────────────────
  function marcar(id, estado) {
    setEstados(prev => ({ ...prev, [id]: estado }));
    setSavedAt(null);
    if (estado !== "falla") {
      setNotas(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  }

  function toggleSeccion(sid) {
    setColapsadas(prev => ({ ...prev, [sid]: !prev[sid] }));
  }

  function resetear() {
    if (!window.confirm("¿Iniciar nueva inspección? Se perderán los datos actuales.")) return;
    setEstados({});
    setNotas({});
    setColapsadas({});
    setForm({ habitacion: "", tipo: "Estándar", inspector: "", turno: "Mañana" });
    setShowModal(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function imprimir() {
    // Expandir todo antes de imprimir
    setColapsadas({});
    setTimeout(() => window.print(), 300);
  }

  async function guardar() {
    if (!form.habitacion) {
      alert("Selecciona una habitación primero");
      return;
    }
    if (!form.inspector.trim()) {
      alert("Ingresa el nombre del inspector");
      return;
    }
    if (!supabase) {
      alert("Sin conexión a base de datos");
      return;
    }
    setSavingDB(true);
    try {
      const payload = {
        habitacion_id: form.habitacion_id || null,
        habitacion_num: form.habitacion,
        tipo: form.tipo,
        inspector: form.inspector.trim(),
        turno: form.turno,
        hora_fin: todosCompletos ? new Date().toISOString() : null,
        estado_global: estadoGlobal,
        score,
        total_ok: totalOk,
        total_falla: totalFallas,
        total_na: totalNa,
        criticos_falla: fallasCriticas,
        estados,
        notas,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("hk_inspecciones").insert(payload);
      if (error) {
        alert("Error guardando: " + error.message);
      } else {
        // Si fue aprobada, marcar la habitación como inspeccionada
        if (estadoGlobal === "aprobada" && form.habitacion_id) {
          await supabase.from("hotel_habitaciones").update({
            estado_hk: "inspeccionada",
            hk_ultima_limpieza: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", form.habitacion_id);
        }
        setSavedAt(new Date());
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSavingDB(false);
  }

  // Stats por sección
  function secStats(sec) {
    const ids = sec.puntos.map(p => p.id);
    const ok = ids.filter(id => estados[id] === "ok").length;
    const falla = ids.filter(id => estados[id] === "falla").length;
    const total = ids.length;
    const hecho = ids.filter(id => estados[id]).length;
    return { ok, falla, total, hecho };
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: G.bg, fontFamily: "'Barlow Condensed', 'Georgia', sans-serif" }}>

      {/* ── PRINT STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @media print {
          .no-print { display: none !important; }
          .sticky-header { position: static !important; }
          body { background: white !important; }
        }
        input, select { outline: none; }
        textarea { outline: none; resize: vertical; }
        button { cursor: pointer; }
        .punto-row { transition: background 0.15s ease; }
        .punto-row:hover { background: #F8F6F2 !important; }
        .btn-estado { transition: all 0.15s ease; border: 2px solid transparent; }
        .btn-estado:hover { transform: translateY(-1px); }
        .sec-toggle { transition: transform 0.2s ease; }
        .progreso-bar { transition: width 0.4s ease; }
      `}</style>

      {/* ══ HEADER STICKY ══════════════════════════════════════════════════ */}
      <div ref={headerRef} className="sticky-header" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: G.navy, color: G.white,
        boxShadow: "0 2px 12px rgba(27,43,75,0.4)"
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            {/* Logo / título */}
            <div>
              <div style={{ fontSize: 11, color: G.sand, letterSpacing: 3, textTransform: "uppercase", marginBottom: 1 }}>
                Atolón Beach Club · Housekeeping
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>
                {form.habitacion ? `Hab. ${form.habitacion}` : "Inspección de Habitación"}
              </div>
            </div>

            {/* Progreso */}
            <div style={{ flex: 1, minWidth: 180, maxWidth: 340, padding: "0 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: G.sand }}>
                <span>Progreso</span>
                <span style={{ fontWeight: 700 }}>{completados} / {TOTAL}</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 4, overflow: "hidden" }}>
                <div className="progreso-bar" style={{ height: "100%", width: `${progreso}%`, background: progreso === 100 ? G.green : G.sand, borderRadius: 4 }} />
              </div>
            </div>

            {/* Estado */}
            <div style={{
              padding: "6px 16px", borderRadius: 6, fontWeight: 700, fontSize: 14, letterSpacing: 1,
              background: estadoColor + "22", border: `2px solid ${estadoColor}`, color: estadoColor
            }}>
              {estadoLabel}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* ══ COLUMNA PRINCIPAL ═══════════════════════════════════════════ */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── Ficha de operación ─────────────────────────────────────── */}
          <div style={{ background: G.card, borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.08)", border: `1px solid ${G.lgray}` }}>
            <div style={{ fontSize: 11, color: G.teal, letterSpacing: 3, textTransform: "uppercase", marginBottom: 16, fontWeight: 600 }}>
              Datos de Inspección
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              {/* Habitación */}
              <div>
                <label style={labelStyle}>Habitación N°</label>
                <select value={form.habitacion} onChange={e => {
                  const numero = e.target.value;
                  const hab = habitacionesDB.find(h => (h.numero || "") === numero);
                  setForm(f => ({ ...f, habitacion: numero, habitacion_id: hab?.id || "", tipo: hab?.categoria || "" }));
                  setSavedAt(null);
                }} style={inputStyle}>
                  <option value="">Seleccionar...</option>
                  {habitacionesDB.length > 0
                    ? habitacionesDB.map(h => <option key={h.id} value={h.numero}>#{h.numero}{h.categoria ? ` — ${h.categoria}` : ""}</option>)
                    : <option value="" disabled>Cargando habitaciones…</option>}
                </select>
              </div>
              {/* Tipo (auto desde habitación) */}
              <div>
                <label style={labelStyle}>Tipo</label>
                <div style={{ ...inputStyle, background: G.bg, color: form.tipo ? G.navy : G.gray, fontWeight: form.tipo ? 700 : 400, fontSize: 13 }}>
                  {form.tipo || "Selecciona una habitación"}
                </div>
              </div>
              {/* Inspector */}
              <div>
                <label style={labelStyle}>Inspector</label>
                <input value={form.inspector} onChange={e => setForm(f => ({ ...f, inspector: e.target.value }))} placeholder="Nombre completo" style={inputStyle} />
              </div>
              {/* Turno */}
              <div>
                <label style={labelStyle}>Turno</label>
                <select value={form.turno} onChange={e => setForm(f => ({ ...f, turno: e.target.value }))} style={inputStyle}>
                  {["Mañana", "Tarde", "Noche"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              {/* Fecha */}
              <div>
                <label style={labelStyle}>Inicio de inspección</label>
                <div style={{ ...inputStyle, background: G.bg, color: G.gray, fontSize: 13 }}>{horaInicio}</div>
              </div>
            </div>
          </div>

          {/* ── Secciones ──────────────────────────────────────────────── */}
          {SECCIONES.map(sec => {
            const { ok, falla, total, hecho } = secStats(sec);
            const abierta = !colapsadas[sec.id];
            const hayFallas = falla > 0;

            return (
              <div key={sec.id} style={{
                background: G.card, borderRadius: 12, marginBottom: 16,
                boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
                border: `1px solid ${hayFallas ? G.red + "44" : G.lgray}`,
                overflow: "hidden"
              }}>
                {/* Header de sección */}
                <div
                  onClick={() => toggleSeccion(sec.id)}
                  style={{ background: sec.color, padding: "14px 20px", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{sec.icon}</span>
                    <div>
                      <span style={{ color: G.sand, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>Sección {sec.id}  </span>
                      <span style={{ color: G.white, fontSize: 16, fontWeight: 600 }}>{sec.titulo}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Pill de estado */}
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      background: hecho === total ? (falla > 0 ? G.red : G.green) : "rgba(255,255,255,0.15)",
                      color: G.white
                    }}>
                      {hecho === total ? (falla > 0 ? `${falla} falla${falla > 1 ? "s" : ""}` : "✓ Completa") : `${hecho}/${total}`}
                    </span>
                    <span className="sec-toggle" style={{ color: G.sand, fontSize: 18, transform: abierta ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
                  </div>
                </div>

                {/* Puntos */}
                {abierta && (
                  <div>
                    {/* Cabecera de columnas */}
                    <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 120px", padding: "8px 20px", borderBottom: `1px solid ${G.lgray}`, background: "#FAFAF8" }}>
                      <div style={{ fontSize: 10, color: G.gray, textTransform: "uppercase", letterSpacing: 1 }}>#</div>
                      <div style={{ fontSize: 10, color: G.gray, textTransform: "uppercase", letterSpacing: 1 }}>Punto de inspección</div>
                      <div style={{ fontSize: 10, color: G.gray, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>Estado</div>
                    </div>

                    {sec.puntos.map((punto, idx) => {
                      const estado = estados[punto.id];
                      const esFalla = estado === "falla";
                      const rowBg = esFalla ? G.redBg : (idx % 2 === 0 ? G.white : "#FBFAF7");

                      return (
                        <div key={punto.id} className="punto-row">
                          {/* Fila principal */}
                          <div style={{
                            display: "grid", gridTemplateColumns: "36px 1fr 120px",
                            padding: "12px 20px", alignItems: "center",
                            background: rowBg,
                            borderLeft: esFalla ? `3px solid ${G.red}` : punto.critico ? `3px solid ${G.sand}` : "3px solid transparent",
                            borderBottom: `1px solid ${G.lgray}`,
                          }}>
                            {/* Número */}
                            <div style={{ fontSize: 12, fontWeight: 700, color: punto.critico ? G.red : G.teal }}>
                              {String(punto.id).padStart(2, "0")}
                            </div>

                            {/* Descripción */}
                            <div style={{ paddingRight: 12 }}>
                              {punto.critico && (
                                <span style={{ fontSize: 10, background: G.red, color: G.white, borderRadius: 4, padding: "1px 5px", marginRight: 6, fontWeight: 700, letterSpacing: 0.5, verticalAlign: "middle" }}>★ CRÍTICO</span>
                              )}
                              <span style={{ fontSize: 14, color: DGRAY, lineHeight: 1.4, fontFamily: "'Barlow Condensed', sans-serif" }}>{punto.texto}</span>
                            </div>

                            {/* Botones de estado */}
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <button className="btn-estado" onClick={() => marcar(punto.id, "ok")} style={{
                                flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                                background: estado === "ok" ? G.green : "transparent",
                                color: estado === "ok" ? G.white : G.green,
                                border: `2px solid ${G.green}`,
                              }}>OK</button>
                              <button className="btn-estado" onClick={() => marcar(punto.id, "falla")} style={{
                                flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                                background: estado === "falla" ? G.red : "transparent",
                                color: estado === "falla" ? G.white : G.red,
                                border: `2px solid ${G.red}`,
                              }}>✗</button>
                              <button className="btn-estado" onClick={() => marcar(punto.id, "na")} style={{
                                flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                                background: estado === "na" ? "#888" : "transparent",
                                color: estado === "na" ? G.white : "#999",
                                border: "2px solid #ccc",
                              }}>N/A</button>
                            </div>
                          </div>

                          {/* Campo de nota si hay falla */}
                          {esFalla && (
                            <div style={{ padding: "8px 20px 12px 56px", background: G.redBg, borderBottom: `1px solid ${G.red}22` }}>
                              <textarea
                                value={notas[punto.id] || ""}
                                onChange={e => setNotas(prev => ({ ...prev, [punto.id]: e.target.value }))}
                                placeholder="Describe la falla y acción correctiva requerida..."
                                rows={2}
                                style={{
                                  width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13,
                                  border: `1px solid ${G.red}55`, background: G.white,
                                  fontFamily: "inherit", color: DGRAY, lineHeight: 1.5
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Botones de acción ──────────────────────────────────────── */}
          <div className="no-print" style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => todosCompletos && setShowModal(true)}
              disabled={!todosCompletos}
              style={{
                flex: 1, minWidth: 200, padding: "14px 24px", borderRadius: 8,
                fontSize: 15, fontWeight: 700, letterSpacing: 1, border: "none",
                background: todosCompletos ? (estadoGlobal === "aprobada" ? G.green : G.red) : G.lgray,
                color: todosCompletos ? G.white : "#bbb",
                cursor: todosCompletos ? "pointer" : "not-allowed",
                transition: "all 0.2s"
              }}
            >
              {todosCompletos ? "Ver Resumen Final →" : `Faltan ${TOTAL - completados} puntos`}
            </button>
            <button onClick={guardar} disabled={savingDB || !form.habitacion}
              style={{ padding: "14px 20px", borderRadius: 8, fontSize: 14, fontWeight: 700, border: "none", background: !form.habitacion ? G.lgray : G.navy, color: !form.habitacion ? "#bbb" : G.white, cursor: !form.habitacion || savingDB ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              {savingDB ? "Guardando…" : savedAt ? "✓ Guardado" : "💾 Guardar"}
            </button>
            <button onClick={imprimir} style={{ padding: "14px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, border: `2px solid ${G.teal}`, background: "transparent", color: G.teal }}>
              🖨️ Imprimir
            </button>
            <button onClick={resetear} style={{ padding: "14px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, border: `2px solid ${G.lgray}`, background: "transparent", color: G.gray }}>
              ↺ Nueva
            </button>
          </div>
        </div>

        {/* ══ PANEL LATERAL ═══════════════════════════════════════════════ */}
        <div className="no-print" style={{ width: 260, flexShrink: 0, position: "sticky", top: 80 }}>

          {/* Score */}
          <div style={{ background: G.card, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.07)", border: `1px solid ${G.lgray}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: G.teal, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>Score General</div>
            <div style={{ fontSize: 56, fontWeight: 800, color: score >= 90 ? G.green : score >= 70 ? G.amber : G.red, lineHeight: 1 }}>
              {score}<span style={{ fontSize: 22, fontWeight: 400, color: G.gray }}>%</span>
            </div>
            <div style={{ fontSize: 12, color: G.gray, marginTop: 4 }}>sobre {aplicables} puntos aplicables</div>
            <div style={{ height: 1, background: G.lgray, margin: "16px 0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "OK", val: totalOk, color: G.green },
                { label: "Falla", val: totalFallas, color: G.red },
                { label: "N/A", val: totalNa, color: G.gray },
              ].map(item => (
                <div key={item.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.val}</div>
                  <div style={{ fontSize: 11, color: G.gray }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Críticos */}
          <div style={{ background: fallasCriticas > 0 ? G.redBg : G.greenBg, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${fallasCriticas > 0 ? G.red + "44" : G.green + "44"}` }}>
            <div style={{ fontSize: 11, color: fallasCriticas > 0 ? G.red : G.green, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Puntos Críticos ★</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: fallasCriticas > 0 ? G.red : G.green }}>{fallasCriticas}</div>
            <div style={{ fontSize: 12, color: fallasCriticas > 0 ? G.red : G.green }}>
              {fallasCriticas > 0 ? `falla${fallasCriticas > 1 ? "s" : ""} — BLOQUEA check-in` : "sin fallas críticas"}
            </div>
          </div>

          {/* Estado por sección */}
          <div style={{ background: G.card, borderRadius: 12, padding: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.07)", border: `1px solid ${G.lgray}` }}>
            <div style={{ fontSize: 11, color: G.teal, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Por Sección</div>
            {SECCIONES.map(sec => {
              const { ok, falla, total, hecho } = secStats(sec);
              const pct = hecho > 0 ? Math.round((ok / hecho) * 100) : 0;
              return (
                <div key={sec.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: G.navy, fontWeight: 600 }}>{sec.icon} {sec.id} — {sec.titulo.split(" ")[0]}</span>
                    <span style={{ color: falla > 0 ? G.red : hecho === total ? G.green : G.gray, fontWeight: 700 }}>
                      {hecho}/{total}
                    </span>
                  </div>
                  <div style={{ height: 4, background: G.lgray, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(hecho / total) * 100}%`, background: falla > 0 ? G.red : G.teal, borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Regla de oro */}
          <div style={{ marginTop: 16, padding: 14, background: G.navy, borderRadius: 12, border: `1px solid ${G.sand}33` }}>
            <div style={{ fontSize: 10, color: G.sand, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Regla de Oro</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Si un punto crítico ★ falla, la habitación NO se entrega hasta corregirlo. Cloudbeds se actualiza solo cuando los 35 puntos están verificados.
            </div>
          </div>
        </div>
      </div>

      {/* ══ MODAL DE RESUMEN ════════════════════════════════════════════════ */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(27,43,75,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <div style={{
            background: G.card, borderRadius: 16, maxWidth: 600, width: "100%",
            maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
          }}>
            {/* Header modal */}
            <div style={{ background: estadoGlobal === "aprobada" ? G.green : G.red, padding: "20px 24px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>Resumen de Inspección</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: G.white }}>{estadoLabel}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
                Hab. {form.habitacion || "—"}  ·  {form.inspector || "—"}  ·  Turno {form.turno}
              </div>
            </div>

            {/* Contenido modal */}
            <div style={{ overflowY: "auto", padding: 24, flex: 1 }}>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Score", val: `${score}%`, color: score >= 90 ? G.green : G.red },
                  { label: "Críticos en falla", val: fallasCriticas, color: fallasCriticas > 0 ? G.red : G.green },
                  { label: "Fallas totales", val: totalFallas, color: totalFallas > 0 ? G.amber : G.green },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: "center", padding: 14, background: G.bg, borderRadius: 10 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: item.color }}>{item.val}</div>
                    <div style={{ fontSize: 11, color: G.gray, marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Lista de fallas */}
              {totalFallas > 0 ? (
                <div>
                  <div style={{ fontSize: 12, color: G.red, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Puntos con falla</div>
                  {SECCIONES.flatMap(sec =>
                    sec.puntos.filter(p => estados[p.id] === "falla").map(p => (
                      <div key={p.id} style={{ padding: 14, marginBottom: 8, borderRadius: 8, background: G.redBg, border: `1px solid ${G.red}33`, borderLeft: `4px solid ${p.critico ? G.red : G.amber}` }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                          {p.critico && <span style={{ fontSize: 10, background: G.red, color: G.white, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>★ CRÍTICO</span>}
                          <span style={{ fontSize: 11, color: G.gray }}>#{String(p.id).padStart(2, "0")} · Sección {sec.id}</span>
                        </div>
                        <div style={{ fontSize: 13, color: DGRAY, marginBottom: notas[p.id] ? 6 : 0 }}>{p.texto}</div>
                        {notas[p.id] && (
                          <div style={{ fontSize: 12, color: G.red, fontStyle: "italic" }}>→ {notas[p.id]}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: 24, color: G.green }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Inspección sin fallas</div>
                  <div style={{ fontSize: 13, color: G.gray, marginTop: 4 }}>La habitación está lista para el huésped</div>
                </div>
              )}
            </div>

            {/* Footer modal */}
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${G.lgray}`, display: "flex", gap: 10 }}>
              {estadoGlobal === "aprobada" && (
                <button style={{ flex: 1, padding: "12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: G.green, color: G.white, border: "none" }}>
                  ✓ Marcar Aprobada en Cloudbeds
                </button>
              )}
              <button onClick={imprimir} style={{ padding: "12px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, border: `2px solid ${G.teal}`, background: "transparent", color: G.teal }}>
                🖨️ Imprimir
              </button>
              <button onClick={() => setShowModal(false)} style={{ padding: "12px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, border: `2px solid ${G.lgray}`, background: "transparent", color: G.gray }}>
                Volver
              </button>
              <button onClick={resetear} style={{ padding: "12px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "none", background: G.lgray, color: G.gray }}>
                ↺ Nueva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

