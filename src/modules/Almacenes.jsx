import React, { useState, useEffect, useMemo, useCallback } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { logAccion } from "../lib/logAccion";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const BTN_PRIM = { padding: "8px 14px", borderRadius: 8, border: "none", background: B.sky, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const BTN_SEC  = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontWeight: 600, fontSize: 12 };

export default function Almacenes() {
  const [tab, setTab] = useState("stock");
  const [almacenes, setAlmacenes] = useState([]);
  const [items, setItems] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [mesaMapping, setMesaMapping] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showNewTransfer, setShowNewTransfer] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email || ""));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [almRes, itemsRes, stockRes, transfRes, mapRes] = await Promise.all([
        supabase.from("almacenes").select("*").eq("activo", true).order("orden"),
        supabase.from("items_catalogo").select("id, nombre, unidad, categoria, precio_compra").eq("activo", true).order("nombre"),
        supabase.from("items_stock_almacen").select("*"),
        supabase.from("transferencias_almacen").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("mesa_almacen_mapping").select("*").order("prioridad", { ascending: false }),
      ]);
      if (cancelled) return;
      setAlmacenes(almRes.data || []);
      setItems(itemsRes.data || []);
      setStockRows(stockRes.data || []);
      setTransfers(transfRes.data || []);
      setMesaMapping(mapRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshTick]);

  const itemsById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const almById   = useMemo(() => new Map(almacenes.map(a => [a.id, a])), [almacenes]);

  // Stock por (item, almacen) mapeado
  const stockMap = useMemo(() => {
    const m = new Map();
    for (const r of stockRows) m.set(`${r.item_id}|${r.almacen_id}`, r);
    return m;
  }, [stockRows]);

  const stockPorAlmacen = useMemo(() => {
    const m = new Map();
    for (const r of stockRows) {
      if (!m.has(r.almacen_id)) m.set(r.almacen_id, []);
      m.get(r.almacen_id).push(r);
    }
    return m;
  }, [stockRows]);

  if (loading) return <div style={{ padding: 40, color: "#fff", textAlign: "center" }}>Cargando almacenes…</div>;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 20, color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🏬 Almacenes</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            Stock por ubicación física + transferencias entre almacenes.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "transferencias" && (
            <button onClick={() => setShowNewTransfer(true)} style={BTN_PRIM}>+ Nueva transferencia</button>
          )}
          <button onClick={() => setRefreshTick(t => t + 1)} style={BTN_SEC}>↻ Refrescar</button>
        </div>
      </div>

      {/* KPIs almacenes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>
        {almacenes.map(a => {
          const rows = stockPorAlmacen.get(a.id) || [];
          const total = rows.reduce((s, r) => s + (Number(r.cantidad) || 0) * (Number(itemsById.get(r.item_id)?.precio_compra) || 0), 0);
          const conStock = rows.filter(r => Number(r.cantidad) > 0).length;
          return (
            <div key={a.id} style={{ background: B.navyMid, borderRadius: 10, padding: 14, borderLeft: `3px solid ${a.color || B.sky}` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>{a.icon} {a.nombre}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: a.color || B.sky, marginTop: 4 }}>{conStock}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>items con stock · {COP(total)}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: `1px solid ${B.navyLight}`, flexWrap: "wrap" }}>
        <TabBtn active={tab==="stock"} onClick={() => setTab("stock")}>📦 Stock por almacén</TabBtn>
        <TabBtn active={tab==="transferencias"} onClick={() => setTab("transferencias")} count={transfers.length}>🔁 Transferencias</TabBtn>
        <TabBtn active={tab==="almacenes"} onClick={() => setTab("almacenes")} count={almacenes.length}>🏬 Gestionar almacenes</TabBtn>
      </div>

      {tab === "stock" && (
        <StockTab almacenes={almacenes} items={items} itemsById={itemsById} stockMap={stockMap} />
      )}

      {tab === "transferencias" && (
        <TransferenciasTab transfers={transfers} almById={almById} itemsById={itemsById} />
      )}

      {tab === "almacenes" && (
        <AlmacenesTab almacenes={almacenes} onReload={() => setRefreshTick(t => t + 1)} />
      )}

      {showNewTransfer && (
        <NewTransferModal
          almacenes={almacenes} items={items} itemsById={itemsById}
          stockMap={stockMap} userEmail={userEmail}
          onClose={() => setShowNewTransfer(false)}
          onSaved={() => { setShowNewTransfer(false); setRefreshTick(t => t + 1); }}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────

function TabBtn({ active, onClick, children, count }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 16px", background: "transparent", border: "none",
      borderBottom: active ? `2px solid ${B.sky}` : "2px solid transparent",
      color: active ? "#fff" : "rgba(255,255,255,0.5)",
      fontWeight: active ? 700 : 500, cursor: "pointer", fontSize: 13,
    }}>
      {children}
      {count !== undefined && <span style={{ marginLeft: 6, fontSize: 11, background: active ? B.sky + "44" : "rgba(255,255,255,0.1)", padding: "2px 7px", borderRadius: 10 }}>{count}</span>}
    </button>
  );
}

function StockTab({ almacenes, items, itemsById, stockMap }) {
  const [search, setSearch] = useState("");
  const [almacenFiltro, setAlmacenFiltro] = useState("todos");
  const [soloConStock, setSoloConStock] = useState(true);

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter(it => !q || it.nombre.toLowerCase().includes(q) || (it.categoria || "").toLowerCase().includes(q))
      .map(it => {
        const perAlm = almacenes.map(a => {
          const r = stockMap.get(`${it.id}|${a.id}`);
          return { almacen: a, cantidad: Number(r?.cantidad) || 0 };
        });
        const total = perAlm.reduce((s, x) => s + x.cantidad, 0);
        return { item: it, perAlm, total };
      })
      .filter(r => almacenFiltro === "todos" || r.perAlm.find(x => x.almacen.id === almacenFiltro && x.cantidad > 0))
      .filter(r => !soloConStock || r.total > 0)
      .sort((a, b) => a.item.nombre.localeCompare(b.item.nombre, "es"));
  }, [items, almacenes, stockMap, search, almacenFiltro, soloConStock]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar item..." style={{ ...IS, maxWidth: 300 }} />
        <select value={almacenFiltro} onChange={e => setAlmacenFiltro(e.target.value)} style={{ ...IS, maxWidth: 220 }}>
          <option value="todos">Todos los almacenes</option>
          {almacenes.map(a => <option key={a.id} value={a.id}>{a.icon} {a.nombre}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} />
          Solo con stock
        </label>
      </div>

      <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: `2fr repeat(${almacenes.length}, 1fr) 100px`, gap: 8, padding: "10px 14px", fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${B.navyLight}`, alignItems: "center" }}>
          <div>Item</div>
          {almacenes.map(a => <div key={a.id} style={{ textAlign: "right", color: a.color }}>{a.icon} {a.nombre.length > 12 ? a.nombre.slice(0, 12) + "..." : a.nombre}</div>)}
          <div style={{ textAlign: "right" }}>Total</div>
        </div>
        {rows.slice(0, 500).map(r => (
          <div key={r.item.id} style={{ display: "grid", gridTemplateColumns: `2fr repeat(${almacenes.length}, 1fr) 100px`, gap: 8, padding: "8px 14px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.item.nombre}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{r.item.categoria} · {r.item.unidad}</div>
            </div>
            {r.perAlm.map(x => (
              <div key={x.almacen.id} style={{ textAlign: "right", color: x.cantidad > 0 ? "#fff" : "rgba(255,255,255,0.25)" }}>
                {x.cantidad > 0 ? Number(x.cantidad).toLocaleString("es-CO", { maximumFractionDigits: 2 }) : "—"}
              </div>
            ))}
            <div style={{ textAlign: "right", fontWeight: 700, color: B.sky }}>{Number(r.total).toLocaleString("es-CO", { maximumFractionDigits: 2 })}</div>
          </div>
        ))}
        {rows.length > 500 && (
          <div style={{ padding: 12, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Mostrando primeros 500 de {rows.length}. Usa el buscador.</div>
        )}
      </div>
    </div>
  );
}

function TransferenciasTab({ transfers, almById, itemsById }) {
  const [expandedId, setExpandedId] = useState(null);

  const badge = (estado) => {
    const cfg = {
      borrador:      { color: "#888", bg: "#88888822", label: "Borrador" },
      en_transito:   { color: "#fbbf24", bg: "#fbbf2422", label: "En tránsito" },
      recibida:      { color: "#22c55e", bg: "#22c55e22", label: "Recibida" },
      cancelada:     { color: "#ef4444", bg: "#ef444422", label: "Cancelada" },
    }[estado] || { color: "#888", bg: "#88888822", label: estado };
    return <span style={{ fontSize: 10, padding: "2px 8px", background: cfg.bg, color: cfg.color, borderRadius: 10, border: `1px solid ${cfg.color}44` }}>{cfg.label}</span>;
  };

  if (transfers.length === 0) {
    return <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 10 }}>
      Sin transferencias todavía. Click en "+ Nueva transferencia" arriba.
    </div>;
  }
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
      {transfers.map(t => {
        const origen = almById.get(t.almacen_origen_id);
        const destino = almById.get(t.almacen_destino_id);
        const nItems = Array.isArray(t.items) ? t.items.length : 0;
        return (
          <div key={t.id}>
            <div onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 100px 100px", gap: 10, padding: "12px 16px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, cursor: "pointer", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fmtFecha(t.created_at)} · {t.id}</div>
                <div style={{ marginTop: 3 }}>{badge(t.estado)}</div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)" }}>{origen?.icon} {origen?.nombre || t.almacen_origen_id}</div>
              <div style={{ color: "rgba(255,255,255,0.7)" }}>→ {destino?.icon} {destino?.nombre || t.almacen_destino_id}</div>
              <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>{nItems} items</div>
              <div style={{ textAlign: "right", fontSize: 16, color: B.sky }}>{expandedId === t.id ? "▲" : "▼"}</div>
            </div>
            {expandedId === t.id && (
              <div style={{ background: B.navy, padding: "14px 20px", borderTop: `1px solid ${B.navyLight}` }}>
                {(t.items || []).map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, borderBottom: `1px solid ${B.navyLight}44` }}>
                    <div>{itemsById.get(it.item_id)?.nombre || it.item_id}</div>
                    <div style={{ color: B.sky, fontWeight: 700 }}>{it.cantidad} {it.unidad}</div>
                  </div>
                ))}
                {t.notas && <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Nota: {t.notas}</div>}
                <div style={{ marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.4)", display: "flex", gap: 12 }}>
                  <div>Solicitó: {t.solicitado_por || "—"}</div>
                  {t.enviado_por && <div>Envió: {t.enviado_por}</div>}
                  {t.recibido_por && <div>Recibió: {t.recibido_por}</div>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlmacenesTab({ almacenes, onReload }) {
  const [editando, setEditando] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button style={BTN_PRIM} onClick={() => setNuevo(true)}>+ Nuevo almacén</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {almacenes.map(a => (
          <div key={a.id} style={{ background: B.navyMid, borderRadius: 10, padding: 16, borderLeft: `3px solid ${a.color || B.sky}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 20 }}>{a.icon} {a.nombre}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{a.tipo} · {a.ubicacion || "sin ubicación"}</div>
                {a.responsable_email && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>👤 {a.responsable_email}</div>}
              </div>
              <button style={BTN_SEC} onClick={() => setEditando(a)}>✏️</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>id: {a.id}</div>
          </div>
        ))}
      </div>
      {(editando || nuevo) && (
        <AlmacenModal almacen={editando} onClose={() => { setEditando(null); setNuevo(false); }} onSaved={() => { setEditando(null); setNuevo(false); onReload(); }} />
      )}
    </div>
  );
}

function AlmacenModal({ almacen, onClose, onSaved }) {
  const isNew = !almacen?.id;
  const [form, setForm] = useState({
    id: almacen?.id || `ALM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    nombre: almacen?.nombre || "",
    tipo: almacen?.tipo || "bodega",
    ubicacion: almacen?.ubicacion || "",
    responsable_email: almacen?.responsable_email || "",
    color: almacen?.color || "#a78bfa",
    icon: almacen?.icon || "🏬",
    orden: almacen?.orden ?? 100,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    if (!form.nombre.trim()) { setErr("Nombre requerido"); return; }
    setBusy(true); setErr(null);
    const payload = { ...form, updated_at: new Date().toISOString() };
    const { error } = isNew
      ? await supabase.from("almacenes").insert(payload)
      : await supabase.from("almacenes").update(payload).eq("id", almacen.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    logAccion({ modulo: "almacenes", accion: isNew ? "crear_almacen" : "editar_almacen", tabla: "almacenes", registroId: form.id, datosDespues: payload });
    onSaved();
  };
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, width: 480, maxWidth: "95vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{isNew ? "🏬 Nuevo almacén" : "✏️ Editar " + almacen.nombre}</div>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={LS}>Nombre</label><input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} style={IS} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Tipo</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={IS}>
                <option value="bodega">Bodega</option><option value="cocina">Cocina</option>
                <option value="bar">Bar</option><option value="muelle">Muelle</option><option value="otro">Otro</option>
              </select>
            </div>
            <div><label style={LS}>Ubicación</label><input value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} style={IS} placeholder="Isla, Playa, etc" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Icon</label><input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={IS} maxLength={4} /></div>
            <div><label style={LS}>Color</label><input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...IS, padding: 3, height: 40 }} /></div>
            <div><label style={LS}>Orden</label><input type="number" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: Number(e.target.value) }))} style={IS} /></div>
          </div>
          <div><label style={LS}>Responsable (email)</label><input value={form.responsable_email} onChange={e => setForm(f => ({ ...f, responsable_email: e.target.value }))} style={IS} /></div>
        </div>
        {err && <div style={{ marginTop: 10, padding: 10, background: "#ef444422", color: "#fca5a5", borderRadius: 8, fontSize: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button style={BTN_SEC} onClick={onClose}>Cancelar</button>
          <button style={BTN_PRIM} onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

function NewTransferModal({ almacenes, items, itemsById, stockMap, userEmail, onClose, onSaved }) {
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [selectedItems, setSelectedItems] = useState([]); // [{ item_id, cantidad, unidad }]
  const [search, setSearch] = useState("");
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Items disponibles con stock > 0 en el origen
  const availableItems = useMemo(() => {
    if (!origen) return [];
    return items
      .map(it => {
        const s = stockMap.get(`${it.id}|${origen}`);
        return { item: it, disponible: Number(s?.cantidad) || 0 };
      })
      .filter(x => x.disponible > 0)
      .filter(x => !search || x.item.nombre.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.item.nombre.localeCompare(b.item.nombre, "es"));
  }, [items, stockMap, origen, search]);

  const addItem = (item, disponible) => {
    setSelectedItems(prev => {
      if (prev.find(x => x.item_id === item.id)) return prev;
      return [...prev, { item_id: item.id, cantidad: 0, unidad: item.unidad, disponible }];
    });
  };
  const updateCant = (id, cant) => setSelectedItems(prev => prev.map(x => x.item_id === id ? { ...x, cantidad: cant } : x));
  const removeItem = (id) => setSelectedItems(prev => prev.filter(x => x.item_id !== id));

  const ejecutar = async () => {
    if (!origen || !destino) { setErr("Selecciona origen y destino"); return; }
    if (origen === destino) { setErr("Origen y destino no pueden ser iguales"); return; }
    const validos = selectedItems.filter(x => Number(x.cantidad) > 0);
    if (validos.length === 0) { setErr("Agrega al menos un item con cantidad > 0"); return; }
    for (const x of validos) {
      if (Number(x.cantidad) > Number(x.disponible)) {
        const nom = itemsById.get(x.item_id)?.nombre || x.item_id;
        setErr(`${nom}: cantidad ${x.cantidad} supera stock disponible ${x.disponible}`);
        return;
      }
    }
    setBusy(true); setErr(null);

    const id = `TRF-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const itemsPayload = validos.map(x => ({
      item_id: x.item_id, cantidad: Number(x.cantidad), unidad: x.unidad,
    }));

    // Insert transferencia como 'recibida' — modelo simple: envío + recepción inmediato.
    // (Si en el futuro queremos flujo 'en_transito', cambiar aquí.)
    const { error: trfErr } = await supabase.from("transferencias_almacen").insert({
      id, almacen_origen_id: origen, almacen_destino_id: destino, items: itemsPayload,
      estado: "recibida",
      fecha_solicitud: nowIso, fecha_envio: nowIso, fecha_recepcion: nowIso,
      solicitado_por: userEmail, enviado_por: userEmail, recibido_por: userEmail,
      notas: notas.trim() || null, updated_at: nowIso,
    });
    if (trfErr) { setErr("Error creando transferencia: " + trfErr.message); setBusy(false); return; }

    // Registrar 2 movimientos + actualizar items_stock_almacen por cada item
    const origenNom = almacenes.find(a => a.id === origen)?.nombre || origen;
    const destinoNom = almacenes.find(a => a.id === destino)?.nombre || destino;
    const movs = [];
    for (const x of validos) {
      const nomIt = itemsById.get(x.item_id)?.nombre || x.item_id;
      movs.push(
        { id: `MOV-TRF-${Date.now()}-${x.item_id}-out`, tipo: "salida_transferencia", item_id: x.item_id,
          cantidad: Number(x.cantidad), unidad: x.unidad, almacen_id: origen,
          origen_tipo: "transferencias_almacen", origen_id: id, fecha: nowIso,
          usuario_email: userEmail, notas: `Transferencia ${origenNom} → ${destinoNom} · ${nomIt}` },
        { id: `MOV-TRF-${Date.now()}-${x.item_id}-in`, tipo: "entrada_transferencia", item_id: x.item_id,
          cantidad: Number(x.cantidad), unidad: x.unidad, almacen_id: destino,
          origen_tipo: "transferencias_almacen", origen_id: id, fecha: nowIso,
          usuario_email: userEmail, notas: `Transferencia ${origenNom} → ${destinoNom} · ${nomIt}` },
      );
    }
    const { error: movErr } = await supabase.from("movimientos_inventario_atolon").insert(movs);
    if (movErr) { setErr("Movs insertados con errores: " + movErr.message); setBusy(false); return; }

    // Actualizar items_stock_almacen — restar en origen, sumar en destino
    for (const x of validos) {
      const cant = Number(x.cantidad);
      // Origen: leer y actualizar
      const { data: rowOrig } = await supabase.from("items_stock_almacen").select("cantidad").eq("item_id", x.item_id).eq("almacen_id", origen).single();
      await supabase.from("items_stock_almacen").update({
        cantidad: (Number(rowOrig?.cantidad) || 0) - cant,
        updated_at: nowIso,
      }).eq("item_id", x.item_id).eq("almacen_id", origen);
      // Destino: upsert
      const { data: rowDest } = await supabase.from("items_stock_almacen").select("cantidad").eq("item_id", x.item_id).eq("almacen_id", destino).maybeSingle();
      if (rowDest) {
        await supabase.from("items_stock_almacen").update({
          cantidad: (Number(rowDest.cantidad) || 0) + cant, updated_at: nowIso,
        }).eq("item_id", x.item_id).eq("almacen_id", destino);
      } else {
        await supabase.from("items_stock_almacen").insert({
          item_id: x.item_id, almacen_id: destino, cantidad: cant, updated_at: nowIso,
        });
      }
    }

    logAccion({ modulo: "almacenes", accion: "crear_transferencia", tabla: "transferencias_almacen", registroId: id, datosDespues: { origen, destino, items: itemsPayload } });
    onSaved();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🔁 Nueva transferencia entre almacenes</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={LS}>Almacén origen</label>
            <select value={origen} onChange={e => { setOrigen(e.target.value); setSelectedItems([]); }} style={IS}>
              <option value="">— Seleccionar —</option>
              {almacenes.map(a => <option key={a.id} value={a.id}>{a.icon} {a.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={LS}>Almacén destino</label>
            <select value={destino} onChange={e => setDestino(e.target.value)} style={IS}>
              <option value="">— Seleccionar —</option>
              {almacenes.filter(a => a.id !== origen).map(a => <option key={a.id} value={a.id}>{a.icon} {a.nombre}</option>)}
            </select>
          </div>
        </div>

        {origen && (
          <>
            <div style={{ marginTop: 14, marginBottom: 8, fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Items seleccionados ({selectedItems.length})
            </div>
            {selectedItems.length === 0 ? (
              <div style={{ padding: 14, textAlign: "center", background: B.navy, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 10 }}>
                Agrega items del origen abajo
              </div>
            ) : (
              <div style={{ background: B.navy, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                {selectedItems.map(x => {
                  const it = itemsById.get(x.item_id);
                  const excede = Number(x.cantidad) > Number(x.disponible);
                  return (
                    <div key={x.item_id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 40px", gap: 8, padding: "6px 4px", fontSize: 12, alignItems: "center", borderBottom: `1px solid ${B.navyLight}44` }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{it?.nombre}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Disponible: {x.disponible} {x.unidad}</div>
                      </div>
                      <input type="number" min={0} max={x.disponible} value={x.cantidad}
                        onChange={e => updateCant(x.item_id, e.target.value)}
                        style={{ ...IS, borderColor: excede ? "#ef4444" : B.navyLight, color: excede ? "#fca5a5" : "#fff" }} />
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{x.unidad}</div>
                      <button onClick={() => removeItem(x.item_id)} style={{ background: "transparent", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 16 }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar items para agregar..." style={IS} />
              <div style={{ background: B.navy, borderRadius: 8, maxHeight: 200, overflowY: "auto", marginTop: 6 }}>
                {availableItems.slice(0, 30).map(x => {
                  const yaEsta = selectedItems.find(s => s.item_id === x.item.id);
                  return (
                    <div key={x.item.id} onClick={() => !yaEsta && addItem(x.item, x.disponible)}
                      style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", fontSize: 12, cursor: yaEsta ? "default" : "pointer", opacity: yaEsta ? 0.4 : 1, borderBottom: `1px solid ${B.navyLight}44` }}>
                      <div>
                        <div>{x.item.nombre}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{x.item.categoria}</div>
                      </div>
                      <div style={{ color: B.sky, fontWeight: 700 }}>{x.disponible} {x.item.unidad}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={LS}>Notas (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} />
        </div>

        {err && <div style={{ marginTop: 10, padding: 10, background: "#ef444422", color: "#fca5a5", borderRadius: 8, fontSize: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button style={BTN_SEC} onClick={onClose}>Cancelar</button>
          <button style={BTN_PRIM} onClick={ejecutar} disabled={busy}>
            {busy ? "Ejecutando..." : "Ejecutar transferencia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MapeoTab: mesa Loggro → almacén Atolón ─────────────────────────

function MapeoTab({ mapping, almacenes, onReload }) {
  const [editando, setEditando] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const almById = useMemo(() => new Map(almacenes.map(a => [a.id, a])), [almacenes]);

  const eliminar = async (id) => {
    if (!confirm("Eliminar este mapeo?")) return;
    const { error } = await supabase.from("mesa_almacen_mapping").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    logAccion({ modulo: "almacenes", accion: "eliminar_mapeo", tabla: "mesa_almacen_mapping", registroId: id });
    onReload();
  };

  return (
    <div>
      <div style={{ background: B.navyMid, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Cómo funciona</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
          Cuando Loggro registra una venta, Atolón OS decide de qué almacén descontar los ingredientes según la mesa.
          Los patrones usan sintaxis SQL <code style={{ background: B.navy, padding: "1px 5px", borderRadius: 3 }}>LIKE</code> — <code>%</code> = cualquier texto,
          <code>_</code> = un carácter. Ejemplo: <code>PS%</code> matchea PS11, PS12, etc.
          El de <b>mayor prioridad</b> gana. Un patrón <code>%</code> con prioridad 0 sirve de fallback.
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <button style={BTN_PRIM} onClick={() => setNuevo(true)}>+ Nuevo mapeo</button>
      </div>

      <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 200px 1fr 200px 100px 80px", gap: 10, padding: "10px 16px", fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${B.navyLight}` }}>
          <div>Prioridad</div><div>Patrón mesa</div><div>Notas</div><div>Almacén destino</div><div>Estado</div><div></div>
        </div>
        {mapping.map(m => {
          const alm = almById.get(m.almacen_id);
          return (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "80px 200px 1fr 200px 100px 80px", gap: 10, padding: "10px 16px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 700, color: m.prioridad >= 100 ? B.sky : "rgba(255,255,255,0.5)" }}>{m.prioridad}</div>
              <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#fbbf24" }}>{m.mesa_pattern}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{m.notas || "—"}</div>
              <div style={{ color: alm?.color || "#fff" }}>{alm ? `${alm.icon} ${alm.nombre}` : m.almacen_id}</div>
              <div>
                <span style={{ fontSize: 10, padding: "2px 8px", background: m.activo ? "#22c55e22" : "#88888822", color: m.activo ? "#22c55e" : "#888", borderRadius: 10 }}>
                  {m.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button style={{ ...BTN_SEC, padding: "4px 8px", fontSize: 11 }} onClick={() => setEditando(m)}>✏️</button>
                <button style={{ ...BTN_SEC, padding: "4px 8px", fontSize: 11, color: "#fca5a5" }} onClick={() => eliminar(m.id)}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {(editando || nuevo) && (
        <MapeoModal mapeo={editando} almacenes={almacenes} onClose={() => { setEditando(null); setNuevo(false); }} onSaved={() => { setEditando(null); setNuevo(false); onReload(); }} />
      )}
    </div>
  );
}

function MapeoModal({ mapeo, almacenes, onClose, onSaved }) {
  const isNew = !mapeo?.id;
  const [form, setForm] = useState({
    id: mapeo?.id || `MAP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    mesa_pattern: mapeo?.mesa_pattern || "",
    almacen_id: mapeo?.almacen_id || almacenes[0]?.id || "",
    prioridad: mapeo?.prioridad ?? 100,
    notas: mapeo?.notas || "",
    activo: mapeo?.activo ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!form.mesa_pattern.trim()) { setErr("Patrón de mesa requerido"); return; }
    if (!form.almacen_id) { setErr("Selecciona un almacén"); return; }
    setBusy(true); setErr(null);
    const payload = { ...form, updated_at: new Date().toISOString() };
    const { error } = isNew
      ? await supabase.from("mesa_almacen_mapping").insert(payload)
      : await supabase.from("mesa_almacen_mapping").update(payload).eq("id", mapeo.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    logAccion({ modulo: "almacenes", accion: isNew ? "crear_mapeo" : "editar_mapeo", tabla: "mesa_almacen_mapping", registroId: form.id, datosDespues: payload });
    onSaved();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, width: 480, maxWidth: "95vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{isNew ? "🎯 Nuevo mapeo" : "✏️ Editar mapeo"}</div>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={LS}>Patrón mesa (SQL LIKE)</label>
            <input value={form.mesa_pattern} onChange={e => setForm(f => ({ ...f, mesa_pattern: e.target.value }))} style={{ ...IS, fontFamily: "monospace" }} placeholder="ej. PS%, C%, HB%, %" />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>% = cualquier texto · _ = un carácter · exacto = "PS11"</div>
          </div>
          <div>
            <label style={LS}>Almacén destino</label>
            <select value={form.almacen_id} onChange={e => setForm(f => ({ ...f, almacen_id: e.target.value }))} style={IS}>
              {almacenes.map(a => <option key={a.id} value={a.id}>{a.icon} {a.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Prioridad</label>
              <input type="number" value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: Number(e.target.value) }))} style={IS} />
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Mayor gana. Usa 0 para fallback</div>
            </div>
            <div>
              <label style={LS}>Activo</label>
              <select value={form.activo ? "1" : "0"} onChange={e => setForm(f => ({ ...f, activo: e.target.value === "1" }))} style={IS}>
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </div>
          </div>
          <div>
            <label style={LS}>Notas</label>
            <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={IS} placeholder="Descripción del mapeo" />
          </div>
        </div>
        {err && <div style={{ marginTop: 10, padding: 10, background: "#ef444422", color: "#fca5a5", borderRadius: 8, fontSize: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button style={BTN_SEC} onClick={onClose}>Cancelar</button>
          <button style={BTN_PRIM} onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
