import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
  hotel: "#a78bfa",
};
const COP = (n) => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const ESTADOS = [
  { key: "pendiente",      label: "Recibido",       color: "rgba(255,255,255,0.6)" },
  { key: "preparando",     label: "Preparando",     color: B.warning },
  { key: "en_camino",      label: "En camino",      color: B.sky },
  { key: "entregado",      label: "Entregado",      color: B.success },
  { key: "cancelado",      label: "Cancelado",      color: B.danger },
];
const KANBAN_COLS = ["pendiente", "preparando", "en_camino", "entregado"];
const NEXT_EST = { pendiente: "preparando", preparando: "en_camino", en_camino: "entregado" };
const estColor = (e) => ESTADOS.find(x => x.key === e)?.color || "rgba(255,255,255,0.4)";
const estLabel = (e) => ESTADOS.find(x => x.key === e)?.label || e;

// Orden fijo de categorías del menú restaurante
const CAT_ORDER = ["Entradas", "Marinas", "Ensalada", "Ensaladas", "Tacos", "Pizza", "Pizzas", "Especialidades", "Especialidades de la Isla", "Parrilla", "De la Parrilla", "Complementos", "Postres"];
const catRank = (cat) => {
  const idx = CAT_ORDER.findIndex(c => c.toLowerCase() === (cat || "").toLowerCase());
  return idx === -1 ? 999 : idx;
};
const sortCats = (cats) => [...cats].sort((a, b) => {
  const ra = catRank(a), rb = catRank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
});

export default function HotelRoomService() {
  const [habs, setHabs] = useState([]);
  const [items, setItems] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selHab, setSelHab] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [huesped, setHuesped] = useState("");
  const [notas, setNotas] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [tab, setTab] = useState("nuevo"); // nuevo | pedidos | menu

  const load = async () => {
    setLoading(true);
    const [{ data: hData }, { data: iData }, { data: pData }] = await Promise.all([
      supabase.from("hotel_habitaciones").select("*").eq("estado", "activa").order("numero"),
      supabase.from("menu_items").select("id, nombre, descripcion, precio, categoria, menu_tipo").eq("menu_tipo", "restaurant").eq("activo", true).order("categoria").order("orden"),
      supabase.from("hotel_room_service_pedidos").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setHabs(hData || []);
    setItems(iData || []);
    setPedidos(pData || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime subscription — nuevo pedido → recarga + sonido
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("rs-pedidos-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "hotel_room_service_pedidos" }, (payload) => {
        load();
        // Sonido de notificación (web audio beep)
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 880; o.type = "sine";
          g.gain.setValueAtTime(0.3, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
          o.start(); o.stop(ctx.currentTime + 0.6);
          // segundo beep
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.frequency.value = 1320; o2.type = "sine";
          g2.gain.setValueAtTime(0.3, ctx.currentTime + 0.3);
          g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
          o2.start(ctx.currentTime + 0.3); o2.stop(ctx.currentTime + 0.9);
        } catch {}
        // Notificación del navegador
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("🛎️ Nuevo pedido Room Service", { body: `Hab. ${payload.new?.habitacion_num || "—"} · ${(payload.new?.items || []).length} items` });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "hotel_room_service_pedidos" }, () => load())
      .subscribe();
    // Pedir permiso de notificaciones
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    return () => { supabase.removeChannel(channel); };
  }, []);

  const itemsFiltrados = useMemo(() => {
    const base = filtroCat ? items.filter(i => i.categoria === filtroCat) : items;
    return [...base].sort((a, b) => {
      const ra = catRank(a.categoria), rb = catRank(b.categoria);
      if (ra !== rb) return ra - rb;
      if ((a.categoria || "") !== (b.categoria || "")) return (a.categoria || "").localeCompare(b.categoria || "");
      return (a.orden || 0) - (b.orden || 0) || (a.nombre || "").localeCompare(b.nombre || "");
    });
  }, [items, filtroCat]);

  const cats = useMemo(() => sortCats(Array.from(new Set(items.map(i => i.categoria).filter(Boolean)))), [items]);

  const addAlCarrito = (it) => {
    setCarrito(prev => {
      const existing = prev.find(x => x.id === it.id);
      if (existing) return prev.map(x => x.id === it.id ? { ...x, cantidad: x.cantidad + 1 } : x);
      return [...prev, { id: it.id, nombre: it.nombre, precio: it.precio || 0, cantidad: 1, notas: "" }];
    });
  };
  const setCantidad = (id, cant) => {
    const n = Number(cant);
    if (n <= 0) return setCarrito(prev => prev.filter(x => x.id !== id));
    setCarrito(prev => prev.map(x => x.id === id ? { ...x, cantidad: n } : x));
  };
  const setNotaItem = (id, notas) => setCarrito(prev => prev.map(x => x.id === id ? { ...x, notas } : x));
  const quitar = (id) => setCarrito(prev => prev.filter(x => x.id !== id));

  const subtotal = carrito.reduce((s, x) => s + x.precio * x.cantidad, 0);
  const total = subtotal;

  const habSel = habs.find(h => h.id === selHab);

  const crearPedido = async (enviarLoggro = false) => {
    if (!selHab) return alert("Selecciona una habitación");
    if (carrito.length === 0) return alert("Agrega al menos un ítem al carrito");
    const codigo = `RS-${Date.now()}`;
    const payload = {
      codigo,
      habitacion_id: selHab,
      habitacion_num: habSel?.numero || "",
      huesped,
      items: carrito,
      subtotal,
      total,
      notas,
      estado: "pendiente",
      creado_por: "",
    };
    const { data: inserted, error } = await supabase
      .from("hotel_room_service_pedidos").insert(payload).select().single();
    if (error) return alert("Error: " + error.message);

    // Si el usuario pulsó "Crear y enviar a Loggro", dispara el envío real ahora
    if (enviarLoggro && inserted) {
      await enviarALoggro(inserted);
    }

    setCarrito([]);
    setHuesped("");
    setNotas("");
    setSelHab("");
    setTab("pedidos");
    load();
  };

  const cambiarEstado = async (id, estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    await supabase.from("hotel_room_service_pedidos").update(patch).eq("id", id);
    load();
  };

  const enviarALoggro = async (pedido) => {
    // Busca loggro_mesa_id de la habitación
    const hab = habs.find(h => h.id === pedido.habitacion_id || h.numero === pedido.habitacion_num);
    if (!hab?.loggro_mesa_id) {
      alert(`⚠️ Habitación ${pedido.habitacion_num || "?"} no está mapeada a una mesa de Loggro.\n\nVe a Hotel → Habitaciones → Editar → Mesa Loggro.`);
      return;
    }
    // Construir items con loggro_id + unit_price (Loggro lo exige)
    const { data: menuItems } = await supabase
      .from("menu_items").select("id, loggro_id, precio")
      .in("id", (pedido.items || []).map(i => i.id));
    const mapLoggro = Object.fromEntries((menuItems || []).map(m => [m.id, m]));
    const items = (pedido.items || []).map(it => {
      const m = mapLoggro[it.id] || {};
      return {
        productId: m.loggro_id,
        qty: it.cantidad,
        unit_price: Number(it.precio) || Number(m.precio) || 0,
        notes: it.notas ? [String(it.notas)] : (pedido.notas ? [String(pedido.notas)] : []),
      };
    }).filter(i => i.productId);

    if (items.length === 0) {
      alert("Ningún item del pedido tiene loggro_id. Sincroniza productos primero (Loggro → Sincronizar).");
      return;
    }

    try {
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anon,
          "Authorization": `Bearer ${anon}`,
        },
        body: JSON.stringify({
          mesaId: hab.loggro_mesa_id,
          groupName: `Room Service · Hab ${pedido.habitacion_num || ""}${pedido.huesped ? " · " + pedido.huesped : ""}`,
          items,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const orderArr = Array.isArray(data.order) ? data.order : [data.order];
        const firstId = orderArr[0]?._id || orderArr[0]?.id || null;
        const groupId = orderArr[0]?.group || null;
        await supabase.from("hotel_room_service_pedidos").update({
          estado: "enviado_loggro",
          enviado_loggro_at: new Date().toISOString(),
          loggro_response: data.order,
          loggro_order_id: firstId,
          loggro_group_id: groupId,
        }).eq("id", pedido.id);
        alert("✓ Enviado a cocina de Loggro");
      } else {
        await supabase.from("hotel_room_service_pedidos").update({
          loggro_response: { error: data.error, at: new Date().toISOString() },
        }).eq("id", pedido.id);
        alert("⚠️ Error enviando a Loggro:\n" + (data.error || "Desconocido"));
      }
      load();
    } catch (err) {
      alert("Error de red: " + err.message);
    }
  };

  const pedidosHoy = pedidos.filter(p => (p.created_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10));
  const ventasHoy = pedidosHoy.filter(p => p.estado !== "cancelado").reduce((s, p) => s + (Number(p.total) || 0), 0);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1300, margin: "0 auto", color: "#fff" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800 }}>🛎️ Room Service</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Pedidos a habitación · Integración Loggro Restobar</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Pedidos hoy", valor: pedidosHoy.length, color: B.hotel },
          { label: "Ventas hoy", valor: COP(ventasHoy), color: B.success, isMoney: true },
          { label: "En proceso", valor: pedidos.filter(p => ["pendiente", "enviado_loggro", "preparando"].includes(p.estado)).length, color: B.warning },
          { label: "Ítems disponibles", valor: items.length, color: B.sky },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: k.isMoney ? 20 : 28, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${B.navyLight}` }}>
        {[["nuevo", "🆕 Nuevo pedido"], ["pedidos", `📋 Pedidos (${pedidos.length})`], ["menu", "📖 Vista Menú"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 400,
              background: "none", color: tab === k ? B.white : "rgba(255,255,255,0.4)",
              borderBottom: tab === k ? `2px solid ${B.hotel}` : "2px solid transparent" }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : tab === "nuevo" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
          {/* ── Menú ── */}
          <div>
            {/* Selector habitación */}
            <div style={{ background: B.navy, borderRadius: 12, padding: "14px 18px", border: `1px solid ${B.navyLight}`, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LS}>Habitación *</label>
                  <select value={selHab} onChange={e => setSelHab(e.target.value)} style={{ ...IS, cursor: "pointer" }}>
                    <option value="">— Seleccionar habitación ocupada —</option>
                    {habs.map(h => (
                      <option key={h.id} value={h.id}>#{h.numero} — {h.categoria || ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={LS}>Huésped (opcional)</label>
                  <input value={huesped} onChange={e => setHuesped(e.target.value)} style={IS} placeholder="Nombre del huésped" />
                </div>
              </div>
              {habs.length === 0 && (
                <div style={{ fontSize: 11, color: B.warning, marginTop: 8 }}>⚠ No hay habitaciones activas. Crea habitaciones en el módulo Habitaciones primero.</div>
              )}
            </div>

            {/* Filtro categorías */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <button onClick={() => setFiltroCat("")}
                style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${filtroCat === "" ? B.hotel : B.navyLight}`,
                  background: filtroCat === "" ? `${B.hotel}22` : "transparent", color: filtroCat === "" ? B.hotel : "rgba(255,255,255,0.5)",
                  cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                Todos ({items.length})
              </button>
              {cats.map(c => (
                <button key={c} onClick={() => setFiltroCat(c)}
                  style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${filtroCat === c ? B.hotel : B.navyLight}`,
                    background: filtroCat === c ? `${B.hotel}22` : "transparent", color: filtroCat === c ? B.hotel : "rgba(255,255,255,0.5)",
                    cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                  {c}
                </button>
              ))}
            </div>

            {items.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12, border: `1px dashed ${B.navyLight}` }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
                <div style={{ fontSize: 14 }}>No hay productos en el Menú Restaurante.</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>
                  Ve a <strong>Productos → Menú Restaurante</strong> para crear los items disponibles.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {itemsFiltrados.map(it => (
                  <div key={it.id} onClick={() => addAlCarrito(it)}
                    style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", border: `1px solid ${B.navyLight}`, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = B.hotel}
                    onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                    <div style={{ fontSize: 10, color: B.hotel, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{it.categoria}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{it.nombre}</div>
                    {it.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 6, lineHeight: 1.4 }}>{it.descripcion}</div>}
                    <div style={{ fontSize: 15, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(it.precio || 0)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Carrito ── */}
          <div style={{ background: B.navy, borderRadius: 12, padding: 16, border: `1px solid ${B.navyLight}`, alignSelf: "flex-start", position: "sticky", top: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🛒 Carrito</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{carrito.length} ítems</span>
            </div>
            {carrito.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
                Carrito vacío<br />
                <span style={{ fontSize: 10 }}>Haz clic en los productos para agregarlos</span>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto", marginBottom: 14 }}>
                  {carrito.map(x => (
                    <div key={x.id} style={{ background: B.navyLight, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{x.nombre}</div>
                        <button onClick={() => quitar(x.id)} style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 12 }}>✕</button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                        <input type="number" min="1" value={x.cantidad} onChange={e => setCantidad(x.id, e.target.value)}
                          style={{ width: 50, padding: "4px 8px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navy}`, color: "#fff", fontSize: 12, outline: "none" }} />
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>× {COP(x.precio)}</span>
                        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: B.sand }}>{COP(x.precio * x.cantidad)}</span>
                      </div>
                      <input value={x.notas} onChange={e => setNotaItem(x.id, e.target.value)}
                        placeholder="Nota para cocina…"
                        style={{ ...IS, marginTop: 6, fontSize: 11, padding: "5px 8px" }} />
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 10, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    <span>Subtotal</span><span>{COP(subtotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800 }}>
                    <span>Total</span><span style={{ color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22 }}>{COP(total)}</span>
                  </div>
                </div>
                <div>
                  <label style={LS}>Notas generales</label>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                    style={{ ...IS, resize: "vertical", fontFamily: "inherit", fontSize: 12 }} placeholder="Alergias, instrucciones, etc." />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                  <button onClick={() => crearPedido(true)} style={{ ...BTN(B.hotel), padding: "12px 16px", fontSize: 13 }}>
                    🛎️ Enviar a cocina (Loggro)
                  </button>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8, textAlign: "center", fontStyle: "italic" }}>
                  El pedido llega a cocina inmediatamente vía Loggro Restobar.
                </div>
              </>
            )}
          </div>
        </div>
      ) : tab === "pedidos" ? (
        /* ── Tab: Kanban de pedidos ── */
        <Kanban pedidos={pedidos} cambiarEstado={cambiarEstado} enviarALoggro={enviarALoggro} />
      ) : (
        /* ── Tab: Vista Menú ── */
        <VistaMenu items={items} />
      )}
    </div>
  );
}

