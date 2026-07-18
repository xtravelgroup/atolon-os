// Transferencias de inventario entre bodegas (estilo HacerInventario).
// Casos típicos:
//   · Almacén Bar → Bar (reponer barra)
//   · Almacén Bar → Mini Bar (reponer minibares en general)
//   · Mini Bar → Mini Bar 4A/5B/etc (asignar a habitación específica)
//   · Almacén Cocina → otras bodegas
import { useState, useEffect, useMemo, useCallback } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };

// IDs de todos los minibares específicos por habitación
const MINIBARS_HABITACION = [
  "LOC-MINIBAR-1A","LOC-MINIBAR-1B","LOC-MINIBAR-2A","LOC-MINIBAR-2B",
  "LOC-MINIBAR-3A","LOC-MINIBAR-3B","LOC-MINIBAR-4A","LOC-MINIBAR-4B",
  "LOC-MINIBAR-5A","LOC-MINIBAR-5B","LOC-MINIBAR-6A","LOC-MINIBAR-6B",
  "LOC-MINIBAR-401","LOC-MINIBAR-402","LOC-MINIBAR-403","LOC-MINIBAR-404","LOC-MINIBAR-405",
];

// Reglas de destino permitido por origen.
// Si el origen no está en este map, se permite cualquier destino.
const DESTINOS_PERMITIDOS = {
  "LOC-ALMACEN-BAR":  ["LOC-BAR", "LOC-MINIBAR"],
  "LOC-BAR":          ["LOC-ALMACEN-BAR", "LOC-MINIBAR", ...MINIBARS_HABITACION],
  "LOC-MINIBAR":      ["LOC-ALMACEN-BAR", ...MINIBARS_HABITACION],
};

