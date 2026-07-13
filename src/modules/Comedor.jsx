// Comedor.jsx — Servicio de alimentación staff/contratistas
// 3 comidas (desayuno · almuerzo · cena). Para staff la comida está
// incluida según su horario. Si come fuera de horario o es contratista,
// se cobra (precio configurable). Cocina carga el menú del día y el
// consumo de inventario para calcular el costo del comedor.
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";
import { useMobile } from "../lib/useMobile";

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const fmtFecha = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long" }) : "";
const COMIDAS = [
  { k: "desayuno", l: "Desayuno", icon: "🌅", color: "#fbbf24", franja: "06:00–10:00" },
  { k: "almuerzo", l: "Almuerzo", icon: "🌞", color: "#22c55e", franja: "12:00–14:00" },
  { k: "cena",     l: "Cena",     icon: "🌙", color: "#a78bfa", franja: "18:00–21:00" },
];
const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS  = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS  = { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };
const COPx = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

export default function Comedor() {
  const { isMobile } = useMobile();
  const [tab, setTab] = useState("hoy"); // hoy | menu | consumo | reporte | precios
  const [fecha, setFecha] = useState(todayStr());
  const [menus, setMenus] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [consumo, setConsumo] = useState([]);
  const [precios, setPrecios] = useState([]);
  const [comensalesEsperados, setComensalesEsperados] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [mR, rR, cR, pR, eR, exR, iR, uR] = await Promise.all([
      supabase.from("comedor_menus").select("*").eq("fecha", fecha),
      supabase.from("comedor_registros").select("*").eq("fecha", fecha).order("created_at", { ascending: false }),
      supabase.from("comedor_consumo").select("*").eq("fecha", fecha).eq("anulado", false),
      supabase.from("comedor_precios").select("*"),
      supabase.from("rh_empleados").select("id, nombres, apellidos, cargo").eq("activo", true).order("nombres"),
      supabase.from("comedor_comensales_esperados").select("*").eq("fecha", fecha),
      supabase.from("items_catalogo").select("id, nombre, categoria, unidad, stock_actual, precio_compra, foto_url").eq("activo", true).order("nombre"),
      supabase.auth.getUser(),
    ]);
    setMenus(mR.data || []);
    setRegistros(rR.data || []);
    setConsumo(cR.data || []);
    setPrecios(pR.data || []);
    setEmpleados(eR.data || []);
    setComensalesEsperados(exR.data || []);
    setItems(iR.data || []);
    setUserEmail(uR.data?.user?.email || "");
    setLoading(false);
  }, [fecha]);
  useEffect(() => { load(); }, [load]);

  const precioComida = (k) => Number(precios.find(p => p.comida === k)?.precio || 0);

  // KPIs del día
  const totalComieron = registros.length;
  const totalIncluidos = registros.filter(r => r.tipo === "incluido").length;
  const totalCobrados = registros.filter(r => r.tipo !== "incluido").length;
  const ingresoCobrado = registros.filter(r => r.tipo !== "incluido").reduce((s, r) => s + (Number(r.monto_cobro) || 0), 0);
  const costoConsumo = consumo.reduce((s, c) => s + (Number(c.costo_total) || 0), 0);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;

  return (
    <div style={{ padding: isMobile ? 14 : 24, maxWidth: 1300, margin: "0 auto", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 800 }}>🍴 Comedor</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            Servicio de alimentación · Staff (incluido según horario) · Contratistas (cobrado)
          </div>
        </div>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          style={{ ...IS, width: 180, fontWeight: 700 }} />
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 180}px, 1fr))`, gap: 12, marginBottom: 18 }}>
        {[
          { l: "Comieron hoy",  v: totalComieron, c: B.sky },
          { l: "Incluidos",     v: totalIncluidos, c: "#22c55e" },
          { l: "Cobrados",      v: totalCobrados, c: "#fbbf24" },
          { l: "Ingreso cobro", v: COPx(ingresoCobrado), c: "#a78bfa" },
          { l: "Costo insumos", v: COPx(costoConsumo), c: "#ef4444" },
        ].map(k => (
          <div key={k.l} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", borderLeft: `4px solid ${k.c}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.c, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${B.navyLight}`, flexWrap: "wrap" }}>
        {[
          ["hoy",     `📋 Comensales del día`],
          ["menu",    `🍽️ Menú`],
          ["consumo", `📦 Consumo (${consumo.length})`],
          ["reporte", `📊 Reporte`],
          ["precios", `💰 Precios`],
        ].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 400,
              background: "none", color: tab === k ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: tab === k ? `2px solid ${B.sky}` : "2px solid transparent" }}>{l}</button>
        ))}
      </div>

      {tab === "hoy"     && <TabComensales fecha={fecha} registros={registros} esperados={comensalesEsperados} empleados={empleados} precios={precios} userEmail={userEmail} onReload={load} />}
      {tab === "menu"    && <TabMenu fecha={fecha} menus={menus} userEmail={userEmail} onReload={load} />}
      {tab === "consumo" && <TabConsumoComedor fecha={fecha} consumo={consumo} items={items} userEmail={userEmail} onReload={load} />}
      {tab === "reporte" && <TabReporte fecha={fecha} />}
      {tab === "precios" && <TabPrecios precios={precios} onReload={load} />}
    </div>
  );
}

// ─── TAB COMENSALES DEL DÍA ──────────────────────────────────────────
function TabComensales({ fecha, registros, esperados, empleados, precios, userEmail, onReload }) {
  const [showAdd, setShowAdd] = useState(false);
  const [pickComida, setPickComida] = useState("almuerzo");
  const [pickComensalTipo, setPickComensalTipo] = useState("empleado");
  const [pickComensalId, setPickComensalId] = useState("");
  const [pickNombre, setPickNombre] = useState("");
  const [pickCedula, setPickCedula] = useState("");
  const [pickTipo, setPickTipo] = useState("incluido");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  // Set de IDs en proceso de borrado — evita doble click que disparaba
  // dos DELETE seguidos del mismo registro.
  const [deleting, setDeleting] = useState(new Set());

  const precioComida = (k) => Number(precios.find(p => p.comida === k)?.precio || 0);

  // Construir lista esperada por comida
  const esperadosPorComida = {};
  COMIDAS.forEach(c => esperadosPorComida[c.k] = []);
  esperados.forEach(e => {
    if (e.incluye_desayuno) esperadosPorComida.desayuno.push(e);
    if (e.incluye_almuerzo) esperadosPorComida.almuerzo.push(e);
    if (e.incluye_cena)     esperadosPorComida.cena.push(e);
  });

  // Marcar quién ya comió
  const yaComio = (comidaK, empId) => registros.some(r => r.comida === comidaK && r.comensal_id === empId);

  const empleadosFiltrados = empleados.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${e.nombres} ${e.apellidos} ${e.cargo || ""}`.toLowerCase().includes(q);
  }).slice(0, 50);

  const registrarRapido = async (comensal, comidaK, esperadoIncluye) => {
    const monto = esperadoIncluye ? 0 : precioComida(comidaK);
    const tipo = esperadoIncluye ? "incluido" : "extra";
    setSaving(true);
    await supabase.from("comedor_registros").insert({
      fecha, comida: comidaK,
      comensal_tipo: "empleado",
      comensal_id: comensal.empleado_id || comensal.id,
      comensal_nombre: comensal.nombre || `${comensal.nombres} ${comensal.apellidos}`,
      cargo: comensal.cargo,
      tipo,
      monto_cobro: monto,
      registrado_por: userEmail,
    });
    setSaving(false);
    onReload();
  };

  const submitAdd = async () => {
    setSaving(true);
    const monto = pickTipo === "incluido" ? 0 : precioComida(pickComida);
    const isEmp = pickComensalTipo === "empleado";
    const emp = isEmp ? empleados.find(e => e.id === pickComensalId) : null;
    await supabase.from("comedor_registros").insert({
      fecha, comida: pickComida,
      comensal_tipo: pickComensalTipo,
      comensal_id: isEmp ? pickComensalId : pickCedula,
      comensal_nombre: emp ? `${emp.nombres} ${emp.apellidos}` : pickNombre,
      cargo: emp?.cargo || null,
      tipo: pickComensalTipo === "contratista" ? "cobrado" : pickTipo,
      monto_cobro: pickComensalTipo === "contratista" ? precioComida(pickComida) : monto,
      registrado_por: userEmail,
    });
    setSaving(false);
    setShowAdd(false);
    setPickNombre(""); setPickCedula(""); setPickComensalId(""); setSearch("");
    onReload();
  };

  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
          {fmtFecha(fecha)}
        </div>
        <button type="button" onClick={() => setShowAdd(true)} style={BTN(B.success)}>+ Registrar comida</button>
      </div>

      {/* 3 columnas: una por comida */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {COMIDAS.map(c => {
          const regs = registros.filter(r => r.comida === c.k);
          const esperadosC = esperadosPorComida[c.k];
          return (
            <div key={c.k} style={{ background: B.navyMid, borderRadius: 12, padding: 14, borderTop: `3px solid ${c.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{c.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{c.l}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{c.franja}</div>
                  </div>
                </div>
                <div style={{ fontSize: 18, color: c.color, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {regs.length} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>/ {esperadosC.length}</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
                {regs.length} registrados · {esperadosC.length} esperados según horario
              </div>

              {/* Esperados que aún no comieron */}
              {esperadosC.filter(e => !yaComio(c.k, e.empleado_id)).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginBottom: 4 }}>Pendientes (1 click)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                    {esperadosC.filter(e => !yaComio(c.k, e.empleado_id)).map(e => (
                      <button key={e.empleado_id} type="button" onClick={() => registrarRapido(e, c.k, true)} disabled={saving}
                        style={{ background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 6, padding: "6px 10px", color: "#fff", textAlign: "left", cursor: "pointer", fontSize: 11 }}>
                        ✓ {e.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ya registrados */}
              {regs.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginBottom: 4 }}>Registrados</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {regs.map(r => (
                      <div key={r.id} style={{ background: r.tipo === "incluido" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                          border: `1px solid ${r.tipo === "incluido" ? "#22c55e44" : "#f59e0b44"}`,
                          borderRadius: 6, padding: "6px 10px", fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{r.comensal_nombre}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>
                            {r.tipo === "incluido" ? "✓ Incluido" : `💰 ${COPx(r.monto_cobro)} (${r.tipo})`}
                            {r.comensal_tipo === "contratista" && " · Contratista"}
                          </div>
                        </div>
                        <button type="button" disabled={deleting.has(r.id)} onClick={async () => {
                          if (deleting.has(r.id)) return;
                          if (!confirm("¿Eliminar registro?")) return;
                          setDeleting(prev => new Set(prev).add(r.id));
                          await supabase.from("comedor_registros").delete().eq("id", r.id);
                          await onReload();
                          setDeleting(prev => { const n = new Set(prev); n.delete(r.id); return n; });
                        }} style={{ background: "none", border: "none", color: B.danger, cursor: deleting.has(r.id) ? "wait" : "pointer", fontSize: 12, opacity: deleting.has(r.id) ? 0.4 : 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {regs.length === 0 && esperadosC.length === 0 && (
                <div style={{ textAlign: "center", padding: 12, fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                  Sin movimiento aún
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 16, padding: 22, maxWidth: 540, width: "100%", color: "#fff", border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>+ Registrar comida</div>
              <button type="button" onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 22 }}>×</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Comida</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {COMIDAS.map(c => (
                  <button key={c.k} type="button" onClick={() => setPickComida(c.k)}
                    style={{ padding: "10px", borderRadius: 8, border: pickComida === c.k ? `2px solid ${c.color}` : `1px solid ${B.navyLight}`,
                      background: pickComida === c.k ? c.color + "22" : B.navyMid,
                      color: pickComida === c.k ? c.color : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                    <div style={{ fontSize: 18 }}>{c.icon}</div>
                    {c.l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Tipo de comensal</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {["empleado", "contratista", "invitado"].map(t => (
                  <button key={t} type="button" onClick={() => setPickComensalTipo(t)}
                    style={{ padding: "8px 10px", borderRadius: 8, border: pickComensalTipo === t ? `2px solid ${B.sky}` : `1px solid ${B.navyLight}`,
                      background: pickComensalTipo === t ? B.sky + "22" : B.navyMid,
                      color: pickComensalTipo === t ? B.sky : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>{t}</button>
                ))}
              </div>
            </div>

            {pickComensalTipo === "empleado" ? (
              <div style={{ marginBottom: 12 }}>
                <label style={LS}>Empleado</label>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar..." style={{ ...IS, marginBottom: 6 }} />
                <div style={{ background: B.navyMid, borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
                  {empleadosFiltrados.map(e => (
                    <button key={e.id} type="button" onClick={() => setPickComensalId(e.id)}
                      style={{ display: "block", width: "100%", padding: "8px 12px", background: pickComensalId === e.id ? B.sky + "22" : "transparent", border: "none", borderBottom: `1px solid ${B.navyLight}`, color: pickComensalId === e.id ? B.sky : "#fff", cursor: "pointer", textAlign: "left", fontSize: 12 }}>
                      <div style={{ fontWeight: 700 }}>{e.nombres} {e.apellidos}</div>
                      {e.cargo && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{e.cargo}</div>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 8 }}>
                  <label style={LS}>Nombre</label>
                  <input value={pickNombre} onChange={e => setPickNombre(e.target.value)} style={IS} placeholder="Nombre completo" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={LS}>Cédula / ID</label>
                  <input value={pickCedula} onChange={e => setPickCedula(e.target.value)} style={IS} placeholder="(opcional)" />
                </div>
              </>
            )}

            {pickComensalTipo === "empleado" && (
              <div style={{ marginBottom: 12 }}>
                <label style={LS}>¿Está incluida o cobra extra?</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => setPickTipo("incluido")}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: pickTipo === "incluido" ? `2px solid #22c55e` : `1px solid ${B.navyLight}`,
                      background: pickTipo === "incluido" ? "#22c55e22" : B.navyMid, color: pickTipo === "incluido" ? "#22c55e" : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                    ✓ Incluido (sin cobro)
                  </button>
                  <button type="button" onClick={() => setPickTipo("extra")}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: pickTipo === "extra" ? `2px solid #fbbf24` : `1px solid ${B.navyLight}`,
                      background: pickTipo === "extra" ? "#fbbf2422" : B.navyMid, color: pickTipo === "extra" ? "#fbbf24" : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                    💰 Extra ({COPx(precioComida(pickComida))})
                  </button>
                </div>
              </div>
            )}
            {pickComensalTipo === "contratista" && (
              <div style={{ background: "rgba(245,158,11,0.08)", border: `1px solid #f59e0b55`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 11, color: "#f59e0b" }}>
                💰 Contratista: se cobra {COPx(precioComida(pickComida))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setShowAdd(false)} style={BTN(B.navyLight)} disabled={saving}>Cancelar</button>
              <button type="button" onClick={submitAdd} style={BTN(B.success)} disabled={saving || (pickComensalTipo === "empleado" ? !pickComensalId : !pickNombre.trim())}>
                {saving ? "Guardando…" : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB MENÚ ────────────────────────────────────────────────────────
function TabMenu({ fecha, menus, userEmail, onReload }) {
  const [editing, setEditing] = useState({});

  const get = (k) => menus.find(m => m.comida === k) || {};
  const guardar = async (comida) => {
    const cur = editing[comida] || get(comida);
    if (!cur.plato?.trim()) return alert("El plato es requerido");
    const existing = menus.find(m => m.comida === comida);
    const payload = {
      fecha, comida,
      plato: cur.plato.trim(),
      descripcion: cur.descripcion || null,
      alergenos: cur.alergenos || null,
      notas: cur.notas || null,
      creado_por: userEmail,
      updated_at: new Date().toISOString(),
    };
    if (existing) await supabase.from("comedor_menus").update(payload).eq("id", existing.id);
    else          await supabase.from("comedor_menus").insert(payload);
    setEditing(s => ({ ...s, [comida]: null }));
    onReload();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
      {COMIDAS.map(c => {
        const m = get(c.k);
        const ed = editing[c.k] || m;
        const dirty = editing[c.k] != null;
        return (
          <div key={c.k} style={{ background: B.navyMid, borderRadius: 12, padding: 16, borderTop: `3px solid ${c.color}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>{c.l}
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={LS}>Plato del día</label>
              <input value={ed.plato || ""} onChange={e => setEditing(s => ({ ...s, [c.k]: { ...ed, plato: e.target.value } }))}
                placeholder="Ej: Bandeja paisa con huevo" style={IS} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={LS}>Descripción (opcional)</label>
              <textarea value={ed.descripcion || ""} onChange={e => setEditing(s => ({ ...s, [c.k]: { ...ed, descripcion: e.target.value } }))} rows={2}
                style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={LS}>Alérgenos (opcional)</label>
              <input value={ed.alergenos || ""} onChange={e => setEditing(s => ({ ...s, [c.k]: { ...ed, alergenos: e.target.value } }))}
                placeholder="Gluten, lactosa, frutos secos…" style={IS} />
            </div>
            <button type="button" onClick={() => guardar(c.k)} disabled={!dirty && !!m.plato}
              style={{ ...BTN(dirty ? B.success : B.navyLight), width: "100%" }}>
              {m.plato ? (dirty ? "Guardar cambios" : "Guardado") : "Guardar"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── TAB CONSUMO (insumos del comedor) ───────────────────────────────
function TabConsumoComedor({ fecha, consumo, items, userEmail, onReload }) {
  const [showPick, setShowPick] = useState(false);
  const [locacionId, setLocacionId] = useState("LOC-ALMACEN-COCINA");
  const [saving, setSaving] = useState(false);
  const [locaciones, setLocaciones] = useState([]);
  const [editando, setEditando] = useState(null); // registro de comedor_consumo en edicion
  // Filas de la tabla: cada una es un item a cargar. Se preserva mientras el
  // modal esté abierto (multi-item batch).
  const [filas, setFilas] = useState(() => [
    { item_id: "", comida: "almuerzo", cantidad: "", search: "", notas: "" },
  ]);

  useEffect(() => {
    supabase.from("items_locaciones").select("id, nombre").then(({ data }) => setLocaciones(data || []));
  }, []);

  // Politica direccion 2026-07-11: comedor solo carga productos de COCINA.
  // Excluimos todo lo que sea de Bar (licores, cerveza, vino, shots, etc.) via
  // blacklist de keywords en categoria. Se prefiere blacklist para no dejar
  // fuera categorias nuevas de cocina que se creen en el futuro.
  const itemsAlimentos = useMemo(() => {
    const excluir = ["bar", "licor", "ron", "tequila", "mezcal", "vodka", "gin", "whisky", "bourbon", "cerveza", "vino", "espumoso", "shot"];
    return items.filter(i => {
      const cat = (i.categoria || "").toLowerCase();
      if (!cat) return false;                                        // sin categoria → no mostrar
      return !excluir.some(kw => cat.includes(kw));
    });
  }, [items]);

  const itemsById = Object.fromEntries(items.map(i => [i.id, i]));
  const totalCosto = consumo.reduce((s, c) => s + (Number(c.costo_total) || 0), 0);

  const setFila = (idx, patch) => {
    setFilas(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  };
  const agregarFila = () => {
    // Mantener la ultima comida seleccionada como default de la nueva fila
    const ult = filas[filas.length - 1] || {};
    setFilas(prev => [...prev, { item_id: "", comida: ult.comida || "almuerzo", cantidad: "", search: "", notas: "" }]);
  };
  const quitarFila = (idx) => {
    setFilas(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  };

  const totalPreview = filas.reduce((s, f) => {
    const it = itemsById[f.item_id];
    const precio = Number(it?.precio_compra) || 0;
    return s + (Number(f.cantidad) || 0) * precio;
  }, 0);

  const cerrarModal = () => {
    setShowPick(false);
    setFilas([{ item_id: "", comida: "almuerzo", cantidad: "", search: "", notas: "" }]);
  };

  const registrarTodo = async () => {
    const validas = filas.filter(f => f.item_id && Number(f.cantidad) > 0);
    if (validas.length === 0) return alert("Agrega al menos un item con cantidad válida.");
    setSaving(true);
    const rows = validas.map(f => {
      const it = itemsById[f.item_id];
      const precio = Number(it?.precio_compra) || 0;
      const qty = Number(f.cantidad);
      return {
        fecha, comida: f.comida, item_id: f.item_id,
        cantidad: qty, unidad: it?.unidad || null,
        locacion_id: locacionId || null,
        precio_unitario: precio, costo_total: qty * precio,
        notas: f.notas?.trim() || null, registrado_por: userEmail,
      };
    });
    const { data: inserted, error } = await supabase
      .from("comedor_consumo").insert(rows).select("id, item_id");
    setSaving(false);
    if (error) return alert("Error: " + error.message);
    // Sync a Loggro por cada uno con loggro_id (fire-and-forget)
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    (inserted || []).forEach(row => {
      const it = itemsById[row.item_id];
      if (it?.loggro_id) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/consumo-comedor-salida`, {
          method: "POST",
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ consumo_id: row.id }),
        }).catch(() => {});
      }
    });
    cerrarModal();
    setTimeout(onReload, 1200);
  };

  // Anular (soft delete) un registro de consumo. Direccion 2026-07-13.
  const borrarConsumo = async (c) => {
    const motivo = window.prompt(
      `Anular consumo:\n\n${itemsById[c.item_id]?.nombre || c.item_id}\n${Number(c.cantidad).toLocaleString("es-CO")} ${c.unidad || ""}\n\nMotivo (obligatorio):`
    );
    if (!motivo || !motivo.trim()) return;
    const { error } = await supabase.from("comedor_consumo").update({
      anulado: true,
      anulado_por: userEmail,
      anulado_at: new Date().toISOString(),
      motivo_anulacion: motivo.trim(),
    }).eq("id", c.id);
    if (error) return alert("Error: " + error.message);
    setTimeout(onReload, 500);
  };

  // Guardar edicion de un registro existente. Recalcula costo_total.
  const guardarEdicion = async (patch) => {
    if (!editando) return;
    const qty = Number(patch.cantidad);
    if (!qty || qty <= 0) return alert("Cantidad inválida");
    const precio = Number(patch.precio_unitario ?? editando.precio_unitario) || 0;
    const { error } = await supabase.from("comedor_consumo").update({
      cantidad: qty,
      comida: patch.comida || editando.comida,
      notas: patch.notas?.trim() || null,
      precio_unitario: precio,
      costo_total: qty * precio,
    }).eq("id", editando.id);
    if (error) return alert("Error: " + error.message);
    setEditando(null);
    setTimeout(onReload, 500);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          Insumos usados en preparar las comidas — costo total: <strong style={{ color: B.sky }}>{COPx(totalCosto)}</strong>
        </div>
        <button type="button" onClick={() => setShowPick(true)} style={BTN(B.success)}>+ Cargar consumo</button>
      </div>

      {consumo.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
          Sin consumo registrado para este día.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Agrupado por desayuno → almuerzo → cena → general (direccion 2026-07-13) */}
          {[...COMIDAS, { k: "general", l: "General", icon: "📦", color: B.sky }].map(cm => {
            const items = consumo.filter(c => c.comida === cm.k);
            if (items.length === 0) return null;
            const subtotal = items.reduce((s, c) => s + (Number(c.costo_total) || 0), 0);
            return (
              <div key={cm.k} style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", borderLeft: `4px solid ${cm.color}` }}>
                {/* Header del grupo con icono + total */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: `${cm.color}18`, borderBottom: `1px solid ${B.navyLight}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{cm.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>{cm.l}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", background: B.navy, padding: "2px 8px", borderRadius: 10 }}>
                      {items.length} item{items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 800, color: cm.color }}>
                    {COPx(subtotal)}
                  </div>
                </div>
                {/* Items del grupo */}
                {items.map(c => {
                  const it = itemsById[c.item_id];
                  return (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 60px", gap: 10, padding: "10px 16px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "#fff" }}>{it?.nombre || c.item_id}</div>
                        {c.notas && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.notas}</div>}
                      </div>
                      <div style={{ textAlign: "right", color: "#fff" }}>
                        {Number(c.cantidad).toLocaleString("es-CO")} <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{c.unidad || it?.unidad || ""}</span>
                      </div>
                      <div style={{ textAlign: "right", color: "rgba(255,255,255,0.55)" }}>{COPx(c.precio_unitario)}</div>
                      <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>{COPx(c.costo_total)}</div>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => setEditando(c)} title="Editar"
                          style={{ background: B.sky + "22", color: B.sky, border: "none", borderRadius: 4, padding: "3px 7px", cursor: "pointer", fontSize: 11 }}>✎</button>
                        <button type="button" onClick={() => borrarConsumo(c)} title="Anular consumo"
                          style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 4, padding: "3px 7px", cursor: "pointer", fontSize: 11 }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de carga masiva: tabla con multiples items, filtro solo Alimentos */}
      {showPick && (
        <div onClick={cerrarModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 16, padding: 22, maxWidth: 980, width: "100%", color: "#fff", border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>+ Cargar consumo del comedor</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                  Solo productos de <b style={{ color: B.sky }}>Cocina</b> · {itemsAlimentos.length} disponibles
                </div>
              </div>
              <button type="button" onClick={cerrarModal} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 22 }}>×</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Locación (descuenta de stock)</label>
              <select value={locacionId} onChange={e => setLocacionId(e.target.value)} style={{ ...IS, maxWidth: 300 }}>
                <option value="">— Sin descontar —</option>
                {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>

            {/* Tabla de items */}
            <div style={{ background: B.navyMid, borderRadius: 10, padding: 8, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 130px 100px 1.2fr 32px", gap: 8, padding: "6px 10px", fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <div>Item</div>
                <div>Comida</div>
                <div style={{ textAlign: "right" }}>Cantidad</div>
                <div style={{ textAlign: "right" }}>Costo</div>
                <div>Notas</div>
                <div></div>
              </div>
              {filas.map((f, idx) => {
                const it = itemsById[f.item_id];
                const opciones = itemsAlimentos.filter(i => {
                  if (!f.search?.trim()) return true;
                  const q = f.search.toLowerCase();
                  return `${i.nombre || ""}`.toLowerCase().includes(q);
                }).slice(0, 30);
                const costo = (Number(f.cantidad) || 0) * (Number(it?.precio_compra) || 0);
                return (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 130px 100px 1.2fr 32px", gap: 8, padding: "6px 10px", borderTop: `1px solid ${B.navyLight}55`, alignItems: "center" }}>
                    {/* Item picker con buscador inline */}
                    <div>
                      {it ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.nombre}</div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{COPx(it.precio_compra || 0)}/{it.unidad || "und"}</div>
                          </div>
                          <button type="button" onClick={() => setFila(idx, { item_id: "", search: "" })}
                            style={{ background: "none", border: "none", color: B.sky, fontSize: 10, cursor: "pointer" }}>✎</button>
                        </div>
                      ) : (
                        <div style={{ position: "relative" }}>
                          <input value={f.search} onChange={e => setFila(idx, { search: e.target.value })}
                            placeholder="🔍 Buscar item…" autoFocus={idx === filas.length - 1 && !f.item_id}
                            style={{ ...IS, padding: "6px 10px", fontSize: 11 }} />
                          {f.search?.trim() && (
                            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2, zIndex: 10, background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 6, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
                              {opciones.length === 0 ? (
                                <div style={{ padding: "8px 12px", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Sin coincidencias.</div>
                              ) : opciones.map(i => (
                                <button key={i.id} type="button"
                                  onMouseDown={e => { e.preventDefault(); setFila(idx, { item_id: i.id, search: "" }); }}
                                  style={{ display: "block", width: "100%", padding: "6px 10px", background: "transparent", border: "none", borderTop: `1px solid ${B.navyLight}44`, color: "#fff", cursor: "pointer", textAlign: "left", fontSize: 11 }}>
                                  <div style={{ fontWeight: 700 }}>{i.nombre}</div>
                                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>Stock: {Number(i.stock_actual || 0).toLocaleString("es-CO")} {i.unidad || ""} · {COPx(i.precio_compra || 0)}/u</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Comida */}
                    <div>
                      <select value={f.comida} onChange={e => setFila(idx, { comida: e.target.value })} style={{ ...IS, padding: "6px 8px", fontSize: 11 }}>
                        {COMIDAS.map(c => <option key={c.k} value={c.k}>{c.icon} {c.l}</option>)}
                        <option value="general">📦 General</option>
                      </select>
                    </div>
                    {/* Cantidad + unidad (badge visible para evitar confusion Kg vs Gr, Lt vs Ml, etc.) */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" value={f.cantidad} onChange={e => setFila(idx, { cantidad: e.target.value })}
                        step="0.01" min="0" placeholder="0"
                        style={{ ...IS, padding: "6px 8px", fontSize: 11, textAlign: "right", flex: 1, minWidth: 0 }} />
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "3px 7px", borderRadius: 4,
                        background: it ? B.warning + "33" : B.navyLight,
                        color: it ? B.warning : "rgba(255,255,255,0.35)",
                        whiteSpace: "nowrap", minWidth: 32, textAlign: "center",
                      }} title={it ? `Unidad: ${it.unidad || "sin definir"}` : "Selecciona el item primero"}>
                        {it?.unidad || "—"}
                      </span>
                    </div>
                    {/* Costo (calculado) */}
                    <div style={{ textAlign: "right", color: B.sky, fontWeight: 700, fontSize: 12 }}>
                      {COPx(costo)}
                    </div>
                    {/* Notas */}
                    <div>
                      <input value={f.notas} onChange={e => setFila(idx, { notas: e.target.value })}
                        placeholder="(opcional)"
                        style={{ ...IS, padding: "6px 8px", fontSize: 11 }} />
                    </div>
                    {/* Quitar */}
                    <div>
                      <button type="button" onClick={() => quitarFila(idx)} disabled={filas.length === 1}
                        title="Quitar fila"
                        style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 4, padding: "4px 6px", cursor: filas.length === 1 ? "not-allowed" : "pointer", fontSize: 12, opacity: filas.length === 1 ? 0.3 : 1 }}>🗑</button>
                    </div>
                  </div>
                );
              })}
              <div style={{ padding: "8px 10px", borderTop: `1px solid ${B.navyLight}55` }}>
                <button type="button" onClick={agregarFila}
                  style={{ background: B.sky + "22", color: B.sky, border: `1px dashed ${B.sky}66`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                  + Agregar item
                </button>
              </div>
            </div>

            {/* Footer con total + acciones */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Total del batch: </span>
                <strong style={{ color: B.sky, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, marginLeft: 6 }}>
                  {COPx(totalPreview)}
                </strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={cerrarModal} style={BTN(B.navyLight)} disabled={saving}>Cancelar</button>
                <button type="button" onClick={registrarTodo} style={BTN(B.success)} disabled={saving}>
                  {saving ? "Registrando…" : `Registrar ${filas.filter(f => f.item_id && Number(f.cantidad) > 0).length} item(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edicion de un registro de consumo */}
      {editando && (
        <EditarConsumoModal
          registro={editando}
          item={itemsById[editando.item_id]}
          onClose={() => setEditando(null)}
          onSave={guardarEdicion}
        />
      )}
    </div>
  );
}

// ─── Modal de edicion de un registro de consumo ──────────────────────
function EditarConsumoModal({ registro, item, onClose, onSave }) {
  const [comida, setComida] = useState(registro.comida);
  const [cantidad, setCantidad] = useState(String(registro.cantidad));
  const [precioUnit, setPrecioUnit] = useState(String(registro.precio_unitario));
  const [notas, setNotas] = useState(registro.notas || "");
  const [saving, setSaving] = useState(false);

  const costo = (Number(cantidad) || 0) * (Number(precioUnit) || 0);

  const guardar = async () => {
    setSaving(true);
    await onSave({ comida, cantidad, precio_unitario: precioUnit, notas });
    setSaving(false);
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div style={{ background: B.navy, borderRadius: 14, padding: 22, maxWidth: 480, width: "100%", color: "#fff", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Editar consumo</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {item?.nombre || registro.item_id} · {item?.unidad || registro.unidad}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={LS}>Comida</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {COMIDAS.map(c => (
              <button key={c.k} type="button" onClick={() => setComida(c.k)}
                style={{ padding: "8px", borderRadius: 8, border: comida === c.k ? `2px solid ${c.color}` : `1px solid ${B.navyLight}`,
                  background: comida === c.k ? c.color + "22" : B.navyMid, color: comida === c.k ? c.color : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                {c.icon} {c.l}
              </button>
            ))}
            <button type="button" onClick={() => setComida("general")}
              style={{ padding: "8px", borderRadius: 8, border: comida === "general" ? `2px solid ${B.sky}` : `1px solid ${B.navyLight}`,
                background: comida === "general" ? B.sky + "22" : B.navyMid, color: comida === "general" ? B.sky : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
              📦 General
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label style={LS}>Cantidad ({item?.unidad || registro.unidad})</label>
            <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} step="0.01" min="0.01" autoFocus style={IS} />
          </div>
          <div>
            <label style={LS}>Precio unitario</label>
            <input type="number" value={precioUnit} onChange={e => setPrecioUnit(e.target.value)} step="0.01" min="0" style={IS} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={LS}>Notas</label>
          <input value={notas} onChange={e => setNotas(e.target.value)} style={IS} placeholder="(opcional)" />
        </div>

        <div style={{ background: B.navyMid, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>Costo total</span>
          <strong style={{ color: B.sky, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20 }}>{COPx(costo)}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={BTN(B.navyLight)} disabled={saving}>Cancelar</button>
          <button type="button" onClick={guardar} style={BTN(B.success)} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB REPORTE (mes/rango) ────────────────────────────────────────
function TabReporte({ fecha }) {
  const [desde, setDesde] = useState(() => {
    const d = new Date(fecha + "T12:00:00");
    d.setDate(1);
    return d.toLocaleDateString("en-CA");
  });
  const [hasta, setHasta] = useState(fecha);
  const [data, setData] = useState({ registros: [], consumo: [] });
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const [rR, cR] = await Promise.all([
      supabase.from("comedor_registros").select("*").gte("fecha", desde).lte("fecha", hasta),
      supabase.from("comedor_consumo").select("*").gte("fecha", desde).lte("fecha", hasta).eq("anulado", false),
    ]);
    setData({ registros: rR.data || [], consumo: cR.data || [] });
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [desde, hasta]);

  const totalRegs = data.registros.length;
  const totalCobrados = data.registros.filter(r => r.tipo !== "incluido").reduce((s, r) => s + (Number(r.monto_cobro) || 0), 0);
  const totalCosto = data.consumo.reduce((s, c) => s + (Number(c.costo_total) || 0), 0);
  const margen = totalCobrados - totalCosto;

  // Por empleado
  const porEmpleado = {};
  data.registros.forEach(r => {
    const k = r.comensal_id || r.comensal_nombre;
    if (!porEmpleado[k]) porEmpleado[k] = { nombre: r.comensal_nombre, tipo: r.comensal_tipo, count: 0, cobro: 0 };
    porEmpleado[k].count++;
    porEmpleado[k].cobro += Number(r.monto_cobro) || 0;
  });
  const rankingEmp = Object.values(porEmpleado).sort((a, b) => b.count - a.count).slice(0, 20);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={LS}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...IS, width: 160 }} />
        </div>
        <div>
          <label style={LS}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...IS, width: 160 }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard l="Comidas servidas" v={totalRegs} c={B.sky} />
        <KpiCard l="Ingreso por cobros" v={COPx(totalCobrados)} c="#22c55e" />
        <KpiCard l="Costo insumos" v={COPx(totalCosto)} c="#ef4444" />
        <KpiCard l="Subsidio comedor" v={COPx(totalCosto - totalCobrados)} c="#fbbf24" sub="costo - cobros" />
      </div>
      {loading ? <div style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.4)" }}>Cargando…</div> : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${B.navyLight}`, fontSize: 13, fontWeight: 800 }}>Top 20 comensales</div>
          {rankingEmp.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Sin registros en el rango.</div>
          ) : rankingEmp.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 1fr 80px 100px 100px", gap: 10, padding: "8px 16px", borderTop: `1px solid ${B.navyLight}`, fontSize: 12 }}>
              <div style={{ color: "rgba(255,255,255,0.4)" }}>#{i + 1}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{r.nombre}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "capitalize" }}>{r.tipo}</div>
              </div>
              <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>{r.count}</div>
              <div style={{ textAlign: "right", color: "rgba(255,255,255,0.5)", fontSize: 10 }}>comidas</div>
              <div style={{ textAlign: "right", color: r.cobro > 0 ? "#fbbf24" : "rgba(255,255,255,0.3)", fontWeight: 700 }}>{COPx(r.cobro)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const KpiCard = ({ l, v, c, sub }) => (
  <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", borderLeft: `4px solid ${c}` }}>
    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: c, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{v}</div>
    {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
  </div>
);

// ─── TAB PRECIOS (configuración) ────────────────────────────────────
function TabPrecios({ precios, onReload }) {
  const [editing, setEditing] = useState({});
  const guardar = async (comida, precio) => {
    await supabase.from("comedor_precios").update({ precio: Number(precio) || 0, updated_at: new Date().toISOString() }).eq("comida", comida);
    setEditing(s => ({ ...s, [comida]: null }));
    onReload();
  };
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ background: "rgba(245,158,11,0.08)", border: `1px solid #f59e0b55`, borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12, color: "#f59e0b" }}>
        💰 Estos precios se usan para cobrar comidas extras a empleados (fuera de horario) y a contratistas/invitados.
      </div>
      {COMIDAS.map(c => {
        const p = precios.find(x => x.comida === c.k);
        const ed = editing[c.k];
        return (
          <div key={c.k} style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.l}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.franja}</div>
            </div>
            <input type="number" value={ed != null ? ed : (p?.precio || 0)} onChange={e => setEditing(s => ({ ...s, [c.k]: e.target.value }))}
              style={{ ...IS, width: 130, textAlign: "right" }} />
            <button type="button" onClick={() => guardar(c.k, ed != null ? ed : (p?.precio || 0))} disabled={ed == null}
              style={BTN(ed != null ? B.success : B.navyLight)}>
              {ed != null ? "Guardar" : "—"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