// ─── KANBAN de pedidos (staff) ─────────────────────────────────────────────
function Kanban({ pedidos, cambiarEstado, enviarALoggro }) {
  const porCol = KANBAN_COLS.reduce((acc, k) => { acc[k] = []; return acc; }, {});
  pedidos.forEach(p => {
    if (KANBAN_COLS.includes(p.estado)) porCol[p.estado].push(p);
  });
  const minutosDesde = (ts) => ts ? Math.round((Date.now() - new Date(ts).getTime()) / 60000) : 0;
  const bgCol = {
    pendiente: "rgba(255,255,255,0.04)",
    preparando: `${B.warning}11`,
    en_camino: `${B.sky}11`,
    entregado: `${B.success}11`,
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {KANBAN_COLS.map(col => {
          const items = porCol[col] || [];
          return (
            <div key={col} style={{ background: bgCol[col], borderRadius: 12, padding: 10, minHeight: 400, border: `1px solid ${B.navyLight}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: "4px 6px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: estColor(col), textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {estLabel(col)}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: B.navy, padding: "1px 8px", borderRadius: 10 }}>{items.length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.length === 0 && (
                  <div style={{ textAlign: "center", padding: 16, fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>—</div>
                )}
                {items.map(p => {
                  const mins = minutosDesde(p.created_at);
                  const demorado = (col === "pendiente" && mins > 3) || (col === "preparando" && mins > 25);
                  return (
                    <div key={p.id} style={{ background: B.navy, borderRadius: 10, padding: "10px 12px", border: `1px solid ${demorado ? B.danger : B.navyLight}`, borderLeft: `4px solid ${estColor(col)}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
                          🚪 Hab. {p.habitacion_num || "—"}
                        </div>
                        <div style={{ fontSize: 9, color: demorado ? B.danger : "rgba(255,255,255,0.35)", fontWeight: demorado ? 700 : 400 }}>
                          {demorado ? "⚠ " : ""}{mins}m
                        </div>
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                        {p.codigo}{p.huesped ? ` · ${p.huesped}` : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 6, lineHeight: 1.35 }}>
                        {(p.items || []).slice(0, 4).map((it, i) => (
                          <div key={i} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.cantidad}× {it.nombre}
                          </div>
                        ))}
                        {(p.items || []).length > 4 && <div style={{ color: "rgba(255,255,255,0.3)" }}>+{p.items.length - 4} más</div>}
                      </div>
                      {p.notas && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontStyle: "italic", marginBottom: 6 }}>"{p.notas}"</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 6, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(p.total)}</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {col === "pendiente" && !p.enviado_loggro_at && enviarALoggro && (
                            <button onClick={() => enviarALoggro(p)} title="Enviar a Loggro"
                              style={{ padding: "4px 8px", fontSize: 10, borderRadius: 6, border: `1px solid ${B.sky}55`, background: `${B.sky}22`, color: B.sky, cursor: "pointer", fontWeight: 700 }}>
                              📤 Loggro
                            </button>
                          )}
                          {p.enviado_loggro_at && (
                            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: `${B.success}22`, color: B.success, fontWeight: 600 }} title={`Enviado: ${new Date(p.enviado_loggro_at).toLocaleString("es-CO")}`}>
                              ✓ Loggro
                            </span>
                          )}
                          {col !== "entregado" && NEXT_EST[col] && (
                            <button onClick={() => cambiarEstado(p.id, NEXT_EST[col])}
                              style={{ ...BTN(estColor(NEXT_EST[col]) + "22"), color: estColor(NEXT_EST[col]), padding: "4px 10px", fontSize: 10, border: `1px solid ${estColor(NEXT_EST[col])}55` }}>
                              {estLabel(NEXT_EST[col])} →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {pedidos.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", marginTop: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛎️</div>
          <div style={{ fontSize: 13 }}>Sin pedidos todavía. Los nuevos aparecerán aquí con sonido.</div>
        </div>
      )}
    </div>
  );
}

function VistaMenu({ items }) {
  const porCategoria = items.reduce((acc, it) => {
    const g = it.categoria || "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(it);
    return acc;
  }, {});
  const cats = sortCats(Object.keys(porCategoria));

  const descargar = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Menú Room Service — Atolon Beach Club</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; color: #0D1B3E; max-width: 800px; margin: 0 auto; padding: 40px 32px; background: #fff; }
    .hero { text-align: center; padding-bottom: 24px; border-bottom: 2px solid #C8B99A; margin-bottom: 32px; }
    .hero h1 { font-family: 'Barlow Condensed', sans-serif; font-size: 42px; margin: 0 0 6px; letter-spacing: 0.04em; font-weight: 800; }
    .hero .sub { font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.15em; }
    h2 { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; color: #0D1B3E; letter-spacing: 0.03em; text-transform: uppercase; }
    .item { padding: 12px 0; border-bottom: 1px dotted #d4d4d8; page-break-inside: avoid; }
    .item-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 4px; }
    .item-name { font-size: 15px; font-weight: 700; color: #0D1B3E; flex: 1; }
    .dots { flex: 1; border-bottom: 1px dotted #d4d4d8; margin: 0 6px 4px; min-width: 20px; }
    .item-price { font-family: 'Barlow Condensed', sans-serif; font-size: 17px; font-weight: 700; color: #C8B99A; white-space: nowrap; }
    .item-desc { font-size: 12px; color: #666; font-style: italic; line-height: 1.45; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 14px; }
    .actions { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; }
    .actions button { padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-weight: 700; font-size: 13px; }
    .btn-print { background: #0D1B3E; color: #fff; }
    .btn-close { background: #e5e7eb; color: #0D1B3E; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="actions no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>
  <div class="hero">
    <h1>🛎️ Room Service</h1>
    <div class="sub">Atolon Beach Club · Cartagena de Indias</div>
  </div>
  ${cats.map(cat => `
    <h2>${cat}</h2>
    ${porCategoria[cat].map(it => `
      <div class="item">
        <div class="item-head">
          <div class="item-name">${it.nombre}</div>
          <div class="dots"></div>
          <div class="item-price">${COP(it.precio || 0)}</div>
        </div>
        ${it.descripcion ? `<div class="item-desc">${it.descripcion}</div>` : ""}
      </div>
    `).join("")}
  `).join("")}
  <div class="footer">
    Atolon Beach Club · Cartagena de Indias · Impreso el ${new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
  </div>
</body>
</html>
    `;
    w.document.write(html);
    w.document.close();
  };

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12, border: `1px dashed ${B.navyLight}` }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
        <div style={{ fontSize: 14 }}>Todavía no hay productos en el Menú Restaurante.</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>
          Ve a <strong>Productos → Menú Restaurante</strong> para crear los items disponibles.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button onClick={descargar} style={{ ...BTN(B.hotel), padding: "10px 16px" }}>📄 Descargar PDF</button>
      </div>
      <div style={{ background: B.navy, borderRadius: 14, padding: "32px 36px", border: `1px solid ${B.navyLight}` }}>
        <div style={{ textAlign: "center", paddingBottom: 20, borderBottom: `2px solid ${B.sand}`, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 36, fontWeight: 800, letterSpacing: "0.04em" }}>🛎️ Room Service</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 4 }}>Atolon Beach Club · Cartagena</div>
        </div>

        {cats.map(cat => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", color: B.sand, borderBottom: `1px solid ${B.navyLight}`, paddingBottom: 6, marginBottom: 12 }}>
              {cat}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {porCategoria[cat].map(it => (
                <div key={it.id} style={{ padding: "10px 0", borderBottom: `1px dotted ${B.navyLight}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 3 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: B.white }}>{it.nombre}</div>
                    <div style={{ flex: 1, borderBottom: `1px dotted ${B.navyLight}`, margin: "0 6px 4px", minWidth: 20 }}></div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, color: B.sand, whiteSpace: "nowrap" }}>{COP(it.precio || 0)}</div>
                  </div>
                  {it.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontStyle: "italic", lineHeight: 1.5 }}>{it.descripcion}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
