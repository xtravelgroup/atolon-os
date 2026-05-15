// PoolService — Pedidos desde áreas exteriores (piscina, beach, cabañas, bar)
// Similar a HotelRoomService pero para zonas del beach club.
// Cada área tiene un QR que el huésped escanea → portal público → pedido aquí.
//
// Tablas:
//   - pool_service_areas    (zonas con QR)
//   - pool_service_pedidos  (pedidos con kanban)

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";
import PoolFloorPlanPicker from "../components/PoolFloorPlanPicker.jsx";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
  pool: "#06b6d4",
};
const COP = (n) => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const BTN = (bg, color = "#fff") => ({ padding: "9px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12, minHeight: 40 });
const IS = { width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const ESTADOS = [
  { key: "recibido",       label: "Recibido",     color: "rgba(255,255,255,0.6)" },
  { key: "enviado_loggro", label: "En cocina",    color: B.pool },
  { key: "preparando",     label: "Preparando",   color: B.warning },
  { key: "listo",          label: "Listo",        color: B.sky },
  { key: "entregado",      label: "Entregado",    color: B.success },
  { key: "cancelado",      label: "Cancelado",    color: B.danger },
];
// Kanban columns — enviado_loggro se muestra como "recibido" en la grid
const KANBAN_COLS = ["recibido", "preparando", "listo", "entregado"];
const NEXT_EST    = { recibido: "preparando", enviado_loggro: "preparando", preparando: "listo", listo: "entregado" };
const estColor = (e) => ESTADOS.find(x => x.key === e)?.color || "rgba(255,255,255,0.4)";
const estLabel = (e) => ESTADOS.find(x => x.key === e)?.label || e;

const TIPO_ICON = {
  piscina:       "🏊",
  piscina_chica: "🛟",
  beach:         "🏖️",
  cabana:        "🏝️",
  bar:           "🍹",
  vip:           "⭐",
  otra:          "📍",
};

const CAT_ORDER = ["Bebidas", "Cervezas", "Cocteles", "Snacks", "Entradas", "Marinas", "Ensalada", "Ensaladas", "Tacos", "Pizza", "Pizzas", "Especialidades", "Especialidades de la Isla", "Parrilla", "De la Parrilla", "Complementos", "Postres"];
const catRank = (cat) => {
  const idx = CAT_ORDER.findIndex(c => c.toLowerCase() === (cat || "").toLowerCase());
  return idx === -1 ? 999 : idx;
};
const sortCats = (cats) => [...cats].sort((a, b) => {
  const ra = catRank(a), rb = catRank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
});

export default function PoolService() {
  const { isMobile } = useBreakpoint();
  const [areas, setAreas]     = useState([]);
  const [items, setItems]     = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tab por defecto = "nuevo" → muestra el plano de la piscina como landing.
  // Los meseros entran y lo primero que ven es el floor plan para tocar la mesa.
  const [tab, setTab] = useState("nuevo"); // nuevo (plano) | pedidos | areas

  const load = async () => {
    setLoading(true);
    const [a, i, p] = await Promise.all([
      supabase.from("pool_service_areas").select("*").eq("activo", true).order("orden").order("nombre"),
      // Pool Service usa los menús "restaurant" y "bebidas" del módulo de Productos
      // — fuente única de verdad, ya sincronizado con Loggro. Aquí NO se gestiona
      // catálogo, sólo se consume. Para crear/editar items: Productos → Menú.
      supabase.from("menu_items")
        .select("id, nombre, descripcion, precio, categoria, menu_tipo, orden, loggro_id, foto_url")
        .in("menu_tipo", ["restaurant", "bebidas"])
        .eq("activo", true)
        .order("categoria").order("orden"),
      supabase.from("pool_service_pedidos").select("*").order("created_at", { ascending: false }).limit(120),
    ]);
    setAreas(a.data || []);
    setItems(i.data || []);
    setPedidos(p.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime: nuevo pedido → recarga + sonido + notificación
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("pool-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pool_service_pedidos" }, (payload) => {
        load();
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 660; o.type = "sine";
          g.gain.setValueAtTime(0.3, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
          o.start(); o.stop(ctx.currentTime + 0.7);
        } catch {}
        if ("Notification" in window && Notification.permission === "granted") {
          const ped = payload.new;
          new Notification("🏊 Nuevo pedido Pool Service", {
            body: `${ped?.area_nombre || "?"} · ${(ped?.items || []).length} ítems · ${COP(ped?.total)}`,
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pool_service_pedidos" }, () => load())
      .subscribe();
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const cambiarEstado = async (id, estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    if (estado === "entregado")  patch.entregado_at = new Date().toISOString();
    if (estado === "cancelado")  patch.cancelado_at = new Date().toISOString();
    await supabase.from("pool_service_pedidos").update(patch).eq("id", id);
    load();
  };

  // ── Envío a Loggro (misma lógica que HotelRoomService) ──────────────────
  // Para spots de Piscina: usa floorplan_spots.loggro_mesa_id como destino.
  // Si el spot no tiene mapeo a Loggro, alerta al operador para que lo
  // configure (Floor Plan → spot → "Mesa Loggro").
  const enviarALoggro = async (pedido) => {
    if (!pedido?.spot_id) {
      alert("Este pedido no tiene un spot del floor plan asignado.\nNo se puede enviar a Loggro.");
      return;
    }
    // 1) Resolver loggro_mesa_id desde floorplan_spots
    const { data: spot, error: spotErr } = await supabase.from("floorplan_spots")
      .select("id, loggro_mesa_id").eq("id", pedido.spot_id).maybeSingle();
    if (spotErr || !spot?.loggro_mesa_id) {
      alert(`⚠️ Spot ${pedido.spot_id} no está mapeado a una mesa de Loggro.\n\nVe a Floor Plan → ${pedido.spot_id} → "Mesa Loggro".`);
      return;
    }
    // 2) Resolver loggro_id + precio de cada ítem
    const itemIds = (pedido.items || []).map(i => i.id);
    const { data: menuItems } = await supabase
      .from("menu_items").select("id, loggro_id, precio").in("id", itemIds);
    const mapLoggro = Object.fromEntries((menuItems || []).map(m => [m.id, m]));
    const items = (pedido.items || []).map(it => {
      const m = mapLoggro[it.id] || {};
      return {
        productId: m.loggro_id,
        qty:       it.cantidad,
        unit_price: Number(it.precio) || Number(m.precio) || 0,
        notes:     it.notas ? [String(it.notas)] : (pedido.notas ? [String(pedido.notas)] : []),
      };
    }).filter(i => i.productId);

    if (items.length === 0) {
      alert("Ningún ítem del pedido tiene loggro_id. Sincroniza productos primero (Loggro → Sincronizar).");
      return;
    }

    // 3) POST a la edge function loggro-sync/create-order
    try {
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/create-order`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        anon,
          "Authorization": `Bearer ${anon}`,
        },
        body: JSON.stringify({
          mesaId:    spot.loggro_mesa_id,
          groupName: `Pool Service · ${pedido.spot_id}${pedido.huesped ? " · " + pedido.huesped : ""}`,
          items,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const orderArr = Array.isArray(data.order) ? data.order : [data.order];
        const firstId  = orderArr[0]?._id   || orderArr[0]?.id || null;
        const groupId  = orderArr[0]?.group || null;
        await supabase.from("pool_service_pedidos").update({
          estado:            "enviado_loggro",
          enviado_loggro_at: new Date().toISOString(),
          loggro_response:   data.order,
          loggro_order_id:   firstId,
          loggro_group_id:   groupId,
          updated_at:        new Date().toISOString(),
        }).eq("id", pedido.id);
        alert("✓ Enviado a cocina de Loggro");
      } else {
        await supabase.from("pool_service_pedidos").update({
          loggro_response: { error: data.error, at: new Date().toISOString() },
          updated_at:      new Date().toISOString(),
        }).eq("id", pedido.id);
        alert("⚠️ Error enviando a Loggro:\n" + (data.error || "Desconocido"));
      }
      load();
    } catch (err) {
      alert("Error de red: " + err.message);
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    const today = pedidos.filter(p => (p.created_at || "").slice(0, 10) === hoy);
    return {
      pendientes: pedidos.filter(p => p.estado === "recibido" || p.estado === "preparando" || p.estado === "listo").length,
      hoy: today.length,
      ventas_hoy: today.filter(p => p.estado !== "cancelado").reduce((s, p) => s + Number(p.total || 0), 0),
      areas_activas: areas.length,
    };
  }, [pedidos, areas]);

  if (loading) return <div style={{ padding: 40, color: "#fff", textAlign: "center" }}>Cargando Pool Service…</div>;

  return (
    <div style={{ padding: isMobile ? 12 : 20, maxWidth: 1400, margin: "0 auto" }}>
      {/* Navegación mínima — solo lo esencial para cambiar de vista */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { k: "nuevo",   l: "🏊 Plano" },
          { k: "pedidos", l: `📋 Pedidos${kpis.pendientes ? ` (${kpis.pendientes})` : ""}` },
          { k: "areas",   l: "📍 Áreas" },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={BTN(tab === t.k ? B.pool : B.navyMid, tab === t.k ? B.navy : "#fff")}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "pedidos" && (
        <Kanban pedidos={pedidos} cambiarEstado={cambiarEstado} enviarALoggro={enviarALoggro} isMobile={isMobile} />
      )}
      {tab === "nuevo" && (
        <NuevoPedido areas={areas} items={items} onSaved={() => { setTab("pedidos"); load(); }} enviarALoggro={enviarALoggro} isMobile={isMobile} />
      )}
      {tab === "areas" && (
        <AreasManager areas={areas} onChanged={load} />
      )}
    </div>
  );
}

// ─── Kanban de pedidos ─────────────────────────────────────────────────────
function Kanban({ pedidos, cambiarEstado, enviarALoggro, isMobile }) {
  const cols = useMemo(() => {
    const buckets = Object.fromEntries(KANBAN_COLS.map(k => [k, []]));
    pedidos.forEach(p => {
      if (buckets[p.estado]) buckets[p.estado].push(p);
    });
    return buckets;
  }, [pedidos]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${KANBAN_COLS.length}, 1fr)`, gap: 12 }}>
      {KANBAN_COLS.map(k => (
        <div key={k} style={{ background: B.navyMid, borderRadius: 12, padding: 12, minHeight: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: estColor(k), marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {estLabel(k)} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>({cols[k].length})</span>
          </div>
          {cols[k].length === 0 ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", padding: "10px 4px" }}>Sin pedidos.</div>
          ) : cols[k].map(p => (
            <PedidoCard key={p.id} p={p} cambiarEstado={cambiarEstado} enviarALoggro={enviarALoggro} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PedidoCard({ p, cambiarEstado, enviarALoggro }) {
  const next = NEXT_EST[p.estado];
  // Si tiene spot_id (Piscina), mostrar el código grande y visible para que los
  // meseros sepan exactamente a qué cama / PS llevar el pedido.
  const tituloDestino = p.spot_id || p.area_nombre || p.area_id || "—";
  const enviadoLoggro = !!p.loggro_order_id || p.estado === "enviado_loggro";
  const errorLoggro   = !!(p.loggro_response?.error);
  return (
    <div style={{ background: B.navy, borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: p.spot_id ? 18 : 13, fontWeight: 800, color: p.spot_id ? B.sand : "#fff", letterSpacing: p.spot_id ? "0.05em" : "normal" }}>
            {tituloDestino}
          </div>
          {p.spot_id && p.area_nombre && p.area_nombre !== p.spot_id && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{p.area_nombre.replace(/^.*\(([^)]+)\).*$/, "$1")}</div>
          )}
          {p.huesped && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>👤 {p.huesped}</div>}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>
          {(p.created_at || "").slice(11, 16)}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>
        {(p.items || []).map((it, i) => (
          <div key={i}>{it.cantidad}× {it.nombre}</div>
        ))}
      </div>
      {/* Badge de estado Loggro */}
      {enviadoLoggro && (
        <div style={{ fontSize: 10, color: B.pool, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
          ✓ En cocina (Loggro {p.loggro_order_id?.slice(-6) || "—"})
        </div>
      )}
      {errorLoggro && (
        <div style={{ fontSize: 10, color: B.danger, marginBottom: 6 }}>
          ⚠ Error Loggro: {String(p.loggro_response.error).slice(0, 60)}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: B.success }}>{COP(p.total)}</div>
        <div style={{ display: "flex", gap: 4 }}>
          {/* Enviar / Reenviar a Loggro — solo para spots, si aún no se envió */}
          {p.spot_id && !enviadoLoggro && typeof enviarALoggro === "function" && (
            <button onClick={() => enviarALoggro(p)} style={{ ...BTN(B.pool, B.navy), padding: "5px 10px", fontSize: 10, minHeight: 0 }}
              title="Enviar a la cocina vía Loggro">
              🍳 Loggro
            </button>
          )}
          {next && (
            <button onClick={() => cambiarEstado(p.id, next)} style={{ ...BTN(B.pool), padding: "5px 10px", fontSize: 10, minHeight: 0 }}>
              → {estLabel(next)}
            </button>
          )}
          {p.estado !== "cancelado" && p.estado !== "entregado" && (
            <button onClick={() => { if (window.confirm("¿Cancelar?")) cambiarEstado(p.id, "cancelado"); }}
              style={{ ...BTN(B.danger + "44", B.danger), padding: "5px 8px", fontSize: 10, minHeight: 0 }}>
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Nuevo pedido (uso staff) ──────────────────────────────────────────────
function todayBogota() {
  return new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).slice(0, 10);
}

function NuevoPedido({ areas, items, onSaved, enviarALoggro, isMobile }) {
  // Flujo: 1) mesero toca el spot en el floor plan → 2) llena pedido → 3) envía.
  // El spot puede ser de la Piscina (floorplan_spots) o un área tradicional
  // (pool_service_areas) para zonas que aún no tienen floor plan visual (beach, cabañas).
  const [spotSel, setSpotSel] = useState(null);   // { id, tipo, capacidad, zona }
  const [asignSel, setAsignSel] = useState(null); // huésped/pax del floorplan_asignaciones (si existe)
  const [areaId, setAreaId] = useState("");       // fallback: áreas sin floor plan
  const [huesped, setHuesped] = useState("");
  const [pax, setPax] = useState(1);
  const [notas, setNotas] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [filtroCat, setFiltroCat] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-llenar huésped/pax cuando el mesero elige un spot ya asignado
  const handleSelectSpot = (spot, asign) => {
    setSpotSel(spot);
    setAsignSel(asign || null);
    setAreaId("");  // si elige spot, ignorar área tradicional
    if (asign?.huesped) setHuesped(asign.huesped);
    if (asign?.pax > 0) setPax(asign.pax);
  };

  const cats = useMemo(() => sortCats(Array.from(new Set(items.map(i => i.categoria).filter(Boolean)))), [items]);
  const filtered = useMemo(() => {
    const base = filtroCat ? items.filter(i => i.categoria === filtroCat) : items;
    return [...base].sort((a, b) => {
      const ra = catRank(a.categoria), rb = catRank(b.categoria);
      if (ra !== rb) return ra - rb;
      return (a.orden || 0) - (b.orden || 0) || (a.nombre || "").localeCompare(b.nombre || "");
    });
  }, [items, filtroCat]);

  const add = (it) => setCarrito(prev => {
    const ex = prev.find(x => x.id === it.id);
    if (ex) return prev.map(x => x.id === it.id ? { ...x, cantidad: x.cantidad + 1 } : x);
    return [...prev, { id: it.id, nombre: it.nombre, precio: it.precio || 0, cantidad: 1, notas: "" }];
  });
  const setCant = (id, c) => {
    const n = Number(c);
    if (n <= 0) return setCarrito(prev => prev.filter(x => x.id !== id));
    setCarrito(prev => prev.map(x => x.id === id ? { ...x, cantidad: n } : x));
  };

  const subtotal = carrito.reduce((s, x) => s + x.precio * x.cantidad, 0);
  const areaSel = areas.find(a => a.id === areaId);

  // ¿La cama ya tiene huésped asignado? → no volver a mostrar el formulario.
  // El mesero solo necesita capturar nombre/pax/notas la PRIMERA vez; luego
  // queda guardado en floorplan_asignaciones y va directo al menú.
  const yaAsignado = !!(spotSel && asignSel?.huesped);

  // El destino del pedido: spot del floor plan O área tradicional
  const destinoOk = !!spotSel || !!areaId;
  const destinoLabel = spotSel
    ? `${spotSel.id} · Cama ${spotSel.id.startsWith("PS") ? "Pool Side" : "Exterior"} · ${spotSel.zona.replace("piscina_","P. ").replace("_"," ")}`
    : areaSel ? `${TIPO_ICON[areaSel.tipo] || "📍"} ${areaSel.nombre}` : "";

  const guardar = async ({ enviarLoggro = false } = {}) => {
    if (!destinoOk)           return alert("Selecciona un spot (cama / PS) o un área");
    if (carrito.length === 0) return alert("Agrega al menos un ítem");
    setSaving(true);
    const codigo = `PS-${Date.now()}`;
    const payload = {
      codigo,
      huesped:     huesped || asignSel?.huesped || null,
      pax:         Number(pax) || 1,
      items:       carrito,
      subtotal,
      total:       subtotal,
      notas:       notas || null,
      estado:      "recibido",
      creado_por:  "staff",
      reserva_id:  asignSel?.reserva_id || null,
    };
    if (spotSel) {
      payload.spot_id     = spotSel.id;
      payload.area_id     = `spot:${spotSel.id}`;       // legacy compat
      payload.area_nombre = `${spotSel.id} (Cama ${spotSel.id.startsWith("PS") ? "Pool Side" : "Exterior"})`;
    } else {
      payload.area_id     = areaId;
      payload.area_nombre = areaSel?.nombre || areaId;
    }
    const { data: inserted, error } = await supabase
      .from("pool_service_pedidos").insert(payload).select().single();
    if (error) { setSaving(false); return alert("Error: " + error.message); }

    // Persistir el huésped en la cama (floorplan_asignaciones) la PRIMERA vez.
    // Así la próxima vez que el mesero toque esta cama no vuelve a pedir el
    // nombre — va directo al menú. Marca la cama como "ocupado".
    if (spotSel && !yaAsignado) {
      const fecha = todayBogota();
      const nombreFinal = (huesped || "").trim();
      const asignPayload = {
        spot_id:  spotSel.id,
        fecha,
        estado:   "ocupado",
        huesped:  nombreFinal || null,
        pax:      Number(pax) || 1,
        notas:    notas || null,
        updated_at: new Date().toISOString(),
      };
      if (asignSel?.id) {
        await supabase.from("floorplan_asignaciones").update(asignPayload).eq("id", asignSel.id);
      } else {
        await supabase.from("floorplan_asignaciones").insert({
          id: `FPA-${Date.now()}`, ...asignPayload, created_at: new Date().toISOString(),
        }).then(() => {}).catch(() => {});
      }
    }

    // Si el operador pulsó "Crear y enviar a Loggro", dispara el envío a cocina.
    // Sólo aplica para spots (los de área tradicional usan el flujo legacy).
    if (enviarLoggro && inserted && spotSel && typeof enviarALoggro === "function") {
      await enviarALoggro(inserted);
    }
    setSaving(false);
    onSaved?.();
  };

  // ── PÁGINA 1: PLANO ──────────────────────────────────────────────────────
  // Sin mesa seleccionada → mostramos SOLO el plano (pantalla completa).
  if (!destinoOk) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            🏊 Plano de Piscina
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>
              · localiza la mesa del cliente y tócala
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, color: "rgba(255,255,255,0.6)", alignItems: "center", flexWrap: "wrap" }}>
            <Legend dot={B.success}      label="Libre" />
            <Legend dot={B.sky}          label="Reservado" />
            <Legend dot={B.danger}       label="Ocupado" />
            <Legend dot={B.warning}      label="Limpieza" />
            <Legend dot="rgba(255,255,255,0.3)" label="Bloqueado" />
          </div>
        </div>
        <PoolFloorPlanPicker
          selectedSpotId={null}
          onSelectSpot={handleSelectSpot}
          showEstadoColor={true}
          size="lg"
        />
        {areas.length > 0 && (
          <details style={{ marginTop: 10, background: B.navyMid, padding: 10, borderRadius: 8 }}>
            <summary style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
              ¿Pedido para zona sin plano? (beach, cabañas, bar exterior)
            </summary>
            <select value={areaId} onChange={e => setAreaId(e.target.value)} style={{ ...IS, marginTop: 8 }}>
              <option value="">— elige área —</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{TIPO_ICON[a.tipo] || "📍"} {a.nombre}</option>
              ))}
            </select>
          </details>
        )}
      </div>
    );
  }

  // ── PÁGINA 2: MENÚ / PEDIDO ──────────────────────────────────────────────
  // Mesa seleccionada → pantalla completa de pedido con botón "volver al plano".
  return (
    <div>
      {/* Barra superior: volver + mesa */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => { setSpotSel(null); setAsignSel(null); setAreaId(""); setCarrito([]); }}
          style={{ ...BTN(B.navyMid, B.pool), padding: "10px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          ← Volver al plano
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 10, color: B.pool, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Pedido para</div>
          <div style={{ fontSize: 20, color: B.sand, fontWeight: 800, letterSpacing: "0.05em" }}>{destinoLabel}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 1fr) minmax(0, 2fr)", gap: 16 }}>
          {/* Sidebar pedido */}
          <div style={{
            background: B.navyMid, padding: 14, borderRadius: 12,
            position: isMobile ? "static" : "sticky", top: 12, alignSelf: "start",
            maxHeight: isMobile ? "none" : "85vh", overflow: isMobile ? "visible" : "auto",
          }}>
            {/* Banner destino — compacto si la cama ya tiene huésped */}
            <div style={{ background: B.pool + "22", border: `2px solid ${B.pool}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: B.pool, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Mesa</div>
              <div style={{ fontSize: 18, color: B.sand, fontWeight: 800, marginTop: 2, letterSpacing: "0.05em" }}>{destinoLabel}</div>
              {yaAsignado && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>
                  👤 {asignSel.huesped}{asignSel.pax > 0 ? ` · ${asignSel.pax} pax` : ""}
                </div>
              )}
            </div>

            {/* Formulario huésped/pax/notas — SOLO la primera vez (cama sin huésped) */}
            {!yaAsignado && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div>
                    <label style={LS}>Huésped (opcional)</label>
                    <input value={huesped} onChange={e => setHuesped(e.target.value)} style={IS} placeholder="Nombre" />
                  </div>
                  <div>
                    <label style={LS}>Pax</label>
                    <input type="number" value={pax} onChange={e => setPax(e.target.value)} style={IS} min={1} />
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={LS}>Notas</label>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} placeholder="Alergias, sin hielo, etc." />
                </div>
              </>
            )}

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
                Carrito ({carrito.length})
              </div>
              {carrito.length === 0 ? (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Vacío.</div>
              ) : carrito.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <input type="number" value={c.cantidad} onChange={e => setCant(c.id, e.target.value)} min={0}
                    style={{ ...IS, width: 50, padding: "4px 6px" }} />
                  <div style={{ flex: 1, fontSize: 12, minWidth: 0 }}>
                    <div style={{ color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{COP(c.precio)} c/u</div>
                  </div>
                  <div style={{ fontSize: 11, color: B.success, fontWeight: 700 }}>{COP(c.precio * c.cantidad)}</div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 14, fontWeight: 800 }}>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>Total</span>
                <span style={{ color: B.success }}>{COP(subtotal)}</span>
              </div>
              <button onClick={() => guardar({ enviarLoggro: false })} disabled={saving || !destinoOk || carrito.length === 0}
                style={{ ...BTN(saving ? B.navyLight : B.success), width: "100%", marginTop: 12, opacity: (!destinoOk || carrito.length === 0) ? 0.5 : 1 }}>
                {saving ? "Guardando…" : "Guardar pedido"}
              </button>
              {/* Botón directo a cocina vía Loggro (solo para spots con mapeo) */}
              {spotSel && (
                <button onClick={() => guardar({ enviarLoggro: true })} disabled={saving || !destinoOk || carrito.length === 0}
                  style={{ ...BTN(saving ? B.navyLight : B.pool, B.navy), width: "100%", marginTop: 8, opacity: (!destinoOk || carrito.length === 0) ? 0.5 : 1 }}>
                  {saving ? "Enviando…" : "🍳 Crear y enviar a Loggro"}
                </button>
              )}
            </div>
          </div>

          {/* Menú: Restaurant + Bebidas (desde Productos) */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                🍽 Menú · Restaurant + Bebidas
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                {items.filter(i => i.loggro_id).length} / {items.length} con Loggro
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <button onClick={() => setFiltroCat("")} style={BTN(filtroCat === "" ? B.pool : B.navyMid)}>Todo</button>
              {cats.map(c => (
                <button key={c} onClick={() => setFiltroCat(c)} style={BTN(filtroCat === c ? B.pool : B.navyMid)}>
                  {c}
                </button>
              ))}
            </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 180}px, 1fr))`, gap: isMobile ? 8 : 10 }}>
          {filtered.map(it => {
            const sinLoggro = !it.loggro_id;
            return (
              <button key={it.id} onClick={() => add(it)}
                title={sinLoggro ? "Este ítem no tiene loggro_id — no se enviará a cocina vía Loggro" : undefined}
                style={{
                  background: B.navyMid, border: sinLoggro ? `1px dashed ${B.warning}66` : "none",
                  borderRadius: 10, padding: 12, textAlign: "left", cursor: "pointer", color: "#fff",
                  position: "relative",
                }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {it.categoria || "—"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, lineHeight: 1.2 }}>{it.nombre}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: B.success }}>{COP(it.precio)}</div>
                  {sinLoggro && (
                    <span style={{ fontSize: 9, color: B.warning, fontWeight: 700, letterSpacing: "0.04em" }}>
                      ⚠ SIN LOGGRO
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mini-leyenda de color → estado del spot
function Legend({ dot, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: dot, border: `1px solid ${dot}` }} />
      {label}
    </span>
  );
}

// ─── Áreas (gestión simple) ────────────────────────────────────────────────
function AreasManager({ areas, onChanged }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newArea, setNewArea] = useState({ nombre: "", tipo: "piscina", capacidad: 10, qr_code: "" });

  const guardarNueva = async () => {
    if (!newArea.nombre.trim()) return alert("Nombre es requerido");
    const id = `AREA-${Date.now()}`;
    const { error } = await supabase.from("pool_service_areas").insert({
      id,
      nombre:    newArea.nombre.trim(),
      tipo:      newArea.tipo,
      capacidad: Number(newArea.capacidad) || 0,
      qr_code:   newArea.qr_code.trim() || id.toLowerCase().replace(/_/g, "-"),
      activo:    true,
      orden:     (areas[areas.length - 1]?.orden || 0) + 10,
    });
    if (error) return alert("Error: " + error.message);
    setNewArea({ nombre: "", tipo: "piscina", capacidad: 10, qr_code: "" });
    setShowAdd(false);
    onChanged?.();
  };

  const toggleActivo = async (a) => {
    await supabase.from("pool_service_areas").update({ activo: !a.activo, updated_at: new Date().toISOString() }).eq("id", a.id);
    onChanged?.();
  };

  const portalUrl = (qr) => `${window.location.origin}/pool/${qr}`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          Cada área tiene un QR — el huésped lo escanea y entra al portal de pedidos.
        </div>
        <button onClick={() => setShowAdd(v => !v)} style={BTN(B.success)}>
          {showAdd ? "Cancelar" : "+ Nueva área"}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: B.navyMid, padding: 14, borderRadius: 10, marginBottom: 14, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={LS}>Nombre</label>
            <input value={newArea.nombre} onChange={e => setNewArea({ ...newArea, nombre: e.target.value })} style={IS} placeholder="Piscina Oeste" />
          </div>
          <div>
            <label style={LS}>Tipo</label>
            <select value={newArea.tipo} onChange={e => setNewArea({ ...newArea, tipo: e.target.value })} style={IS}>
              <option value="piscina">Piscina</option>
              <option value="piscina_chica">Piscina chica</option>
              <option value="beach">Beach</option>
              <option value="cabana">Cabaña</option>
              <option value="bar">Bar</option>
              <option value="vip">VIP</option>
              <option value="otra">Otra</option>
            </select>
          </div>
          <div>
            <label style={LS}>Capacidad</label>
            <input type="number" value={newArea.capacidad} onChange={e => setNewArea({ ...newArea, capacidad: e.target.value })} style={IS} />
          </div>
          <div>
            <label style={LS}>QR code (slug URL)</label>
            <input value={newArea.qr_code} onChange={e => setNewArea({ ...newArea, qr_code: e.target.value })} style={IS} placeholder="auto-generado" />
          </div>
          <button onClick={guardarNueva} style={BTN(B.success)}>Guardar</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {areas.map(a => (
          <div key={a.id} style={{ background: B.navyMid, borderRadius: 12, padding: 14, opacity: a.activo ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 24 }}>{TIPO_ICON[a.tipo] || "📍"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{a.nombre}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{a.tipo} · cap {a.capacidad}</div>
              </div>
            </div>
            <div style={{ background: B.navy, padding: 8, borderRadius: 6, fontSize: 11, color: B.sand, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 10 }}>
              {portalUrl(a.qr_code)}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <a href={portalUrl(a.qr_code)} target="_blank" rel="noreferrer" style={{ ...BTN(B.pool), textDecoration: "none", display: "inline-block", textAlign: "center", flex: 1 }}>
                Ver portal
              </a>
              <button onClick={() => toggleActivo(a)} style={BTN(a.activo ? B.danger + "55" : B.success, "#fff")}>
                {a.activo ? "Pausar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

