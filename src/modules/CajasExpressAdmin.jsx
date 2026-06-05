// CajasExpressAdmin — Panel admin para configurar el evento y monitorear ventas.
// URL pública con autenticación PIN: /cajas-admin
//
// Tabs:
//   - Productos: marcar items_catalogo como visibles para el evento + precio
//   - Cajeros: CRUD básico (nombre + PIN)
//   - Cajas: CRUD (nombre + loggro_mesa_id)
//   - Ventas: tabla en vivo con filtros

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const COP = n => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;
const ADMIN_PIN = "ATOLON26"; // PIN admin — cambiar si se necesita
const STORAGE_KEY = "cajas_admin_auth_v1";

const C = {
  bg: "#FAFAF8", bgCard: "#FFFFFF",
  text: "#0A0A0A", textMid: "#404040", textLow: "#888888",
  border: "#E5E5E5", borderMid: "#CCCCCC",
  red: "#E11D2A", green: "#16A34A", amber: "#F59E0B",
};

export default function CajasExpressAdmin() {
  const [auth, setAuth] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      `}</style>
      {auth ? <Dashboard onLogout={() => { sessionStorage.removeItem(STORAGE_KEY); setAuth(false); }} />
            : <Login onAuth={() => { sessionStorage.setItem(STORAGE_KEY, "1"); setAuth(true); }} />}
    </div>
  );
}

// ────────────────────────────────── LOGIN
function Login({ onAuth }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    if (pin.trim() === ADMIN_PIN) onAuth();
    else { setErr("Clave incorrecta"); setPin(""); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{
        background: "#fff", border: `2px solid ${C.text}`, borderRadius: 10,
        padding: 36, maxWidth: 360, width: "100%", textAlign: "center",
      }}>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "0.06em" }}>
          CAJAS ADMIN
        </div>
        <div style={{ fontSize: 11, letterSpacing: "0.25em", color: C.textMid, fontWeight: 700, marginTop: 4 }}>
          PUNTO DE VENTA EXPRESS
        </div>
        <div style={{ width: 50, height: 2, background: C.red, margin: "20px auto" }} />
        <input type="password" value={pin} autoFocus
          onChange={e => { setPin(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Clave admin"
          style={{
            width: "100%", padding: 14, fontSize: 16, textAlign: "center",
            border: `2px solid ${err ? C.red : C.borderMid}`, borderRadius: 6,
            outline: "none", boxSizing: "border-box", letterSpacing: "0.12em",
          }} />
        {err && <div style={{ fontSize: 12, color: C.red, marginTop: 8, fontWeight: 600 }}>{err}</div>}
        <button onClick={submit} style={{
          marginTop: 16, width: "100%", padding: 14,
          background: C.text, color: "#fff", border: "none", borderRadius: 6,
          fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", cursor: "pointer",
        }}>ENTRAR</button>
      </div>
    </div>
  );
}

// ────────────────────────────────── DASHBOARD
function Dashboard({ onLogout }) {
  const [tab, setTab] = useState("productos");
  return (
    <div>
      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: `1px solid ${C.border}`,
        padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.05em" }}>
            CAJAS EXPRESS · ADMIN
          </div>
          <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700, marginTop: 2 }}>
            ATOLÓN BEACH CLUB
          </div>
        </div>
        <button onClick={onLogout} style={{
          padding: "8px 14px", background: "#fff", border: `1.5px solid ${C.borderMid}`,
          borderRadius: 6, fontSize: 12, color: C.textMid, cursor: "pointer",
        }}>Salir</button>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 4, padding: "0 10px" }}>
          {[
            { k: "productos", l: "🛒 Productos" },
            { k: "cajeros", l: "👤 Cajeros" },
            { k: "cajas", l: "🏪 Cajas" },
            { k: "ventas", l: "💰 Ventas" },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{
                padding: "14px 16px", background: "none", border: "none",
                borderBottom: `3px solid ${tab === t.k ? C.red : "transparent"}`,
                color: tab === t.k ? C.text : C.textMid,
                fontSize: 14, fontWeight: tab === t.k ? 800 : 500,
                cursor: "pointer", letterSpacing: "0.04em",
              }}>{t.l}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 60px" }}>
        {tab === "productos" && <TabProductos />}
        {tab === "cajeros"   && <TabCajeros />}
        {tab === "cajas"     && <TabCajas />}
        {tab === "ventas"    && <TabVentas />}
      </div>
    </div>
  );
}

// ────────────────────────────────── TAB PRODUCTOS
function TabProductos() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [soloVisibles, setSoloVisibles] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    supabase.from("items_catalogo")
      .select("id, nombre, categoria, precio_compra, evento_caja_visible, evento_caja_precio, loggro_id")
      .eq("activo", true)
      .in("categoria", ["BEBIDAS", "CERVEZAS", "BOTELLAS", "Alimentos", "Jugos", "ENTRADAS Y ENSALADAS", "PLATOS PRINCIPALES", "POSTRES", "Shots", "VINOS / ESPUMOSOS", "LICORES", "RON", "VODKA / GIN", "WHISKY / BOURBON", "TEQUILA / MEZCAL"])
      .order("categoria")
      .order("nombre")
      .then(({ data }) => {
        setItems(data || []);
        setLoading(false);
      });
  }, [reload]);

  const toggleVisible = async (id, current) => {
    await supabase.from("items_catalogo").update({ evento_caja_visible: !current }).eq("id", id);
    setItems(its => its.map(i => i.id === id ? { ...i, evento_caja_visible: !current } : i));
  };
  const updatePrecio = async (id, val) => {
    const precio = Number(val) || 0;
    await supabase.from("items_catalogo").update({ evento_caja_precio: precio }).eq("id", id);
    setItems(its => its.map(i => i.id === id ? { ...i, evento_caja_precio: precio } : i));
  };

  const filtered = useMemo(() => items.filter(i =>
    (!filtro || i.nombre.toLowerCase().includes(filtro.toLowerCase()) || (i.categoria || "").toLowerCase().includes(filtro.toLowerCase()))
    && (!soloVisibles || i.evento_caja_visible)
  ), [items, filtro, soloVisibles]);

  const totalVisibles = items.filter(i => i.evento_caja_visible).length;

  if (loading) return <div style={{ padding: 30, color: C.textMid }}>Cargando…</div>;

  return (
    <div>
      <SectionTitle title="Productos del evento" sub={`${totalVisibles} productos marcados como visibles para las cajas`} />
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar por nombre o categoría…"
          style={{ flex: 1, minWidth: 220, padding: "10px 14px", border: `1.5px solid ${C.borderMid}`, borderRadius: 6, fontSize: 13 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.textMid, cursor: "pointer" }}>
          <input type="checkbox" checked={soloVisibles} onChange={e => setSoloVisibles(e.target.checked)} />
          Solo visibles
        </label>
        <button onClick={() => setReload(r => r + 1)} style={{ padding: "8px 14px", background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>↻ Refrescar</button>
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th style={th}>Visible</th>
                <th style={th}>Categoría</th>
                <th style={th}>Producto</th>
                <th style={th}>Loggro</th>
                <th style={{ ...th, textAlign: "right" }}>Precio evento (COP)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id} style={{ borderTop: `1px solid ${C.border}`, background: i.evento_caja_visible ? "#FEF7E0" : "#fff" }}>
                  <td style={td}>
                    <input type="checkbox" checked={!!i.evento_caja_visible}
                      onChange={() => toggleVisible(i.id, i.evento_caja_visible)}
                      style={{ width: 20, height: 20, cursor: "pointer" }} />
                  </td>
                  <td style={td}><span style={{ fontSize: 10, color: C.textMid, letterSpacing: "0.08em" }}>{i.categoria}</span></td>
                  <td style={td}><span style={{ fontWeight: 600 }}>{i.nombre}</span></td>
                  <td style={td}>{i.loggro_id ? <span style={{ fontSize: 10, color: C.green }}>✓ Sync</span> : <span style={{ fontSize: 10, color: C.amber }}>—</span>}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <input type="number" defaultValue={i.evento_caja_precio || ""}
                      onBlur={e => updatePrecio(i.id, e.target.value)}
                      placeholder="0"
                      style={{ width: 110, padding: 6, textAlign: "right", border: `1px solid ${C.borderMid}`, borderRadius: 4, fontWeight: 700 }} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="5" style={{ ...td, textAlign: "center", padding: 30, color: C.textLow }}>Sin productos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────── TAB CAJEROS
function TabCajeros() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nombre: "", pin: "" });
  const [err, setErr] = useState("");

  const fetchItems = () => {
    setLoading(true);
    supabase.from("cajas_evento_cajeros").select("*").order("nombre")
      .then(({ data }) => { setItems(data || []); setLoading(false); });
  };
  useEffect(() => { fetchItems(); }, []);

  const addCajero = async () => {
    setErr("");
    if (!form.nombre.trim()) return setErr("Nombre requerido");
    if (!/^\d{4,6}$/.test(form.pin)) return setErr("PIN debe ser 4 a 6 dígitos");
    const id = `CAJERO-${Date.now()}`;
    const { error } = await supabase.from("cajas_evento_cajeros").insert({
      id, nombre: form.nombre.trim(), pin: form.pin, activo: true,
    });
    if (error) {
      if (error.code === "23505") setErr("Ese PIN ya está en uso");
      else setErr(error.message);
      return;
    }
    setForm({ nombre: "", pin: "" });
    setShowAdd(false);
    fetchItems();
  };

  const toggleActivo = async (c) => {
    await supabase.from("cajas_evento_cajeros").update({ activo: !c.activo }).eq("id", c.id);
    fetchItems();
  };
  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar cajero "${c.nombre}"?`)) return;
    await supabase.from("cajas_evento_cajeros").delete().eq("id", c.id);
    fetchItems();
  };

  if (loading) return <div style={{ padding: 30, color: C.textMid }}>Cargando…</div>;

  return (
    <div>
      <SectionTitle title="Cajeros" sub={`${items.filter(i => i.activo).length} activos · ${items.length} en total`} />
      <div style={{ marginBottom: 14 }}>
        {!showAdd ? (
          <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Agregar cajero</button>
        ) : (
          <div style={{ background: "#fff", border: `2px solid ${C.text}`, borderRadius: 8, padding: 16, display: "grid", gap: 10, gridTemplateColumns: "1fr 130px auto auto" }}>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre del cajero"
              style={inputStyle} autoFocus />
            <input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
              placeholder="PIN 4 dígitos" maxLength={6}
              style={{ ...inputStyle, letterSpacing: "0.15em", fontFamily: "monospace" }} />
            <button onClick={addCajero} style={btnPrimary}>Guardar</button>
            <button onClick={() => { setShowAdd(false); setErr(""); setForm({ nombre: "", pin: "" }); }} style={btnSecondary}>Cancelar</button>
            {err && <div style={{ gridColumn: "1 / -1", fontSize: 12, color: C.red, fontWeight: 600 }}>{err}</div>}
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <th style={th}>Estado</th>
              <th style={th}>Nombre</th>
              <th style={th}>PIN</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id} style={{ borderTop: `1px solid ${C.border}`, opacity: c.activo ? 1 : 0.5 }}>
                <td style={td}>
                  <button onClick={() => toggleActivo(c)} style={{
                    padding: "4px 10px", borderRadius: 14, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                    background: c.activo ? C.green + "22" : C.borderMid,
                    color: c.activo ? C.green : C.textMid,
                  }}>{c.activo ? "Activo" : "Inactivo"}</button>
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{c.nombre}</td>
                <td style={{ ...td, fontFamily: "monospace", fontSize: 16, letterSpacing: "0.15em" }}>{c.pin}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => eliminar(c)} style={{ background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan="4" style={{ ...td, textAlign: "center", padding: 30, color: C.textLow }}>Aún no hay cajeros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────── TAB CAJAS
function TabCajas() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nombre: "", loggro_mesa_id: "" });

  const fetchItems = () => {
    setLoading(true);
    supabase.from("cajas_evento_cajas").select("*").order("nombre")
      .then(({ data }) => { setItems(data || []); setLoading(false); });
  };
  useEffect(() => { fetchItems(); }, []);

  const add = async () => {
    if (!form.nombre.trim()) return;
    const id = `CAJA-${Date.now()}`;
    await supabase.from("cajas_evento_cajas").insert({
      id, nombre: form.nombre.trim(), loggro_mesa_id: form.loggro_mesa_id.trim() || null, activo: true,
    });
    setForm({ nombre: "", loggro_mesa_id: "" });
    setShowAdd(false);
    fetchItems();
  };
  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar ${c.nombre}?`)) return;
    await supabase.from("cajas_evento_cajas").delete().eq("id", c.id);
    fetchItems();
  };

  if (loading) return <div style={{ padding: 30, color: C.textMid }}>Cargando…</div>;

  return (
    <div>
      <SectionTitle title="Cajas físicas" sub="Cada caja es un punto de venta físico. El campo loggro_mesa_id es el objectId de la mesa virtual donde van las ventas." />
      <div style={{ marginBottom: 14 }}>
        {!showAdd ? (
          <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Agregar caja</button>
        ) : (
          <div style={{ background: "#fff", border: `2px solid ${C.text}`, borderRadius: 8, padding: 16, display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr auto auto" }}>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre (ej. CAJA 1)" style={inputStyle} autoFocus />
            <input value={form.loggro_mesa_id} onChange={e => setForm(f => ({ ...f, loggro_mesa_id: e.target.value }))}
              placeholder="loggro_mesa_id (opcional)" style={inputStyle} />
            <button onClick={add} style={btnPrimary}>Guardar</button>
            <button onClick={() => setShowAdd(false)} style={btnSecondary}>Cancelar</button>
          </div>
        )}
      </div>
      <div style={{ background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: C.bg }}>
            <th style={th}>Nombre</th>
            <th style={th}>Loggro Mesa ID</th>
            <th style={th}></th>
          </tr></thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 700 }}>{c.nombre}</td>
                <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: C.textMid }}>{c.loggro_mesa_id || "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => eliminar(c)} style={{ background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan="3" style={{ ...td, textAlign: "center", padding: 30, color: C.textLow }}>Sin cajas aún.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────── TAB VENTAS
function TabVentas() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("todas"); // todas | enviadas | pendientes | falladas
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    supabase.from("cajas_evento_ventas")
      .select("*").order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => { setVentas(data || []); setLoading(false); });
  }, [reload]);

  // Auto-refresh cada 15s
  useEffect(() => {
    const t = setInterval(() => setReload(r => r + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const lista = useMemo(() => ventas.filter(v => {
    if (filtroEstado === "enviadas"   && v.loggro_estado !== "sent")    return false;
    if (filtroEstado === "pendientes" && v.loggro_estado !== "pending") return false;
    if (filtroEstado === "falladas"   && v.loggro_estado !== "failed")  return false;
    return v.estado !== "anulada";
  }), [ventas, filtroEstado]);

  const totales = useMemo(() => {
    const t = { count: 0, total: 0, efectivo: 0, tarjeta: 0, porCajero: {} };
    lista.forEach(v => {
      t.count++;
      t.total += Number(v.total) || 0;
      if (v.metodo_pago === "efectivo") t.efectivo += Number(v.total) || 0;
      if (v.metodo_pago === "tarjeta")  t.tarjeta  += Number(v.total) || 0;
      const c = v.cajero_nombre || "—";
      if (!t.porCajero[c]) t.porCajero[c] = { count: 0, total: 0 };
      t.porCajero[c].count++;
      t.porCajero[c].total += Number(v.total) || 0;
    });
    return t;
  }, [lista]);

  if (loading) return <div style={{ padding: 30, color: C.textMid }}>Cargando…</div>;

  return (
    <div>
      <SectionTitle title="Ventas" sub="Auto-refresh cada 15s. Muestra últimas 500." />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 18 }}>
        <Kpi label="VENTAS" valor={totales.count} />
        <Kpi label="TOTAL" valor={COP(totales.total)} accent />
        <Kpi label="EFECTIVO" valor={COP(totales.efectivo)} color={C.green} />
        <Kpi label="TARJETA" valor={COP(totales.tarjeta)} color={C.amber} />
      </div>

      {/* Por cajero */}
      <div style={{ background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 8, padding: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700, marginBottom: 10 }}>POR CAJERO</div>
        <div style={{ display: "grid", gap: 6 }}>
          {Object.entries(totales.porCajero).sort((a, b) => b[1].total - a[1].total).map(([c, d]) => (
            <div key={c} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, padding: "8px 12px", background: C.bg, borderRadius: 4, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{c}</div>
              <div style={{ color: C.textMid }}>{d.count} ventas</div>
              <div style={{ fontWeight: 700 }}>{COP(d.total)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { val: "todas", l: "Todas" },
          { val: "enviadas", l: "✓ Enviadas a Loggro" },
          { val: "pendientes", l: "⏳ Pendientes Loggro" },
          { val: "falladas", l: "✗ Falladas Loggro" },
        ].map(o => (
          <button key={o.val} onClick={() => setFiltroEstado(o.val)}
            style={{
              padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 16, cursor: "pointer",
              background: filtroEstado === o.val ? C.text : "#fff",
              color: filtroEstado === o.val ? "#fff" : C.text,
              border: `1.5px solid ${filtroEstado === o.val ? C.text : C.borderMid}`,
            }}>{o.l}</button>
        ))}
        <button onClick={() => setReload(r => r + 1)} style={{ marginLeft: "auto", padding: "5px 12px", fontSize: 12, background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 16, cursor: "pointer" }}>↻ Refrescar</button>
      </div>

      {/* Lista */}
      <div style={{ background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: C.bg }}>
              <th style={th}>Hora</th>
              <th style={th}>Caja</th>
              <th style={th}>Cajero</th>
              <th style={th}>Items</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={th}>Pago</th>
              <th style={th}>Loggro</th>
            </tr></thead>
            <tbody>
              {lista.map(v => (
                <tr key={v.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{fmtHora(v.created_at)}</td>
                  <td style={td}>{v.caja_id}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{v.cajero_nombre}</td>
                  <td style={{ ...td, fontSize: 11, color: C.textMid, maxWidth: 280 }}>
                    {(v.items || []).map(it => `${it.cantidad}× ${it.nombre}`).join(", ")}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(v.total)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: v.metodo_pago === "efectivo" ? C.green + "22" : C.amber + "22", color: v.metodo_pago === "efectivo" ? C.green : "#92400E" }}>
                      {v.metodo_pago.toUpperCase()}
                    </span>
                  </td>
                  <td style={td}>
                    <LoggroBadge estado={v.loggro_estado} error={v.loggro_error} />
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr><td colSpan="7" style={{ ...td, textAlign: "center", padding: 30, color: C.textLow }}>Sin ventas en este filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────── HELPERS UI
function SectionTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "0.02em" }}>{title}</h2>
      {sub && <div style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
function Kpi({ label, valor, color, accent }) {
  return (
    <div style={{
      background: accent ? C.red : "#fff", color: accent ? "#fff" : C.text,
      border: `1.5px solid ${accent ? C.red : C.borderMid}`,
      borderRadius: 8, padding: "12px 16px",
    }}>
      <div style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 700, opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || (accent ? "#fff" : C.text) }}>{valor}</div>
    </div>
  );
}
function LoggroBadge({ estado, error }) {
  const cfg = {
    sent:    { bg: C.green + "22", color: C.green,  label: "✓ Enviada" },
    pending: { bg: C.amber + "22", color: "#92400E", label: "⏳ Pendiente" },
    failed:  { bg: "#FECACA",      color: "#B91C1C", label: "✗ Falló" },
  }[estado] || { bg: C.bg, color: C.textMid, label: estado };
  return <span title={error || ""} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}
function fmtHora(iso) {
  try { return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return "—"; }
}

const th = { padding: "10px 8px", textAlign: "left", fontSize: 10, color: C.textMid, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" };
const td = { padding: "10px 8px", color: C.text, verticalAlign: "middle" };
const btnPrimary = { padding: "10px 18px", background: C.text, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnSecondary = { padding: "10px 18px", background: "#fff", color: C.textMid, border: `1.5px solid ${C.borderMid}`, borderRadius: 6, fontSize: 13, cursor: "pointer" };
const inputStyle = { padding: "10px 12px", border: `1.5px solid ${C.borderMid}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };
