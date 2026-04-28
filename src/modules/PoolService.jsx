// PoolService — Pedidos desde áreas exteriores (piscina, beach, cabañas, bar)
// Similar a HotelRoomService pero para zonas del beach club.
// Cada área tiene un QR que el huésped escanea → portal público → pedido aquí.
//
// Tablas:
//   - pool_service_areas    (zonas con QR)
//   - pool_service_pedidos  (pedidos con kanban)

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
  pool: "#06b6d4",
};
const COP = (n) => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const BTN = (bg, color = "#fff") => ({ padding: "9px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12, minHeight: 40 });
const IS = { width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const ESTADOS = [
  { key: "recibido",   label: "Recibido",   color: "rgba(255,255,255,0.6)" },
  { key: "preparando", label: "Preparando", color: B.warning },
  { key: "listo",      label: "Listo",      color: B.sky },
  { key: "entregado",  label: "Entregado",  color: B.success },
  { key: "cancelado",  label: "Cancelado",  color: B.danger },
];
const KANBAN_COLS = ["recibido", "preparando", "listo", "entregado"];
const NEXT_EST    = { recibido: "preparando", preparando: "listo", listo: "entregado" };
const estColor = (e) => ESTADOS.find(x => x.key === e)?.color || "rgba(255,255,255,0.4)";
const estLabel = (e) => ESTADOS.find(x => x.key === e)?.label || e;

const TIPO_ICON = {
  piscina:       "🏊",
  piscina_chica: "🛟",
  beach:         "🏖️",
  cabana:        "🏝️",
  bar:           "🍹",
  vip:           "⭐",
  otra:          "📍",
};

const CAT_ORDER = ["Bebidas", "Cervezas", "Cocteles", "Snacks", "Entradas", "Marinas", "Ensalada", "Ensaladas", "Tacos", "Pizza", "Pizzas", "Especialidades", "Especialidades de la Isla", "Parrilla", "De la Parrilla", "Complementos", "Postres"];
const catRank = (cat) => {
  const idx = CAT_ORDER.findIndex(c => c.toLowerCase() === (cat || "").toLowerCase());
  return idx === -1 ? 999 : idx;
};
const sortCats = (cats) => [...cats].sort((a, b) => {
  const ra = catRank(a), rb = catRank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
});

export default function PoolService() {
  const { isMobile } = useBreakpoint();
  const [areas, setAreas]     = useState([]);
  const [items, setItems]     = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pedidos"); // pedidos | nuevo | areas | menu

  const load = async () => {
    setLoading(true);
    const [a, i, p] = await Promise.all([
      supabase.from("pool_service_areas").select("*").eq("activo", true).order("orden").order("nombre"),
      supabase.from("menu_items").select("id, nombre, descripcion, precio, categoria, menu_tipo, orden").in("menu_tipo", ["restaurant", "bebidas"]).eq("activo", true).order("categoria").order("orden"),
      supabase.from("pool_service_pedidos").select("*").order("created_at", { ascending: false }).limit(120),
    ]);
    setAreas(a.data || []);
    setItems(i.data || []);
    setPedidos(p.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime: nuevo pedido → recarga + sonido + notificación
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("pool-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pool_service_pedidos" }, (payload) => {
        load();
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 660; o.type = "sine";
          g.gain.setValueAtTime(0.3, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
          o.start(); o.stop(ctx.currentTime + 0.7);
        } catch {}
        if ("Notification" in window && Notification.permission === "granted") {
          const ped = payload.new;
          new Notification("🏊 Nuevo pedido Pool Service", {
            body: `${ped?.area_nombre || "?"} · ${(ped?.items || []).length} ítems · ${COP(ped?.total)}`,
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pool_service_pedidos" }, () => load())
      .subscribe();
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const cambiarEstado = async (id, estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    if (estado === "entregado")  patch.entregado_at = new Date().toISOString();
    if (estado === "cancelado")  patch.cancelado_at = new Date().toISOString();
    await supabase.from("pool_service_pedidos").update(patch).eq("id", id);
    load();
  };

  // KPIs
  const kpis = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    const today = pedidos.filter(p => (p.created_at || "").slice(0, 10) === hoy);
    return {
      pendientes: pedidos.filter(p => p.estado === "recibido" || p.estado === "preparando" || p.estado === "listo").length,
      hoy: today.length,
      ventas_hoy: today.filter(p => p.estado !== "cancelado").reduce((s, p) => s + Number(p.total || 0), 0),
      areas_activas: areas.length,
    };
  }, [pedidos, areas]);

  if (loading) return <div style={{ padding: 40, color: "#fff", textAlign: "center" }}>Cargando Pool Service…</div>;

  return (
    <div style={{ padding: isMobile ? 12 : 20, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            🏊 Pool Service
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            Pedidos desde piscinas, beach, cabañas y bar — los huéspedes piden con QR.
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 170}px, 1fr))`, gap: 10, marginBottom: 16 }}>
        <Kpi label="Pendientes"      valor={kpis.pendientes}             color={B.warning} />
        <Kpi label="Pedidos hoy"     valor={kpis.hoy}                    color={B.sky} />
        <Kpi label="Ventas hoy"      valor={COP(kpis.ventas_hoy)}        color={B.success} />
        <Kpi label="Áreas activas"   valor={kpis.areas_activas}          color={B.pool} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { k: "pedidos", l: `📋 Pedidos (${kpis.pendientes})` },
          { k: "nuevo",   l: "➕ Nuevo pedido" },
          { k: "areas",   l: `📍 Áreas (${areas.length})` },
          { k: "menu",    l: `🍽️ Menú (${items.length})` },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={BTN(tab === t.k ? B.pool : B.navyMid, tab === t.k ? B.navy : "#fff")}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "pedidos" && (
        <Kanban pedidos={pedidos} cambiarEstado={cambiarEstado} isMobile={isMobile} />
      )}
      {tab === "nuevo" && (
        <NuevoPedido areas={areas} items={items} onSaved={() => { setTab("pedidos"); load(); }} />
      )}
      {tab === "areas" && (
        <AreasManager areas={areas} onChanged={load} />
      )}
      {tab === "menu" && (
        <VistaMenu items={items} />
      )}
    </div>
  );
}

function Kpi({ label, valor, color }) {
  return (
    <div style={{ background: B.navyMid, padding: 12, borderRadius: 10, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 4 }}>{valor}</div>
    </div>
  );
}

// ─── Kanban de pedidos ─────────────────────────────────────────────────────
function Kanban({ pedidos, cambiarEstado, isMobile }) {
  const cols = useMemo(() => {
    const buckets = Object.fromEntries(KANBAN_COLS.map(k => [k, []]));
    pedidos.forEach(p => {
      if (buckets[p.estado]) buckets[p.estado].push(p);
    });
    return buckets;
  }, [pedidos]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${KANBAN_COLS.length}, 1fr)`, gap: 12 }}>
      {KANBAN_COLS.map(k => (
        <div key={k} style={{ background: B.navyMid, borderRadius: 12, padding: 12, minHeight: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: estColor(k), marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {estLabel(k)} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>({cols[k].length})</span>
          </div>
          {cols[k].length === 0 ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", padding: "10px 4px" }}>Sin pedidos.</div>
          ) : cols[k].map(p => (
            <PedidoCard key={p.id} p={p} cambiarEstado={cambiarEstado} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PedidoCard({ p, cambiarEstado }) {
  const next = NEXT_EST[p.estado];
  return (
    <div style={{ background: B.navy, borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{p.area_nombre || p.area_id || "—"}</div>
          {p.huesped && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{p.huesped}</div>}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>
          {(p.created_at || "").slice(11, 16)}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>
        {(p.items || []).map((it, i) => (
          <div key={i}>{it.cantidad}× {it.nombre}</div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: B.success }}>{COP(p.total)}</div>
        <div style={{ display: "flex", gap: 4 }}>
          {next && (
            <button onClick={() => cambiarEstado(p.id, next)} style={{ ...BTN(B.pool), padding: "5px 10px", fontSize: 10, minHeight: 0 }}>
              → {estLabel(next)}
            </button>
          )}
          {p.estado !== "cancelado" && p.estado !== "entregado" && (
            <button onClick={() => { if (window.confirm("¿Cancelar?")) cambiarEstado(p.id, "cancelado"); }}
              style={{ ...BTN(B.danger + "44", B.danger), padding: "5px 8px", fontSize: 10, minHeight: 0 }}>
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Nuevo pedido (uso staff) ──────────────────────────────────────────────
function NuevoPedido({ areas, items, onSaved }) {
  const [areaId, setAreaId] = useState("");
  const [huesped, setHuesped] = useState("");
  const [pax, setPax] = useState(1);
  const [notas, setNotas] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [filtroCat, setFiltroCat] = useState("");
  const [saving, setSaving] = useState(false);

  const cats = useMemo(() => sortCats(Array.from(new Set(items.map(i => i.categoria).filter(Boolean)))), [items]);
  const filtered = useMemo(() => {
    const base = filtroCat ? items.filter(i => i.categoria === filtroCat) : items;
    return [...base].sort((a, b) => {
      const ra = catRank(a.categoria), rb = catRank(b.categoria);
      if (ra !== rb) return ra - rb;
      return (a.orden || 0) - (b.orden || 0) || (a.nombre || "").localeCompare(b.nombre || "");
    });
  }, [items, filtroCat]);

  const add = (it) => setCarrito(prev => {
    const ex = prev.find(x => x.id === it.id);
    if (ex) return prev.map(x => x.id === it.id ? { ...x, cantidad: x.cantidad + 1 } : x);
    return [...prev, { id: it.id, nombre: it.nombre, precio: it.precio || 0, cantidad: 1, notas: "" }];
  });
  const setCant = (id, c) => {
    const n = Number(c);
    if (n <= 0) return setCarrito(prev => prev.filter(x => x.id !== id));
    setCarrito(prev => prev.map(x => x.id === id ? { ...x, cantidad: n } : x));
  };

  const subtotal = carrito.reduce((s, x) => s + x.precio * x.cantidad, 0);
  const areaSel = areas.find(a => a.id === areaId);

  const guardar = async () => {
    if (!areaId)            return alert("Selecciona un área");
    if (carrito.length === 0) return alert("Agrega al menos un ítem");
    setSaving(true);
    const codigo = `PS-${Date.now()}`;
    const { error } = await supabase.from("pool_service_pedidos").insert({
      codigo,
      area_id:     areaId,
      area_nombre: areaSel?.nombre || areaId,
      huesped:     huesped || null,
      pax:         Number(pax) || 1,
      items:       carrito,
      subtotal,
      total:       subtotal,
      notas:       notas || null,
      estado:      "recibido",
      creado_por:  "staff",
    });
    setSaving(false);
    if (error) return alert("Error: " + error.message);
    onSaved?.();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(0, 2fr)", gap: 16 }}>
      {/* Sidebar: pedido */}
      <div style={{ background: B.navyMid, padding: 14, borderRadius: 12, position: "sticky", top: 12, alignSelf: "start", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#fff" }}>Nuevo pedido</div>
        <div style={{ marginBottom: 10 }}>
          <label style={LS}>Área</label>
          <select value={areaId} onChange={e => setAreaId(e.target.value)} style={IS}>
            <option value="">— Selecciona área —</option>
            {areas.map(a => (
              <option key={a.id} value={a.id}>{TIPO_ICON[a.tipo] || "📍"} {a.nombre}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={LS}>Huésped (opcional)</label>
            <input value={huesped} onChange={e => setHuesped(e.target.value)} style={IS} placeholder="Nombre" />
          </div>
          <div>
            <label style={LS}>Pax</label>
            <input type="number" value={pax} onChange={e => setPax(e.target.value)} style={IS} min={1} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={LS}>Notas</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} placeholder="Alergias, ubicación específica, etc." />
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
            Carrito ({carrito.length})
          </div>
          {carrito.length === 0 ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Vacío.</div>
          ) : carrito.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <input type="number" value={c.cantidad} onChange={e => setCant(c.id, e.target.value)} min={0}
                style={{ ...IS, width: 50, padding: "4px 6px" }} />
              <div style={{ flex: 1, fontSize: 12, minWidth: 0 }}>
                <div style={{ color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{COP(c.precio)} c/u</div>
              </div>
              <div style={{ fontSize: 11, color: B.success, fontWeight: 700 }}>{COP(c.precio * c.cantidad)}</div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 14, fontWeight: 800 }}>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>Total</span>
            <span style={{ color: B.success }}>{COP(subtotal)}</span>
          </div>
          <button onClick={guardar} disabled={saving || !areaId || carrito.length === 0}
            style={{ ...BTN(saving ? B.navyLight : B.success), width: "100%", marginTop: 12, opacity: (!areaId || carrito.length === 0) ? 0.5 : 1 }}>
            {saving ? "Guardando…" : "Crear pedido"}
          </button>
        </div>
      </div>

      {/* Menú */}
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={() => setFiltroCat("")} style={BTN(filtroCat === "" ? B.pool : B.navyMid)}>Todo</button>
          {cats.map(c => (
            <button key={c} onClick={() => setFiltroCat(c)} style={BTN(filtroCat === c ? B.pool : B.navyMid)}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {filtered.map(it => (
            <button key={it.id} onClick={() => add(it)}
              style={{ background: B.navyMid, border: "none", borderRadius: 10, padding: 12, textAlign: "left", cursor: "pointer", color: "#fff" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {it.categoria || "—"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, lineHeight: 1.2 }}>{it.nombre}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: B.success, marginTop: 6 }}>{COP(it.precio)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Áreas (gestión simple) ────────────────────────────────────────────────
function AreasManager({ areas, onChanged }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newArea, setNewArea] = useState({ nombre: "", tipo: "piscina", capacidad: 10, qr_code: "" });

  const guardarNueva = async () => {
    if (!newArea.nombre.trim()) return alert("Nombre es requerido");
    const id = `AREA-${Date.now()}`;
    const { error } = await supabase.from("pool_service_areas").insert({
      id,
      nombre:    newArea.nombre.trim(),
      tipo:      newArea.tipo,
      capacidad: Number(newArea.capacidad) || 0,
      qr_code:   newArea.qr_code.trim() || id.toLowerCase().replace(/_/g, "-"),
      activo:    true,
      orden:     (areas[areas.length - 1]?.orden || 0) + 10,
    });
    if (error) return alert("Error: " + error.message);
    setNewArea({ nombre: "", tipo: "piscina", capacidad: 10, qr_code: "" });
    setShowAdd(false);
    onChanged?.();
  };

  const toggleActivo = async (a) => {
    await supabase.from("pool_service_areas").update({ activo: !a.activo, updated_at: new Date().toISOString() }).eq("id", a.id);
    onChanged?.();
  };

  const portalUrl = (qr) => `${window.location.origin}/pool/${qr}`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          Cada área tiene un QR — el huésped lo escanea y entra al portal de pedidos.
        </div>
        <button onClick={() => setShowAdd(v => !v)} style={BTN(B.success)}>
          {showAdd ? "Cancelar" : "+ Nueva área"}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: B.navyMid, padding: 14, borderRadius: 10, marginBottom: 14, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={LS}>Nombre</label>
            <input value={newArea.nombre} onChange={e => setNewArea({ ...newArea, nombre: e.target.value })} style={IS} placeholder="Piscina Oeste" />
          </div>
          <div>
            <label style={LS}>Tipo</label>
            <select value={newArea.tipo} onChange={e => setNewArea({ ...newArea, tipo: e.target.value })} style={IS}>
              <option value="piscina">Piscina</option>
              <option value="piscina_chica">Piscina chica</option>
              <option value="beach">Beach</option>
              <option value="cabana">Cabaña</option>
              <option value="bar">Bar</option>
              <option value="vip">VIP</option>
              <option value="otra">Otra</option>
            </select>
          </div>
          <div>
            <label style={LS}>Capacidad</label>
            <input type="number" value={newArea.capacidad} onChange={e => setNewArea({ ...newArea, capacidad: e.target.value })} style={IS} />
          </div>
          <div>
            <label style={LS}>QR code (slug URL)</label>
            <input value={newArea.qr_code} onChange={e => setNewArea({ ...newArea, qr_code: e.target.value })} style={IS} placeholder="auto-generado" />
          </div>
          <button onClick={guardarNueva} style={BTN(B.success)}>Guardar</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {areas.map(a => (
          <div key={a.id} style={{ background: B.navyMid, borderRadius: 12, padding: 14, opacity: a.activo ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 24 }}>{TIPO_ICON[a.tipo] || "📍"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{a.nombre}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{a.tipo} · cap {a.capacidad}</div>
              </div>
            </div>
            <div style={{ background: B.navy, padding: 8, borderRadius: 6, fontSize: 11, color: B.sand, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 10 }}>
              {portalUrl(a.qr_code)}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <a href={portalUrl(a.qr_code)} target="_blank" rel="noreferrer" style={{ ...BTN(B.pool), textDecoration: "none", display: "inline-block", textAlign: "center", flex: 1 }}>
                Ver portal
              </a>
              <button onClick={() => toggleActivo(a)} style={BTN(a.activo ? B.danger + "55" : B.success, "#fff")}>
                {a.activo ? "Pausar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Vista del menú ────────────────────────────────────────────────────────
function VistaMenu({ items }) {
  const cats = useMemo(() => sortCats(Array.from(new Set(items.map(i => i.categoria).filter(Boolean)))), [items]);
  return (
    <div>
      {cats.map(cat => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            {cat}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {items.filter(i => i.categoria === cat).map(it => (
              <div key={it.id} style={{ background: B.navyMid, padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{it.nombre}</div>
                {it.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{it.descripcion}</div>}
                <div style={{ fontSize: 14, fontWeight: 800, color: B.success, marginTop: 6 }}>{COP(it.precio)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
