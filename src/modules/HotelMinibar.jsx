// HotelMinibar.jsx — Gestión de mini bar por habitación del hotel.
//   Tab 1: Configurar stock estándar por habitación
//   Tab 2: Registrar consumo (check al hacer housekeeping)
//   Tab 3: Historial de ventas

import { useState, useEffect, useMemo, useCallback } from "react";
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
      supabase.from("hotel_habitaciones").select("id, numero, tipo, piso").order("numero"),
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

    // Traer info de la reserva activa (si hay) para asociar al folio
    const { data: reservaActiva } = await supabase.from("hotel_reservas")
      .select("id, huesped_nombre, folio_id")
      .eq("habitacion_id", habId)
      .eq("estado", "check_in")
      .limit(1);
    const reserva = reservaActiva?.[0];

    const rows = consumos.map(c => ({
      id: `MB-${Date.now()}-${c.item_id.slice(-4)}`,
      habitacion_id: habId,
      item_id: c.item_id,
      item_nombre: c.nombre,
      cantidad: c.consumido,
      precio_unit: Number(c.precio_venta) || 0,
      subtotal: c.subtotal,
      fecha: todayStr(),
      huesped_nombre: reserva?.huesped_nombre || null,
      reservation_id: reserva?.id || null,
      folio_id: reserva?.folio_id || null,
      cobrado: false,
      registrado_por: userEmail || "sistema",
      notas: notas.trim() || null,
    }));

    const { error } = await supabase.from("minibar_ventas").insert(rows);
    if (error) { setSaving(false); return alert("Error: " + error.message); }

    setSaved({ total: totalVenta, count: consumos.length, reserva: reserva?.huesped_nombre || null });
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
            Cargado al folio de <strong style={{ color: B.white }}>{saved.reserva}</strong>
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
      {/* Selector de habitación */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 16, border: `1px solid ${B.navyLight}` }}>
        <label style={LS}>Habitación</label>
        <select value={habId} onChange={e => { setHabId(e.target.value); setConteo({}); }} style={IS}>
          <option value="">— Seleccionar habitación —</option>
          {habitaciones.map(h => (
            <option key={h.id} value={h.id}>
              {h.numero} {h.tipo ? `· ${h.tipo}` : ""} {h.piso ? `· Piso ${h.piso}` : ""}
              {(stockByHab[h.id] || []).length === 0 ? "  (sin config)" : ""}
            </option>
          ))}
        </select>
      </div>

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

  useEffect(() => {
    if (!habId) { setRows([]); return; }
    const s = stockByHab[habId] || [];
    setRows(s.map(x => ({ item_id: x.item_id, cantidad_esperada: x.cantidad_esperada, precio_venta: x.precio_venta })));
  }, [habId, stockByHab]);

  const itemsFiltrados = useMemo(() => {
    if (!search) return items.slice(0, 30);
    const s = search.toLowerCase();
    return items.filter(i => i.nombre?.toLowerCase().includes(s)).slice(0, 30);
  }, [items, search]);

  const addItem = (itemId) => {
    if (rows.find(r => r.item_id === itemId)) return;
    setRows(r => [...r, { item_id: itemId, cantidad_esperada: 1, precio_venta: 0 }]);
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
      <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 16, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <label style={LS}>Habitación</label>
            <select value={habId} onChange={e => setHabId(e.target.value)} style={IS}>
              <option value="">— Seleccionar —</option>
              {habitaciones.map(h => (
                <option key={h.id} value={h.id}>
                  {h.numero} {h.tipo ? `· ${h.tipo}` : ""} {(stockByHab[h.id] || []).length > 0 ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
          {habId && habsConConfig.length > 0 && (
            <button onClick={() => setShowCopiar(true)}
              style={{ background: B.navyLight, color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              📋 Copiar de otra
            </button>
          )}
        </div>
      </div>

      {habId && (
        <>
          {/* Buscador de items para agregar */}
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "14px 18px", marginBottom: 12, border: `1px solid ${B.navyLight}` }}>
            <label style={LS}>Agregar producto al mini bar</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." style={IS} />
            {search && itemsFiltrados.length > 0 && (
              <div style={{ marginTop: 8, maxHeight: 250, overflowY: "auto", background: B.navy, borderRadius: 8 }}>
                {itemsFiltrados.map(i => {
                  const ya = rows.find(r => r.item_id === i.id);
                  return (
                    <div key={i.id}
                      onClick={() => !ya && addItem(i.id)}
                      style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: ya ? "default" : "pointer", borderBottom: `1px solid ${B.navyLight}33`, opacity: ya ? 0.4 : 1 }}
                      onMouseEnter={e => { if (!ya) e.currentTarget.style.background = B.navyLight + "33"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ fontSize: 13, color: B.white }}>{i.nombre}</div>
                      <div style={{ fontSize: 10, color: ya ? B.success : B.sky }}>{ya ? "✓ Agregado" : "+ Agregar"}</div>
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
