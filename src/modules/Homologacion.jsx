import React, { useState, useEffect, useMemo, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";
import { logAccion } from "../lib/logAccion";

// Estilos base
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const BTN_PRIM = { padding: "8px 14px", borderRadius: 8, border: "none", background: B.sky, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const BTN_SEC  = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontWeight: 600, fontSize: 12 };

// Normaliza nombre para matching fuzzy
const normalize = (s = "") => String(s).toLowerCase().trim()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]+/g, " ")
  .replace(/\s+/g, " ");

// Similaridad simple: token overlap
function similarity(a, b) {
  const A = new Set(normalize(a).split(" ").filter(x => x.length > 1));
  const B = new Set(normalize(b).split(" ").filter(x => x.length > 1));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

// Fetch Loggro via edge function /raw
async function fetchLoggroCatalog() {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/raw`;
  const fetchPath = async (path) => {
    const items = [];
    for (let p = 0; p < 20; p++) {
      const inner = `${path}?pagination=true&limit=200&page=${p}`;
      const r = await fetch(`${baseUrl}?path=${encodeURIComponent(inner)}`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      const j = await r.json();
      const arr = j?.data || (Array.isArray(j) ? j : []);
      if (!arr.length) break;
      items.push(...arr);
    }
    return items;
  };
  const [products, ingredients] = await Promise.all([
    fetchPath("/products"),
    fetchPath("/ingredients"),
  ]);
  // Etiquetar cada item con su tipo Loggro. Un mismo _id puede estar en ambos
  // endpoints (un producto tambien usado como ingrediente) — en ese caso
  // marcamos como 'ambos' porque para el POS es producto vendible Y
  // materia prima para otras recetas.
  const map = new Map();
  for (const it of products) if (it?._id) map.set(it._id, { ...it, __tipo: "producto" });
  for (const it of ingredients) {
    if (!it?._id) continue;
    if (map.has(it._id)) map.set(it._id, { ...map.get(it._id), __tipo: "ambos" });
    else map.set(it._id, { ...it, __tipo: "ingrediente" });
  }
  return [...map.values()];
}

export default function Homologacion() {
  const [loading, setLoading] = useState(true);
  const [items, setItems]     = useState([]);   // items_catalogo de Atolón
  const [loggro, setLoggro]   = useState([]);   // catálogo Loggro
  const [tab, setTab]         = useState("resumen");
  const [tipoFiltro, setTipoFiltro] = useState("todos"); // todos | producto | ingrediente
  const [search, setSearch]   = useState("");
  const [errorMsg, setErrorMsg] = useState(null);
  const [linking, setLinking] = useState(null); // { loggro_it | atolon_it }
  const [refreshTick, setRefreshTick] = useState(0);

  // Carga
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErrorMsg(null);
      try {
        const [atolonRes, loggroRes] = await Promise.all([
          supabase.from("items_catalogo")
            .select("id, nombre, categoria, unidad, loggro_id, precio_compra, stock_actual, activo")
            .order("nombre"),
          fetchLoggroCatalog(),
        ]);
        if (cancelled) return;
        if (atolonRes.error) throw new Error("Error Atolón: " + atolonRes.error.message);
        setItems(atolonRes.data || []);
        setLoggro(loggroRes || []);
      } catch (e) {
        if (!cancelled) setErrorMsg(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTick]);

  // Índices
  const atolonByLoggroId = useMemo(() => {
    const m = new Map();
    for (const it of items) if (it.loggro_id) m.set(it.loggro_id, it);
    return m;
  }, [items]);

  const atolonByNombre = useMemo(() => {
    const m = new Map();
    for (const it of items) m.set(normalize(it.nombre), it);
    return m;
  }, [items]);

  // Filtro por tipo: 'todos' | 'producto' | 'ingrediente'
  // Un item 'ambos' pasa en cualquier filtro (es producto Y ingrediente).
  const pasaFiltroTipo = useCallback((loggroItem) => {
    if (tipoFiltro === "todos") return true;
    const t = loggroItem.__tipo;
    if (tipoFiltro === "producto") return t === "producto" || t === "ambos";
    if (tipoFiltro === "ingrediente") return t === "ingrediente" || t === "ambos";
    return true;
  }, [tipoFiltro]);

  // Counts totales de tipos (para chips)
  const tipoCounts = useMemo(() => {
    let productos = 0, ingredientes = 0, ambos = 0;
    for (const l of loggro) {
      if (l.__tipo === "producto") productos++;
      else if (l.__tipo === "ingrediente") ingredientes++;
      else if (l.__tipo === "ambos") ambos++;
    }
    return {
      productos: productos + ambos,     // Un 'ambos' cuenta como producto
      ingredientes: ingredientes + ambos, // Y como ingrediente
      ambos,
      total: loggro.length,
    };
  }, [loggro]);

  // Buckets — aplican el filtro por tipo sobre los items de Loggro
  const buckets = useMemo(() => {
    const vinculados = [];   // Loggro id existe en Atolón
    const soloLoggro = [];   // Loggro item que no tiene par en Atolón por loggro_id
    const soloAtolon = items.filter(it => !it.loggro_id);
    const duplicadosLoggro = new Map(); // loggro_id → count > 1 en items_catalogo

    // Duplicados: cuantos items_catalogo apuntan al mismo loggro_id
    const countByLoggroId = new Map();
    for (const it of items) {
      if (!it.loggro_id) continue;
      countByLoggroId.set(it.loggro_id, (countByLoggroId.get(it.loggro_id) || 0) + 1);
    }
    for (const [lid, n] of countByLoggroId) if (n > 1) duplicadosLoggro.set(lid, n);

    for (const l of loggro) {
      if (!l?._id) continue;
      if (!pasaFiltroTipo(l)) continue;
      const atolonMatch = atolonByLoggroId.get(l._id);
      if (atolonMatch) {
        vinculados.push({ loggro: l, atolon: atolonMatch });
      } else {
        soloLoggro.push(l);
      }
    }
    return { vinculados, soloLoggro, soloAtolon, duplicadosLoggro };
  }, [items, loggro, atolonByLoggroId, pasaFiltroTipo]);

  // Sugerencias fuzzy para un item Loggro sin vincular
  const sugerenciasParaLoggro = useCallback((loggroItem) => {
    const candidatos = items
      .filter(it => !it.loggro_id) // solo los que aún no están vinculados
      .map(it => ({ item: it, score: similarity(loggroItem.name, it.nombre) }))
      .filter(x => x.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return candidatos;
  }, [items]);

  const sugerenciasParaAtolon = useCallback((atolonItem) => {
    const yaLinkeados = new Set([...atolonByLoggroId.keys()]);
    const candidatos = loggro
      .filter(l => l?._id && !yaLinkeados.has(l._id))
      .map(l => ({ loggro: l, score: similarity(l.name, atolonItem.nombre) }))
      .filter(x => x.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return candidatos;
  }, [loggro, atolonByLoggroId]);

  // Vincular: PATCH items_catalogo.loggro_id = X
  const vincular = async (atolon_id, loggro_id, loggro_nombre) => {
    setErrorMsg(null);
    const { error } = await supabase.from("items_catalogo")
      .update({ loggro_id, updated_at: new Date().toISOString() })
      .eq("id", atolon_id);
    if (error) { setErrorMsg("Vincular falló: " + error.message); return; }
    logAccion({ modulo: "homologacion", accion: "vincular_loggro", tabla: "items_catalogo", registroId: atolon_id, datosDespues: { loggro_id, loggro_nombre } });
    setLinking(null);
    setRefreshTick(t => t + 1);
  };

  // Desvincular
  const desvincular = async (atolon_id, motivo = "") => {
    if (!confirm("Desvincular este item de Loggro?")) return;
    const { error } = await supabase.from("items_catalogo")
      .update({ loggro_id: null, updated_at: new Date().toISOString() })
      .eq("id", atolon_id);
    if (error) { setErrorMsg("Desvincular falló: " + error.message); return; }
    logAccion({ modulo: "homologacion", accion: "desvincular_loggro", tabla: "items_catalogo", registroId: atolon_id });
    setRefreshTick(t => t + 1);
  };

  // Crear en Atolón desde item Loggro
  const crearEnAtolon = async (loggroItem) => {
    if (!confirm(`Crear "${loggroItem.name}" en Atolón OS?\nQuedará vinculado a Loggro automáticamente.`)) return;
    const id = `ITEM-${crypto.randomUUID().slice(0, 8)}`;
    const record = {
      id,
      nombre: loggroItem.name || "(sin nombre)",
      categoria: loggroItem.category?.name || "Insumos cocina",
      unidad: loggroItem.unit?.name || loggroItem.unit?.shortName || "Unidades",
      loggro_id: loggroItem._id,
      precio_compra: Number(loggroItem?.locationsStock?.[0]?.pricePurchase) || Number(loggroItem?.pricePurchase) || 0,
      stock_actual: 0,
      stock_minimo: 0,
      activo: true,
      raw: loggroItem,
    };
    const { error } = await supabase.from("items_catalogo").insert(record);
    if (error) { setErrorMsg("Crear falló: " + error.message); return; }
    logAccion({ modulo: "homologacion", accion: "crear_desde_loggro", tabla: "items_catalogo", registroId: id, datosDespues: record });
    setRefreshTick(t => t + 1);
  };

  // KPIs para resumen — se muestran globales (independiente del filtro tipo)
  const kpis = useMemo(() => {
    let vincProductos = 0, vincIngredientes = 0;
    let soloLogProductos = 0, soloLogIngredientes = 0;
    for (const l of loggro) {
      const yaVinculado = atolonByLoggroId.has(l._id);
      const esProducto = l.__tipo === "producto" || l.__tipo === "ambos";
      const esIngrediente = l.__tipo === "ingrediente" || l.__tipo === "ambos";
      if (yaVinculado) {
        if (esProducto) vincProductos++;
        if (esIngrediente) vincIngredientes++;
      } else {
        if (esProducto) soloLogProductos++;
        if (esIngrediente) soloLogIngredientes++;
      }
    }
    const totalProds = vincProductos + soloLogProductos;
    const totalIngs = vincIngredientes + soloLogIngredientes;
    return {
      loggro_total: loggro.length,
      atolon_total: items.length,
      vinculados_total: vincProductos + vincIngredientes - tipoCounts.ambos, // no doble contar
      productos_total: totalProds,
      productos_vinc: vincProductos,
      productos_pend: soloLogProductos,
      ingredientes_total: totalIngs,
      ingredientes_vinc: vincIngredientes,
      ingredientes_pend: soloLogIngredientes,
      solo_atolon: buckets.soloAtolon.length,
      duplicados: buckets.duplicadosLoggro.size,
      cobertura_productos: totalProds > 0 ? (vincProductos / totalProds * 100).toFixed(0) : "0",
      cobertura_ingredientes: totalIngs > 0 ? (vincIngredientes / totalIngs * 100).toFixed(0) : "0",
    };
  }, [loggro, items, buckets, atolonByLoggroId, tipoCounts.ambos]);

  // Filtro búsqueda
  const q = normalize(search);

  if (loading) {
    return <div style={{ padding: 40, color: "#fff", textAlign: "center" }}>Cargando catálogos Loggro + Atolón OS…</div>;
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 20, color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🔗 Homologación Loggro ↔ Atolón OS</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            Vincula cada producto/ingrediente de Loggro Restobar con su item en el inventario de Atolón OS.
            Esto habilita que las ventas de Loggro descuenten stock automáticamente.
          </div>
        </div>
        <button onClick={() => setRefreshTick(t => t + 1)} style={BTN_SEC}>↻ Refrescar</button>
      </div>

      {errorMsg && (
        <div style={{ padding: 12, background: "#ef444422", border: "1px solid #ef444455", borderRadius: 8, marginBottom: 16, color: "#fca5a5" }}>
          {errorMsg}
        </div>
      )}

      {/* KPIs — separados por Productos e Ingredientes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Kpi label="🍽️ Productos vinculados" value={`${kpis.productos_vinc} / ${kpis.productos_total}`} color="#38bdf8" sub={`${kpis.cobertura_productos}% cobertura`} />
        <Kpi label="🥕 Ingredientes vinculados" value={`${kpis.ingredientes_vinc} / ${kpis.ingredientes_total}`} color="#fbbf24" sub={`${kpis.cobertura_ingredientes}% cobertura`} />
        <Kpi label="Solo en Atolón" value={kpis.solo_atolon} color="#a78bfa" sub="sin loggro_id" />
        <Kpi label="Loggro items totales" value={kpis.loggro_total} color={B.sand} />
        <Kpi label="Atolón items totales" value={kpis.atolon_total} color={B.sky} />
      </div>

      {/* Filtro tipo: Todos / Productos / Ingredientes */}
      {tab !== "resumen" && tab !== "solo_atolon" && tab !== "duplicados" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5, marginRight: 4 }}>Tipo Loggro:</span>
          <TipoChip active={tipoFiltro==="todos"} onClick={() => setTipoFiltro("todos")} count={tipoCounts.total}>Todos</TipoChip>
          <TipoChip active={tipoFiltro==="producto"} onClick={() => setTipoFiltro("producto")} count={tipoCounts.productos} icon="🍽️">Productos</TipoChip>
          <TipoChip active={tipoFiltro==="ingrediente"} onClick={() => setTipoFiltro("ingrediente")} count={tipoCounts.ingredientes} icon="🥕">Ingredientes</TipoChip>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: `1px solid ${B.navyLight}`, flexWrap: "wrap" }}>
        <TabBtn active={tab==="resumen"} onClick={() => setTab("resumen")}>Resumen</TabBtn>
        <TabBtn active={tab==="vinculados"} onClick={() => setTab("vinculados")} count={buckets.vinculados.length}>✅ Vinculados</TabBtn>
        <TabBtn active={tab==="solo_loggro"} onClick={() => setTab("solo_loggro")} count={buckets.soloLoggro.length}>⚠️ Solo Loggro</TabBtn>
        <TabBtn active={tab==="solo_atolon"} onClick={() => setTab("solo_atolon")} count={buckets.soloAtolon.length}>🔷 Solo Atolón</TabBtn>
        {buckets.duplicadosLoggro.size > 0 && (
          <TabBtn active={tab==="duplicados"} onClick={() => setTab("duplicados")} count={buckets.duplicadosLoggro.size}>🚨 Duplicados</TabBtn>
        )}
      </div>

      {/* Buscador */}
      {tab !== "resumen" && (
        <div style={{ marginBottom: 14 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre..." style={{ ...IS, maxWidth: 400 }} />
        </div>
      )}

      {/* Contenido */}
      {tab === "resumen" && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Diagnóstico</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div style={{ background: "#38bdf822", borderLeft: "3px solid #38bdf8", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", marginBottom: 8 }}>🍽️ Productos (vendibles en POS)</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
                <div><b>{kpis.productos_vinc}</b> de <b>{kpis.productos_total}</b> vinculados <span style={{ color: "#4ade80" }}>({kpis.cobertura_productos}%)</span></div>
                <div><b>{kpis.productos_pend}</b> productos sin vincular</div>
              </div>
            </div>
            <div style={{ background: "#fbbf2422", borderLeft: "3px solid #fbbf24", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>🥕 Ingredientes (materias primas)</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
                <div><b>{kpis.ingredientes_vinc}</b> de <b>{kpis.ingredientes_total}</b> vinculados <span style={{ color: "#4ade80" }}>({kpis.cobertura_ingredientes}%)</span></div>
                <div><b>{kpis.ingredientes_pend}</b> ingredientes sin vincular</div>
              </div>
            </div>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
            <li><b>{kpis.solo_atolon}</b> items de Atolón <b>no tienen loggro_id</b>. No se descuentan cuando se vende algo relacionado.</li>
            {kpis.duplicados > 0 && (
              <li style={{ color: "#fca5a5" }}><b>{kpis.duplicados}</b> loggro_id están usados por más de un item de Atolón — <b>fusionar</b> los duplicados.</li>
            )}
          </ul>
          <div style={{ marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            Usa el filtro <b>🍽️ Productos / 🥕 Ingredientes</b> arriba de los tabs para trabajar cada tipo por separado. Loggro considera un mismo item como "ambos" cuando se vende Y se usa como componente de otras recetas.
          </div>
        </div>
      )}

      {tab === "vinculados" && (
        <VinculadosTab items={buckets.vinculados.filter(v => !q || normalize(v.loggro.name).includes(q) || normalize(v.atolon.nombre).includes(q))}
                        onDesvincular={desvincular} />
      )}

      {tab === "solo_loggro" && (
        <SoloLoggroTab items={buckets.soloLoggro.filter(l => !q || normalize(l.name).includes(q))}
                      sugerenciasFn={sugerenciasParaLoggro}
                      onVincular={vincular}
                      onCrear={crearEnAtolon} />
      )}

      {tab === "solo_atolon" && (
        <SoloAtolonTab items={buckets.soloAtolon.filter(a => !q || normalize(a.nombre).includes(q))}
                       sugerenciasFn={sugerenciasParaAtolon}
                       onVincular={vincular} />
      )}

      {tab === "duplicados" && (
        <DuplicadosTab dup={buckets.duplicadosLoggro} atolonItems={items} loggro={loggro}
                       onDesvincular={desvincular} />
      )}
    </div>
  );
}

// ─── Componentes auxiliares ───────────────────────────────────────────────

function Kpi({ label, value, color, sub }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, padding: "14px 16px", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function TipoChip({ active, onClick, children, count, icon }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: 20, border: `1px solid ${active ? B.sky : "rgba(255,255,255,0.15)"}`,
      background: active ? B.sky + "22" : "transparent",
      color: active ? B.sky : "rgba(255,255,255,0.6)",
      fontWeight: active ? 700 : 500, cursor: "pointer", fontSize: 12,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      {icon && <span>{icon}</span>}
      {children}
      {count !== undefined && <span style={{ fontSize: 10, background: active ? B.sky + "44" : "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 10 }}>{count}</span>}
    </button>
  );
}

function TipoBadge({ tipo }) {
  if (!tipo) return null;
  const cfg = tipo === "producto" ? { icon: "🍽️", label: "Producto", color: "#38bdf8" }
    : tipo === "ingrediente" ? { icon: "🥕", label: "Ingrediente", color: "#fbbf24" }
    : { icon: "🍽️🥕", label: "Ambos", color: "#a78bfa" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, background: cfg.color + "22", color: cfg.color, padding: "1px 6px", borderRadius: 8, border: `1px solid ${cfg.color}44` }}>
      <span>{cfg.icon}</span> {cfg.label}
    </span>
  );
}

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

function VinculadosTab({ items, onDesvincular }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 120px", gap: 10, padding: "10px 16px", fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${B.navyLight}` }}>
        <div>Loggro</div><div>Atolón OS</div><div style={{ textAlign: "right" }}>Stock</div><div></div>
      </div>
      {items.slice(0, 500).map(({ loggro, atolon }) => (
        <div key={atolon.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 120px", gap: 10, padding: "10px 16px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <div style={{ fontWeight: 600 }}>{loggro.name}</div>
              <TipoBadge tipo={loggro.__tipo} />
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{loggro.category?.name} · {loggro.unit?.name || loggro.unit?.shortName}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{atolon.nombre}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{atolon.categoria} · {atolon.unidad}</div>
          </div>
          <div style={{ textAlign: "right", color: "rgba(255,255,255,0.65)" }}>{Number(atolon.stock_actual) || 0}</div>
          <div>
            <button onClick={() => onDesvincular(atolon.id)} style={{ ...BTN_SEC, fontSize: 11, padding: "4px 8px", color: "#fca5a5" }}>Desvincular</button>
          </div>
        </div>
      ))}
      {items.length > 500 && (
        <div style={{ padding: 12, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Mostrando primeros 500 de {items.length}. Usa el buscador para filtrar.</div>
      )}
    </div>
  );
}

function SoloLoggroTab({ items, sugerenciasFn, onVincular, onCrear }) {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", fontSize: 11, color: "rgba(255,255,255,0.4)", borderBottom: `1px solid ${B.navyLight}` }}>
        {items.length} productos de Loggro sin vincular en Atolón. Click en cada uno para ver sugerencias fuzzy.
      </div>
      {items.slice(0, 500).map(l => (
        <div key={l._id}>
          <div onClick={() => setExpanded(expanded === l._id ? null : l._id)}
            style={{ display: "grid", gridTemplateColumns: "1fr 200px 200px 100px", gap: 10, padding: "10px 16px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, alignItems: "center", cursor: "pointer" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <div style={{ fontWeight: 600 }}>{l.name}</div>
                <TipoBadge tipo={l.__tipo} />
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>id: {l._id}</div>
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)" }}>{l.category?.name || "—"}</div>
            <div style={{ color: "rgba(255,255,255,0.6)" }}>{l.unit?.name || l.unit?.shortName || "—"}</div>
            <div style={{ textAlign: "right", color: B.sky, fontSize: 18 }}>{expanded === l._id ? "▲" : "▼"}</div>
          </div>
          {expanded === l._id && (
            <ExpandedSoloLoggro loggroItem={l} sugerenciasFn={sugerenciasFn} onVincular={onVincular} onCrear={onCrear} />
          )}
        </div>
      ))}
      {items.length > 500 && (
        <div style={{ padding: 12, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Mostrando primeros 500 de {items.length}. Usa el buscador para filtrar.</div>
      )}
    </div>
  );
}

function ExpandedSoloLoggro({ loggroItem, sugerenciasFn, onVincular, onCrear }) {
  const sugerencias = useMemo(() => sugerenciasFn(loggroItem), [loggroItem, sugerenciasFn]);
  return (
    <div style={{ background: B.navy, padding: "12px 20px", borderTop: `1px solid ${B.navyLight}` }}>
      {sugerencias.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>Sin sugerencias por similitud. Puedes crear el item en Atolón desde este mismo botón:</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 }}>Sugerencias en Atolón OS ({sugerencias.length})</div>
          {sugerencias.map(s => (
            <div key={s.item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: B.navyMid, borderRadius: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.item.nombre}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{s.item.categoria} · {s.item.unidad} · match {Math.round(s.score * 100)}%</div>
              </div>
              <button style={BTN_PRIM} onClick={() => onVincular(s.item.id, loggroItem._id, loggroItem.name)}>Vincular</button>
            </div>
          ))}
        </>
      )}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.navyLight}55` }}>
        <button style={{ ...BTN_SEC, borderColor: B.sky, color: B.sky }} onClick={() => onCrear(loggroItem)}>+ Crear en Atolón como item nuevo</button>
      </div>
    </div>
  );
}

function SoloAtolonTab({ items, sugerenciasFn, onVincular }) {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", fontSize: 11, color: "rgba(255,255,255,0.4)", borderBottom: `1px solid ${B.navyLight}` }}>
        {items.length} items en Atolón sin loggro_id. Estos NO se descuentan cuando Loggro vende.
      </div>
      {items.slice(0, 500).map(a => (
        <div key={a.id}>
          <div onClick={() => setExpanded(expanded === a.id ? null : a.id)}
            style={{ display: "grid", gridTemplateColumns: "1fr 200px 100px 120px 40px", gap: 10, padding: "10px 16px", borderTop: `1px solid ${B.navyLight}55`, fontSize: 12, alignItems: "center", cursor: "pointer" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{a.nombre}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{a.categoria}</div>
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)" }}>{a.unidad}</div>
            <div style={{ textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{COP(a.precio_compra || 0)}</div>
            <div style={{ textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{Number(a.stock_actual) || 0}</div>
            <div style={{ textAlign: "right", color: B.sky, fontSize: 18 }}>{expanded === a.id ? "▲" : "▼"}</div>
          </div>
          {expanded === a.id && (
            <ExpandedSoloAtolon atolonItem={a} sugerenciasFn={sugerenciasFn} onVincular={onVincular} />
          )}
        </div>
      ))}
      {items.length > 500 && (
        <div style={{ padding: 12, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Mostrando primeros 500 de {items.length}. Usa el buscador para filtrar.</div>
      )}
    </div>
  );
}

function ExpandedSoloAtolon({ atolonItem, sugerenciasFn, onVincular }) {
  const sugerencias = useMemo(() => sugerenciasFn(atolonItem), [atolonItem, sugerenciasFn]);
  return (
    <div style={{ background: B.navy, padding: "12px 20px", borderTop: `1px solid ${B.navyLight}` }}>
      {sugerencias.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Sin sugerencias en Loggro por similitud.</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 }}>Sugerencias en Loggro ({sugerencias.length})</div>
          {sugerencias.map(s => (
            <div key={s.loggro._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: B.navyMid, borderRadius: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.loggro.name}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{s.loggro.category?.name} · {s.loggro.unit?.name || s.loggro.unit?.shortName || "—"} · match {Math.round(s.score * 100)}%</div>
              </div>
              <button style={BTN_PRIM} onClick={() => onVincular(atolonItem.id, s.loggro._id, s.loggro.name)}>Vincular</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DuplicadosTab({ dup, atolonItems, loggro, onDesvincular }) {
  const loggroById = useMemo(() => new Map(loggro.map(l => [l._id, l])), [loggro]);
  const grupos = useMemo(() => {
    const g = [];
    for (const [loggro_id, count] of dup) {
      const atolonList = atolonItems.filter(it => it.loggro_id === loggro_id);
      const l = loggroById.get(loggro_id);
      g.push({ loggro_id, loggro: l, count, atolonList });
    }
    return g;
  }, [dup, atolonItems, loggroById]);
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
        Los siguientes loggro_id están asignados a más de un item en Atolón. Elige uno y desvincula los demás.
      </div>
      {grupos.map(g => (
        <div key={g.loggro_id} style={{ background: B.navy, borderRadius: 8, padding: 14, marginBottom: 12, borderLeft: `3px solid #ef4444` }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{g.loggro?.name || "(Loggro id " + g.loggro_id + ")"}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>{g.count} items en Atolón apuntan a este</div>
          {g.atolonList.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: B.navyMid, borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{a.nombre}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{a.categoria} · {a.unidad} · stock {Number(a.stock_actual) || 0}</div>
              </div>
              <button style={{ ...BTN_SEC, fontSize: 11, padding: "4px 8px", color: "#fca5a5" }} onClick={() => onDesvincular(a.id)}>Desvincular</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
