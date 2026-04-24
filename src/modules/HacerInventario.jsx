import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { B, COP, todayStr } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };

export default function HacerInventario() {
  const [step, setStep] = useState(1); // 1 = seleccionar locación, 2 = contar
  const [locaciones, setLocaciones] = useState([]);
  const [locId, setLocId] = useState("");
  const [items, setItems] = useState([]);
  const [stockPorLoc, setStockPorLoc] = useState({});
  const [conteos, setConteos] = useState({}); // { item_id: cantidad_contada }
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");
  const [filterModo, setFilterModo] = useState("todos"); // "todos" | "pendientes" | "con_diferencia"
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [historial, setHistorial] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState(null); // { type: "ok"|"err", text }
  const [cantidadModal, setCantidadModal] = useState(null); // { item, cant } — al escanear
  const [continuandoId, setContinuandoId] = useState(null); // id del conteo que estás continuando
  const rowRefs = useRef({}); // item_id → input element

  // Cargar locaciones y conteos históricos
  useEffect(() => {
    if (!supabase) return;
    supabase.from("items_locaciones").select("*").eq("activa", true).order("orden")
      .then(({ data }) => setLocaciones(data || []));
    supabase.auth.getSession().then(({ data }) => setUserEmail(data?.session?.user?.email || ""));
    supabase.from("items_conteos").select("id, locacion_id, fecha, usuario_email, total_items, diferencias, notas, created_at")
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setHistorial(data || []));
  }, []);

  // Cargar items + stock cuando eligen locación
  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [iR, sR] = await Promise.all([
      supabase.from("items_catalogo").select("id, nombre, codigo, categoria, unidad").eq("activo", true).order("nombre"),
      supabase.from("items_stock_locacion").select("item_id, locacion_id, cantidad"),
    ]);
    setItems(iR.data || []);
    const map = {};
    (sR.data || []).forEach(s => { map[`${s.item_id}|${s.locacion_id}`] = Number(s.cantidad) || 0; });
    setStockPorLoc(map);
    setConteos({});
  }, []);

  const stockEn = (item_id) => Number(stockPorLoc[`${item_id}|${locId}`]) || 0;

  const comenzarConteo = (id) => {
    setLocId(id);
    cargar().then(() => setStep(2));
  };

  // Categorías con items
  const categorias = useMemo(() => {
    const set = new Set(items.map(i => i.categoria).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const hayBusqueda = !!search || catFilter !== "todos";
    // Sin búsqueda: solo mostrar los ya contados o los seleccionados por scan
    if (!hayBusqueda) {
      return items.filter(i => conteos[i.id] !== undefined && conteos[i.id] !== "");
    }
    let list = items;
    if (catFilter !== "todos") list = list.filter(i => i.categoria === catFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i => i.nombre?.toLowerCase().includes(s) || i.codigo?.toLowerCase().includes(s));
    }
    if (filterModo === "pendientes") list = list.filter(i => conteos[i.id] === undefined || conteos[i.id] === "");
    else if (filterModo === "contados") list = list.filter(i => conteos[i.id] !== undefined && conteos[i.id] !== "");
    return list;
  }, [items, search, catFilter, filterModo, conteos]);

  const sinBusqueda = !search && catFilter === "todos";

  const stats = useMemo(() => {
    const contados = items.filter(i => conteos[i.id] !== undefined && conteos[i.id] !== "").length;
    return { contados, pendientes: items.length - contados };
  }, [conteos, items]);

  const locActual = locaciones.find(l => l.id === locId);

  // Al detectar un código: cerrar scanner y abrir modal de cantidad
  const handleCodigoEscaneado = useCallback((codigo) => {
    const c = String(codigo).trim();
    if (!c) return;
    const found = items.find(i => (i.codigo || "").trim() === c);
    if (!found) {
      setScanMsg({ type: "err", text: `Código "${c}" no está en catálogo` });
      setTimeout(() => setScanMsg(null), 2500);
      return;
    }
    // Cerrar scanner y abrir pop-up de cantidad
    setScanOpen(false);
    setCantidadModal({ item: found, cant: "" });
    // Limpiar filtros/búsqueda para que sea visible al cerrar
    setSearch("");
    setCatFilter("todos");
    setFilterModo("todos");
    // Scroll al ítem y enfocar el input (por si acaso)
    setTimeout(() => {
      const el = rowRefs.current[found.id];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  }, [items]);

  // Guardar conteo: crea registro + actualiza items_stock_locacion
  const guardar = async () => {
    if (!supabase) return;
    const itemsConteados = items
      .filter(i => conteos[i.id] !== undefined && conteos[i.id] !== "")
      .map(i => ({
        item_id: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        sistema: stockEn(i.id),
        contado: Number(conteos[i.id]),
        diferencia: Number(conteos[i.id]) - stockEn(i.id),
      }));
    if (itemsConteados.length === 0) return alert("No has contado ningún ítem");
    if (!confirm(`Guardar conteo de ${itemsConteados.length} ítems en ${locActual?.nombre}? Esto ajustará el stock al valor contado.`)) return;

    setSaving(true);
    const diffs = itemsConteados.filter(i => i.diferencia !== 0).length;
    let id;

    if (continuandoId) {
      // UPDATE: mergear con los ítems previos del conteo (último valor gana por item_id)
      const { data: prevData } = await supabase.from("items_conteos").select("items").eq("id", continuandoId).single();
      const prevItems = prevData?.items || [];
      const map = new Map();
      prevItems.forEach(it => map.set(it.item_id, it));
      itemsConteados.forEach(it => map.set(it.item_id, it));
      const merged = Array.from(map.values());
      const mergedDiffs = merged.filter(i => Number(i.diferencia) !== 0).length;
      const { error } = await supabase.from("items_conteos").update({
        items: merged,
        total_items: merged.length,
        diferencias: mergedDiffs,
        notas: notas.trim() || null,
        usuario_email: userEmail || "sistema",
      }).eq("id", continuandoId);
      if (error) { setSaving(false); return alert("Error actualizando conteo: " + error.message); }
      id = continuandoId;
    } else {
      id = `CNT-${Date.now()}`;
      const { error } = await supabase.from("items_conteos").insert({
        id, locacion_id: locId, fecha: todayStr(),
        usuario_email: userEmail || "sistema",
        notas: notas.trim() || null,
        items: itemsConteados,
        total_items: itemsConteados.length,
        diferencias: diffs,
      });
      if (error) { setSaving(false); return alert("Error guardando conteo: " + error.message); }
    }

    // Actualizar stock por locación
    await Promise.all(itemsConteados.map(it =>
      supabase.from("items_stock_locacion").upsert({
        item_id: it.item_id, locacion_id: locId,
        cantidad: it.contado, updated_at: new Date().toISOString(),
      }, { onConflict: "item_id,locacion_id" })
    ));

    setSaving(false);
    setSaved({ id, total: itemsConteados.length, diferencias: diffs });
  };

  const reset = () => {
    setStep(1); setLocId(""); setConteos({}); setSearch(""); setCatFilter("todos");
    setFilterModo("todos"); setNotas(""); setSaved(null); setContinuandoId(null);
    // Recargar historial
    supabase.from("items_conteos").select("id, locacion_id, fecha, usuario_email, total_items, diferencias, notas, created_at")
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setHistorial(data || []));
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ color: "#fff", fontFamily: "inherit", maxWidth: 980, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📋 Hacer Inventario</h2>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          Conteo físico de stock por locación. Ajusta las cantidades al valor real.
        </div>
      </div>

      {/* ═══ STEP 1: seleccionar locación ═══ */}
      {step === 1 && !saved && (
        <>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 12 }}>
            Selecciona la locación a contar
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 30 }}>
            {locaciones.map(loc => (
              <button key={loc.id} onClick={() => comenzarConteo(loc.id)}
                style={{
                  background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 14,
                  padding: "24px 20px", textAlign: "left", cursor: "pointer", color: "#fff",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = B.sky; e.currentTarget.style.background = B.sky + "10"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = B.navyLight; e.currentTarget.style.background = B.navyMid; }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>{loc.icono}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: B.white }}>{loc.nombre}</div>
                {loc.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>{loc.descripcion}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {loc.es_principal && <span style={{ fontSize: 9, padding: "2px 8px", background: B.sand + "22", color: B.sand, borderRadius: 10, fontWeight: 700 }}>★ principal</span>}
                  {loc.es_ventas && <span style={{ fontSize: 9, padding: "2px 8px", background: B.success + "22", color: B.success, borderRadius: 10, fontWeight: 700 }}>💰 ventas</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Historial de conteos — clickable para continuar */}
          {historial.length > 0 && (
            <div style={{ background: B.navyMid, borderRadius: 12, padding: "18px 20px", border: `1px solid ${B.navyLight}` }}>
              <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Historial de conteos</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>Click en un conteo para retomarlo o revisarlo.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {historial.map(c => {
                  const loc = locaciones.find(l => l.id === c.locacion_id);
                  const continuar = async () => {
                    if (!supabase) return;
                    setLocId(c.locacion_id);
                    setContinuandoId(c.id);
                    const [iR, sR] = await Promise.all([
                      supabase.from("items_catalogo").select("id, nombre, codigo, categoria, unidad").eq("activo", true).order("nombre"),
                      supabase.from("items_stock_locacion").select("item_id, locacion_id, cantidad"),
                    ]);
                    setItems(iR.data || []);
                    const map = {};
                    (sR.data || []).forEach(s => { map[`${s.item_id}|${s.locacion_id}`] = Number(s.cantidad) || 0; });
                    setStockPorLoc(map);
                    const pre = {};
                    (c.items || []).forEach(it => { pre[it.item_id] = String(it.contado); });
                    setConteos(pre);
                    setNotas(c.notas || "");
                    setStep(2);
                  };
                  return (
                    <button key={c.id} onClick={continuar}
                      style={{ display: "grid", gridTemplateColumns: "110px 1fr auto auto auto", gap: 12, alignItems: "center", padding: "10px 14px", background: B.navy, borderRadius: 8, fontSize: 12, border: `1px solid ${B.navyLight}`, cursor: "pointer", color: B.white, textAlign: "left", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = B.sky; e.currentTarget.style.background = B.sky + "10"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = B.navyLight; e.currentTarget.style.background = B.navy; }}>
                      <span style={{ color: "rgba(255,255,255,0.55)" }}>{new Date(c.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })} {new Date(c.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{loc?.icono} <strong>{loc?.nombre || c.locacion_id}</strong> · <span style={{ color: "rgba(255,255,255,0.4)" }}>{c.usuario_email}</span></span>
                      <span style={{ color: "rgba(255,255,255,0.6)" }}>{c.total_items} ítems</span>
                      <span style={{ color: c.diferencias > 0 ? B.warning : B.success, fontWeight: 700 }}>{c.diferencias > 0 ? `${c.diferencias} Δ` : "✓"}</span>
                      <span style={{ color: B.sky, fontSize: 11, fontWeight: 700 }}>▶ Continuar</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ STEP 2: contar ═══ */}
      {step === 2 && !saved && (
        <>
          {/* Header locación */}
          <div style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 14, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 32 }}>{locActual?.icono}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Contando en</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: B.white }}>{locActual?.nombre}</div>
            </div>
            <button onClick={() => { if (Object.keys(conteos).length > 0 && !confirm("Perderás los conteos sin guardar. ¿Continuar?")) return; setStep(1); setConteos({}); }}
              style={{ background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
              ← Cambiar locación
            </button>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${B.sky}` }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total ítems</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>{items.length}</div>
            </div>
            <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${B.success}` }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Contados</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>{stats.contados}</div>
            </div>
            <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${B.warning}` }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pendientes</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>{stats.pendientes}</div>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
            <button onClick={() => setScanOpen(true)}
              style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              📷 Escanear código
            </button>
            <input placeholder="🔍 Buscar ítem o código…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...IS, width: 260 }} />
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...IS, width: 200 }}>
              <option value="todos">Todas las categorías</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display: "flex", gap: 0, border: `1px solid ${B.navyLight}`, borderRadius: 8, overflow: "hidden" }}>
              {[
                { k: "todos", l: "Todos" },
                { k: "pendientes", l: "Pendientes" },
                { k: "contados", l: "Contados" },
              ].map(f => (
                <button key={f.k} onClick={() => setFilterModo(f.k)}
                  style={{ padding: "9px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: filterModo === f.k ? B.sky : B.navyMid, color: filterModo === f.k ? B.navy : "rgba(255,255,255,0.6)" }}>
                  {f.l}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla de ítems */}
          <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}`, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1.2fr 0.8fr 1.2fr", padding: "10px 16px", borderBottom: `2px solid ${B.navyLight}`, gap: 8 }}>
              {["Ítem", "Categoría", "Unidad", "Cantidad contada"].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</div>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, lineHeight: 1.7 }}>
                {sinBusqueda ? (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📷</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", fontWeight: 600, marginBottom: 6 }}>Escanea un código o busca un ítem para empezar</div>
                    <div style={{ fontSize: 11 }}>La lista completa no se muestra — aparecen solo los ítems que contás.</div>
                  </>
                ) : "No hay ítems que coincidan con el filtro."}
              </div>
            ) : filtered.map((i, idx) => {
              const contadoStr = conteos[i.id] ?? "";
              const yaContado = contadoStr !== "";
              return (
                <div key={i.id} style={{
                  display: "grid", gridTemplateColumns: "3fr 1.2fr 0.8fr 1.2fr", padding: "9px 16px", gap: 8, alignItems: "center",
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${B.navyLight}` : "none",
                  background: yaContado ? "rgba(74,222,128,0.04)" : "transparent",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: B.white }}>{i.nombre}</div>
                    {i.codigo && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{i.codigo}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{i.categoria || "—"}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{i.unidad || "—"}</div>
                  <div>
                    <input
                      ref={el => { rowRefs.current[i.id] = el; }}
                      type="number"
                      value={contadoStr}
                      onChange={e => setConteos(c => ({ ...c, [i.id]: e.target.value }))}
                      placeholder="Contar…"
                      style={{ ...IS, padding: "6px 10px", textAlign: "right", fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", borderColor: yaContado ? B.success + "55" : B.navyLight }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Notas + Guardar */}
          <div style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 12, padding: "16px 20px" }}>
            <label style={LS}>Notas del conteo (opcional)</label>
            <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones, merma, productos en mal estado…"
              style={{ ...IS, resize: "vertical", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {stats.contados} de {items.length} contados
              </div>
              <button onClick={guardar} disabled={saving || stats.contados === 0}
                style={{
                  background: saving || stats.contados === 0 ? B.navyLight : B.success,
                  color: B.navy, border: "none", borderRadius: 10, padding: "12px 28px",
                  fontSize: 14, fontWeight: 800, cursor: saving || stats.contados === 0 ? "not-allowed" : "pointer",
                }}>
                {saving ? "Guardando…" : `💾 Guardar conteo (${stats.contados})`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ MODAL ESCÁNER DE CÓDIGO DE BARRAS ═══ */}
      {scanOpen && <ScannerModal onClose={() => setScanOpen(false)} onCode={handleCodigoEscaneado} />}

      {/* ═══ POP-UP CANTIDAD al escanear ═══ */}
      {cantidadModal && (() => {
        const i = cantidadModal.item;
        const cantNum = Number(cantidadModal.cant) || 0;
        const acumulado = Number(conteos[i.id] || 0);
        const confirmar = () => {
          if (!cantNum || cantNum <= 0) return alert("Cantidad inválida");
          // Sumar a lo que ya había contado (por si scan el mismo producto 2 veces)
          setConteos(prev => ({ ...prev, [i.id]: String(acumulado + cantNum) }));
          setCantidadModal(null);
          setScanMsg({ type: "ok", text: `✓ ${i.nombre}: +${cantNum}` });
          setTimeout(() => setScanMsg(null), 1500);
          // Re-abrir scanner para seguir escaneando
          setTimeout(() => setScanOpen(true), 300);
        };
        return (
          <div onClick={e => e.target === e.currentTarget && setCantidadModal(null)}
            style={{ position: "fixed", inset: 0, zIndex: 2200, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 420, padding: 28, border: `2px solid ${B.success}` }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 }}>📷 Escaneado</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: B.white, marginBottom: 4 }}>{i.nombre}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
                {i.categoria} · Unidad: {i.unidad || "—"}
                {acumulado > 0 && <span style={{ color: B.success, fontWeight: 700, marginLeft: 8 }}>(ya contado: {acumulado})</span>}
              </div>
              <label style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
                ¿Cuántos {i.unidad || "unidades"}?
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <button onClick={() => setCantidadModal(c => ({ ...c, cant: String(Math.max(0, (Number(c.cant) || 0) - 1)) }))}
                  style={{ width: 42, height: 42, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: B.sky, fontSize: 22, fontWeight: 800, cursor: "pointer" }}>−</button>
                <input
                  autoFocus type="number" min={0}
                  step={i.unidad?.toLowerCase().match(/kg|gr|lt|lit|gal/) ? "0.01" : "1"}
                  value={cantidadModal.cant}
                  onChange={e => setCantidadModal(c => ({ ...c, cant: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 32, fontWeight: 800, textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }}
                  placeholder="0" />
                <button onClick={() => setCantidadModal(c => ({ ...c, cant: String((Number(c.cant) || 0) + 1) }))}
                  style={{ width: 42, height: 42, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: B.sky, fontSize: 22, fontWeight: 800, cursor: "pointer" }}>+</button>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setCantidadModal(null); setTimeout(() => setScanOpen(true), 100); }}
                  style={{ flex: 1, padding: "12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 600, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={confirmar} disabled={!cantNum}
                  style={{ flex: 2, padding: "12px", borderRadius: 8, border: "none", background: !cantNum ? B.navyLight : B.success, color: B.navy, fontWeight: 800, fontSize: 14, cursor: !cantNum ? "default" : "pointer" }}>
                  ✓ Agregar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast mensajes del escáner */}
      {scanMsg && (
        <div style={{
          position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)",
          background: scanMsg.type === "ok" ? B.success : B.danger, color: B.navy,
          padding: "12px 24px", borderRadius: 12, fontWeight: 800, fontSize: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 2000,
        }}>
          {scanMsg.text}
        </div>
      )}

      {/* ═══ ÉXITO ═══ */}
      {saved && (
        <div style={{ background: "#4ade8018", border: "1px solid #4ade8033", borderRadius: 16, padding: "32px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: B.success, marginBottom: 6 }}>Conteo guardado</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>ID: {saved.id}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: "14px 0" }}>
            {saved.total} ítems contados · <strong style={{ color: saved.diferencias > 0 ? B.warning : B.success }}>{saved.diferencias}</strong> con diferencia
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
            El stock de <strong style={{ color: B.white }}>{locActual?.nombre}</strong> fue actualizado al valor contado.
          </div>
          <button onClick={reset}
            style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            + Nuevo Conteo
          </button>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// SCANNER MODAL — Escaneo de código de barras usando BarcodeDetector API
// ═══════════════════════════════════════════════════════════════════════════
function ScannerModal({ onClose, onCode }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const detectorSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!detectorSupported) {
      setError("Tu navegador no soporta escaneo nativo. Usa entrada manual o un scanner USB.");
      return;
    }
    let stream = null;
    let detector = null;
    let rafId = null;
    let stopped = false;

    const start = async () => {
      try {
        // Formatos típicos en inventario: EAN-13, EAN-8, UPC-A, Code128, QR
        detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "data_matrix", "itf"],
        });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const loop = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              const code = codes[0].rawValue || codes[0].displayValue;
              if (code && !cooldown) {
                setLastCode(code);
                setCooldown(true);
                onCode(code);
                // Beep (tono corto)
                try {
                  const ctx = new (window.AudioContext || window.webkitAudioContext)();
                  const osc = ctx.createOscillator();
                  osc.frequency.value = 900; osc.connect(ctx.destination);
                  osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, 80);
                } catch(_) {}
                setTimeout(() => setCooldown(false), 1500);
              }
            }
          } catch (_) { /* ignore frame errors */ }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setError("No se pudo acceder a la cámara: " + e.message);
      }
    };

    start();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line

  const submitManual = () => {
    const c = manual.trim();
    if (!c) return;
    onCode(c);
    setManual("");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "#000",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", background: "rgba(0,0,0,0.85)", color: "#fff", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📷 Escanear código de barras</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            Apunta al código. Cada scan suma +1 al ítem. Queda abierto para varios seguidos.
          </div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          ✕ Cerrar
        </button>
      </div>

      {/* Video */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
        {error ? (
          <div style={{ color: "#fca5a5", textAlign: "center", padding: 40, fontSize: 14 }}>
            ⚠️ {error}
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {/* Marco guía */}
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: "80%", maxWidth: 500, aspectRatio: "2 / 1",
              border: `3px solid ${cooldown ? "#4ade80" : "#38bdf8"}`,
              borderRadius: 16, pointerEvents: "none",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
              transition: "border-color 0.15s",
            }} />
            {lastCode && (
              <div style={{ position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.75)", color: "#4ade80", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontFamily: "monospace" }}>
                Último: {lastCode}
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      {/* Entrada manual (fallback) */}
      <div style={{ padding: "12px 16px", background: "rgba(0,0,0,0.85)", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: 8 }}>
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submitManual(); }}
          placeholder="…o escribe/pega el código aquí y pulsa Enter"
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, outline: "none" }}
        />
        <button onClick={submitManual} style={{ background: "#38bdf8", color: "#0D1B3E", border: "none", borderRadius: 8, padding: "0 18px", fontWeight: 800, cursor: "pointer" }}>Agregar</button>
      </div>
    </div>
  );
}
