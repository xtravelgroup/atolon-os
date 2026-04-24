import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";

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
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={BTN(tab === t.k ? B.hotel : B.navyMid)}>{t.l}</button>
        ))}
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...IS, width: 160 }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}
        </select>
        <input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...IS, maxWidth: 260, flex: 1, minWidth: 180 }} />
      </div>

      {loading ? (
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
            return (
              <div key={r.id} onClick={() => setOpenId(r.id)} style={{
                display: "grid", gridTemplateColumns: "110px 1fr 100px 100px 80px 110px 100px 80px",
                padding: "10px 14px", fontSize: 12, alignItems: "center",
                borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer",
              }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: B.sky }}>{r.codigo}</div>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nombreHuesped(h)} {h?.vip && "⭐"}
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
      )}

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
    habitacion_id: "",
    tarifa_id: "",
    precio_noche: 0,
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
  const total = Number(f.precio_noche || 0) * noches;
  const saldo = total - Number(f.deposito || 0);

  // Habitaciones disponibles (sin solapamiento + categoría si aplica)
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

  // Tarifas aplicables
  const tarifasAplicables = useMemo(() => {
    return tarifas.filter(t => {
      const cat = categorias.find(c => c.nombre === f.categoria_preferida || c.id === habitaciones.find(h => h.id === f.habitacion_id)?.categoria);
      if (t.categoria && cat && t.categoria !== cat.nombre) return false;
      if (t.vigencia_desde && f.check_in_at < t.vigencia_desde) return false;
      if (t.vigencia_hasta && f.check_in_at > t.vigencia_hasta) return false;
      if (t.min_noches > noches) return false;
      return true;
    });
  }, [tarifas, f.categoria_preferida, f.habitacion_id, f.check_in_at, habitaciones, categorias, noches]);

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

      const { error: errE } = await supabase.from("hotel_estancias").insert({
        codigo: uid(),
        huesped_id,
        habitacion_id: f.habitacion_id || null,
        categoria_preferida: f.categoria_preferida || null,
        check_in_at: new Date(f.check_in_at + "T15:00:00").toISOString(),
        check_out_at: new Date(f.check_out_at + "T12:00:00").toISOString(),
        pax_adultos: Number(f.pax_adultos) || 1,
        pax_ninos: Number(f.pax_ninos) || 0,
        estado: f.estado,
        tarifa_id: f.tarifa_id || null,
        precio_noche: Number(f.precio_noche) || 0,
        total,
        deposito: Number(f.deposito) || 0,
        canal: f.canal,
        solicitudes_especiales: f.solicitudes_especiales.trim() || null,
        notas: f.notas.trim() || null,
      });
      if (errE) throw errE;
      onSaved();
    } catch (e) {
      setErr(e.message);
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

          <label style={LS}>Habitación ({disponibles.length} disponibles)</label>
          <div style={{ maxHeight: 180, overflowY: "auto", background: B.navyLight, borderRadius: 8, padding: 6 }}>
            <div onClick={() => set("habitacion_id", "")} style={{
              padding: 8, fontSize: 12, cursor: "pointer", borderRadius: 6,
              background: !f.habitacion_id ? B.hotel + "33" : "transparent",
            }}>
              Sin asignar (asignar al check-in)
            </div>
            {disponibles.map(h => (
              <div key={h.id} onClick={() => set("habitacion_id", h.id)} style={{
                padding: 8, fontSize: 12, cursor: "pointer", borderRadius: 6,
                background: f.habitacion_id === h.id ? B.hotel + "33" : "transparent",
                display: "flex", justifyContent: "space-between",
              }}>
                <span>🚪 <b>{h.numero}</b> · {h.categoria}</span>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>Cap {h.capacidad}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {paso === 3 && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>3. Tarifa y pago</div>
          <label style={LS}>Tarifa</label>
          <div style={{ maxHeight: 180, overflowY: "auto", background: B.navyLight, borderRadius: 8, padding: 6, marginBottom: 10 }}>
            {tarifasAplicables.length === 0 ? (
              <div style={{ padding: 10, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Sin tarifas aplicables — puedes fijar precio manual</div>
            ) : tarifasAplicables.map(t => (
              <div key={t.id} onClick={() => { set("tarifa_id", t.id); set("precio_noche", t.precio_base); }} style={{
                padding: 8, fontSize: 12, cursor: "pointer", borderRadius: 6,
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: f.tarifa_id === t.id ? B.hotel + "33" : "transparent",
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.nombre}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{t.tipo}{t.incluye_desayuno ? " · ☕" : ""}</div>
                </div>
                <div style={{ fontWeight: 700, color: B.success }}>{fmtCOP(t.precio_base)}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={LS}>Precio / noche</label><input type="number" value={f.precio_noche} onChange={e => set("precio_noche", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Depósito</label><input type="number" value={f.deposito} onChange={e => set("deposito", e.target.value)} style={IS} /></div>
          </div>

          <div style={{ background: B.navyLight, padding: 12, borderRadius: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Noches</span><span>{noches}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Precio / noche</span><span>{fmtCOP(f.precio_noche)}</span></div>
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
  const est = ESTADOS.find(e => e.k === reserva.estado) || ESTADOS[0];
  const noches = diffDays(reserva.check_in_at, reserva.check_out_at);
  const saldo = Number(reserva.total || 0) - Number(reserva.deposito || 0);

  async function cambiarEstado(nuevoEstado) {
    setLoading(true); setErr("");
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
    const r = await supabase.from("hotel_estancias").delete().eq("id", reserva.id);
    if (r.error) { setErr(r.error.message); return; }
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
        <InfoBox l="Habitación" v={habitacion ? `${habitacion.categoria} ${habitacion.numero}` : (reserva.categoria_preferida || "Sin asignar")} />
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
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between" }}>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} style={BTN("transparent", B.danger)}>🗑 Eliminar</button>
        ) : (
          <div>
            <span style={{ fontSize: 12, color: B.danger, marginRight: 8 }}>¿Seguro?</span>
            <button onClick={eliminar} style={BTN(B.danger)}>Sí</button>
            <button onClick={() => setConfirmDel(false)} style={{ ...BTN(B.navyLight), marginLeft: 6 }}>No</button>
          </div>
        )}
        <button onClick={onClose} style={BTN(B.navyLight)}>Cerrar</button>
      </div>
    </Overlay>
  );
}

function InfoBox({ l, v }) {
  return (
    <div style={{ background: B.navyLight, padding: 10, borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{l}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{v}</div>
    </div>
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
