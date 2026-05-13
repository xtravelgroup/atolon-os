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
                        <button type="button" onClick={async () => {
                          if (!confirm("¿Eliminar registro?")) return;
                          await supabase.from("comedor_registros").delete().eq("id", r.id);
                          onReload();
                        }} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 12 }}>×</button>
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
  const [search, setSearch] = useState("");
  const [pickItem, setPickItem] = useState(null);
  const [pickComida, setPickComida] = useState("almuerzo");
  const [cantidad, setCantidad] = useState("1");
  const [locacionId, setLocacionId] = useState("LOC-ALMACEN-COCINA");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [locaciones, setLocaciones] = useState([]);

  useEffect(() => {
    supabase.from("items_locaciones").select("id, nombre").then(({ data }) => setLocaciones(data || []));
  }, []);

  const itemsFiltrados = items.filter(i => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${i.nombre || ""} ${i.categoria || ""}`.toLowerCase().includes(q);
  }).slice(0, 50);

  const itemsById = Object.fromEntries(items.map(i => [i.id, i]));
  const totalCosto = consumo.reduce((s, c) => s + (Number(c.costo_total) || 0), 0);

  const registrar = async () => {
    if (!pickItem) return;
    const qty = Number(cantidad);
    if (!qty || qty <= 0) return alert("Cantidad inválida");
    setSaving(true);
    const precio = Number(pickItem.precio_compra) || 0;
    const { data: inserted } = await supabase.from("comedor_consumo").insert({
      fecha, comida: pickComida, item_id: pickItem.id,
      cantidad: qty, unidad: pickItem.unidad || null,
      locacion_id: locacionId || null,
      precio_unitario: precio, costo_total: qty * precio,
      notas: notas.trim() || null, registrado_por: userEmail,
    }).select().single();
    setSaving(false);
    setShowPick(false);
    setPickItem(null);
    setCantidad("1");
    setNotas("");
    setSearch("");
    // Sync a Loggro como Salida - Otro
    if (inserted?.id && pickItem.loggro_id) {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/consumo-comedor-salida`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consumo_id: inserted.id }),
      }).catch(() => {});
    }
    setTimeout(onReload, 1200);
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
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          {consumo.map(c => {
            const it = itemsById[c.item_id];
            const cm = COMIDAS.find(x => x.k === c.comida);
            return (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr 70px 100px 100px", gap: 10, padding: "10px 14px", borderTop: `1px solid ${B.navyLight}`, fontSize: 12, alignItems: "center" }}>
                <div style={{ fontSize: 16 }}>{cm?.icon || "🍴"}</div>
                <div>
                  <div style={{ fontWeight: 600, color: "#fff" }}>{it?.nombre || c.item_id}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{cm?.l || ""}{c.notas ? ` · ${c.notas}` : ""}</div>
                </div>
                <div style={{ textAlign: "right", color: "#fff" }}>{Number(c.cantidad).toLocaleString("es-CO")}</div>
                <div style={{ textAlign: "right", color: "rgba(255,255,255,0.55)" }}>{COPx(c.precio_unitario)}</div>
                <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>{COPx(c.costo_total)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de carga (igual patrón que open bar) */}
      {showPick && (
        <div onClick={() => setShowPick(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 16, padding: 22, maxWidth: 540, width: "100%", color: "#fff", border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>+ Cargar consumo</div>
              <button type="button" onClick={() => setShowPick(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 22 }}>×</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Comida</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {COMIDAS.map(c => (
                  <button key={c.k} type="button" onClick={() => setPickComida(c.k)}
                    style={{ padding: "8px", borderRadius: 8, border: pickComida === c.k ? `2px solid ${c.color}` : `1px solid ${B.navyLight}`,
                      background: pickComida === c.k ? c.color + "22" : B.navyMid, color: pickComida === c.k ? c.color : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                    {c.icon} {c.l}
                  </button>
                ))}
                <button type="button" onClick={() => setPickComida("general")}
                  style={{ padding: "8px", borderRadius: 8, border: pickComida === "general" ? `2px solid ${B.sky}` : `1px solid ${B.navyLight}`,
                    background: pickComida === "general" ? B.sky + "22" : B.navyMid, color: pickComida === "general" ? B.sky : "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                  📦 General
                </button>
              </div>
            </div>

            {!pickItem ? (
              <>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar producto…" autoFocus
                  style={{ ...IS, marginBottom: 8 }} />
                <div style={{ background: B.navyMid, borderRadius: 8, maxHeight: 320, overflowY: "auto" }}>
                  {itemsFiltrados.map(i => (
                    <button key={i.id} type="button" onClick={() => setPickItem(i)}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px", background: "transparent", border: "none", borderBottom: `1px solid ${B.navyLight}`, color: "#fff", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 6, background: i.foto_url ? `url(${i.foto_url}) center/cover` : B.navyLight, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                        {!i.foto_url && "📦"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nombre}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{i.categoria || "—"} · Stock: {Number(i.stock_actual || 0).toLocaleString("es-CO")} {i.unidad || ""} · {COPx(i.precio_compra || 0)}/u</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setPickItem(null)} style={{ background: "none", border: "none", color: B.sky, fontSize: 11, cursor: "pointer", marginBottom: 10, padding: 0 }}>← Cambiar producto</button>
                <div style={{ background: B.navyMid, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{pickItem.nombre}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    {pickItem.categoria || "—"} · Stock: {Number(pickItem.stock_actual || 0).toLocaleString("es-CO")} {pickItem.unidad || ""} · {COPx(pickItem.precio_compra || 0)} c/u
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={LS}>Cantidad</label>
                    <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} step="0.01" min="0.01" autoFocus style={IS} />
                  </div>
                  <div>
                    <label style={LS}>Locación</label>
                    <select value={locacionId} onChange={e => setLocacionId(e.target.value)} style={IS}>
                      <option value="">— Sin descontar —</option>
                      {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={LS}>Notas</label>
                  <input value={notas} onChange={e => setNotas(e.target.value)} style={IS} />
                </div>
                <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Costo</span>
                  <strong style={{ color: B.sky, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>
                    {COPx((Number(cantidad) || 0) * (Number(pickItem.precio_compra) || 0))}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" onClick={() => setShowPick(false)} style={BTN(B.navyLight)} disabled={saving}>Cancelar</button>
                  <button type="button" onClick={registrar} style={BTN(B.success)} disabled={saving}>{saving ? "Registrando…" : "Registrar"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
