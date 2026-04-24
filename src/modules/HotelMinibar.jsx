// HotelMinibar.jsx — Gestión de mini bar por habitación del hotel.
//   Tab 1: Configurar stock estándar por habitación
//   Tab 2: Registrar consumo (check al hacer housekeeping)
//   Tab 3: Historial de ventas

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { B, COP, todayStr } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };

export default function HotelMinibar() {
  const [tab, setTab] = useState("consumo"); // "consumo" | "config" | "historial"
  const [habitaciones, setHabitaciones] = useState([]);
  const [items, setItems] = useState([]);
  const [stockByHab, setStockByHab] = useState({}); // { hab_id: [{ item_id, cantidad_esperada, precio_venta, nombre, unidad }] }
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [hR, iR, sR, vR] = await Promise.all([
      supabase.from("hotel_habitaciones").select("id, numero, categoria, estado").order("numero"),
      supabase.from("items_catalogo").select("id, nombre, unidad, categoria, foto_url").eq("activo", true).order("nombre"),
      supabase.from("minibar_stock_habitacion").select("*"),
      supabase.from("minibar_ventas").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setHabitaciones(hR.data || []);
    setItems(iR.data || []);
    setVentas(vR.data || []);
    // Agrupar stock por habitación
    const map = {};
    (sR.data || []).forEach(s => {
      if (!map[s.habitacion_id]) map[s.habitacion_id] = [];
      const it = (iR.data || []).find(x => x.id === s.item_id);
      if (!it) return;
      map[s.habitacion_id].push({ ...s, nombre: it.nombre, unidad: it.unidad, foto_url: it.foto_url });
    });
    setStockByHab(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase?.auth.getSession().then(({ data }) => setUserEmail(data?.session?.user?.email || ""));
  }, [load]);

  return (
    <div style={{ color: "#fff", fontFamily: "inherit", maxWidth: 1100, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🥂 Mini Bar</h2>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          Gestiona el contenido del mini bar por habitación y registra consumos al hacer housekeeping.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: `1px solid ${B.navyLight}`, overflowX: "auto" }}>
        {[
          ["consumo",   "🛎️ Registrar consumo"],
          ["config",    "⚙️ Configurar stock"],
          ["historial", "📋 Historial de ventas"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
              color: tab === k ? B.white : "rgba(255,255,255,0.4)",
              fontSize: 13, fontWeight: tab === k ? 700 : 500,
              borderBottom: tab === k ? `2px solid ${B.sky}` : "2px solid transparent",
              whiteSpace: "nowrap",
            }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : tab === "consumo" ? (
        <TabConsumo habitaciones={habitaciones} stockByHab={stockByHab} userEmail={userEmail} onDone={load} />
      ) : tab === "config" ? (
        <TabConfig habitaciones={habitaciones} items={items} stockByHab={stockByHab} onDone={load} />
      ) : (
        <TabHistorial ventas={ventas} habitaciones={habitaciones} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB CONSUMO — registrar qué se consumió del mini bar
// ═══════════════════════════════════════════════════════════════════════════
function TabConsumo({ habitaciones, stockByHab, userEmail, onDone }) {
  const [habId, setHabId] = useState("");
  const [conteo, setConteo] = useState({}); // item_id → cantidad encontrada
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  const habActual = habitaciones.find(h => h.id === habId);
  const stock = stockByHab[habId] || [];

  const consumos = stock
    .map(s => {
      const encontrado = conteo[s.item_id];
      if (encontrado === undefined || encontrado === "") return null;
      const consumido = Math.max(0, Number(s.cantidad_esperada) - Number(encontrado));
      if (consumido <= 0) return null;
      return { ...s, consumido, subtotal: consumido * Number(s.precio_venta) };
    })
    .filter(Boolean);
  const totalVenta = consumos.reduce((s, c) => s + c.subtotal, 0);

  const guardar = async () => {
    if (!habId || consumos.length === 0) return alert("No hay consumos para registrar");
    setSaving(true);

    // Buscar la estancia activa (check-in en curso) en esta habitación
    const { data: estancias } = await supabase.from("hotel_estancias")
      .select("id, huesped_nombre, reserva_id")
      .eq("habitacion_id", habId)
      .in("estado", ["check_in", "activa", "en_casa"])
      .order("created_at", { ascending: false })
      .limit(1);
    const estancia = estancias?.[0];

    if (!estancia) {
      setSaving(false);
      return alert("⚠️ Esta habitación no tiene huésped con check-in activo. No se puede cargar al folio.");
    }

    // 1. Registrar las ventas en minibar_ventas (audit)
    const rows = consumos.map(c => ({
      id: `MB-${Date.now()}-${c.item_id.slice(-4)}`,
      habitacion_id: habId,
      item_id: c.item_id,
      item_nombre: c.nombre,
      cantidad: c.consumido,
      precio_unit: Number(c.precio_venta) || 0,
      subtotal: c.subtotal,
      fecha: todayStr(),
      huesped_nombre: estancia.huesped_nombre || null,
      reservation_id: estancia.reserva_id || null,
      folio_id: estancia.id,
      cobrado: true, // se marca como cobrado porque ya queda cargado al folio
      registrado_por: userEmail || "sistema",
      notas: notas.trim() || null,
    }));
    const { error } = await supabase.from("minibar_ventas").insert(rows);
    if (error) { setSaving(false); return alert("Error: " + error.message); }

    // 2. Cargar al folio (hotel_room_charges) — una línea consolidada
    const desc = `Mini Bar · ${consumos.map(c => `${c.consumido}× ${c.nombre}`).join(", ")}`;
    const { error: chErr } = await supabase.from("hotel_room_charges").insert({
      estancia_id: estancia.id,
      origen: "minibar",
      origen_ref: rows[0].id,
      descripcion: desc.slice(0, 300),
      monto: totalVenta,
    });
    if (chErr) {
      // Si falla el cargo al folio, avisa pero no rollback (la venta ya queda registrada)
      alert("⚠️ Ventas guardadas, pero falló el cargo al folio: " + chErr.message);
    }

    // 3. Descontar del inventario de la habitación: actualizar cantidad_esperada
    //    al valor "encontrado" (que refleja el stock real después del consumo)
    await Promise.all(consumos.map(c =>
      supabase.from("minibar_stock_habitacion")
        .update({
          cantidad_esperada: Math.max(0, Number(c.cantidad_esperada) - c.consumido),
          updated_at: new Date().toISOString(),
        })
        .eq("habitacion_id", habId)
        .eq("item_id", c.item_id)
    ));

    setSaved({ total: totalVenta, count: consumos.length, reserva: estancia.huesped_nombre || null, folio: !chErr });
    setSaving(false);
  };

  const reset = () => {
    setHabId(""); setConteo({}); setNotas(""); setSaved(null);
    onDone();
  };

  if (saved) {
    return (
      <div style={{ background: "#4ade8015", border: "1px solid #4ade8033", borderRadius: 16, padding: "32px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: B.success, marginBottom: 8 }}>Consumo registrado</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>
          {saved.count} ítem{saved.count !== 1 ? "s" : ""} · <strong style={{ color: B.sand }}>{COP(saved.total)}</strong>
        </div>
        {saved.reserva && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
            {saved.folio ? (
              <>✅ Cargado al folio de <strong style={{ color: B.white }}>{saved.reserva}</strong></>
            ) : (
              <>⚠️ Registrado pero falló el cargo al folio de {saved.reserva}</>
            )}
          </div>
        )}
        <button onClick={reset} style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 10, padding: "11px 24px", fontWeight: 700, cursor: "pointer" }}>
          + Nueva habitación
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Grid de fichas de habitación */}
      {!habId && (
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
            Selecciona una habitación para registrar consumo
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            {habitaciones.map(h => {
              const tieneConfig = (stockByHab[h.id] || []).length > 0;
              return (
                <button key={h.id} onClick={() => { setHabId(h.id); setConteo({}); }}
                  style={{
                    background: tieneConfig ? B.navyMid : "rgba(255,255,255,0.02)",
                    border: `1px solid ${tieneConfig ? B.navyLight : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 12, padding: "16px 14px", cursor: "pointer", color: "#fff",
                    textAlign: "left", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = B.sky; e.currentTarget.style.background = B.sky + "10"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = tieneConfig ? B.navyLight : "rgba(255,255,255,0.08)"; e.currentTarget.style.background = tieneConfig ? B.navyMid : "rgba(255,255,255,0.02)"; }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🏨</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Hab. {h.numero}
                  </div>
                  {h.categoria && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{h.categoria}</div>}
                  <div style={{ fontSize: 9, color: tieneConfig ? B.success : B.warning, fontWeight: 700, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {tieneConfig ? `${(stockByHab[h.id] || []).length} ítems` : "sin config"}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Botón volver */}
      {habId && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => { setHabId(""); setConteo({}); }}
            style={{ background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
            ← Cambiar habitación
          </button>
        </div>
      )}

      {habId && stock.length === 0 && (
        <div style={{ background: B.warning + "15", border: `1px solid ${B.warning}55`, borderRadius: 10, padding: "14px 18px", color: B.warning, fontSize: 13 }}>
          ⚠️ Esta habitación no tiene productos configurados en el mini bar. Ve a <strong>⚙️ Configurar stock</strong> primero.
        </div>
      )}

      {habId && stock.length > 0 && (
        <>
          <div style={{ background: B.navyMid, borderRadius: 14, border: `1px solid ${B.navyLight}`, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: B.white }}>🏨 Habitación {habActual?.numero}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  Indica cuántas unidades quedan de cada producto. La diferencia se cobrará.
                </div>
              </div>
              <button onClick={() => {
                // Auto-llenar con el stock completo (nada consumido)
                const all = {};
                stock.forEach(s => { all[s.item_id] = String(s.cantidad_esperada); });
                setConteo(all);
              }}
                style={{ background: B.navyLight, color: B.sand, border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                ✓ Todo completo
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2.5fr 0.9fr 0.9fr 1fr 1fr", gap: 10, padding: "8px 18px", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, background: B.navy }}>
              <div>Producto</div>
              <div style={{ textAlign: "center" }}>Esperado</div>
              <div style={{ textAlign: "center" }}>Encontrado</div>
              <div style={{ textAlign: "center" }}>Consumido</div>
              <div style={{ textAlign: "right" }}>Subtotal</div>
            </div>

            {stock.map(s => {
              const enc = conteo[s.item_id];
              const encNum = Number(enc) || 0;
              const consumido = enc !== undefined && enc !== "" ? Math.max(0, Number(s.cantidad_esperada) - encNum) : null;
              const subtotal = consumido !== null ? consumido * Number(s.precio_venta) : null;
              return (
                <div key={s.item_id} style={{
                  display: "grid", gridTemplateColumns: "2.5fr 0.9fr 0.9fr 1fr 1fr", gap: 10,
                  padding: "10px 18px", alignItems: "center", borderBottom: `1px solid ${B.navyLight}33`,
                  background: consumido > 0 ? "rgba(251,191,36,0.04)" : "transparent",
                }}>
                  <div style={{ fontSize: 13, color: B.white }}>
                    {s.nombre}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>
                      {s.unidad} · {COP(s.precio_venta)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.6)", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {s.cantidad_esperada}
                  </div>
                  <div>
                    <input type="number" min={0} max={Number(s.cantidad_esperada)}
                      value={enc ?? ""}
                      onChange={e => setConteo(c => ({ ...c, [s.item_id]: e.target.value }))}
                      style={{ ...IS, padding: "6px 10px", fontSize: 14, fontWeight: 700, textAlign: "center" }}
                      placeholder="—" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: consumido > 0 ? B.warning : "rgba(255,255,255,0.25)", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {consumido !== null ? consumido : "—"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: subtotal > 0 ? B.sand : "rgba(255,255,255,0.25)", textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {subtotal !== null && subtotal > 0 ? COP(subtotal) : "—"}
                  </div>
                </div>
              );
            })}

            <div style={{ padding: "14px 18px", background: B.navy, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {consumos.length} ítem{consumos.length !== 1 ? "s" : ""} consumido{consumos.length !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>
                Total: {COP(totalVenta)}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones…" style={IS} />
          </div>

          <button onClick={guardar} disabled={saving || consumos.length === 0}
            style={{
              width: "100%", padding: "14px", borderRadius: 10, border: "none",
              background: saving || consumos.length === 0 ? B.navyLight : B.success,
              color: B.navy, fontWeight: 800, fontSize: 15,
              cursor: saving || consumos.length === 0 ? "default" : "pointer",
            }}>
            {saving ? "Guardando…" : `💾 Registrar consumo (${COP(totalVenta)})`}
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB CONFIG — definir qué lleva el mini bar de cada habitación
// ═══════════════════════════════════════════════════════════════════════════
function TabConfig({ habitaciones, items, stockByHab, onDone }) {
  const [habId, setHabId] = useState("");
  const [rows, setRows] = useState([]); // [{ item_id, cantidad_esperada, precio_venta }]
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [cantidadModal, setCantidadModal] = useState(null); // { item, cant, precio }
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!habId) { setRows([]); return; }
    const s = stockByHab[habId] || [];
    setRows(s.map(x => ({ item_id: x.item_id, cantidad_esperada: x.cantidad_esperada, precio_venta: x.precio_venta })));
  }, [habId, stockByHab]);

  const itemsFiltrados = useMemo(() => {
    if (!search) return items.slice(0, 30);
    const s = search.toLowerCase();
    return items.filter(i => i.nombre?.toLowerCase().includes(s) || (i.codigo || "").includes(search)).slice(0, 30);
  }, [items, search]);

  // Al escanear un código: buscar en catálogo y abrir modal cantidad
  const handleScan = (codigo) => {
    const c = String(codigo).trim();
    const found = items.find(i => (i.codigo || "").trim() === c);
    if (!found) {
      setToast({ type: "err", text: `Código ${c} no encontrado en catálogo` });
      setTimeout(() => setToast(null), 2500);
      return;
    }
    setScanOpen(false);
    const existing = rows.find(r => r.item_id === found.id);
    setCantidadModal({
      item: found,
      cant: existing ? String(existing.cantidad_esperada) : "1",
      precio: existing ? String(existing.precio_venta) : "0",
    });
  };

  const addItem = (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const existing = rows.find(r => r.item_id === itemId);
    setCantidadModal({
      item,
      cant: existing ? String(existing.cantidad_esperada) : "1",
      precio: existing ? String(existing.precio_venta) : "0",
    });
    setSearch("");
  };
  const updateRow = (itemId, field, val) => {
    setRows(r => r.map(x => x.item_id === itemId ? { ...x, [field]: val } : x));
  };
  const removeRow = (itemId) => setRows(r => r.filter(x => x.item_id !== itemId));

  const guardar = async () => {
    if (!habId) return;
    setSaving(true);
    // Borrar todo lo actual y reinsertar
    await supabase.from("minibar_stock_habitacion").delete().eq("habitacion_id", habId);
    if (rows.length > 0) {
      const toInsert = rows.map(r => ({
        habitacion_id: habId,
        item_id: r.item_id,
        cantidad_esperada: Number(r.cantidad_esperada) || 0,
        precio_venta: Number(r.precio_venta) || 0,
      }));
      const { error } = await supabase.from("minibar_stock_habitacion").insert(toInsert);
      if (error) { setSaving(false); return alert("Error: " + error.message); }
    }
    setSaving(false);
    onDone();
    alert("✓ Configuración guardada");
  };

  const habActual = habitaciones.find(h => h.id === habId);

  // Copiar config de otra habitación
  const [showCopiar, setShowCopiar] = useState(false);
  const habsConConfig = habitaciones.filter(h => (stockByHab[h.id] || []).length > 0 && h.id !== habId);
  const copiarDe = (sourceId) => {
    const src = stockByHab[sourceId] || [];
    setRows(src.map(x => ({ item_id: x.item_id, cantidad_esperada: x.cantidad_esperada, precio_venta: x.precio_venta })));
    setShowCopiar(false);
  };

  return (
    <div>
      {/* Grid de habitaciones si no hay selección */}
      {!habId && (
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
            Selecciona una habitación para configurar su mini bar
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {habitaciones.map(h => {
              const tieneConfig = (stockByHab[h.id] || []).length > 0;
              return (
                <button key={h.id} onClick={() => setHabId(h.id)}
                  style={{
                    background: tieneConfig ? B.navyMid : "rgba(255,255,255,0.02)",
                    border: `1px solid ${tieneConfig ? B.success + "55" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 12, padding: "16px 14px", cursor: "pointer", color: "#fff",
                    textAlign: "left", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = B.sky; e.currentTarget.style.background = B.sky + "10"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = tieneConfig ? B.success + "55" : "rgba(255,255,255,0.08)"; e.currentTarget.style.background = tieneConfig ? B.navyMid : "rgba(255,255,255,0.02)"; }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🏨</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Hab. {h.numero}
                  </div>
                  {h.categoria && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{h.categoria}</div>}
                  <div style={{ fontSize: 9, color: tieneConfig ? B.success : "rgba(255,255,255,0.35)", fontWeight: 700, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {tieneConfig ? `✓ ${(stockByHab[h.id] || []).length} ítems` : "sin config"}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {habId && (
        <>
          {/* Header con botones */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <button onClick={() => { setHabId(""); setRows([]); }}
              style={{ background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
              ← Volver
            </button>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: B.white }}>
              🏨 Hab. {habActual?.numero} {habActual?.categoria ? `· ${habActual.categoria}` : ""}
            </div>
            {habsConConfig.length > 0 && (
              <button onClick={() => setShowCopiar(true)}
                style={{ background: B.navyLight, color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                📋 Copiar de otra
              </button>
            )}
          </div>

          {/* Barra de agregar producto */}
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "14px 18px", marginBottom: 12, border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => setScanOpen(true)}
                style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
                📷 Escanear EAN
              </button>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar producto..." style={{ ...IS, flex: 1 }} />
            </div>
            {search && itemsFiltrados.length > 0 && (
              <div style={{ marginTop: 8, maxHeight: 250, overflowY: "auto", background: B.navy, borderRadius: 8 }}>
                {itemsFiltrados.map(i => {
                  const ya = rows.find(r => r.item_id === i.id);
                  return (
                    <div key={i.id}
                      onClick={() => addItem(i.id)}
                      style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderBottom: `1px solid ${B.navyLight}33` }}
                      onMouseEnter={e => { e.currentTarget.style.background = B.navyLight + "33"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ fontSize: 13, color: B.white }}>
                        {i.nombre}
                        {i.codigo && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 8, fontFamily: "monospace" }}>{i.codigo}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: ya ? B.success : B.sky, fontWeight: 700 }}>{ya ? "✏️ Editar" : "+ Agregar"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lista de items configurados */}
          <div style={{ background: B.navyMid, borderRadius: 14, border: `1px solid ${B.navyLight}`, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 40px", gap: 10, padding: "10px 18px", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, background: B.navy }}>
              <div>Producto</div>
              <div style={{ textAlign: "center" }}>Cantidad</div>
              <div style={{ textAlign: "center" }}>Precio venta</div>
              <div></div>
            </div>
            {rows.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                Sin productos en el mini bar. Busca y agrega arriba.
              </div>
            ) : rows.map(r => {
              const it = items.find(i => i.id === r.item_id);
              return (
                <div key={r.item_id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 40px", gap: 10, padding: "10px 18px", alignItems: "center", borderTop: `1px solid ${B.navyLight}` }}>
                  <div style={{ fontSize: 13, color: B.white }}>{it?.nombre || r.item_id}<span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>{it?.unidad}</span></div>
                  <input type="number" min={0} value={r.cantidad_esperada} onChange={e => updateRow(r.item_id, "cantidad_esperada", e.target.value)}
                    style={{ ...IS, padding: "6px 10px", textAlign: "center" }} />
                  <input type="number" min={0} value={r.precio_venta} onChange={e => updateRow(r.item_id, "precio_venta", e.target.value)}
                    style={{ ...IS, padding: "6px 10px", textAlign: "center" }} placeholder="0" />
                  <button onClick={() => removeRow(r.item_id)} style={{ background: "none", border: "none", color: B.danger, fontSize: 16, cursor: "pointer" }}>✕</button>
                </div>
              );
            })}
          </div>

          <button onClick={guardar} disabled={saving}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: saving ? B.navyLight : B.sky, color: B.navy, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            {saving ? "Guardando…" : `💾 Guardar configuración · Hab. ${habActual?.numero || ""}`}
          </button>
        </>
      )}

      {/* Modal copiar de otra habitación */}
      {showCopiar && (
        <div onClick={e => e.target === e.currentTarget && setShowCopiar(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, maxWidth: 400, width: "100%", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, marginBottom: 14 }}>📋 Copiar configuración</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
              Elige una habitación para copiar su stock:
            </div>
            {habsConConfig.map(h => (
              <button key={h.id} onClick={() => copiarDe(h.id)}
                style={{ display: "block", width: "100%", padding: "10px 14px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, textAlign: "left", cursor: "pointer", marginBottom: 6, fontSize: 13 }}>
                🏨 {h.numero} {h.tipo ? `· ${h.tipo}` : ""} <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>({(stockByHab[h.id] || []).length} ítems)</span>
              </button>
            ))}
            <button onClick={() => setShowCopiar(false)}
              style={{ marginTop: 10, width: "100%", padding: 10, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)", borderRadius: 8, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Scanner EAN */}
      {scanOpen && <BarcodeScanner onClose={() => setScanOpen(false)} onCode={handleScan} />}

      {/* Modal cantidad (después de escanear o buscar) */}
      {cantidadModal && (() => {
        const i = cantidadModal.item;
        const cantNum = Number(cantidadModal.cant) || 0;
        const precioNum = Number(cantidadModal.precio) || 0;
        const confirmar = () => {
          if (!cantNum || cantNum <= 0) return alert("Cantidad inválida");
          setRows(r => {
            const idx = r.findIndex(x => x.item_id === i.id);
            if (idx >= 0) {
              const copy = [...r]; copy[idx] = { ...copy[idx], cantidad_esperada: cantNum, precio_venta: precioNum };
              return copy;
            }
            return [...r, { item_id: i.id, cantidad_esperada: cantNum, precio_venta: precioNum }];
          });
          setCantidadModal(null);
          setToast({ type: "ok", text: `✓ ${i.nombre}: ${cantNum} · ${COP(precioNum)}` });
          setTimeout(() => setToast(null), 1500);
          // Re-abrir scanner si venía de ahí
          setTimeout(() => setScanOpen(true), 300);
        };
        return (
          <div onClick={e => e.target === e.currentTarget && setCantidadModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: B.navyMid, borderRadius: 16, maxWidth: 440, width: "100%", padding: 26, border: `2px solid ${B.success}` }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>📷 Agregar al mini bar</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: B.white, marginBottom: 4 }}>{i.nombre}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 18 }}>
                {i.categoria} · {i.unidad || "—"}
                {i.codigo && <span style={{ marginLeft: 8, fontFamily: "monospace" }}>· {i.codigo}</span>}
              </div>

              <label style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Cantidad</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button onClick={() => setCantidadModal(c => ({ ...c, cant: String(Math.max(0, (Number(c.cant) || 0) - 1)) }))}
                  style={{ width: 42, height: 42, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: B.sky, fontSize: 22, fontWeight: 800, cursor: "pointer" }}>−</button>
                <input autoFocus type="number" min={0} value={cantidadModal.cant}
                  onChange={e => setCantidadModal(c => ({ ...c, cant: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
                  style={{ flex: 1, textAlign: "center", fontSize: 28, fontWeight: 800, padding: "8px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }} />
                <button onClick={() => setCantidadModal(c => ({ ...c, cant: String((Number(c.cant) || 0) + 1) }))}
                  style={{ width: 42, height: 42, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: B.sky, fontSize: 22, fontWeight: 800, cursor: "pointer" }}>+</button>
              </div>

              <label style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Precio de venta al huésped</label>
              <input type="number" min={0} value={cantidadModal.precio}
                onChange={e => setCantidadModal(c => ({ ...c, precio: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
                placeholder="0"
                style={{ ...IS, fontSize: 18, fontWeight: 700, textAlign: "right", marginBottom: 20 }} />

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

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "ok" ? B.success : B.danger, color: B.navy,
          padding: "10px 22px", borderRadius: 12, fontWeight: 800, fontSize: 13, zIndex: 2300,
        }}>{toast.text}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB HISTORIAL — lista de ventas de mini bar
// ═══════════════════════════════════════════════════════════════════════════
function TabHistorial({ ventas, habitaciones }) {
  const [filterHab, setFilterHab] = useState("todas");
  const [filterFecha, setFilterFecha] = useState("");

  const filtered = ventas.filter(v => {
    if (filterHab !== "todas" && v.habitacion_id !== filterHab) return false;
    if (filterFecha && v.fecha !== filterFecha) return false;
    return true;
  });

  const totalGeneral = filtered.reduce((s, v) => s + (Number(v.subtotal) || 0), 0);
  const porCobrar = filtered.filter(v => !v.cobrado).reduce((s, v) => s + (Number(v.subtotal) || 0), 0);

  // Agrupar por habitación + fecha
  const grupos = {};
  filtered.forEach(v => {
    const key = `${v.habitacion_id}|${v.fecha}`;
    if (!grupos[key]) grupos[key] = { habitacion_id: v.habitacion_id, fecha: v.fecha, ventas: [], total: 0, huesped: v.huesped_nombre };
    grupos[key].ventas.push(v);
    grupos[key].total += Number(v.subtotal) || 0;
  });
  const gruposList = Object.values(grupos).sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${B.sand}` }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Total ventas</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalGeneral)}</div>
        </div>
        <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${B.warning}` }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Por cobrar</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(porCobrar)}</div>
        </div>
        <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${B.sky}` }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Ventas registradas</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>{filtered.length}</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={filterHab} onChange={e => setFilterHab(e.target.value)} style={{ ...IS, width: 200 }}>
          <option value="todas">Todas las habitaciones</option>
          {habitaciones.map(h => <option key={h.id} value={h.id}>🏨 {h.numero}</option>)}
        </select>
        <input type="date" value={filterFecha} onChange={e => setFilterFecha(e.target.value)} style={{ ...IS, width: 180 }} />
      </div>

      {gruposList.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <div>Sin ventas registradas</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {gruposList.map((g, i) => {
            const hab = habitaciones.find(h => h.id === g.habitacion_id);
            return (
              <div key={i} style={{ background: B.navyMid, borderRadius: 10, border: `1px solid ${B.navyLight}`, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>🏨 Habitación {hab?.numero || g.habitacion_id}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                      {new Date(g.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                      {g.huesped && ` · ${g.huesped}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(g.total)}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {g.ventas.map(v => (
                    <div key={v.id} style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 0.8fr auto", gap: 10, fontSize: 12, color: "rgba(255,255,255,0.7)", padding: "4px 0" }}>
                      <span>{v.item_nombre}</span>
                      <span style={{ textAlign: "right" }}>{v.cantidad}× {COP(v.precio_unit)}</span>
                      <span style={{ textAlign: "right", color: B.sand, fontWeight: 700 }}>{COP(v.subtotal)}</span>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: v.cobrado ? "#4ade8022" : B.warning + "22", color: v.cobrado ? "#4ade80" : B.warning, fontWeight: 700 }}>
                        {v.cobrado ? "COBRADO" : "PENDIENTE"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BARCODE SCANNER — fullscreen, detecta y pasa el código, queda abierto
// para escanear más (el modal de cantidad lo cierra temporalmente)
// ═══════════════════════════════════════════════════════════════════════════
function BarcodeScanner({ onClose, onCode }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState("");
  const detectorSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!detectorSupported) {
      setError("Tu navegador no soporta escaneo nativo. Usa entrada manual.");
      return;
    }
    let stream = null, rafId = null, stopped = false, cooldown = false;
    const start = async () => {
      try {
        const detector = new window.BarcodeDetector({
          formats: ["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code","data_matrix","itf"],
        });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const loop = async () => {
          if (stopped || !videoRef.current) return;
          if (!cooldown) {
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes && codes.length > 0) {
                const code = codes[0].rawValue || codes[0].displayValue;
                if (code) {
                  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); osc.frequency.value = 900; osc.connect(ctx.destination); osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, 80); } catch(_) {}
                  if (navigator.vibrate) navigator.vibrate(60);
                  cooldown = true;
                  onCode(code);
                }
              }
            } catch(_) {}
          }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) { setError("No se pudo acceder a la cámara: " + e.message); }
    };
    start();
    return () => { stopped = true; if (rafId) cancelAnimationFrame(rafId); if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []); // eslint-disable-line

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2100, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 18px", background: "rgba(0,0,0,0.85)", color: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>📷 Escanear código EAN</div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✕ Cerrar</button>
      </div>
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
        {error ? (
          <div style={{ color: "#fca5a5", textAlign: "center", padding: 40, fontSize: 14 }}>⚠️ {error}</div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80%", maxWidth: 500, aspectRatio: "2 / 1", border: "3px solid #38bdf8", borderRadius: 16, pointerEvents: "none", boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
            <div style={{ position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
              Apunta al código de barras
            </div>
          </>
        )}
      </div>
      <div style={{ padding: "12px 16px", background: "rgba(0,0,0,0.85)", display: "flex", gap: 8 }}>
        <input value={manual} onChange={e => setManual(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && manual.trim()) { onCode(manual.trim()); setManual(""); } }}
          placeholder="…o escribe el código a mano"
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, outline: "none" }} />
        <button onClick={() => { if (manual.trim()) { onCode(manual.trim()); setManual(""); } }}
          style={{ background: "#38bdf8", color: "#0D1B3E", border: "none", borderRadius: 8, padding: "0 18px", fontWeight: 800, cursor: "pointer" }}>Usar</button>
      </div>
    </div>
  );
}
