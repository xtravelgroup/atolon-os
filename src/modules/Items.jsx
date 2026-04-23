import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { getCart, addToCart, clearCart, onCartChange } from "../lib/requisicionCart";

// ─── Constantes ──────────────────────────────────────────────────────────────
const UNIDADES = ["Unidades", "Kg", "Gramos", "Litros", "Galones", "Cajas", "Paquetes", "Bolsas", "Metros", "Rollos", "Pares"];
const FALLBACK_ICON = "📦";
const FALLBACK_COLOR = "#888888";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function Items() {
  const [items, setItems] = useState([]);
  const [categorias, setCategorias] = useState([]); // from items_categorias
  const [proveedoresAll, setProveedoresAll] = useState([]);
  const [itemProvs, setItemProvs] = useState([]); // items_proveedores rows
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");
  const [showModal, setShowModal] = useState(null); // null | "new" | item object
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("catalogo"); // "catalogo" | "inventario" | "categorias"
  const [invSearch, setInvSearch] = useState("");
  const [invCatFilter, setInvCatFilter] = useState("todos");
  const [invFilter, setInvFilter] = useState("todos"); // "todos" | "con_stock" | "bajo_min" | "negativo"
  const [invSortBy, setInvSortBy] = useState("valor"); // "valor" | "stock" | "nombre" | "categoria"
  const [invSortDir, setInvSortDir] = useState("desc");
  const [showCatModal, setShowCatModal] = useState(null); // null | "new" | cat object
  const [sortBy, setSortBy] = useState("nombre"); // "nombre" | "categoria" | "unidad" | "precio"
  const [sortDir, setSortDir] = useState("asc");

  // Build lookup maps from dynamic categorias
  const catNames = useMemo(() => categorias.filter(c => c.activo !== false).map(c => c.nombre), [categorias]);
  const catIconMap = useMemo(() => Object.fromEntries(categorias.map(c => [c.nombre, c.icon || FALLBACK_ICON])), [categorias]);
  const catColorMap = useMemo(() => Object.fromEntries(categorias.map(c => [c.nombre, c.color || FALLBACK_COLOR])), [categorias]);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [iR, pR, ipR, cR] = await Promise.all([
      supabase.from("items_catalogo").select("*").order("nombre"),
      supabase.from("proveedores").select("id, nombre, nit, telefono, email").order("nombre"),
      supabase.from("items_proveedores").select("*").order("updated_at", { ascending: false }),
      supabase.from("items_categorias").select("*").order("orden, nombre"),
    ]);
    setItems(iR.data || []);
    setProveedoresAll(pR.data || []);
    setItemProvs(ipR.data || []);
    setCategorias(cR.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Carrito de requisición ──
  const [cart, setCart] = useState(() => getCart());
  useEffect(() => {
    const unsub = onCartChange(setCart);
    return unsub;
  }, []);

  const agregarACarrito = (item, precio) => {
    const cantStr = window.prompt(`¿Cuántos ${item.unidad || "unidades"} de "${item.nombre}"?`, "1");
    if (cantStr === null) return; // canceló
    const cant = Number(cantStr);
    if (!cant || cant <= 0) return alert("Cantidad inválida");
    addToCart({
      item_id: item.id,
      nombre: item.nombre,
      unidad: item.unidad || "Unidades",
      categoria: item.categoria,
      cant,
      precioU: precio || item.precio_compra || 0,
    });
  };

  const irARequisicion = () => {
    window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "requisiciones", action: "nuevaDesdeCarrito" } }));
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const provsForItem = useCallback((itemId) => itemProvs.filter(ip => ip.item_id === itemId), [itemProvs]);

  const precioMejor = useCallback((itemId) => {
    const provs = provsForItem(itemId);
    if (provs.length === 0) return null;
    const principal = provs.find(p => p.es_principal);
    if (principal) return principal.precio;
    return Math.min(...provs.map(p => p.precio));
  }, [provsForItem]);

  const filtered = useMemo(() => {
    let list = items.filter(i => i.activo !== false);
    if (catFilter !== "todos") list = list.filter(i => i.categoria === catFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i => i.nombre?.toLowerCase().includes(s) || i.codigo?.toLowerCase().includes(s) || i.descripcion?.toLowerCase().includes(s));
    }
    // Sort
    list = [...list].sort((a, b) => {
      let va, vb;
      if (sortBy === "nombre") { va = (a.nombre || "").toLowerCase(); vb = (b.nombre || "").toLowerCase(); }
      else if (sortBy === "categoria") { va = (a.categoria || "").toLowerCase(); vb = (b.categoria || "").toLowerCase(); }
      else if (sortBy === "unidad") { va = (a.unidad || "").toLowerCase(); vb = (b.unidad || "").toLowerCase(); }
      else if (sortBy === "precio_compra") { va = Number(a.precio_compra) || 0; vb = Number(b.precio_compra) || 0; }
      else if (sortBy === "stock") { va = Number(a.stock_actual) || 0; vb = Number(b.stock_actual) || 0; }
      else { va = precioMejor(a.id) ?? 999999999; vb = precioMejor(b.id) ?? 999999999; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, catFilter, search, sortBy, sortDir, precioMejor]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalItems = items.filter(i => i.activo !== false).length;
  const conProveedor = items.filter(i => i.activo !== false && provsForItem(i.id).length > 0).length;
  const sinProveedor = totalItems - conProveedor;
  const catCounts = useMemo(() => {
    const map = {};
    items.filter(i => i.activo !== false).forEach(i => { map[i.categoria] = (map[i.categoria] || 0) + 1; });
    return map;
  }, [items]);

  // ── Save item ─────────────────────────────────────────────────────────────
  const saveItem = async (form, proveedores) => {
    if (!supabase) return;
    const isNew = !form.id || form.id === "new";
    const row = {
      nombre: form.nombre,
      codigo: form.codigo || null,
      descripcion: form.descripcion || null,
      categoria: form.categoria,
      unidad: form.unidad || "Unidades",
      foto_url: form.foto_url || null,
      activo: true,
      updated_at: new Date().toISOString(),
    };

    let itemId;
    if (isNew) {
      const { data, error } = await supabase.from("items_catalogo").insert(row).select("id").single();
      if (error) return alert("Error: " + error.message);
      itemId = data.id;
    } else {
      itemId = form.id;
      await supabase.from("items_catalogo").update(row).eq("id", itemId);
    }

    // Sync proveedores: delete all then re-insert
    await supabase.from("items_proveedores").delete().eq("item_id", itemId);
    if (proveedores.length > 0) {
      const rows = proveedores.map(p => ({
        item_id: itemId,
        proveedor_id: p.proveedor_id || null,
        proveedor_nombre: p.proveedor_nombre || "",
        precio: Number(p.precio) || 0,
        es_principal: !!p.es_principal,
        notas: p.notas || null,
        updated_at: new Date().toISOString(),
      }));
      await supabase.from("items_proveedores").insert(rows);
    }

    setShowModal(null);
    setDetail(null);
    load();
  };

  const deleteItem = async (id) => {
    if (!confirm("¿Desactivar este producto?")) return;
    await supabase.from("items_catalogo").update({ activo: false, updated_at: new Date().toISOString() }).eq("id", id);
    setDetail(null);
    load();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando catálogo…</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", margin: 0 }}>
          Catálogo de Productos
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "catalogo" && (
            <>
              <button onClick={async () => {
                if (!confirm("Sincronizar ingredientes desde Loggro?\n\nEsto actualizará los productos con sus datos reales de inventario (precio compra, stock, unidad).")) return;
                try {
                  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/sync-ingredients`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: "{}",
                  });
                  const data = await res.json();
                  alert(`✓ ${data.synced || 0} ingredientes sincronizados`);
                  load();
                } catch (err) { alert("Error: " + err.message); }
              }} style={{ ...BTN(B.navyLight), color: B.sky, border: `1px solid ${B.sky}44` }}>
                🔄 Sync Loggro
              </button>
              <button onClick={() => setShowModal("new")} style={BTN(B.sky, B.navy)}>+ Nuevo Producto</button>
            </>
          )}
          {tab === "inventario" && (
            <button onClick={async () => {
              if (!confirm("Sincronizar stock actual desde Loggro?")) return;
              try {
                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/sync-ingredients`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                  },
                  body: "{}",
                });
                const data = await res.json();
                alert(`✓ ${data.synced || 0} ítems actualizados desde Loggro`);
                load();
              } catch (err) { alert("Error: " + err.message); }
            }} style={{ ...BTN(B.navyLight), color: B.sky, border: `1px solid ${B.sky}44` }}>
              🔄 Sync Loggro
            </button>
          )}
          {tab === "categorias" && <button onClick={() => setShowCatModal("new")} style={BTN(B.sky, B.navy)}>+ Nueva Categoría</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: "catalogo", label: "🛒 Productos" },
          { key: "inventario", label: "📦 Inventario" },
          { key: "categorias", label: "🏷️ Categorías" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", borderRadius: 8, border: `1px solid ${tab === t.key ? B.sky : B.navyLight}`,
            background: tab === t.key ? B.sky + "22" : B.navyMid, color: tab === t.key ? B.sky : "rgba(255,255,255,0.5)",
            cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "catalogo" && <>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "Total productos", value: totalItems, color: B.sky },
          { label: "Con proveedor", value: conProveedor, color: B.success },
          { label: "Sin proveedor", value: sinProveedor, color: sinProveedor > 0 ? B.warning : "rgba(255,255,255,0.3)" },
        ].map(k => (
          <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 20px", flex: "1 1 180px", borderLeft: `4px solid ${k.color}`, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Categorías chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => setCatFilter("todos")} style={{
          padding: "6px 14px", borderRadius: 20, border: `1px solid ${catFilter === "todos" ? B.sky : B.navyLight}`,
          background: catFilter === "todos" ? B.sky + "22" : B.navyMid, color: catFilter === "todos" ? B.sky : "rgba(255,255,255,0.5)",
          cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}>Todos ({totalItems})</button>
        {catNames.map(c => {
          const cnt = catCounts[c] || 0;
          if (cnt === 0) return null;
          const active = catFilter === c;
          const clr = catColorMap[c] || "#fff";
          return (
            <button key={c} onClick={() => setCatFilter(active ? "todos" : c)} style={{
              padding: "6px 14px", borderRadius: 20, border: `1px solid ${active ? clr : B.navyLight}`,
              background: active ? clr + "22" : B.navyMid, color: active ? clr : "rgba(255,255,255,0.5)",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}>{catIconMap[c]} {c} ({cnt})</button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar producto..." style={{ ...IS, maxWidth: 400 }} />
      </div>

      {/* Lista de productos */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
          {search ? "No hay productos que coincidan" : "No hay productos en esta categoría"}
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 14, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          {/* Header con sort */}
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1.3fr 0.7fr 0.9fr 0.9fr 0.9fr 1fr", padding: "10px 18px", borderBottom: `2px solid ${B.navyLight}`, gap: 8 }}>
            {[
              { key: "nombre", label: "Producto" },
              { key: "categoria", label: "Categoría" },
              { key: "unidad", label: "Unidad" },
              { key: "precio_compra", label: "P. Compra" },
              { key: "stock", label: "Stock" },
              { key: "precio", label: "P. Proveedor" },
              { key: null, label: "Proveedor" },
            ].map(col => (
              <div key={col.label}
                onClick={col.key ? () => { if (sortBy === col.key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col.key); setSortDir("asc"); } } : undefined}
                style={{
                  fontSize: 10, fontWeight: 700, color: sortBy === col.key ? B.sky : B.sand,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  cursor: col.key ? "pointer" : "default", userSelect: "none",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {col.label}
                {sortBy === col.key && <span style={{ fontSize: 10 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
              </div>
            ))}
          </div>
          {/* Rows */}
          {filtered.map((item, idx) => {
            const provs = provsForItem(item.id);
            const precio = precioMejor(item.id);
            const principal = provs.find(p => p.es_principal);
            const clr = catColorMap[item.categoria] || "#fff";
            return (
              <div key={item.id} onClick={() => setDetail(item)}
                style={{
                  display: "grid", gridTemplateColumns: "2.2fr 1.3fr 0.7fr 0.9fr 0.9fr 0.9fr 1fr", padding: "11px 18px", gap: 8,
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${B.navyLight}` : "none",
                  cursor: "pointer", transition: "background 0.1s", alignItems: "center",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{catIconMap[item.categoria] || "📦"}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: B.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nombre}</div>
                    {item.codigo && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{item.codigo}</div>}
                  </div>
                </div>
                <div>
                  <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: `${clr}18`, color: clr }}>
                    {item.categoria}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{item.unidad}</div>
                <div>
                  {Number(item.precio_compra) > 0 ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: B.sand }}>{COP(item.precio_compra)}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</span>
                  )}
                </div>
                <div>
                  {item.stock_actual != null ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: Number(item.stock_actual) < Number(item.stock_minimo || 0) && Number(item.stock_minimo) > 0 ? B.danger : "rgba(255,255,255,0.7)" }}>
                      {Number(item.stock_actual).toLocaleString("es-CO")}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</span>
                  )}
                </div>
                <div>
                  {precio != null ? (
                    <span style={{ fontSize: 13, fontWeight: 700, color: B.success }}>{COP(precio)}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {provs.length === 0 ? "—" : principal?.proveedor_nombre || provs[0]?.proveedor_nombre || `${provs.length} proveedores`}
                </div>
              </div>
            );
          })}
          {/* Footer */}
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.3)", display: "flex", justifyContent: "space-between" }}>
            <span>{filtered.length} producto{filtered.length !== 1 ? "s" : ""}</span>
            <span>Ordenado por: {sortBy} {sortDir === "asc" ? "A→Z" : "Z→A"}</span>
          </div>
        </div>
      )}

      </>}

      {/* ══ TAB INVENTARIO ══ */}
      {tab === "inventario" && (
        <InventarioTab
          items={items}
          categorias={categorias}
          catIconMap={catIconMap}
          catColorMap={catColorMap}
          invSearch={invSearch} setInvSearch={setInvSearch}
          invCatFilter={invCatFilter} setInvCatFilter={setInvCatFilter}
          invFilter={invFilter} setInvFilter={setInvFilter}
          invSortBy={invSortBy} setInvSortBy={setInvSortBy}
          invSortDir={invSortDir} setInvSortDir={setInvSortDir}
        />
      )}

      {/* ══ TAB CATEGORÍAS ══ */}
      {tab === "categorias" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {categorias.filter(c => c.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0)).map(cat => (
              <div key={cat.id} onClick={() => setShowCatModal(cat)}
                style={{
                  background: B.navyMid, borderRadius: 14, padding: "18px 20px", cursor: "pointer",
                  border: `1px solid ${B.navyLight}`, transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 14,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = cat.color || FALLBACK_COLOR; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = B.navyLight; }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${cat.color || FALLBACK_COLOR}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                  {cat.icon || FALLBACK_ICON}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{cat.nombre}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: cat.departamento === "Bar" ? "#a78bfa22" : "#f59e0b22", color: cat.departamento === "Bar" ? "#a78bfa" : "#f59e0b", fontWeight: 600 }}>
                      {cat.departamento === "Bar" ? "🍹 Bar" : "🍳 Cocina"}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                      {(catCounts[cat.nombre] || 0)} productos
                    </span>
                  </div>
                </div>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: cat.color || FALLBACK_COLOR }} />
              </div>
            ))}
          </div>
          {categorias.filter(c => c.activo !== false).length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
              No hay categorías. Crea la primera.
            </div>
          )}
        </div>
      )}

      {/* Categoría Modal */}
      {showCatModal && (
        <CatModal
          cat={showCatModal === "new" ? null : showCatModal}
          onSave={async (form) => {
            if (!supabase) return;
            if (form.id) {
              await supabase.from("items_categorias").update({ nombre: form.nombre, icon: form.icon, color: form.color, orden: form.orden, departamento: form.departamento }).eq("id", form.id);
            } else {
              await supabase.from("items_categorias").insert({ nombre: form.nombre, icon: form.icon, color: form.color, orden: form.orden, departamento: form.departamento });
            }
            setShowCatModal(null);
            load();
          }}
          onDelete={async (id) => {
            if (!confirm("¿Desactivar esta categoría?")) return;
            await supabase.from("items_categorias").update({ activo: false }).eq("id", id);
            setShowCatModal(null);
            load();
          }}
          onClose={() => setShowCatModal(null)}
        />
      )}

      {/* Modal nuevo/editar */}
      {showModal && (
        <ItemModal
          item={showModal === "new" ? null : showModal}
          proveedoresAll={proveedoresAll}
          existingProvs={showModal !== "new" ? provsForItem(showModal.id) : []}
          catNames={catNames}
          onSave={saveItem}
          onClose={() => setShowModal(null)}
        />
      )}

      {/* Detail panel */}
      {detail && (
        <DetailPanel
          item={detail}
          provs={provsForItem(detail.id)}
          proveedoresAll={proveedoresAll}
          catIconMap={catIconMap}
          catColorMap={catColorMap}
          onEdit={() => { setShowModal(detail); setDetail(null); }}
          onDelete={() => deleteItem(detail.id)}
          onClose={() => setDetail(null)}
        />
      )}

      {/* ── Carrito flotante de requisición ── */}
      {cart.length > 0 && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 1500,
          background: B.navyMid, border: `2px solid ${B.success}`, borderRadius: 14,
          boxShadow: "0 8px 30px rgba(0,0,0,0.4)", padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 14, maxWidth: 420,
        }}>
          <div style={{ fontSize: 24 }}>🛒</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.white }}>
              {cart.length} producto{cart.length !== 1 ? "s" : ""} en requisición
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {cart.slice(0, 3).map(c => `${c.cant}× ${c.nombre}`).join(" · ")}{cart.length > 3 ? ` +${cart.length - 3}` : ""}
            </div>
          </div>
          <button onClick={irARequisicion}
            style={{ background: B.success, color: B.navy, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
            Ir a requisición →
          </button>
          <button onClick={() => { if (confirm("¿Vaciar carrito?")) clearCart(); }}
            title="Vaciar carrito"
            style={{ background: "none", color: "rgba(255,255,255,0.4)", border: "none", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEM MODAL (New / Edit)
// ═══════════════════════════════════════════════════════════════════════════
function ItemModal({ item, proveedoresAll, existingProvs, catNames, onSave, onClose }) {
  const [form, setForm] = useState({
    id: item?.id || "new",
    nombre: item?.nombre || "",
    codigo: item?.codigo || "",
    descripcion: item?.descripcion || "",
    categoria: item?.categoria || "Alimentos",
    unidad: item?.unidad || "Unidades",
    foto_url: item?.foto_url || "",
  });
  const [provs, setProvs] = useState(
    existingProvs.length > 0
      ? existingProvs.map(p => ({ ...p }))
      : []
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addProv = () => setProvs(ps => [...ps, { proveedor_id: "", proveedor_nombre: "", precio: 0, es_principal: false, notas: "" }]);
  const updateProv = (i, k, v) => setProvs(ps => {
    const copy = [...ps];
    copy[i] = { ...copy[i], [k]: v };
    // Si marca como principal, desmarcar los demás
    if (k === "es_principal" && v) {
      copy.forEach((p, j) => { if (j !== i) copy[j] = { ...copy[j], es_principal: false }; });
    }
    return copy;
  });
  const removeProv = (i) => setProvs(ps => ps.filter((_, j) => j !== i));

  const handleSave = () => {
    if (!form.nombre.trim()) return alert("Nombre es obligatorio");
    // Sync proveedor_nombre from proveedoresAll
    const finalProvs = provs.map(p => {
      if (p.proveedor_id) {
        const prov = proveedoresAll.find(pr => pr.id === p.proveedor_id);
        return { ...p, proveedor_nombre: prov?.nombre || p.proveedor_nombre };
      }
      return p;
    }).filter(p => p.proveedor_id || p.proveedor_nombre);
    onSave(form, finalProvs);
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 660, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {item ? "✏️ Editar Producto" : "📦 Nuevo Producto"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Form fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px", marginBottom: 18 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LS}>Nombre del producto</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: Pechuga de pollo" style={IS} autoFocus />
          </div>
          <div>
            <label style={LS}>Código / SKU</label>
            <input value={form.codigo} onChange={e => set("codigo", e.target.value)} placeholder="Opcional" style={IS} />
          </div>
          <div>
            <label style={LS}>Categoría</label>
            <select value={form.categoria} onChange={e => set("categoria", e.target.value)} style={IS}>
              {catNames.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={LS}>Unidad de medida</label>
            <select value={form.unidad} onChange={e => set("unidad", e.target.value)} style={IS}>
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label style={LS}>Foto URL</label>
            <input value={form.foto_url} onChange={e => set("foto_url", e.target.value)} placeholder="https://..." style={IS} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LS}>Descripción</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={2} placeholder="Opcional" style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        </div>

        {/* Proveedores */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Proveedores & Precios</span>
            <button onClick={addProv} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "5px 12px", color: B.sky }}>+ Agregar proveedor</button>
          </div>

          {provs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12, background: B.navy, borderRadius: 10 }}>
              Sin proveedores — agrega uno para registrar precios
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {provs.map((p, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 32px", gap: 8, alignItems: "end", background: B.navy, borderRadius: 10, padding: "10px 12px" }}>
                  <div>
                    <label style={{ ...LS, fontSize: 10 }}>Proveedor</label>
                    <select value={p.proveedor_id || ""} onChange={e => {
                      const prov = proveedoresAll.find(pr => pr.id === e.target.value);
                      updateProv(i, "proveedor_id", e.target.value);
                      if (prov) updateProv(i, "proveedor_nombre", prov.nombre);
                    }} style={{ ...IS, fontSize: 12 }}>
                      <option value="">— Seleccionar —</option>
                      {proveedoresAll.map(pr => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...LS, fontSize: 10 }}>Precio</label>
                    <input type="number" value={p.precio || ""} onChange={e => updateProv(i, "precio", Number(e.target.value))} style={{ ...IS, fontSize: 12 }} placeholder="$0" />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <label style={{ ...LS, fontSize: 10 }}>Principal</label>
                    <input type="checkbox" checked={!!p.es_principal} onChange={e => updateProv(i, "es_principal", e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                  </div>
                  <button onClick={() => removeProv(i)} style={{ background: "none", border: "none", color: B.danger, fontSize: 16, cursor: "pointer", padding: 4 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={BTN(B.navyLight, "rgba(255,255,255,0.5)")}>Cancelar</button>
          <button onClick={handleSave} style={BTN(B.sky, B.navy)}>💾 Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL PANEL (slide-over)
// ═══════════════════════════════════════════════════════════════════════════
function DetailPanel({ item, provs, proveedoresAll, catIconMap, catColorMap, onEdit, onDelete, onClose }) {
  const clr = catColorMap[item.categoria] || "#fff";

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 480, maxWidth: "95vw", height: "100vh", overflowY: "auto", background: B.navyMid, padding: 28, borderLeft: `3px solid ${clr}` }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: `${clr}22`, color: clr }}>
              {catIconMap[item.categoria]} {item.categoria}
            </span>
            <h2 style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", margin: "8px 0 0" }}>{item.nombre}</h2>
            {item.codigo && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Código: {item.codigo}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Info */}
        {item.descripcion && (
          <div style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
            {item.descripcion}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ background: B.navy, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Unidad</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{item.unidad}</div>
          </div>
          <div style={{ background: B.navy, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Proveedores</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{provs.length}</div>
          </div>
        </div>

        {/* Foto */}
        {item.foto_url && (
          <div style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden" }}>
            <img src={item.foto_url} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover" }} />
          </div>
        )}

        {/* Proveedores table */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Proveedores & Precios
          </div>
          {provs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12, background: B.navy, borderRadius: 10 }}>
              Sin proveedores registrados
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {provs.sort((a, b) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0)).map(p => {
                const prov = proveedoresAll.find(pr => pr.id === p.proveedor_id);
                return (
                  <div key={p.id} style={{
                    background: B.navy, borderRadius: 10, padding: "12px 16px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    border: p.es_principal ? `1px solid ${B.success}44` : "1px solid transparent",
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.proveedor_nombre || prov?.nombre || "—"}</div>
                      {prov?.telefono && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{prov.telefono}</div>}
                      {p.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{p.notas}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: B.success }}>{COP(p.precio)}</div>
                      {p.es_principal && (
                        <span style={{ fontSize: 9, color: B.success, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>⭐ Principal</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onEdit} style={{ ...BTN(B.sky, B.navy), flex: 1 }}>✏️ Editar</button>
          <button onClick={onDelete} style={{ ...BTN(B.navyLight, B.danger) }}>🗑️</button>
        </div>

        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 16, textAlign: "center" }}>
          Creado: {fmtFecha(item.created_at)} · ID: {item.id}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY MODAL
// ═══════════════════════════════════════════════════════════════════════════
const EMOJI_OPTIONS = ["📦", "🍳", "🍹", "🛏️", "🔧", "📊", "📒", "🚤", "🧹", "⚡", "🎨", "🏗️", "💊", "🧪", "🖥️", "👕", "🚿", "🌿", "🔌", "🍽️"];
const COLOR_OPTIONS = ["#f59e0b", "#a78bfa", "#34d399", "#f97316", "#38bdf8", "#fbbf24", "#06b6d4", "#888888", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];

function CatModal({ cat, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    id: cat?.id || null,
    nombre: cat?.nombre || "",
    icon: cat?.icon || "📦",
    color: cat?.color || "#888888",
    orden: cat?.orden || 0,
    departamento: cat?.departamento || "Cocina",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 440, maxWidth: "95vw", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {cat ? "✏️ Editar Categoría" : "🏷️ Nueva Categoría"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Preview */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, background: B.navy, borderRadius: 12, padding: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `${form.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
            {form.icon}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{form.nombre || "Nombre..."}</div>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: form.color, marginTop: 4 }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
          <div>
            <label style={LS}>Nombre</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: Alimentos" style={IS} autoFocus />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={LS}>Departamento</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Cocina", "Bar"].map(d => (
                  <button key={d} onClick={() => set("departamento", d)} style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
                    background: form.departamento === d ? (d === "Cocina" ? "#f59e0b22" : "#a78bfa22") : B.navy,
                    border: `1px solid ${form.departamento === d ? (d === "Cocina" ? "#f59e0b" : "#a78bfa") : B.navyLight}`,
                    color: form.departamento === d ? (d === "Cocina" ? "#f59e0b" : "#a78bfa") : "rgba(255,255,255,0.4)",
                  }}>{d === "Cocina" ? "🍳" : "🍹"} {d}</button>
                ))}
              </div>
            </div>
            <div style={{ width: 80 }}>
              <label style={LS}>Orden</label>
              <input type="number" value={form.orden} onChange={e => set("orden", Number(e.target.value))} style={IS} />
            </div>
          </div>
          <div>
            <label style={LS}>Icono</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => set("icon", e)} style={{
                  width: 36, height: 36, borderRadius: 8, border: form.icon === e ? `2px solid ${B.sky}` : `1px solid ${B.navyLight}`,
                  background: form.icon === e ? B.sky + "22" : B.navy, fontSize: 18, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={LS}>Color</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => set("color", c)} style={{
                  width: 32, height: 32, borderRadius: 8, background: c, cursor: "pointer",
                  border: form.color === c ? "3px solid white" : "2px solid transparent",
                  transition: "all 0.1s",
                }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            {cat && <button onClick={() => onDelete(cat.id)} style={BTN(B.navyLight, B.danger)}>🗑️ Eliminar</button>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={BTN(B.navyLight, "rgba(255,255,255,0.5)")}>Cancelar</button>
            <button onClick={() => { if (!form.nombre.trim()) return alert("Nombre obligatorio"); onSave(form); }} style={BTN(B.sky, B.navy)}>💾 Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTARIO TAB
// ═══════════════════════════════════════════════════════════════════════════
function InventarioTab({
  items, categorias, catIconMap, catColorMap,
  invSearch, setInvSearch, invCatFilter, setInvCatFilter,
  invFilter, setInvFilter, invSortBy, setInvSortBy, invSortDir, setInvSortDir,
}) {
  const activos = items.filter(i => i.activo !== false);
  // Estado del modal "Agregar a requisición"
  const [cartModal, setCartModal] = useState(null); // null | { item, cant }

  // ── Multi-locación ──
  const [locaciones, setLocaciones] = useState([]);
  const [stockPorLoc, setStockPorLoc] = useState({}); // { "item_id|loc_id": cantidad }
  const [locFilter, setLocFilter] = useState("todos"); // "todos" | loc_id
  const [transferModal, setTransferModal] = useState(null); // null | { item }
  const [newLocModal, setNewLocModal] = useState(false);

  const loadLocaciones = useCallback(async () => {
    if (!supabase) return;
    const [lR, sR] = await Promise.all([
      supabase.from("items_locaciones").select("*").eq("activa", true).order("orden"),
      supabase.from("items_stock_locacion").select("item_id, locacion_id, cantidad"),
    ]);
    setLocaciones(lR.data || []);
    const map = {};
    (sR.data || []).forEach(s => { map[`${s.item_id}|${s.locacion_id}`] = Number(s.cantidad) || 0; });
    setStockPorLoc(map);
  }, []);
  useEffect(() => { loadLocaciones(); }, [loadLocaciones]);

  const stockEnLoc = (item_id, loc_id) => Number(stockPorLoc[`${item_id}|${loc_id}`]) || 0;
  const stockTotalNuestro = (item_id) => locaciones.reduce((s, l) => s + stockEnLoc(item_id, l.id), 0);

  const filtered = useMemo(() => {
    let list = activos;
    if (invCatFilter !== "todos") list = list.filter(i => i.categoria === invCatFilter);
    if (invSearch) {
      const s = invSearch.toLowerCase();
      list = list.filter(i => i.nombre?.toLowerCase().includes(s) || i.codigo?.toLowerCase().includes(s));
    }
    // Stock según locación seleccionada (Todas = suma de nuestros depósitos)
    const stockDe = (i) => locFilter === "todos" ? stockTotalNuestro(i.id) : stockEnLoc(i.id, locFilter);
    if (invFilter === "con_stock") list = list.filter(i => stockDe(i) > 0);
    else if (invFilter === "bajo_min") list = list.filter(i => stockDe(i) > 0 && Number(i.stock_minimo || 0) > 0 && stockDe(i) <= Number(i.stock_minimo));
    else if (invFilter === "negativo") list = list.filter(i => stockDe(i) < 0);

    list = [...list].sort((a, b) => {
      let va, vb;
      if (invSortBy === "valor") {
        va = stockDe(a) * (Number(a.precio_compra) || 0);
        vb = stockDe(b) * (Number(b.precio_compra) || 0);
      } else if (invSortBy === "stock") { va = stockDe(a); vb = stockDe(b); }
      else if (invSortBy === "nombre") { va = (a.nombre || "").toLowerCase(); vb = (b.nombre || "").toLowerCase(); }
      else if (invSortBy === "categoria") { va = (a.categoria || "").toLowerCase(); vb = (b.categoria || "").toLowerCase(); }
      if (va < vb) return invSortDir === "asc" ? -1 : 1;
      if (va > vb) return invSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [activos, invSearch, invCatFilter, invFilter, invSortBy, invSortDir]);

  const toggleSort = (k) => {
    if (invSortBy === k) setInvSortDir(d => d === "asc" ? "desc" : "asc");
    else { setInvSortBy(k); setInvSortDir("desc"); }
  };

  const conStock = activos.filter(i => Number(i.stock_actual || 0) > 0);
  const bajoMin = activos.filter(i => Number(i.stock_actual || 0) > 0 && Number(i.stock_minimo || 0) > 0 && Number(i.stock_actual) <= Number(i.stock_minimo));
  const negativos = activos.filter(i => Number(i.stock_actual || 0) < 0);
  const valorTotal = activos.reduce((s, i) => s + (Number(i.stock_actual) || 0) * (Number(i.precio_compra) || 0), 0);

  const exportCSV = () => {
    const rows = [["Nombre", "Categoría", "Unidad", "Stock actual", "Stock mínimo", "Precio compra", "Valor inventario"]];
    filtered.forEach(i => {
      const val = (Number(i.stock_actual) || 0) * (Number(i.precio_compra) || 0);
      rows.push([i.nombre, i.categoria, i.unidad, i.stock_actual, i.stock_minimo, i.precio_compra, Math.round(val)]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventario_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const stockColor = (stock, min) => {
    const s = Number(stock) || 0;
    const m = Number(min) || 0;
    if (s < 0) return B.danger;
    if (m > 0 && s <= m) return B.warning;
    if (s > 0) return B.success;
    return "rgba(255,255,255,0.25)";
  };

  const catsConInv = [...new Set(activos.filter(i => i.categoria).map(i => i.categoria))].sort();

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Con stock", value: conStock.length, color: B.success, sub: `${activos.length} total` },
          { label: "Bajo mínimo", value: bajoMin.length, color: B.warning, sub: "reponer" },
          { label: "Stock negativo", value: negativos.length, color: B.danger, sub: "revisar en Loggro" },
          { label: "Valor inventario", value: COP(valorTotal), color: B.sand, big: true },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
            <div style={{ fontSize: k.big ? 22 : 28, fontWeight: 900, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Selector de locación */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center", background: B.navyMid, padding: "10px 14px", borderRadius: 10, border: `1px solid ${B.navyLight}` }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>📍 Locación:</span>
        {[{ id: "todos", nombre: "Todas", icono: "🌐" }, ...locaciones].map(loc => {
          const active = locFilter === loc.id;
          return (
            <button key={loc.id} onClick={() => setLocFilter(loc.id)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: `1px solid ${active ? B.sky : B.navyLight}`,
                background: active ? B.sky + "22" : "transparent",
                color: active ? B.sky : "rgba(255,255,255,0.55)",
                cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}>
              {loc.icono} {loc.nombre}
              {loc.es_principal && <span style={{ fontSize: 9, marginLeft: 4, color: active ? B.sky : "rgba(255,255,255,0.35)" }}>★ principal</span>}
              {loc.es_ventas && <span style={{ fontSize: 9, marginLeft: 4, color: active ? B.success : "rgba(74,222,128,0.5)" }}>💰 ventas</span>}
            </button>
          );
        })}
        <button onClick={() => setNewLocModal(true)}
          style={{ padding: "7px 12px", borderRadius: 8, border: `1px dashed ${B.sand}`, background: "transparent", color: B.sand, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
          + Agregar locación
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <input placeholder="🔍 Buscar ítem…" value={invSearch} onChange={e => setInvSearch(e.target.value)}
          style={{ ...IS, width: 260 }} />
        <select value={invCatFilter} onChange={e => setInvCatFilter(e.target.value)} style={{ ...IS, width: 220 }}>
          <option value="todos">Todas las categorías</option>
          {catsConInv.map(c => <option key={c} value={c}>{catIconMap[c] || "📦"} {c}</option>)}
        </select>
        <div style={{ display: "flex", gap: 0, border: `1px solid ${B.navyLight}`, borderRadius: 8, overflow: "hidden" }}>
          {[
            { k: "todos", l: "Todos" },
            { k: "con_stock", l: "Con stock" },
            { k: "bajo_min", l: "⚠ Bajo mín" },
            { k: "negativo", l: "Negativo" },
          ].map(f => (
            <button key={f.k} onClick={() => setInvFilter(f.k)}
              style={{
                padding: "9px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                background: invFilter === f.k ? B.sky : B.navyMid,
                color: invFilter === f.k ? B.navy : "rgba(255,255,255,0.6)",
              }}>
              {f.l}
            </button>
          ))}
        </div>
        <button onClick={exportCSV} style={{ ...BTN(B.navyLight), color: B.sand, border: `1px solid ${B.sand}44`, marginLeft: "auto" }}>
          📥 CSV
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}`, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ background: B.navyLight }}>
              {[
                { k: "nombre", label: "Ítem" },
                { k: "categoria", label: "Categoría" },
                { k: null, label: "Unidad" },
                { k: "stock", label: "Stock actual", right: true },
                { k: null, label: "Mín", right: true },
                { k: null, label: "Precio compra", right: true },
                { k: "valor", label: "Valor total", right: true },
                { k: null, label: "", right: false },
              ].map(h => (
                <th key={h.label}
                  onClick={h.k ? () => toggleSort(h.k) : undefined}
                  style={{
                    padding: "12px 14px", textAlign: h.right ? "right" : "left",
                    fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700,
                    cursor: h.k ? "pointer" : "default", userSelect: "none",
                  }}>
                  {h.label} {h.k && invSortBy === h.k && (invSortDir === "asc" ? "↑" : "↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Sin ítems que mostrar</td></tr>
            ) : filtered.map(i => {
              const stock = locFilter === "todos" ? stockTotalNuestro(i.id) : stockEnLoc(i.id, locFilter);
              const loggroStock = Number(i.stock_actual) || 0;
              const diff = locFilter === "todos" ? (stock - loggroStock) : 0;
              const min = Number(i.stock_minimo) || 0;
              const precio = Number(i.precio_compra) || 0;
              const valor = stock * precio;
              // Desglose por locación cuando se ven "Todas"
              const desglose = locFilter === "todos"
                ? locaciones.map(loc => ({ loc, cant: stockEnLoc(i.id, loc.id) })).filter(x => x.cant !== 0)
                : null;
              const color = stockColor(stock, min);
              const cc = catColorMap[i.categoria] || "#888";
              return (
                <tr key={i.id} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                  <td style={{ padding: "11px 14px", fontWeight: 500, color: B.white }}>{i.nombre}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 10, background: cc + "22", color: cc, fontWeight: 600 }}>
                      {catIconMap[i.categoria] || "📦"} {i.categoria || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{i.unidad || "—"}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, color }}>
                    {stock.toFixed(2)}
                    {desglose && desglose.length > 0 && (
                      <div style={{ fontSize: 9, fontFamily: "inherit", fontWeight: 500, color: "rgba(255,255,255,0.4)", marginTop: 2, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {desglose.map(d => <span key={d.loc.id}>{d.loc.icono}{d.cant.toFixed(0)}</span>)}
                      </div>
                    )}
                    {locFilter === "todos" && Math.abs(diff) > 0.01 && (
                      <div style={{ fontSize: 9, fontFamily: "inherit", fontWeight: 600, color: diff > 0 ? B.warning : B.danger, marginTop: 2 }} title="Diferencia vs Loggro">
                        Δ Loggro: {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 12, color: min > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)" }}>
                    {min > 0 ? min.toFixed(0) : "—"}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 12, color: precio > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>
                    {precio > 0 ? COP(precio) : "—"}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700, color: valor > 0 ? B.sand : "rgba(255,255,255,0.2)", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15 }}>
                    {valor > 0 ? COP(valor) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", width: 84 }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setTransferModal({ item: i }); }}
                        title="Transferir entre locaciones"
                        style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: B.sky + "22", color: B.sky, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>
                        🔄
                      </button>
                      {locFilter === "todos" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCartModal({ item: i, cant: "1" }); }}
                          title="Agregar a requisición"
                          style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: B.success + "22", color: B.success, cursor: "pointer", fontSize: 20, fontWeight: 800, lineHeight: 1 }}>
                          +
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.4)", display: "flex", justifyContent: "space-between" }}>
          <span>{filtered.length} ítem{filtered.length !== 1 ? "s" : ""}</span>
          <span>Total visible: {COP(filtered.reduce((s, i) => s + (Number(i.stock_actual)||0) * (Number(i.precio_compra)||0), 0))}</span>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
        Inventario sincronizado desde Loggro Restobar · Compras nuevas entran a Almacén · Ventas salen del Bar
      </div>

      {/* ── Modal Transferencia entre locaciones ── */}
      {transferModal && (() => {
        const i = transferModal.item;
        const [fromLoc, setFromLocRaw] = [transferModal.from || locaciones.find(l => l.es_principal)?.id || locaciones[0]?.id, (v) => setTransferModal(m => ({ ...m, from: v }))];
        const [toLoc, setToLocRaw] = [transferModal.to || locaciones.find(l => l.es_ventas)?.id || locaciones[1]?.id, (v) => setTransferModal(m => ({ ...m, to: v }))];
        const cant = transferModal.cant || "";
        const cantNum = Number(cant) || 0;
        const stockFrom = stockEnLoc(i.id, fromLoc);
        const stockTo   = stockEnLoc(i.id, toLoc);
        const excede = cantNum > stockFrom;
        const confirmar = async () => {
          if (!cantNum || cantNum <= 0) return alert("Cantidad inválida");
          if (excede) return alert(`No hay suficiente en ${locaciones.find(l => l.id === fromLoc)?.nombre} (disponible: ${stockFrom})`);
          if (fromLoc === toLoc) return alert("Selecciona locaciones distintas");
          // Obtener email usuario
          const { data: { session } } = await supabase.auth.getSession();
          const email = session?.user?.email || "sistema";
          // Upsert stock origen (resta)
          await supabase.from("items_stock_locacion").upsert({
            item_id: i.id, locacion_id: fromLoc,
            cantidad: stockFrom - cantNum, updated_at: new Date().toISOString(),
          }, { onConflict: "item_id,locacion_id" });
          // Upsert stock destino (suma)
          await supabase.from("items_stock_locacion").upsert({
            item_id: i.id, locacion_id: toLoc,
            cantidad: stockTo + cantNum, updated_at: new Date().toISOString(),
          }, { onConflict: "item_id,locacion_id" });
          // Registrar transferencia
          await supabase.from("items_transferencias").insert({
            id: `TR-${Date.now()}`, item_id: i.id,
            from_locacion_id: fromLoc, to_locacion_id: toLoc,
            cantidad: cantNum, motivo: transferModal.motivo || null, usuario_email: email,
          });
          await loadLocaciones();
          setTransferModal(null);
        };
        return (
          <div onClick={e => e.target === e.currentTarget && setTransferModal(null)}
            style={{ position: "fixed", inset: 0, zIndex: 1200, background: "#00000088", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 480, padding: 28, border: `1px solid ${B.navyLight}` }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.sand, marginBottom: 4 }}>🔄 Transferir stock</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
                {i.nombre} <span style={{ color: "rgba(255,255,255,0.3)" }}>· {i.unidad}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" }}>Desde</label>
                  <select value={fromLoc} onChange={e => setFromLocRaw(e.target.value)} style={IS}>
                    {locaciones.map(l => <option key={l.id} value={l.id}>{l.icono} {l.nombre} ({stockEnLoc(i.id, l.id).toFixed(0)})</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 22, color: B.sky, paddingTop: 20 }}>→</div>
                <div>
                  <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" }}>Hacia</label>
                  <select value={toLoc} onChange={e => setToLocRaw(e.target.value)} style={IS}>
                    {locaciones.map(l => <option key={l.id} value={l.id}>{l.icono} {l.nombre} ({stockEnLoc(i.id, l.id).toFixed(0)})</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" }}>Cantidad a transferir</label>
                <input type="number" autoFocus value={cant}
                  onChange={e => setTransferModal(m => ({ ...m, cant: e.target.value }))}
                  style={{ ...IS, textAlign: "center", fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }} />
                {excede && <div style={{ fontSize: 11, color: B.danger, marginTop: 4 }}>⚠️ No hay suficiente stock en origen ({stockFrom})</div>}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" }}>Motivo (opcional)</label>
                <input value={transferModal.motivo || ""} onChange={e => setTransferModal(m => ({ ...m, motivo: e.target.value }))}
                  placeholder="Ej: Reposición bar" style={IS} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setTransferModal(null)}
                  style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
                <button onClick={confirmar} disabled={!cantNum || excede || fromLoc === toLoc}
                  style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: (!cantNum || excede || fromLoc === toLoc) ? B.navyLight : B.sky, color: B.navy, cursor: (!cantNum || excede) ? "default" : "pointer", fontWeight: 700, fontSize: 14 }}>
                  ✓ Transferir
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal Nueva Locación ── */}
      {newLocModal && (
        <NewLocacionModal onClose={() => setNewLocModal(false)} onSaved={() => { setNewLocModal(false); loadLocaciones(); }} />
      )}

      {/* ── Modal "Agregar a requisición" ── */}
      {cartModal && (() => {
        const i = cartModal.item;
        const cantNum = Number(cartModal.cant) || 0;
        const precioU = Number(i.precio_compra) || 0;
        const subtotal = cantNum * precioU;
        const confirmar = () => {
          if (!cantNum || cantNum <= 0) return alert("Cantidad inválida");
          addToCart({
            item_id: i.id,
            nombre: i.nombre,
            unidad: i.unidad || "Unidades",
            categoria: i.categoria,
            cant: cantNum,
            precioU,
          });
          setCartModal(null);
        };
        return (
          <div onClick={e => e.target === e.currentTarget && setCartModal(null)}
            style={{ position: "fixed", inset: 0, zIndex: 1200, background: "#00000088", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 440, padding: 28, border: `1px solid ${B.navyLight}` }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.sand, marginBottom: 4 }}>
                🛒 Agregar a requisición
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
                Indica la cantidad a solicitar. Se agregará al carrito de requisición.
              </div>

              {/* Ítem seleccionado */}
              <div style={{ background: "#0D1B3E", borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{catIconMap[i.categoria] || "📦"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: B.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nombre}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                      {i.categoria || "—"} · Unidad: {i.unidad || "—"} · Stock: {Number(i.stock_actual || 0).toFixed(0)}
                    </div>
                  </div>
                </div>
                {precioU > 0 && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                    Precio compra: <strong style={{ color: B.sand }}>{COP(precioU)}</strong>
                  </div>
                )}
              </div>

              {/* Cantidad */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
                  Cantidad ({i.unidad || "unidades"})
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => setCartModal(c => ({ ...c, cant: String(Math.max(1, (Number(c.cant) || 0) - 1)) }))}
                    style={{ width: 38, height: 38, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: B.sky, fontSize: 20, fontWeight: 800, cursor: "pointer" }}>−</button>
                  <input
                    autoFocus
                    type="number"
                    min={0}
                    step={i.unidad?.toLowerCase().match(/kg|gr|lt|lit|gal/) ? "0.01" : "1"}
                    value={cartModal.cant}
                    onChange={e => setCartModal(c => ({ ...c, cant: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
                    style={{ flex: 1, textAlign: "center", fontSize: 24, fontWeight: 800, padding: "8px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, outline: "none", fontFamily: "'Barlow Condensed', sans-serif" }}
                  />
                  <button onClick={() => setCartModal(c => ({ ...c, cant: String((Number(c.cant) || 0) + 1) }))}
                    style={{ width: 38, height: 38, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: B.sky, fontSize: 20, fontWeight: 800, cursor: "pointer" }}>+</button>
                </div>
                {/* Stock actual → después de compra */}
                <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ color: "rgba(255,255,255,0.55)" }}>
                      Stock actual: <strong style={{ color: B.white }}>{Number(i.stock_actual || 0).toFixed(2)} {i.unidad}</strong>
                    </div>
                    <div style={{ color: B.sky, fontWeight: 700 }}>→</div>
                    <div style={{ color: "rgba(255,255,255,0.55)" }}>
                      Después: <strong style={{ color: B.sky, fontSize: 14 }}>{(Number(i.stock_actual || 0) + cantNum).toFixed(2)} {i.unidad}</strong>
                    </div>
                  </div>
                  {Number(i.stock_minimo || 0) > 0 && (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                      Mínimo configurado: {Number(i.stock_minimo).toFixed(0)} {i.unidad}
                      {(Number(i.stock_actual || 0) + cantNum) < Number(i.stock_minimo) && (
                        <span style={{ color: B.warning, marginLeft: 6 }}>⚠ aún bajo mínimo</span>
                      )}
                    </div>
                  )}
                </div>
                {subtotal > 0 && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: B.success + "15", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>
                    Subtotal estimado: <strong style={{ color: B.success, fontSize: 14 }}>{COP(subtotal)}</strong>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setCartModal(null)}
                  style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={confirmar}
                  disabled={!cantNum || cantNum <= 0}
                  style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: (!cantNum || cantNum <= 0) ? B.navyLight : B.success, color: B.navy, cursor: (!cantNum || cantNum <= 0) ? "default" : "pointer", fontWeight: 700, fontSize: 14 }}>
                  ✓ Agregar al carrito
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL NUEVA LOCACIÓN
// ═══════════════════════════════════════════════════════════════════════════
function NewLocacionModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ nombre: "", descripcion: "", icono: "📦" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.nombre.trim()) return alert("Nombre obligatorio");
    setSaving(true);
    const id = `LOC-${form.nombre.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)}-${Date.now().toString().slice(-4)}`;
    const { error } = await supabase.from("items_locaciones").insert({
      id, nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null,
      icono: form.icono || "📦", es_principal: false, es_ventas: false, activa: true, orden: 99,
    });
    setSaving(false);
    if (error) return alert("Error: " + error.message);
    onSaved();
  };
  const ICONOS = ["📦","🍸","🏪","🍽️","🧊","🧴","🧹","🚪","⚓","🏝️","🍷","🥂","🍺","🎉"];
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "#00000088", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 440, padding: 28, border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.sand, marginBottom: 20 }}>📍 Nueva locación</div>
        <div style={{ marginBottom: 14 }}>
          <label style={LS}>Nombre *</label>
          <input autoFocus value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Bodega Playa" style={IS} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={LS}>Descripción (opcional)</label>
          <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ubicación, uso..." style={IS} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={LS}>Ícono</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ICONOS.map(ic => (
              <button key={ic} onClick={() => setForm(f => ({ ...f, icono: ic }))}
                style={{ width: 40, height: 40, borderRadius: 8, fontSize: 20, cursor: "pointer",
                  border: `1px solid ${form.icono === ic ? B.sky : B.navyLight}`,
                  background: form.icono === ic ? B.sky + "22" : B.navy }}>{ic}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
          <button onClick={save} disabled={saving || !form.nombre.trim()}
            style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: saving || !form.nombre.trim() ? B.navyLight : B.success, color: B.navy, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
            {saving ? "Creando…" : "✓ Crear locación"}
          </button>
        </div>
      </div>
    </div>
  );
}
