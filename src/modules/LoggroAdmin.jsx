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
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", borderRadius: 8, border: `1px solid ${tab === t.key ? B.sky : B.navyLight}`,
            background: tab === t.key ? B.sky + "22" : B.navyMid, color: tab === t.key ? B.sky : "rgba(255,255,255,0.5)",
            cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>{t.label}</button>
        ))}
      </div>

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