export default function Transferencias() {
  const [step, setStep] = useState(1);  // 1 = elegir bodegas | 2 = seleccionar items | 3 = confirmar
  const [locaciones, setLocaciones] = useState([]);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [items, setItems] = useState([]);
  const [stockPorLoc, setStockPorLoc] = useState({});
  const [cantidades, setCantidades] = useState({});
  const [search, setSearch] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("items_locaciones").select("*").eq("activa", true).order("orden")
      .then(({ data }) => setLocaciones(data || []));
    supabase.auth.getSession().then(({ data }) => setUserEmail(data?.session?.user?.email || ""));
    cargarHistorial();
  }, []);

  const cargarHistorial = async () => {
    const { data } = await supabase.from("items_transferencias")
      .select("id, item_id, from_locacion_id, to_locacion_id, cantidad, motivo, usuario_email, created_at")
      .order("created_at", { ascending: false }).limit(50);
    setHistorial(data || []);
  };

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const traerStock = async () => {
      const rows = []; const PAGE = 1000;
      for (let f = 0; ; f += PAGE) {
        const { data, error } = await supabase.from("items_stock_locacion").select("item_id, locacion_id, cantidad").range(f, f + PAGE - 1);
        if (error || !data || data.length === 0) break;
        rows.push(...data); if (data.length < PAGE) break;
      }
      return rows;
    };
    const [iR, sRows] = await Promise.all([
      supabase.from("items_catalogo").select("id, nombre, codigo, categoria, unidad").eq("activo", true).order("nombre"),
      traerStock(),
    ]);
    setItems(iR.data || []);
    const map = {};
    sRows.forEach(s => { map[`${s.item_id}|${s.locacion_id}`] = Number(s.cantidad) || 0; });
    setStockPorLoc(map);
    setCantidades({});
  }, []);

  const stockEnOrigen  = (item_id) => Number(stockPorLoc[`${item_id}|${origenId}`]) || 0;
  const stockEnDestino = (item_id) => Number(stockPorLoc[`${item_id}|${destinoId}`]) || 0;

  const itemsEnOrigen = useMemo(() => {
    if (!origenId) return [];
    return items.filter(i => stockPorLoc[`${i.id}|${origenId}`] !== undefined);
  }, [items, stockPorLoc, origenId]);

  const filtered = useMemo(() => {
    let list = itemsEnOrigen;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i => i.nombre?.toLowerCase().includes(s) || i.codigo?.toLowerCase().includes(s));
    }
    return list;
  }, [itemsEnOrigen, search]);

  const seleccionados = useMemo(
    () => Object.entries(cantidades).filter(([_, v]) => Number(v) > 0).map(([id, v]) => ({ id, cant: Number(v) })),
    [cantidades]
  );

  const comenzar = async () => {
    if (!origenId || !destinoId) return;
    if (origenId === destinoId) return alert("Origen y destino no pueden ser el mismo");
    await cargar();
    setStep(2);
  };

  const guardar = async () => {
    if (seleccionados.length === 0) return alert("Selecciona al menos un item con cantidad > 0");
    setSaving(true);
    try {
      const rows = seleccionados.map(s => ({
        id: `TR_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${s.id.slice(-4)}`,
        item_id: s.id,
        from_locacion_id: origenId,
        to_locacion_id: destinoId,
        cantidad: s.cant,
        motivo: motivo || null,
        usuario_email: userEmail || null,
      }));

      // 1. Insertar transferencias
      const { error: e1 } = await supabase.from("items_transferencias").insert(rows);
      if (e1) throw e1;

      // 2. Actualizar stock_locacion: restar de origen, sumar a destino
      for (const s of seleccionados) {
        const stockOrig  = Number(stockPorLoc[`${s.id}|${origenId}`]) || 0;
        const stockDest  = Number(stockPorLoc[`${s.id}|${destinoId}`]) || 0;
        const nuevoOrig  = stockOrig - s.cant;
        const nuevoDest  = stockDest + s.cant;
        // Origen
        await supabase.from("items_stock_locacion").upsert({
          item_id: s.id, locacion_id: origenId, cantidad: nuevoOrig,
          updated_at: new Date().toISOString(),
        }, { onConflict: "item_id,locacion_id" });
        // Destino
        await supabase.from("items_stock_locacion").upsert({
          item_id: s.id, locacion_id: destinoId, cantidad: nuevoDest,
          updated_at: new Date().toISOString(),
        }, { onConflict: "item_id,locacion_id" });
      }

      const totalUnidades = seleccionados.reduce((sum, s) => sum + s.cant, 0);
      setSaved({ items: seleccionados.length, total: totalUnidades });
      cargarHistorial();
    } catch (e) {
      alert(`Error: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep(1); setOrigenId(""); setDestinoId(""); setCantidades({});
    setSearch(""); setMotivo(""); setSaved(null);
  };

  const locOrigen  = locaciones.find(l => l.id === origenId);
  const locDestino = locaciones.find(l => l.id === destinoId);

  // ─── DONE / SAVED ─────────────────────────────────────────────
  if (saved) {
    return (
      <div style={{ padding: 40, textAlign: "center", maxWidth: 500, margin: "40px auto", background: B.navyMid, borderRadius: 16, border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h2 style={{ margin: 0, fontSize: 22, color: B.success }}>Transferencia completada</h2>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 10 }}>
          {saved.items} ítem{saved.items !== 1 ? "s" : ""} · {saved.total} unidades transferidas
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
          {locOrigen?.nombre} → {locDestino?.nombre}
        </div>
        <button onClick={reset}
          style={{ marginTop: 20, padding: "12px 24px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          ↻ Nueva transferencia
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 60px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", margin: 0 }}>
          🔁 Transferir Inventario
        </h1>
        {step === 2 && (
          <button onClick={() => setStep(1)} style={{ background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
            ← Cambiar bodegas
          </button>
        )}
      </div>

      {/* ═══ STEP 1 — Elegir bodegas ═══ */}
      {step === 1 && (
        <>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, border: `1px solid ${B.navyLight}`, marginBottom: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "end" }}>
              <div>
                <label style={LS}>📦 Origen (de qué bodega salen)</label>
                <select value={origenId} onChange={e => setOrigenId(e.target.value)} style={IS}>
                  <option value="">— Seleccionar —</option>
                  {locaciones.map(l => <option key={l.id} value={l.id}>{l.icono || ""} {l.nombre}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 28, color: B.sky, alignSelf: "end", paddingBottom: 8 }}>→</div>
              <div>
                <label style={LS}>🎯 Destino (a qué bodega llegan)</label>
                <select value={destinoId} onChange={e => setDestinoId(e.target.value)} style={IS}>
                  <option value="">— Seleccionar —</option>
                  {(() => {
                    const permitidos = DESTINOS_PERMITIDOS[origenId];
                    const opciones = permitidos
                      ? locaciones.filter(l => permitidos.includes(l.id))
                      : locaciones.filter(l => l.id !== origenId);
                    return opciones.map(l => <option key={l.id} value={l.id}>{l.icono || ""} {l.nombre}</option>);
                  })()}
                </select>
                {DESTINOS_PERMITIDOS[origenId] && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                    Solo se permite transferir a: {DESTINOS_PERMITIDOS[origenId].map(id => locaciones.find(l => l.id === id)?.nombre).filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            </div>

            {/* Atajos comunes */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${B.navyLight}` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Atajos comunes</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { from: "LOC-ALMACEN-BAR", to: "LOC-BAR", label: "🍷 Almacén Bar → Bar" },
                  { from: "LOC-ALMACEN-BAR", to: "LOC-MINIBAR", label: "🍷 Almacén Bar → Mini Bar" },
                  { from: "LOC-MINIBAR",     to: "LOC-MINIBAR-4A", label: "Mini Bar → 4A" },
                  { from: "LOC-MINIBAR",     to: "LOC-MINIBAR-4B", label: "Mini Bar → 4B" },
                  { from: "LOC-MINIBAR",     to: "LOC-MINIBAR-5A", label: "Mini Bar → 5A" },
                  { from: "LOC-MINIBAR",     to: "LOC-MINIBAR-5B", label: "Mini Bar → 5B" },
                  { from: "LOC-MINIBAR",     to: "LOC-MINIBAR-6A", label: "Mini Bar → 6A" },
                  { from: "LOC-MINIBAR",     to: "LOC-MINIBAR-6B", label: "Mini Bar → 6B" },
                  { from: "LOC-ALMACEN-COCINA", to: "LOC-EVENTOS", label: "Cocina → Eventos" },
                ].map(a => (
                  <button key={a.label} onClick={() => { setOrigenId(a.from); setDestinoId(a.to); }}
                    style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${B.navyLight}`, borderRadius: 6, background: B.navy, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={comenzar} disabled={!origenId || !destinoId}
              style={{ marginTop: 18, width: "100%", padding: "14px", borderRadius: 10, border: "none",
                background: (!origenId || !destinoId) ? B.navyLight : B.success,
                color: B.navy, fontSize: 14, fontWeight: 800, cursor: (!origenId || !destinoId) ? "not-allowed" : "pointer" }}>
              {(!origenId || !destinoId) ? "Selecciona origen y destino" : "Continuar →"}
            </button>
          </div>

          {/* Historial */}
          {historial.length > 0 && (
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 18, border: `1px solid ${B.navyLight}` }}>
              <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Últimas transferencias</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {historial.slice(0, 12).map(h => {
                  const it = items.find(i => i.id === h.item_id);
                  const fromLoc = locaciones.find(l => l.id === h.from_locacion_id);
                  const toLoc   = locaciones.find(l => l.id === h.to_locacion_id);
                  return (
                    <div key={h.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 80px", gap: 10, padding: "8px 12px", background: B.navy, borderRadius: 8, fontSize: 12, border: `1px solid ${B.navyLight}` }}>
                      <span style={{ color: "rgba(255,255,255,0.55)" }}>{new Date(h.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })} {new Date(h.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span style={{ color: B.white }}>{it?.nombre || h.item_id}</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{fromLoc?.nombre} → {toLoc?.nombre}</span>
                      <span style={{ color: B.sand, fontWeight: 700, textAlign: "right" }}>{h.cantidad}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ STEP 2 — Seleccionar items y cantidades ═══ */}
      {step === 2 && (
        <>
          <div style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Origen</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{locOrigen?.icono} {locOrigen?.nombre}</div>
              </div>
              <div style={{ fontSize: 24, color: B.sky }}>→</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Destino</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{locDestino?.icono} {locDestino?.nombre}</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            <KPI label="Items en origen" value={itemsEnOrigen.length} color={B.sky} />
            <KPI label="Items seleccionados" value={seleccionados.length} color={B.success} />
            <KPI label="Total a transferir" value={seleccionados.reduce((s, x) => s + x.cant, 0)} color={B.sand} />
          </div>

          <input placeholder="🔍 Buscar item o código…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...IS, marginBottom: 14 }} />

          {/* Tabla */}
          <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}`, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 100px 100px 130px", padding: "10px 16px", borderBottom: `2px solid ${B.navyLight}`, gap: 8 }}>
              {["Ítem", "En origen", "En destino", "Transferir"].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: h === "Ítem" ? "left" : "center" }}>{h}</div>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                {itemsEnOrigen.length === 0
                  ? "No hay items asignados a esta bodega."
                  : "No hay coincidencias con la búsqueda."}
              </div>
            ) : filtered.map((i, idx) => {
              const stockO = stockEnOrigen(i.id);
              const stockD = stockEnDestino(i.id);
              const cant = cantidades[i.id] ?? "";
              const setMax = () => setCantidades(c => ({ ...c, [i.id]: String(stockO) }));
              return (
                <div key={i.id} style={{
                  display: "grid", gridTemplateColumns: "3fr 100px 100px 130px", padding: "10px 16px", gap: 8, alignItems: "center",
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${B.navyLight}` : "none",
                  background: cant !== "" && Number(cant) > 0 ? "rgba(74,222,128,0.04)" : "transparent",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{i.nombre}</div>
                    {i.codigo && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{i.codigo}</div>}
                  </div>
                  <div style={{ fontSize: 13, color: stockO > 0 ? B.success : "rgba(255,255,255,0.4)", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>{stockO}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif" }}>{stockD}</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input type="number" min={0} max={stockO} value={cant}
                      onChange={e => setCantidades(c => ({ ...c, [i.id]: e.target.value }))}
                      placeholder="0"
                      style={{ ...IS, padding: "6px 8px", fontSize: 13, fontWeight: 700, textAlign: "center" }} />
                    <button onClick={setMax} disabled={stockO === 0}
                      style={{ padding: "0 8px", fontSize: 10, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, borderRadius: 6, cursor: stockO === 0 ? "not-allowed" : "pointer" }}>
                      MAX
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Motivo + Confirmar */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", border: `1px solid ${B.navyLight}` }}>
            <label style={LS}>Motivo (opcional)</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: Reposición barra, Asignación habitación 4A, Evento privado..."
              style={{ ...IS, marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)}
                style={{ flex: 1, padding: "12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
                ← Cancelar
              </button>
              <button onClick={guardar} disabled={saving || seleccionados.length === 0}
                style={{ flex: 2, padding: "12px", borderRadius: 8, border: "none",
                  background: saving || seleccionados.length === 0 ? B.navyLight : B.success,
                  color: B.navy, fontSize: 14, fontWeight: 800, cursor: saving || seleccionados.length === 0 ? "not-allowed" : "pointer" }}>
                {saving ? "Transfiriendo…" : `🔁 Transferir ${seleccionados.length} ítem${seleccionados.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
    </div>
  );
}
