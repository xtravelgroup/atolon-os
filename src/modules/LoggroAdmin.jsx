import React, { useState, useEffect, useCallback, useMemo } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync`;
const FN_HEADERS = {
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
};
const MENU_TIPOS = [
  { key: "restaurant", label: "🍽️ Restaurant" },
  { key: "bebidas",    label: "🍹 Bebidas" },
  { key: "banquetes",  label: "🎉 Banquetes" },
];

export default function LoggroAdmin() {
  const [tab, setTab] = useState("productos"); // productos | mesas
  const [items, setItems] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("todas");
  const [filterMenuTipo, setFilterMenuTipo] = useState("todos");
  const [filterRoomService, setFilterRoomService] = useState("todos"); // todos | yes | no

  const [loggroProducts, setLoggroProducts] = useState([]);
  const [matchOpen, setMatchOpen] = useState(null); // item a editar match

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [iR, mR] = await Promise.all([
      supabase.from("menu_items").select("id, nombre, loggro_id, loggro_categoria, categoria, precio, menu_tipo, room_service, activo, foto_url").order("menu_tipo").order("nombre").limit(2000),
      supabase.from("loggro_mesas").select("*").order("nombre"),
    ]);
    setItems(iR.data || []);
    setMesas(mR.data || []);
    setLoading(false);
  }, []);

  // Cargar productos Loggro al abrir el modal (via Edge Function)
  const loadLoggroProducts = async () => {
    if (loggroProducts.length > 0) return;
    try {
      const res = await fetch(`${FN_URL}/products?pagination=true&limit=1000&page=0`, { headers: FN_HEADERS });
      const data = await res.json();
      setLoggroProducts(data.products || []);
    } catch {}
  };
  useEffect(() => { load(); }, [load]);

  const callSync = async (endpoint) => {
    setSyncing(endpoint);
    try {
      const res = await fetch(`${FN_URL}${endpoint}`, { method: "POST", headers: { ...FN_HEADERS, "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      alert(`✓ ${endpoint}: ${JSON.stringify(data)}`);
      load();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
    setSyncing(null);
  };

  const categorias = useMemo(() => {
    const s = new Set();
    items.forEach(i => { if (i.loggro_categoria) s.add(i.loggro_categoria); });
    return [...s].sort();
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filterCat !== "todas") list = list.filter(i => i.loggro_categoria === filterCat);
    if (filterMenuTipo !== "todos") list = list.filter(i => i.menu_tipo === filterMenuTipo);
    if (filterRoomService === "yes") list = list.filter(i => i.room_service === true);
    if (filterRoomService === "no") list = list.filter(i => !i.room_service);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i => i.nombre?.toLowerCase().includes(s));
    }
    return list;
  }, [items, filterCat, filterMenuTipo, filterRoomService, search]);

  const toggleRoomService = async (item) => {
    const newVal = !item.room_service;
    await supabase.from("menu_items").update({ room_service: newVal }).eq("id", item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, room_service: newVal } : i));
  };

  const changeMenuTipo = async (item, newTipo) => {
    await supabase.from("menu_items").update({ menu_tipo: newTipo }).eq("id", item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, menu_tipo: newTipo } : i));
  };

  const bulkSet = async (cat, field, value) => {
    if (!confirm(`Aplicar ${field} = ${value} a todos los productos de "${cat}"?`)) return;
    const ids = items.filter(i => i.loggro_categoria === cat).map(i => i.id);
    if (ids.length === 0) return;
    await supabase.from("menu_items").update({ [field]: value }).in("id", ids);
    alert(`✓ ${ids.length} productos actualizados`);
    load();
  };

  const totalRS = items.filter(i => i.room_service).length;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando…</div>;

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 16px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", margin: 0 }}>
          🔗 Loggro Admin
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => callSync("/sync-tables")} disabled={!!syncing} style={{ ...BTN(B.navyLight), color: B.sky, border: `1px solid ${B.sky}44` }}>
            {syncing === "/sync-tables" ? "Sincronizando..." : "🔄 Sync mesas"}
          </button>
          <button onClick={() => callSync("/sync-products")} disabled={!!syncing} style={{ ...BTN(B.sky, B.navy) }}>
            {syncing === "/sync-products" ? "Sincronizando..." : "🔄 Sync productos"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "Productos Loggro", value: items.length, color: B.sky },
          { label: "En Room Service", value: totalRS, color: B.success },
          { label: "Mesas Loggro", value: mesas.length, color: B.sand },
          { label: "Categorías", value: categorias.length, color: B.warning },
        ].map(k => (
          <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 20px", flex: "1 1 180px", borderLeft: `4px solid ${k.color}`, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[
          { key: "productos", label: "🍴 Productos" },
          { key: "mesas", label: "🪑 Mesas" },
          { key: "inventario", label: "📦 Inventario" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", borderRadius: 8, border: `1px solid ${tab === t.key ? B.sky : B.navyLight}`,
            background: tab === t.key ? B.sky + "22" : B.navyMid, color: tab === t.key ? B.sky : "rgba(255,255,255,0.5)",
            cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══ INVENTARIO — Reset a 0 + Cargar baseline ══ */}
      {tab === "inventario" && <InventarioBaselineTab callSync={callSync} syncing={syncing} setSyncing={setSyncing} />}

      {/* ══ PRODUCTOS ══ */}
      {tab === "productos" && (
        <>
          {/* Filtros */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar producto..." style={IS} />
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...IS, cursor: "pointer" }}>
              <option value="todas">Todas categorías Loggro</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterMenuTipo} onChange={e => setFilterMenuTipo(e.target.value)} style={{ ...IS, cursor: "pointer" }}>
              <option value="todos">Todo menú</option>
              {MENU_TIPOS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select value={filterRoomService} onChange={e => setFilterRoomService(e.target.value)} style={{ ...IS, cursor: "pointer" }}>
              <option value="todos">Todos RS</option>
              <option value="yes">✓ En Room Service</option>
              <option value="no">✗ Fuera de RS</option>
            </select>
          </div>

          {/* Bulk action por categoría filtrada */}
          {filterCat !== "todas" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, padding: "10px 14px", background: `${B.sky}11`, border: `1px solid ${B.sky}33`, borderRadius: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: B.sky }}>Acción masiva para "{filterCat}":</span>
              <button onClick={() => bulkSet(filterCat, "room_service", true)} style={{ ...BTN(B.success), fontSize: 11, padding: "4px 10px" }}>✓ Todos en RS</button>
              <button onClick={() => bulkSet(filterCat, "room_service", false)} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "4px 10px" }}>✗ Quitar de RS</button>
            </div>
          )}

          {/* Tabla */}
          <div style={{ background: B.navyMid, borderRadius: 14, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.3fr 1.4fr 0.7fr 0.9fr 0.6fr 70px", padding: "10px 16px", borderBottom: `2px solid ${B.navyLight}`, gap: 8, fontSize: 10, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <div>Producto Atolón</div>
              <div>Enlace Loggro</div>
              <div>Categoría Loggro</div>
              <div style={{ textAlign: "right" }}>Precio</div>
              <div>Menú</div>
              <div style={{ textAlign: "center" }}>RS</div>
              <div style={{ textAlign: "center" }}>Acción</div>
            </div>
            {filtered.slice(0, 500).map((item, idx) => (
              <div key={item.id} style={{
                display: "grid", gridTemplateColumns: "1.8fr 1.3fr 1.4fr 0.7fr 0.9fr 0.6fr 70px", padding: "9px 16px", gap: 8,
                borderBottom: idx < Math.min(filtered.length, 500) - 1 ? `1px solid ${B.navyLight}` : "none",
                alignItems: "center", fontSize: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {item.foto_url && <img src={item.foto_url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />}
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nombre}</span>
                </div>
                <div style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.loggro_id ? (
                    <span style={{ color: B.success, fontWeight: 600 }} title={item.loggro_id}>
                      ✓ {loggroProducts.find(p => (p._id||p.id) === item.loggro_id)?.name || `ID: ${item.loggro_id.slice(-8)}`}
                    </span>
                  ) : (
                    <span style={{ color: B.warning, fontStyle: "italic" }}>Sin enlazar</span>
                  )}
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.loggro_categoria || "—"}</div>
                <div style={{ textAlign: "right", color: B.success, fontWeight: 700 }}>{item.precio > 0 ? COP(item.precio) : "—"}</div>
                <div>
                  <select value={item.menu_tipo || ""} onChange={e => changeMenuTipo(item, e.target.value)}
                    style={{ background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", width: "100%" }}>
                    <option value="">—</option>
                    {MENU_TIPOS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <div style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={!!item.room_service} onChange={() => toggleRoomService(item)}
                    style={{ width: 18, height: 18, cursor: "pointer" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <button onClick={() => { loadLoggroProducts(); setMatchOpen(item); }}
                    style={{ padding: "3px 8px", fontSize: 10, borderRadius: 6, border: `1px solid ${B.sky}55`, background: `${B.sky}22`, color: B.sky, cursor: "pointer", fontWeight: 700 }}>
                    🔗 Match
                  </button>
                </div>
              </div>
            ))}
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
              {filtered.length > 500 ? `Mostrando 500 de ${filtered.length} — afina los filtros` : `${filtered.length} producto${filtered.length !== 1 ? "s" : ""}`}
            </div>
          </div>
        </>
      )}

      {/* ══ MESAS ══ */}
      {tab === "mesas" && (
        <div style={{ background: B.navyMid, borderRadius: 14, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "10px 16px", borderBottom: `2px solid ${B.navyLight}`, gap: 8, fontSize: 10, fontWeight: 700, color: B.sand, textTransform: "uppercase" }}>
            <div>Mesa</div>
            <div>Tipo</div>
            <div>Activa</div>
            <div>Loggro ID</div>
          </div>
          {mesas.map((m, idx) => (
            <div key={m.loggro_id} style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "9px 16px", gap: 8,
              borderBottom: idx < mesas.length - 1 ? `1px solid ${B.navyLight}` : "none", fontSize: 12,
            }}>
              <div style={{ fontWeight: 600 }}>{m.nombre}</div>
              <div style={{ color: "rgba(255,255,255,0.5)" }}>{m.tipo || "—"}</div>
              <div>{m.activa ? <span style={{ color: B.success }}>✓</span> : <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}</div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{m.loggro_id}</div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Match */}
      {matchOpen && (
        <MatchModal
          item={matchOpen}
          loggroProducts={loggroProducts}
          onClose={() => setMatchOpen(null)}
          onSave={async (loggroId, loggroCat) => {
            await supabase.from("menu_items").update({ loggro_id: loggroId || null, loggro_categoria: loggroCat || null }).eq("id", matchOpen.id);
            setMatchOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL DE MATCH
// ═══════════════════════════════════════════════════════════════════════════
function MatchModal({ item, loggroProducts, onClose, onSave }) {
  const [search, setSearch] = useState(item.nombre || "");

  const results = useMemo(() => {
    if (!search || search.length < 2) return loggroProducts.slice(0, 50);
    const s = search.toLowerCase();
    // Priorizar: 1) empieza con search, 2) incluye search, 3) BT al final
    const matches = loggroProducts.filter(p => (p.name || "").toLowerCase().includes(s));
    return matches.sort((a, b) => {
      const an = (a.name || "").toLowerCase();
      const bn = (b.name || "").toLowerCase();
      const aStarts = an.startsWith(s) ? 0 : 1;
      const bStarts = bn.startsWith(s) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      const aBT = /\bBT\b/i.test(a.name) ? 0 : 1;
      const bBT = /\bBT\b/i.test(b.name) ? 0 : 1;
      if (aBT !== bBT) return aBT - bBT;
      return an.localeCompare(bn);
    }).slice(0, 100);
  }, [search, loggroProducts]);

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, width: 560, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.navyLight}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Enlazar producto Atolón</div>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>🔗 {item.nombre}</div>
              {item.loggro_id && (
                <div style={{ fontSize: 11, color: B.success, marginTop: 4 }}>
                  Actualmente enlazado a: {loggroProducts.find(p => (p._id||p.id) === item.loggro_id)?.name || item.loggro_id}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${B.navyLight}` }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar producto en Loggro..." autoFocus style={IS} />
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
            💡 "BT" = botella · Preferimos la versión botella sobre shot
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Sin resultados</div>
          ) : results.map(p => {
            const id = p._id || p.id;
            const isCurrent = item.loggro_id === id;
            const isBT = /\bBT\b/i.test(p.name);
            return (
              <div key={id} onClick={() => onSave(id, p.category?.name)}
                style={{
                  padding: "11px 20px", cursor: "pointer", borderBottom: `1px solid ${B.navyLight}`,
                  background: isCurrent ? B.success + "22" : "transparent",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{p.name}</span>
                    {isBT && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: B.sand + "33", color: B.sand, fontWeight: 700 }}>🍾 BOTELLA</span>}
                    {isCurrent && <span style={{ fontSize: 10, color: B.success, fontWeight: 700 }}>✓ ACTUAL</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                    {p.category?.name || "Sin categoría"} · {p.price > 0 ? COP(p.price) : "sin precio"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${B.navyLight}`, display: "flex", gap: 8, justifyContent: "space-between" }}>
          {item.loggro_id && (
            <button onClick={() => onSave(null, null)} style={{ ...BTN(B.navyLight), color: B.danger, border: `1px solid ${B.danger}55`, fontSize: 11 }}>
              🗑️ Quitar enlace
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ ...BTN(B.navyLight), fontSize: 11 }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB INVENTARIO — Reset Loggro a 0 + Cargar baseline desde conteo
// ════════════════════════════════════════════════════════════════════
function InventarioBaselineTab({ callSync, syncing, setSyncing }) {
  const [conteos, setConteos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetResult, setResetResult] = useState(null);
  const [loadResult, setLoadResult] = useState(null);
  const [dryRun, setDryRun] = useState(null);
  const [orphanResult, setOrphanResult] = useState(null);
  const [orphanDry, setOrphanDry] = useState(null);
  const [orphanCount, setOrphanCount] = useState(null);

  // Cargar count de huerfanos al montar
  useEffect(() => {
    if (!supabase) return;
    supabase.from("items_catalogo")
      .select("id", { count: "exact", head: true })
      .eq("activo", true).is("loggro_id", null)
      .then(({ count }) => setOrphanCount(count || 0));
  }, [orphanResult]);

  const previewOrphans = async () => {
    setSyncing("/create-orphan-ingredients");
    try {
      const res = await fetch(`${FN_URL}/create-orphan-ingredients`, {
        method: "POST",
        headers: { ...FN_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: true }),
      });
      const data = await res.json();
      setOrphanDry(data);
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setSyncing(null); }
  };

  const ejecutarOrphans = async () => {
    if (!confirm(`Crear ${orphanDry?.creados || "los"} ítems en Loggro Restobar como ingredientes nuevos?\n\nLos que no tengan categoría en Loggro se omitirán (${orphanDry?.omitidos || 0}).`)) return;
    setSyncing("/create-orphan-ingredients");
    try {
      const res = await fetch(`${FN_URL}/create-orphan-ingredients`, {
        method: "POST",
        headers: { ...FN_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setOrphanResult(data);
      if (data.ok) {
        alert(`✓ Sincronizado:\n• Creados: ${data.creados}\n• Omitidos: ${data.omitidos}\n• Errores: ${data.errores}`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setSyncing(null); }
  };

  useEffect(() => {
    if (!supabase) return;
    setLoading(true);
    supabase.from("items_conteos")
      .select("id, locacion_id, fecha, usuario_email, total_items, tipo_conteo, created_at")
      .eq("tipo_conteo", "inicial")
      .order("created_at", { ascending: false })
      .then(({ data }) => { setConteos(data || []); setLoading(false); });
  }, []);

  const previewReset = async () => {
    setSyncing("/reset-all-to-zero");
    try {
      const res = await fetch(`${FN_URL}/reset-all-to-zero`, {
        method: "POST",
        headers: { ...FN_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: true }),
      });
      const data = await res.json();
      setDryRun(data);
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setSyncing(null);
    }
  };

  const ejecutarReset = async () => {
    if (!confirm(`⚠️ ESTO PONE TODO EL INVENTARIO DE LOGGRO EN 0.\n\nVa a sacar ${dryRun?.con_stock_mayor_0 || "todos los"} ítems con stock > 0 (total ${dryRun?.stock_total || "?"} unidades).\n\n¿Continuar?`)) return;
    setSyncing("/reset-all-to-zero");
    try {
      const res = await fetch(`${FN_URL}/reset-all-to-zero`, {
        method: "POST",
        headers: { ...FN_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setResetResult(data);
      if (data.ok) alert(`✓ Reset completado: ${data.items_reseteados} ítems sacados (${data.stock_total_sacado} unidades). Movement ID: ${data.movement_id}`);
      else alert(`Error: ${data.error}`);
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setSyncing(null);
    }
  };

  const cargarBaseline = async (conteoId) => {
    if (!confirm(`Cargar este conteo como ENTRADA / AJUSTE en Loggro?`)) return;
    setSyncing("/load-baseline");
    try {
      const res = await fetch(`${FN_URL}/load-baseline`, {
        method: "POST",
        headers: { ...FN_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ conteo_id: conteoId, note: `Baseline desde Atolón OS — conteo ${conteoId}` }),
      });
      const data = await res.json();
      setLoadResult({ conteoId, ...data });
      if (data.ok) alert(`✓ Baseline cargado: ${data.items_cargados} ítems (${data.cantidad_total} unidades). Movement ID: ${data.movement_id}`);
      else alert(`Error: ${data.error}`);
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div>
      {/* Card huerfanos — sincronizar ítems sin loggro_id */}
      {orphanCount !== null && orphanCount > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 18, border: `1px solid ${B.warning}55`, borderLeft: `4px solid ${B.warning}`, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 11, color: B.warning, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>⚠ Items sin mapeo Loggro</div>
              <h3 style={{ margin: "6px 0 8px", fontSize: 17 }}>🔗 {orphanCount} ítems huérfanos</h3>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, margin: 0 }}>
                Estos ítems del catálogo no tienen <code>loggro_id</code> — no se cargarán al baseline.
                Los crea automáticamente en Loggro Restobar matcheando por categoría.
              </p>
              {orphanDry && (
                <div style={{ background: B.navy, borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12 }}>
                  <div>A crear: <strong style={{ color: B.success }}>{orphanDry.creados}</strong></div>
                  <div>Sin categoría Loggro (omitidos): <strong style={{ color: B.warning }}>{orphanDry.omitidos}</strong></div>
                </div>
              )}
              {orphanResult && (
                <div style={{ background: B.success + "11", border: `1px solid ${B.success}55`, borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12 }}>
                  <div style={{ color: B.success, fontWeight: 700 }}>✓ Sincronización completada</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                    Creados {orphanResult.creados} · Omitidos {orphanResult.omitidos} · Errores {orphanResult.errores}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={previewOrphans} disabled={!!syncing}
                style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                👁 Preview
              </button>
              <button onClick={ejecutarOrphans} disabled={!!syncing || !orphanDry}
                style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: orphanDry ? B.warning : B.navyLight, color: orphanDry ? B.navy : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 800, cursor: orphanDry ? "pointer" : "not-allowed" }}>
                🔗 Crear en Loggro
              </button>
            </div>
          </div>
        </div>
      )}

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* PASO 1: Reset a 0 */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, border: `1px solid ${B.danger}33`, borderLeft: `4px solid ${B.danger}` }}>
        <div style={{ fontSize: 11, color: B.danger, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>PASO 1</div>
        <h3 style={{ margin: "6px 0 12px", fontSize: 17 }}>🗑 Resetear todo a 0</h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
          Crea un movimiento de <strong>ajuste-salida</strong> (type 11) en Loggro Restobar que saca todos los ingredientes con stock {">"} 0.
          Esto es destructivo — confirma 2 veces antes de ejecutar.
        </p>

        {dryRun && (
          <div style={{ background: B.navy, borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12 }}>
            <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, marginBottom: 6 }}>Vista previa</div>
            <div>Total ingredientes en Loggro: <strong>{dryRun.total_ingredientes}</strong></div>
            <div>Con stock {">"} 0: <strong style={{ color: B.warning }}>{dryRun.con_stock_mayor_0}</strong></div>
            <div>Stock total a sacar: <strong style={{ color: B.warning }}>{dryRun.stock_total}</strong></div>
          </div>
        )}

        {resetResult && (
          <div style={{ background: B.success + "11", border: `1px solid ${B.success}55`, borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12 }}>
            <div style={{ color: B.success, fontWeight: 700 }}>✓ Reset completado</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{resetResult.items_reseteados} ítems · {resetResult.stock_total_sacado} unidades</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={previewReset} disabled={!!syncing}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {syncing === "/reset-all-to-zero" && !dryRun ? "Cargando..." : "👁 Vista previa"}
          </button>
          <button onClick={ejecutarReset} disabled={!!syncing || !dryRun}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "none", background: B.danger, color: "#fff", fontSize: 12, fontWeight: 800, cursor: dryRun ? "pointer" : "not-allowed", opacity: dryRun ? 1 : 0.4 }}>
            ⚠ Ejecutar reset
          </button>
        </div>
      </div>

      {/* PASO 2: Cargar baseline */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, border: `1px solid ${B.success}33`, borderLeft: `4px solid ${B.success}` }}>
        <div style={{ fontSize: 11, color: B.success, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>PASO 2</div>
        <h3 style={{ margin: "6px 0 12px", fontSize: 17 }}>📥 Cargar baseline (entrada / ajuste)</h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
          Crea un movimiento de <strong>ajuste-entrada</strong> (type 11, isSubtracted=false) con las cantidades reales de un conteo marcado como ★ INICIAL.
          Solo entran items que tengan <code>loggro_id</code> mapeado en el catálogo.
        </p>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Conteos iniciales disponibles</div>
          {loading ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Cargando…</div>
            : conteos.length === 0 ? (
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, padding: 10, fontStyle: "italic" }}>
                Sin conteos marcados como inicial. Marca uno desde Hacer Inventario.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {conteos.map(c => (
                  <div key={c.id} style={{ background: B.navy, padding: "10px 12px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${B.sand}33` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{c.locacion_id} · {c.total_items} ítems</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{c.usuario_email} · {new Date(c.created_at).toLocaleString("es-CO")}</div>
                    </div>
                    <button onClick={() => cargarBaseline(c.id)} disabled={!!syncing}
                      style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: B.success, color: B.navy, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                      📥 Cargar
                    </button>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {loadResult && (
          <div style={{ background: B.success + "11", border: `1px solid ${B.success}55`, borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12 }}>
            <div style={{ color: B.success, fontWeight: 700 }}>✓ Baseline cargado</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{loadResult.items_cargados} ítems · {loadResult.cantidad_total} unidades</div>
            {loadResult.movement_id && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Movement ID: {loadResult.movement_id}</div>}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
