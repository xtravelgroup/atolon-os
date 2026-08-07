import React, { useState, useEffect, useMemo, useCallback } from "react";
import HotelGrupos from "./hotel/HotelGrupos";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
  hotel: "#a78bfa",
};

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const ESTADOS = [
  { k: "reservada",    l: "Reservada",   c: B.sky },
  { k: "in_house",     l: "In-house",    c: B.success },
  { k: "checked_out",  l: "Checked-out", c: "#64748b" },
  { k: "cancelada",    l: "Cancelada",   c: B.danger },
  { k: "no_show",      l: "No-show",     c: B.warning },
];

const CANALES = [
  { k: "directo",    l: "Directo" },
  { k: "web",        l: "Web" },
  { k: "telefono",   l: "Teléfono" },
  { k: "email",      l: "Email" },
  { k: "walkin",     l: "Walk-in" },
  { k: "ota",        l: "OTA" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const addDaysStr = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—";
const fmtFull = (d) => d ? new Date(d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const uid = () => "HTL-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
const nombreHuesped = (h) => h ? `${h.nombre || ""} ${h.apellido || ""}`.trim() || "(sin nombre)" : "—";

// Detecta si dos rangos se solapan
const solapan = (a1, a2, b1, b2) => new Date(a1) < new Date(b2) && new Date(b1) < new Date(a2);

export default function HotelReservas() {
  const [reservas, setReservas] = useState([]);
  const [huespedes, setHuespedes] = useState([]);
  const [habitaciones, setHabitaciones] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("llegadas");
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rR, hR, habR, tR, cR] = await Promise.all([
      supabase.from("hotel_estancias").select("*").order("check_in_at", { ascending: false }).limit(500),
      supabase.from("hotel_huespedes").select("*").order("nombre"),
      supabase.from("hotel_habitaciones").select("*").eq("estado", "activa").order("numero"),
      supabase.from("hotel_tarifas").select("*").eq("activo", true).order("precio_base"),
      supabase.from("hotel_categorias").select("*").order("nombre"),
    ]);
    setReservas(rR.data || []);
    setHuespedes(hR.data || []);
    setHabitaciones(habR.data || []);
    setTarifas(tR.data || []);
    setCategorias(cR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const huespedById = useMemo(() => Object.fromEntries(huespedes.map(h => [h.id, h])), [huespedes]);
  const habById = useMemo(() => Object.fromEntries(habitaciones.map(h => [h.id, h])), [habitaciones]);

  const hoy = todayStr();
  const llegadasHoy = reservas.filter(r => (r.check_in_at || "").slice(0, 10) === hoy && r.estado === "reservada");
  const salidasHoy = reservas.filter(r => (r.check_out_at || "").slice(0, 10) === hoy && r.estado === "in_house");
  const inhouse = reservas.filter(r => r.estado === "in_house");
  const totalHab = habitaciones.length || 1;
  const ocupacion = Math.round((inhouse.length / totalHab) * 100);

  const visibles = useMemo(() => {
    let list = reservas;
    if (tab === "llegadas") list = list.filter(r => (r.check_in_at || "").slice(0, 10) >= hoy && (r.estado === "reservada"));
    if (tab === "inhouse") list = list.filter(r => r.estado === "in_house");
    if (tab === "salidas") list = list.filter(r => (r.check_out_at || "").slice(0, 10) >= hoy && r.estado === "in_house");
    if (tab === "historico") list = list.filter(r => r.estado === "checked_out" || r.estado === "cancelada" || r.estado === "no_show");
    if (filtroEstado) list = list.filter(r => r.estado === filtroEstado);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => {
        const h = huespedById[r.huesped_id];
        return (r.codigo || "").toLowerCase().includes(q) ||
               nombreHuesped(h).toLowerCase().includes(q) ||
               (h?.documento || "").toLowerCase().includes(q);
      });
    }
    return list;
  }, [reservas, tab, filtroEstado, search, huespedById, hoy]);

  const opened = openId ? reservas.find(r => r.id === openId) : null;

  return (
    <div style={{ padding: 20, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#fff", minHeight: "100vh", background: B.navy }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🛏️ Reservas Hotel</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Gestión de reservas, llegadas, salidas y disponibilidad.</div>
        </div>
        <button onClick={() => setShowNew(true)} style={BTN(B.hotel)}>+ Nueva reserva</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Llegadas hoy", v: llegadasHoy.length, c: B.sky },
          { l: "Salidas hoy",  v: salidasHoy.length, c: B.warning },
          { l: "In-house",     v: inhouse.length, c: B.success },
          { l: "Ocupación",    v: `${ocupacion}%`, c: B.hotel },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navyMid, padding: 12, borderRadius: 10, borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { k: "llegadas", l: `Llegadas (${llegadasHoy.length})` },
          { k: "inhouse",  l: `In-house (${inhouse.length})` },
          { k: "salidas",  l: `Salidas (${salidasHoy.length})` },
          { k: "todas",    l: "Todas" },
          { k: "historico", l: "Histórico" },
          { k: "grupos",   l: "🎟️ Grupos" },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={BTN(tab === t.k ? B.hotel : B.navyMid)}>{t.l}</button>
        ))}
        {tab !== "grupos" && (<>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...IS, width: 160 }}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}
          </select>
          <input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...IS, maxWidth: 260, flex: 1, minWidth: 180 }} />
        </>)}
      </div>

      {tab === "grupos" && <HotelGrupos />}

      {tab !== "grupos" && (loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : visibles.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 10 }}>
          Sin reservas en esta vista.
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 100px 100px 80px 110px 100px 80px", padding: "10px 14px", fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${B.navyLight}` }}>
            <div>Código</div><div>Huésped</div><div>Check-in</div><div>Check-out</div><div>Noches</div><div>Habitación</div><div>Total</div><div>Estado</div>
          </div>
          {visibles.map(r => {
            const h = huespedById[r.huesped_id];
            const hab = habById[r.habitacion_id];
            const est = ESTADOS.find(e => e.k === r.estado) || ESTADOS[0];
            const noches = r.check_in_at && r.check_out_at ? diffDays(r.check_in_at, r.check_out_at) : "—";
            // Contar habitaciones del grupo (folio compartido) para mostrar el badge.
            const grupoCount = r.booking_group_id ? visibles.filter(x => x.booking_group_id === r.booking_group_id).length : 0;
            return (
              <div key={r.id} onClick={() => setOpenId(r.id)} style={{
                display: "grid", gridTemplateColumns: "110px 1fr 100px 100px 80px 110px 100px 80px",
                padding: "10px 14px", fontSize: 12, alignItems: "center",
                borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer",
              }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: B.sky }}>{r.codigo}</div>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nombreHuesped(h)} {h?.vip && "⭐"}
                  {grupoCount > 1 && (
                    <span title={`${grupoCount} habitaciones en la misma reserva (folio único)`}
                      style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: B.hotel + "33", color: B.hotel, fontWeight: 700 }}>
                      🏨×{grupoCount}
                    </span>
                  )}
                </div>
                <div>{fmtFecha(r.check_in_at)}</div>
                <div>{fmtFecha(r.check_out_at)}</div>
                <div>{noches}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                  {hab ? `${hab.categoria} ${hab.numero}` : (r.categoria_preferida || "—")}
                </div>
                <div style={{ fontWeight: 700 }}>{fmtCOP(r.total)}</div>
                <div>
                  <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: est.c + "33", color: est.c, fontWeight: 700 }}>
                    {est.l}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {showNew && (
        <ReservaModal
          huespedes={huespedes}
          habitaciones={habitaciones}
          tarifas={tarifas}
          categorias={categorias}
          reservas={reservas}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}
      {opened && (
        <DetalleModal
          reserva={opened}
          huesped={huespedById[opened.huesped_id]}
          habitacion={habById[opened.habitacion_id]}
          onClose={() => setOpenId(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

// ─── Modal Nueva Reserva ────────────────────────────────────────────────────
function ReservaModal({ huespedes, habitaciones, tarifas, categorias, reservas, onClose, onSaved }) {
  const [paso, setPaso] = useState(1);
  const [f, setF] = useState({
    huesped_id: "",
    nuevoHuesped: false,
    nombre: "", apellido: "", documento: "", documento_tipo: "CC", email: "", telefono: "",
    check_in_at: todayStr(),
    check_out_at: addDaysStr(todayStr(), 1),
    categoria_preferida: "",
    // Selección múltiple: array de habitaciones cada una con su tarifa y precio.
    // Formato: [{ habitacion_id, tarifa_id, precio_noche }]
    // Si el array queda vacío, la reserva queda "sin asignar" (1 habitación
    // sin habitacion_id, asignar al check-in). Con más de 1, se crean N filas
    // en hotel_estancias vinculadas por grupo_id compartido.
    habitaciones_sel: [],
    deposito: 0,
    pax_adultos: 2,
    pax_ninos: 0,
    canal: "directo",
    solicitudes_especiales: "",
    notas: "",
    estado: "reservada",
  });
  const [searchH, setSearchH] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const noches = diffDays(f.check_in_at, f.check_out_at);
  const total = f.habitaciones_sel.reduce(
    (s, x) => s + (Number(x.precio_noche) || 0) * noches, 0
  );
  const saldo = total - Number(f.deposito || 0);

  const toggleHab = (habId) => setF(p => {
    const existente = p.habitaciones_sel.find(x => x.habitacion_id === habId);
    if (existente) {
      return { ...p, habitaciones_sel: p.habitaciones_sel.filter(x => x.habitacion_id !== habId) };
    }
    return { ...p, habitaciones_sel: [...p.habitaciones_sel, { habitacion_id: habId, tarifa_id: "", precio_noche: 0 }] };
  });
  const updateHabRow = (habId, patch) => setF(p => ({
    ...p,
    habitaciones_sel: p.habitaciones_sel.map(x => x.habitacion_id === habId ? { ...x, ...patch } : x),
  }));

  // Habitaciones disponibles (sin solapamiento + categoría si aplica).
  // Excluye las que ya están seleccionadas en la reserva actual — se marcan
  // aparte para poder quitarlas.
  const disponibles = useMemo(() => {
    return habitaciones.filter(hab => {
      if (f.categoria_preferida && hab.categoria !== f.categoria_preferida) return false;
      const ocupada = reservas.some(r =>
        r.habitacion_id === hab.id &&
        (r.estado === "reservada" || r.estado === "in_house") &&
        r.check_in_at && r.check_out_at &&
        solapan(r.check_in_at.slice(0, 10), r.check_out_at.slice(0, 10), f.check_in_at, f.check_out_at)
      );
      return !ocupada;
    });
  }, [habitaciones, reservas, f.categoria_preferida, f.check_in_at, f.check_out_at]);

  // Tarifas aplicables — rank 113: vigencia debe cubrir TODAS las noches,
  // no solo el check_in. Si la reserva cruza un cambio de temporada, ninguna
  // tarifa parcial debe aparecer; el usuario debe partir la reserva o aplicar
  // tarifa manual por tramo.
  const checkOutMinusOne = useMemo(() => {
    // El check_out cuenta hasta la noche ANTERIOR (estandar hotelero: noche
    // del 10 al 11 cuenta como 10/oct, no 11/oct).
    if (!f.check_in_at || !f.check_out_at) return f.check_in_at;
    const d = new Date(f.check_out_at + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [f.check_in_at, f.check_out_at]);
  // Devuelve tarifas aplicables PARA UNA habitación específica (cuando se
  // seleccionan varias en la misma reserva, cada una puede tener categoría
  // distinta y por ende tarifa distinta). Si habId es null, filtra solo por
  // vigencia/noches/categoría preferida.
  const tarifasPara = (habId) => {
    return tarifas.filter(t => {
      const hab = habitaciones.find(h => h.id === habId);
      const cat = categorias.find(c =>
        c.nombre === f.categoria_preferida ||
        (hab && (c.id === hab.categoria_id || c.nombre === hab.categoria))
      );
      if (t.categoria && cat && t.categoria !== cat.nombre) return false;
      if (t.vigencia_desde && f.check_in_at < t.vigencia_desde) return false;
      if (t.vigencia_hasta && checkOutMinusOne > t.vigencia_hasta) return false;
      if (t.min_noches > noches) return false;
      return true;
    });
  };

  const huespedesFiltrados = huespedes
    .filter(h => {
      if (!searchH.trim()) return true;
      const q = searchH.toLowerCase();
      return nombreHuesped(h).toLowerCase().includes(q) ||
             (h.documento || "").toLowerCase().includes(q) ||
             (h.email || "").toLowerCase().includes(q);
    })
    .slice(0, 10);

  async function save() {
    if (!f.huesped_id && !f.nuevoHuesped) { setErr("Selecciona o crea un huésped"); return; }
    if (f.nuevoHuesped && !f.nombre.trim()) { setErr("Nombre del huésped obligatorio"); return; }
    if (f.check_out_at <= f.check_in_at) { setErr("Check-out debe ser posterior al check-in"); return; }

    setSaving(true); setErr("");
    try {
      // Re-validar overlap server-side por CADA habitación seleccionada —
      // la lista 'disponibles' del state local puede estar stale si otros
      // canales tomaron habitaciones mientras el modal estaba abierto.
      if (f.habitaciones_sel.length > 0) {
        const habIds = f.habitaciones_sel.map(x => x.habitacion_id);
        const { data: conflicts } = await supabase
          .from("hotel_estancias")
          .select("id, codigo, habitacion_id, check_in_at, check_out_at, estado")
          .in("habitacion_id", habIds)
          .in("estado", ["reservada", "in_house"]);
        const nuevoIn  = new Date(f.check_in_at  + "T15:00:00").toISOString();
        const nuevoOut = new Date(f.check_out_at + "T12:00:00").toISOString();
        const conflict = (conflicts || []).find(r =>
          r.check_in_at && r.check_out_at &&
          new Date(r.check_in_at) < new Date(nuevoOut) &&
          new Date(nuevoIn) < new Date(r.check_out_at)
        );
        if (conflict) {
          const habConflicto = habitaciones.find(h => h.id === conflict.habitacion_id);
          setSaving(false);
          setErr(`La habitación ${habConflicto?.numero || conflict.habitacion_id} ya está reservada (${conflict.codigo}) entre ${conflict.check_in_at.slice(0,10)} y ${conflict.check_out_at.slice(0,10)}. Otro usuario la tomó mientras armabas esta reserva.`);
          return;
        }
      }

      let huesped_id = f.huesped_id;
      if (f.nuevoHuesped) {
        const { data, error } = await supabase.from("hotel_huespedes").insert({
          nombre: f.nombre.trim(),
          apellido: f.apellido.trim() || null,
          documento_tipo: f.documento_tipo,
          documento: f.documento.trim() || null,
          email: f.email.trim() || null,
          telefono: f.telefono.trim() || null,
        }).select().single();
        if (error) throw error;
        huesped_id = data.id;
      }

      // Multi-habitación: crear N filas en hotel_estancias, todas con el mismo
      // grupo_id (solo si hay >1 habitación), mismas fechas y mismo huésped.
      // Cada fila tiene su propia habitacion_id, tarifa y precio_noche.
      // Con 0 habitaciones seleccionadas se crea 1 sola fila "sin asignar"
      // (habitacion_id=null) para el flujo legacy de asignar-al-checkin.
      const filas = f.habitaciones_sel.length > 0
        ? f.habitaciones_sel
        : [{ habitacion_id: null, tarifa_id: null, precio_noche: 0 }];

      const baseFila = {
        huesped_id,
        categoria_preferida: f.categoria_preferida || null,
        check_in_at: new Date(f.check_in_at + "T15:00:00").toISOString(),
        check_out_at: new Date(f.check_out_at + "T12:00:00").toISOString(),
        pax_adultos: Number(f.pax_adultos) || 1,
        pax_ninos: Number(f.pax_ninos) || 0,
        estado: f.estado,
        canal: f.canal,
        solicitudes_especiales: f.solicitudes_especiales.trim() || null,
        notas: f.notas.trim() || null,
      };
      // booking_group_id: identifica multi-habitaciones de la misma reserva
      // (folio único, mismo huésped). Es distinto de grupo_id, que es FK a
      // hotel_grupos (bodas, corporativos). Con 1 sola habitación queda null.
      const bookingGroupId = filas.length > 1 ? `BG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null;
      // Depósito va a la primera fila (el folio primario del grupo).
      const rows = filas.map((r, idx) => ({
        ...baseFila,
        codigo:            uid(),
        habitacion_id:     r.habitacion_id || null,
        tarifa_id:         r.tarifa_id || null,
        precio_noche:      Number(r.precio_noche) || 0,
        total:             (Number(r.precio_noche) || 0) * noches,
        deposito:          idx === 0 ? (Number(f.deposito) || 0) : 0,
        booking_group_id:  bookingGroupId,
      }));

      console.log("[HotelReservas] Insertando estancias:", rows);
      const { data: insertadas, error: errE } = await supabase
        .from("hotel_estancias").insert(rows).select();
      if (errE) {
        console.error("[HotelReservas] Insert error:", errE, "payload:", rows);
        throw errE;
      }
      console.log(`[HotelReservas] ✓ ${insertadas?.length || 0} estancias creadas`);
      onSaved();
    } catch (e) {
      const detail = [e.message, e.details, e.hint].filter(Boolean).join(" · ");
      setErr(detail || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Nueva reserva</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
        Paso {paso} de 3
      </div>

      {paso === 1 && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>1. Huésped</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={() => { set("nuevoHuesped", false); }} style={BTN(!f.nuevoHuesped ? B.hotel : B.navyLight)}>Existente</button>
            <button onClick={() => { set("nuevoHuesped", true); set("huesped_id", ""); }} style={BTN(f.nuevoHuesped ? B.hotel : B.navyLight)}>Nuevo</button>
          </div>

          {!f.nuevoHuesped ? (
            <>
              <input placeholder="Buscar por nombre, doc o email…" value={searchH} onChange={e => setSearchH(e.target.value)} style={{ ...IS, marginBottom: 8 }} />
              <div style={{ maxHeight: 260, overflowY: "auto", background: B.navyLight, borderRadius: 8 }}>
                {huespedesFiltrados.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Sin resultados</div>
                ) : huespedesFiltrados.map(h => (
                  <div key={h.id} onClick={() => set("huesped_id", h.id)} style={{
                    padding: 10, fontSize: 13, cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    background: f.huesped_id === h.id ? B.hotel + "33" : "transparent",
                  }}>
                    <div style={{ fontWeight: 600 }}>{nombreHuesped(h)} {h.vip && "⭐"}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                      {h.documento_tipo} {h.documento || "—"} · {h.email || h.telefono || "—"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={LS}>Nombre *</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={IS} /></div>
              <div><label style={LS}>Apellido</label><input value={f.apellido} onChange={e => set("apellido", e.target.value)} style={IS} /></div>
              <div>
                <label style={LS}>Documento</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <select value={f.documento_tipo} onChange={e => set("documento_tipo", e.target.value)} style={{ ...IS, width: 70 }}>
                    {["CC", "PS", "CE", "TI"].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input value={f.documento} onChange={e => set("documento", e.target.value)} style={IS} />
                </div>
              </div>
              <div><label style={LS}>Teléfono</label><input value={f.telefono} onChange={e => set("telefono", e.target.value)} style={IS} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={LS}>Email</label><input value={f.email} onChange={e => set("email", e.target.value)} style={IS} /></div>
            </div>
          )}
        </div>
      )}

      {paso === 2 && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>2. Fechas y habitación</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={LS}>Check-in</label><input type="date" value={f.check_in_at} onChange={e => set("check_in_at", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Check-out</label><input type="date" value={f.check_out_at} onChange={e => set("check_out_at", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Adultos</label><input type="number" min="1" value={f.pax_adultos} onChange={e => set("pax_adultos", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Niños</label><input type="number" min="0" value={f.pax_ninos} onChange={e => set("pax_ninos", e.target.value)} style={IS} /></div>
          </div>
          <div style={{ fontSize: 12, color: B.sky, marginBottom: 12 }}>📅 {noches} noche{noches !== 1 ? "s" : ""}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={LS}>Categoría (opcional)</label>
              <select value={f.categoria_preferida} onChange={e => { set("categoria_preferida", e.target.value); set("habitacion_id", ""); }} style={IS}>
                <option value="">Todas</option>
                {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Canal</label>
              <select value={f.canal} onChange={e => set("canal", e.target.value)} style={IS}>
                {CANALES.map(c => <option key={c.k} value={c.k}>{c.l}</option>)}
              </select>
            </div>
          </div>

          <label style={LS}>
            Habitaciones ({disponibles.length} disponibles · {f.habitaciones_sel.length} seleccionadas)
          </label>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
            Toca varias para reservar múltiples habitaciones en la misma estancia (mismo huésped, mismas fechas, folio único).
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", background: B.navyLight, borderRadius: 8, padding: 6 }}>
            {f.habitaciones_sel.length === 0 && (
              <div style={{ padding: 8, fontSize: 11, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>
                Sin selección → reserva quedará "sin asignar" (asignar al check-in).
              </div>
            )}
            {disponibles.map(h => {
              const seleccionada = f.habitaciones_sel.some(x => x.habitacion_id === h.id);
              return (
                <div key={h.id} onClick={() => toggleHab(h.id)} style={{
                  padding: 8, fontSize: 12, cursor: "pointer", borderRadius: 6,
                  background: seleccionada ? B.hotel + "33" : "transparent",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: 2,
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      display: "inline-block", width: 16, height: 16, borderRadius: 3,
                      border: `2px solid ${seleccionada ? B.hotel : "rgba(255,255,255,0.3)"}`,
                      background: seleccionada ? B.hotel : "transparent",
                      color: "#fff", fontSize: 11, textAlign: "center", lineHeight: "13px", fontWeight: 700,
                    }}>{seleccionada ? "✓" : ""}</span>
                    🚪 <b>{h.numero}</b> · {h.categoria}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Cap {h.capacidad}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {paso === 3 && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>3. Tarifa y pago</div>

          {f.habitaciones_sel.length === 0 ? (
            <div style={{ padding: 12, background: B.warning + "22", color: B.warning, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
              Reserva sin habitación asignada. Podrás fijar tarifa manual abajo.
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Tarifa por habitación
              </div>
              {f.habitaciones_sel.map((row) => {
                const hab = habitaciones.find(h => h.id === row.habitacion_id);
                const opciones = tarifasPara(row.habitacion_id);
                return (
                  <div key={row.habitacion_id} style={{ background: B.navyLight, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>🚪 {hab?.numero} · {hab?.categoria}</div>
                      <button onClick={() => toggleHab(row.habitacion_id)}
                        style={{ background: "transparent", border: "none", color: B.danger, fontSize: 11, cursor: "pointer" }}>
                        Quitar
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                      <select value={row.tarifa_id || ""}
                        onChange={e => {
                          const t = opciones.find(x => x.id === e.target.value);
                          updateHabRow(row.habitacion_id, {
                            tarifa_id: e.target.value || null,
                            precio_noche: t ? t.precio_base : row.precio_noche,
                          });
                        }} style={IS}>
                        <option value="">— Manual —</option>
                        {opciones.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.nombre} · {fmtCOP(t.precio_base)}{t.incluye_desayuno ? " ☕" : ""}
                          </option>
                        ))}
                      </select>
                      <input type="number" value={row.precio_noche}
                        onChange={e => updateHabRow(row.habitacion_id, { precio_noche: e.target.value })}
                        placeholder="Precio/noche" style={IS} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.6)", textAlign: "right" }}>
                      Subtotal: <strong style={{ color: B.success }}>{fmtCOP((Number(row.precio_noche) || 0) * noches)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={LS}>Depósito (folio único del grupo)</label>
            <input type="number" value={f.deposito} onChange={e => set("deposito", e.target.value)} style={IS} />
          </div>

          <div style={{ background: B.navyLight, padding: 12, borderRadius: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>Habitaciones × Noches</span>
              <span>{f.habitaciones_sel.length} × {noches}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <span>Total</span><span style={{ color: B.success }}>{fmtCOP(total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
              <span>Depósito</span><span>{fmtCOP(f.deposito)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: B.warning }}>
              <span>Saldo</span><span>{fmtCOP(saldo)}</span>
            </div>
          </div>

          <div><label style={LS}>Solicitudes especiales</label><textarea value={f.solicitudes_especiales} onChange={e => set("solicitudes_especiales", e.target.value)} style={{ ...IS, minHeight: 50, resize: "vertical" }} /></div>
          <div style={{ marginTop: 10 }}><label style={LS}>Notas internas</label><textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 40, resize: "vertical" }} /></div>
        </div>
      )}

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <div style={{ display: "flex", gap: 8 }}>
          {paso > 1 && <button onClick={() => setPaso(p => p - 1)} style={BTN(B.navyLight)}>← Atrás</button>}
          {paso < 3 ? (
            <button onClick={() => setPaso(p => p + 1)} style={BTN(B.hotel)}>Siguiente →</button>
          ) : (
            <button onClick={save} disabled={saving} style={BTN(B.success)}>
              {saving ? "Guardando…" : "✓ Crear reserva"}
            </button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ─── Modal Detalle ─────────────────────────────────────────────────────────
function DetalleModal({ reserva, huesped, habitacion, onClose, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const est = ESTADOS.find(e => e.k === reserva.estado) || ESTADOS[0];
  const noches = diffDays(reserva.check_in_at, reserva.check_out_at);
  const saldo = Number(reserva.total || 0) - Number(reserva.deposito || 0);

  async function cambiarEstado(nuevoEstado) {
    // rank 116: no permitir transicion a in_house sin habitacion_id. Una
    // reserva "Sin asignar (asignar al check-in)" debe pasar primero por
    // edicion de habitacion antes de marcarse como huesped en casa.
    if (nuevoEstado === "in_house" && !reserva.habitacion_id) {
      setErr("Asigna una habitación antes de hacer check-in.");
      return;
    }
    setLoading(true); setErr("");
    // Si pasamos de cancelada/no_show/checked_out a un estado ACTIVO
    // (reservada / in_house), re-validar que la habitación no se haya
    // reservado mientras tanto. Audit rank 30: reactivar una reserva
    // cancelada permitia double-booking porque el codigo NO chequeaba.
    const estadosActivosNuevos = ["reservada", "in_house"];
    const estadosNoActivosPrev = ["cancelada", "no_show", "checked_out"];
    if (
      estadosActivosNuevos.includes(nuevoEstado) &&
      estadosNoActivosPrev.includes(reserva.estado) &&
      reserva.habitacion_id
    ) {
      const { data: conflicts } = await supabase
        .from("hotel_estancias")
        .select("id, codigo, check_in_at, check_out_at")
        .eq("habitacion_id", reserva.habitacion_id)
        .in("estado", estadosActivosNuevos)
        .neq("id", reserva.id);
      const conflict = (conflicts || []).find(r =>
        r.check_in_at && r.check_out_at &&
        new Date(r.check_in_at) < new Date(reserva.check_out_at) &&
        new Date(reserva.check_in_at) < new Date(r.check_out_at)
      );
      if (conflict) {
        setLoading(false);
        setErr(`No se puede reactivar: la habitación ya tiene otra reserva activa (${conflict.codigo}) entre ${conflict.check_in_at.slice(0,10)} y ${conflict.check_out_at.slice(0,10)}. Reasignala primero.`);
        return;
      }
    }

    const r = await supabase.from("hotel_estancias").update({
      estado: nuevoEstado,
      updated_at: new Date().toISOString(),
    }).eq("id", reserva.id);
    setLoading(false);
    if (r.error) { setErr(r.error.message); return; }
    onChanged();
    onClose();
  }

  async function eliminar() {
    // rank 115: guard contra doble-click. Sin esto, dos clicks rapidos
    // disparaban dos DELETE consecutivos. El segundo no-op a nivel DB pero
    // re-disparaba onChanged() y a veces onClose() encima de un modal ya
    // cerrando, llevando a inconsistencias visuales.
    if (loading) return;
    setLoading(true); setErr("");
    const r = await supabase.from("hotel_estancias").delete().eq("id", reserva.id);
    if (r.error) { setLoading(false); setErr(r.error.message); return; }
    onChanged();
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: B.sky }}>{reserva.codigo}</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
            {nombreHuesped(huesped)} {huesped?.vip && "⭐"}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            {huesped?.documento_tipo} {huesped?.documento || ""} · {huesped?.email || huesped?.telefono || "—"}
          </div>
        </div>
        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, background: est.c + "33", color: est.c, fontWeight: 700 }}>
          {est.l}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <InfoBox l="Check-in" v={fmtFull(reserva.check_in_at)} />
        <InfoBox l="Check-out" v={fmtFull(reserva.check_out_at)} />
        <InfoBox l="Noches" v={`${noches} · ${reserva.pax_adultos || 0}A ${reserva.pax_ninos || 0}N`} />
        <InfoBox
          l="Habitación"
          v={habitacion ? `${habitacion.categoria} ${habitacion.numero}` : (reserva.categoria_preferida || "Sin asignar")}
          alert={!habitacion ? "Asignar habitación antes del check-in" : null}
        />
        <InfoBox l="Canal" v={reserva.canal || "directo"} />
        <InfoBox l="Precio / noche" v={fmtCOP(reserva.precio_noche)} />
      </div>

      <div style={{ background: B.navyLight, padding: 12, borderRadius: 8, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800 }}>
          <span>Total</span><span style={{ color: B.success }}>{fmtCOP(reserva.total)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>Depósito</span><span>{fmtCOP(reserva.deposito)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: saldo > 0 ? B.warning : B.success }}>
          <span>Saldo</span><span>{fmtCOP(saldo)}</span>
        </div>
      </div>

      {reserva.solicitudes_especiales && (
        <div style={{ padding: 10, background: B.warning + "22", borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: B.warning, textTransform: "uppercase", marginBottom: 4 }}>Solicitudes</div>
          {reserva.solicitudes_especiales}
        </div>
      )}
      {reserva.notas && (
        <div style={{ padding: 10, background: B.navyLight, borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>Notas</div>
          {reserva.notas}
        </div>
      )}

      {/* Acciones por estado */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {reserva.estado === "reservada" && (
          <>
            <button onClick={() => cambiarEstado("in_house")} disabled={loading} style={BTN(B.success)}>✓ Marcar Check-in</button>
            <button onClick={() => cambiarEstado("no_show")} disabled={loading} style={BTN(B.warning)}>No-show</button>
            <button onClick={() => cambiarEstado("cancelada")} disabled={loading} style={BTN(B.danger)}>Cancelar</button>
          </>
        )}
        {reserva.estado === "in_house" && (
          <button onClick={() => cambiarEstado("checked_out")} disabled={loading} style={BTN(B.hotel)}>→ Check-out</button>
        )}
        {(reserva.estado === "cancelada" || reserva.estado === "no_show") && (
          <button onClick={() => cambiarEstado("reservada")} disabled={loading} style={BTN(B.sky, B.navy)}>↩ Reactivar</button>
        )}
        {saldo > 0 && reserva.estado !== "cancelada" && (
          <button onClick={() => setLinkModal(true)} disabled={loading} style={BTN(B.sky, B.navy)}>
            🔗 Link de pago
          </button>
        )}
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      {linkModal && (
        <LinkPagoHotelModal
          reserva={reserva}
          huesped={huesped}
          saldoDefault={saldo}
          onClose={() => setLinkModal(false)}
          onSaved={() => { setLinkModal(false); onChanged(); }}
        />
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between" }}>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} style={BTN("transparent", B.danger)}>🗑 Eliminar</button>
        ) : (
          <div>
            <span style={{ fontSize: 12, color: B.danger, marginRight: 8 }}>¿Seguro?</span>
            <button onClick={eliminar} disabled={loading} style={{ ...BTN(B.danger), opacity: loading ? 0.6 : 1 }}>{loading ? "Eliminando…" : "Sí"}</button>
            <button onClick={() => setConfirmDel(false)} disabled={loading} style={{ ...BTN(B.navyLight), marginLeft: 6 }}>No</button>
          </div>
        )}
        <button onClick={onClose} style={BTN(B.navyLight)}>Cerrar</button>
      </div>
    </Overlay>
  );
}

function InfoBox({ l, v, alert }) {
  return (
    <div style={{
      background: alert ? B.warning + "22" : B.navyLight,
      padding: 10, borderRadius: 8,
      border: alert ? `1px solid ${B.warning}55` : "none",
    }}>
      <div style={{ fontSize: 10, color: alert ? B.warning : "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{l}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{v}</div>
      {alert && <div style={{ fontSize: 10, color: B.warning, marginTop: 4 }}>⚠ {alert}</div>}
    </div>
  );
}

// ─── Modal Link de Pago (Wompi) ─────────────────────────────────────────────
// Genera un checkout Wompi para cobrar la reserva (deposito, saldo o total).
// Al confirmarse el pago via wompi-webhook, la reserva se actualiza sola —
// aca solo persistimos el link y expiracion para trazabilidad.
function LinkPagoHotelModal({ reserva, huesped, saldoDefault, onClose, onSaved }) {
  const [monto, setMonto] = useState(saldoDefault || 0);
  const [horasVigencia, setHorasVigencia] = useState(24);
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [copiado, setCopiado] = useState(false);

  const email = huesped?.email || "";
  const nombre = nombreHuesped(huesped);
  const telefono = huesped?.telefono || "";

  async function generar() {
    if (!monto || monto <= 0) { setErr("Monto debe ser mayor a 0"); return; }
    setSaving(true); setErr("");
    try {
      const redirect = `https://www.atolon.co/pago?reserva=${encodeURIComponent(reserva.codigo)}`;
      const url = await wompiCheckoutUrl({
        referencia: reserva.codigo,
        totalCOP: Number(monto),
        email,
        redirectUrl: redirect,
      });
      const expira = new Date(Date.now() + horasVigencia * 3600 * 1000).toISOString();

      // Persistir en la reserva para trazabilidad (link + expira).
      const { error } = await supabase.from("hotel_estancias").update({
        expira_en: expira,
        updated_at: new Date().toISOString(),
      }).eq("id", reserva.id);
      if (error) throw error;

      setLink(url);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { setErr("No se pudo copiar al portapapeles"); }
  }

  const waLink = () => {
    if (!telefono) return null;
    const tel = String(telefono).replace(/\D/g, "");
    const t = tel.length === 10 ? `57${tel}` : tel;
    const msg = encodeURIComponent(
      `Hola ${nombre || ""}, aqui el link para completar el pago de tu reserva ${reserva.codigo} en Atolon Beach Club:\n\n${link}\n\nMonto: ${fmtCOP(monto)} COP\nVence en ${horasVigencia}h.`
    );
    return `https://wa.me/${t}?text=${msg}`;
  };
  const mailtoLink = () => {
    if (!email) return null;
    const subject = encodeURIComponent(`Link de pago — Atolon Beach Club (${reserva.codigo})`);
    const body = encodeURIComponent(
      `Hola ${nombre || ""},\n\nAqui el link para completar el pago de tu reserva:\n\n${link}\n\nReserva: ${reserva.codigo}\nMonto: ${fmtCOP(monto)} COP\nVence: en ${horasVigencia} horas.\n\nGracias,\nAtolon Beach Club`
    );
    return `mailto:${email}?subject=${subject}&body=${body}`;
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>🔗 Link de pago Wompi</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>
        Reserva <b>{reserva.codigo}</b> · {nombre || "—"}
      </div>

      {!link ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={LS}>Monto a cobrar (COP)</label>
              <input type="number" value={monto} onChange={e => setMonto(Number(e.target.value))}
                min="1" style={IS} />
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                Total reserva: {fmtCOP(reserva.total)} · Depósito: {fmtCOP(reserva.deposito)} · Saldo: {fmtCOP(saldoDefault)}
              </div>
            </div>
            <div>
              <label style={LS}>Vigencia (horas)</label>
              <input type="number" value={horasVigencia} onChange={e => setHorasVigencia(Number(e.target.value))}
                min="1" max="720" style={IS} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setMonto(saldoDefault)} style={BTN(B.navyLight)}>Saldo pendiente</button>
            <button onClick={() => setMonto(reserva.total)} style={BTN(B.navyLight)}>Total</button>
            <button onClick={() => setMonto(Math.round(Number(reserva.total || 0) * 0.5))} style={BTN(B.navyLight)}>50% depósito</button>
          </div>

          {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{err}</div>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
            <button onClick={generar} disabled={saving} style={BTN(B.success)}>
              {saving ? "Generando…" : "🔗 Generar link"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ background: B.navyLight, padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 11, wordBreak: "break-all", fontFamily: "monospace", color: B.sky }}>
            {link}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={copiar} style={BTN(B.sky, B.navy)}>{copiado ? "✓ Copiado" : "📋 Copiar link"}</button>
            {waLink() && (
              <a href={waLink()} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <button style={BTN("#25D366", "#fff")}>📱 Enviar por WhatsApp</button>
              </a>
            )}
            {mailtoLink() && (
              <a href={mailtoLink()} style={{ textDecoration: "none" }}>
                <button style={BTN(B.sand, B.navy)}>✉️ Enviar por email</button>
              </a>
            )}
            <a href={link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <button style={BTN(B.navyLight)}>🌐 Abrir checkout</button>
            </a>
          </div>
          <div style={{ padding: 10, background: "rgba(95,207,128,0.1)", borderRadius: 8, fontSize: 11, color: B.success, marginBottom: 12 }}>
            ✓ Link generado. Cuando el cliente pague, la reserva se actualizará automáticamente vía webhook Wompi.
            Monto: <b>{fmtCOP(monto)}</b> · Vence en <b>{horasVigencia}h</b>.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onSaved} style={BTN(B.hotel)}>Listo</button>
          </div>
        </>
      )}
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: B.navyMid, borderRadius: 14, padding: 22, width: "100%", maxWidth: 780,
        marginTop: 40, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {children}
      </div>
    </div>
  );
}
