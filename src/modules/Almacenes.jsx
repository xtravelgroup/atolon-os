import React, { useState, useEffect, useMemo } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { logAccion } from "../lib/logAccion";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const BTN_PRIM = { padding: "8px 14px", borderRadius: 8, border: "none", background: B.sky, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const BTN_SEC  = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontWeight: 600, fontSize: 12 };

// ─── Locaciones "principales" a mostrar como columnas en Stock ────
// El resto (mini bares por habitación) queda accesible con filtro.
const LOCS_PRINCIPALES = [
  "LOC-ALMACEN-COCINA",
  "LOC-ALMACEN-BAR",
  "LOC-BAR",
  "LOC-BEACHCLUB",
  "LOC-EVENTOS",
  "LOC-HOTEL",
];

export default function Almacenes() {
  const [tab, setTab] = useState("stock");
  const [locaciones, setLocaciones] = useState([]);
  const [items, setItems] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [movs, setMovs] = useState([]);
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
      const [locRes, itemsRes, stockRes, movsRes] = await Promise.all([
        supabase.from("items_locaciones").select("*").eq("activa", true).order("nombre"),
        supabase.from("items_catalogo").select("id, nombre, unidad, categoria, precio_compra, locacion_default_id").eq("activo", true).order("nombre"),
        supabase.from("items_stock_locacion").select("*"),
        // Últimas 100 transferencias entre locaciones (via movimientos_inventario_atolon)
        supabase.from("movimientos_inventario_atolon")
          .select("id, tipo, item_id, cantidad, unidad, almacen_id, origen_tipo, origen_id, fecha, usuario_email, notas")
          .in("tipo", ["salida_transferencia", "entrada_transferencia"])
          .eq("anulado", false)
          .order("fecha", { ascending: false })
          .limit(200),
      ]);
      if (cancelled) return;
      setLocaciones(locRes.data || []);
      setItems(itemsRes.data || []);
      setStockRows(stockRes.data || []);
      setMovs(movsRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshTick]);

  const itemsById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const locById   = useMemo(() => new Map(locaciones.map(l => [l.id, l])), [locaciones]);
  const stockMap = useMemo(() => {
    const m = new Map();
    for (const r of stockRows) m.set(`${r.item_id}|${r.locacion_id}`, r);
    return m;
  }, [stockRows]);
  const stockPorLoc = useMemo(() => {
    const m = new Map();
    for (const r of stockRows) {
      if (!m.has(r.locacion_id)) m.set(r.locacion_id, []);
      m.get(r.locacion_id).push(r);
    }
    return m;
  }, [stockRows]);

  // Agrupar movs por origen_id (transferencia)
  const transferencias = useMemo(() => {
    const map = new Map();
    for (const m of movs) {
      if (m.origen_tipo !== "transferencia_manual" && m.origen_tipo !== "transferencias_locacion") continue;
      if (!map.has(m.origen_id)) map.set(m.origen_id, { id: m.origen_id, fecha: m.fecha, usuario: m.usuario_email, items: [], origen: null, destino: null });
      const t = map.get(m.origen_id);
      if (m.tipo === "salida_transferencia") t.origen = m.almacen_id;
      else if (m.tipo === "entrada_transferencia") t.destino = m.almacen_id;
      const existing = t.items.find(x => x.item_id === m.item_id);
      if (!existing) t.items.push({ item_id: m.item_id, cantidad: m.cantidad, unidad: m.unidad });
    }
    return [...map.values()].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  }, [movs]);

  if (loading) return <div style={{ padding: 40, color: "#fff", textAlign: "center" }}>Cargando almacenes…</div>;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 20, color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🏬 Almacenes y Locaciones</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            Stock por ubicación física + transferencias manuales entre locaciones.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "transferencias" && (
            <button onClick={() => setShowNewTransfer(true)} style={BTN_PRIM}>+ Nueva transferencia</button>
          )}
          <button onClick={() => setRefreshTick(t => t + 1)} style={BTN_SEC}>↻ Refrescar</button>
        </div>
      </div>

      {/* KPIs por locación principal */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>
        {locaciones.filter(l => LOCS_PRINCIPALES.includes(l.id)).map(l => {
          const rows = stockPorLoc.get(l.id) || [];
          const conStock = rows.filter(r => Number(r.cantidad) > 0).length;
          const total = rows.reduce((s, r) => s + (Number(r.cantidad) || 0) * (Number(itemsById.get(r.item_id)?.precio_compra) || 0), 0);
          return (
            <div key={l.id} style={{ background: B.navyMid, borderRadius: 10, padding: 14, borderLeft: `3px solid ${B.sky}` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>{l.icono || "📍"} {l.nombre}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: B.sky, marginTop: 4 }}>{conStock}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>items con stock · {COP(total)}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: `1px solid ${B.navyLight}`, flexWrap: "wrap" }}>
        <TabBtn active={tab==="stock"} onClick={() => setTab("stock")}>📦 Stock por locación</TabBtn>
        <TabBtn active={tab==="transferencias"} onClick={() => setTab("transferencias")} count={transferencias.length}>🔁 Transferencias</TabBtn>
      </div>

      {tab === "stock" && (
        <StockTab locaciones={locaciones} items={items} itemsById={itemsById} stockMap={stockMap} />
      )}

      {tab === "transferencias" && (
        <TransferenciasTab transferencias={transferencias} locById={locById} itemsById={itemsById} />
      )}

      {showNewTransfer && (
        <NewTransferModal
          locaciones={locaciones} items={items} itemsById={itemsById}
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

function StockTab({ locaciones, items, itemsById, stockMap }) {
  const [search, setSearch] = useState("");
  const [locFiltro, setLocFiltro] = useState("todos");
  const [soloConStock, setSoloConStock] = useState(true);

  // Columnas: siempre principales + si el filtro es específico, esa columna
  const columnasLoc = useMemo(() => {
    const principales = locaciones.filter(l => LOCS_PRINCIPALES.includes(l.id));
    if (locFiltro === "todos" || principales.find(l => l.id === locFiltro)) return principales;
    const extra = locaciones.find(l => l.id === locFiltro);
    return extra ? [extra, ...principales] : principales;
  }, [locaciones, locFiltro]);

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter(it => !q || it.nombre.toLowerCase().includes(q) || (it.categoria || "").toLowerCase().includes(q))
      .map(it => {
        const perLoc = columnasLoc.map(l => {
          const r = stockMap.get(`${it.id}|${l.id}`);
          return { loc: l, cantidad: Number(r?.cantidad) || 0 };
        });
        // Total: sumar todo el stock en TODAS las locaciones, no solo columnas visibles
        let total = 0;
        for (const l of locaciones) {
          const r = stockMap.get(`${it.id}|${l.id}`);
          if (r) total += Number(r.cantidad) || 0;
        }
        return { item: it, perLoc, total };
      })
      .filter(r => locFiltro === "todos" || r.perLoc.find(x => x.loc.id === locFiltro && x.cantidad > 0))
      .filter(r => !soloConStock || r.total > 0)
      .sort((a, b) => a.item.nombre.localeCompare(b.item.nombre, "es"));
  }, [items, locaciones, stockMap, search, locFiltro, soloConStock, columnasLoc]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar item..." style={{ ...IS, maxWidth: 300 }} />
        <select value={locFiltro} onChange={e => setLocFiltro(e.target.value)} style={{ ...IS, maxWidth: 240 }}>
          <option value="todos">Todas las locaciones</option>
          {locaciones.map(l => <option key={l.id} value={l.id}>{l.icono || "📍"} {l.nombre}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} />
          Solo con stock
        </label>
      </div>

      <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: `2fr repeat(${columnasLoc.length}, 1fr) 100px`, gap: 8, padding: "10px 14px", fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${B.navyLight}`, alignItems: "center" }}>
          <div>Item</div>
          {columnasLoc.map(l => <div key={l.id} style={{ textAlign: "right" }}>{l.icono || "📍"} {(l.nombre || "").length > 14 ? l.nombre.slice(0, 14) + "..." : l.nombre}</div>)}
          <div style={{ textAlign: "right" }}>Total</div>
        </div>
        {rows.slice(0, 500).map(r => (
          <div key={r.item.id} style={{ display: "grid", gridTemplateColumns: `2fr repeat(${columnasLoc.length}, 1fr) 100px`, gap: 8, padding: "8px 14px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.item.nombre}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{r.item.categoria} · {r.item.unidad}</div>
            </div>
            {r.perLoc.map(x => (
              <div key={x.loc.id} style={{ textAlign: "right", color: x.cantidad > 0 ? "#fff" : "rgba(255,255,255,0.25)" }}>
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

function TransferenciasTab({ transferencias, locById, itemsById }) {
  const [expandedId, setExpandedId] = useState(null);

  if (transferencias.length === 0) {
    return <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 10 }}>
      Sin transferencias todavía. Click en "+ Nueva transferencia" arriba.
    </div>;
  }
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
      {transferencias.map(t => {
        const origen = locById.get(t.origen);
        const destino = locById.get(t.destino);
        return (
          <div key={t.id}>
            <div onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 100px 100px", gap: 10, padding: "12px 16px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, cursor: "pointer", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fmtFecha(t.fecha)}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{t.usuario}</div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)" }}>{origen?.icono || "📍"} {origen?.nombre || t.origen}</div>
              <div style={{ color: "rgba(255,255,255,0.7)" }}>→ {destino?.icono || "📍"} {destino?.nombre || t.destino}</div>
              <div style={{ textAlign: "right", color: B.sky, fontWeight: 700 }}>{t.items.length} items</div>
              <div style={{ textAlign: "right", fontSize: 16, color: B.sky }}>{expandedId === t.id ? "▲" : "▼"}</div>
            </div>
            {expandedId === t.id && (
              <div style={{ background: B.navy, padding: "14px 20px", borderTop: `1px solid ${B.navyLight}` }}>
                {t.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, borderBottom: `1px solid ${B.navyLight}44` }}>
                    <div>{itemsById.get(it.item_id)?.nombre || it.item_id}</div>
                    <div style={{ color: B.sky, fontWeight: 700 }}>{it.cantidad} {it.unidad}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NewTransferModal({ locaciones, items, itemsById, stockMap, userEmail, onClose, onSaved }) {
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [search, setSearch] = useState("");
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

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
    setSelectedItems(prev => prev.find(x => x.item_id === item.id)
      ? prev
      : [...prev, { item_id: item.id, cantidad: 0, unidad: item.unidad, disponible }]);
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
        setErr(`${itemsById.get(x.item_id)?.nombre || x.item_id}: cantidad ${x.cantidad} supera disponible ${x.disponible}`);
        return;
      }
    }
    setBusy(true); setErr(null);

    const transferId = `TRF-${Date.now()}`;
    const nowIso = new Date().toISOString();

    // Insertar 2 movs por item (salida en origen, entrada en destino)
    const movs = [];
    for (const x of validos) {
      const it = itemsById.get(x.item_id);
      movs.push(
        { id: `MOV-TRF-${transferId}-${x.item_id}-out`, tipo: "salida_transferencia", item_id: x.item_id,
          cantidad: Number(x.cantidad), unidad: x.unidad, almacen_id: origen,
          origen_tipo: "transferencia_manual", origen_id: transferId, fecha: nowIso,
          usuario_email: userEmail, notas: notas.trim() || `Transferencia manual → ${it?.nombre}` },
        { id: `MOV-TRF-${transferId}-${x.item_id}-in`, tipo: "entrada_transferencia", item_id: x.item_id,
          cantidad: Number(x.cantidad), unidad: x.unidad, almacen_id: destino,
          origen_tipo: "transferencia_manual", origen_id: transferId, fecha: nowIso,
          usuario_email: userEmail, notas: notas.trim() || `Transferencia manual ← ${it?.nombre}` },
      );
    }
    const { error: movErr } = await supabase.from("movimientos_inventario_atolon").insert(movs);
    if (movErr) { setErr("Error insertando movimientos: " + movErr.message); setBusy(false); return; }

    // Actualizar items_stock_locacion — restar origen, sumar destino
    for (const x of validos) {
      const cant = Number(x.cantidad);
      const { data: rowOrig } = await supabase.from("items_stock_locacion")
        .select("cantidad").eq("item_id", x.item_id).eq("locacion_id", origen).single();
      await supabase.from("items_stock_locacion").update({
        cantidad: (Number(rowOrig?.cantidad) || 0) - cant, updated_at: nowIso,
      }).eq("item_id", x.item_id).eq("locacion_id", origen);

      const { data: rowDest } = await supabase.from("items_stock_locacion")
        .select("cantidad").eq("item_id", x.item_id).eq("locacion_id", destino).maybeSingle();
      if (rowDest) {
        await supabase.from("items_stock_locacion").update({
          cantidad: (Number(rowDest.cantidad) || 0) + cant, updated_at: nowIso,
        }).eq("item_id", x.item_id).eq("locacion_id", destino);
      } else {
        await supabase.from("items_stock_locacion").insert({
          item_id: x.item_id, locacion_id: destino, cantidad: cant, updated_at: nowIso,
        });
      }
    }

    logAccion({ modulo: "almacenes", accion: "transferencia_manual", tabla: "movimientos_inventario_atolon", registroId: transferId,
      datosDespues: { origen, destino, items: validos.map(x => ({ item_id: x.item_id, cantidad: Number(x.cantidad) })) } });
    onSaved();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🔁 Nueva transferencia manual</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={LS}>Locación origen</label>
            <select value={origen} onChange={e => { setOrigen(e.target.value); setSelectedItems([]); }} style={IS}>
              <option value="">— Seleccionar —</option>
              {locaciones.map(l => <option key={l.id} value={l.id}>{l.icono || "📍"} {l.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={LS}>Locación destino</label>
            <select value={destino} onChange={e => setDestino(e.target.value)} style={IS}>
              <option value="">— Seleccionar —</option>
              {locaciones.filter(l => l.id !== origen).map(l => <option key={l.id} value={l.id}>{l.icono || "📍"} {l.nombre}</option>)}
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
