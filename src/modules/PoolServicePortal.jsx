// PoolServicePortal — Portal público para huéspedes en /pool/:qr
// El cliente escanea el QR del área (piscina, beach, cabaña), llega aquí,
// arma su pedido y lo envía. El staff lo ve en tiempo real en PoolService.
//
// Usa Supabase con anon key — RLS permite INSERT/SELECT a anon en la
// tabla pool_service_pedidos.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#FAF6EE", primary: "#0D1B3E", accent: "#C8B99A",
  text: "#0D1B3E", textMid: "#475569", textLight: "#94a3b8",
  border: "#e5e7eb", success: "#16a34a", danger: "#dc2626",
};
const COP = (n) => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const TIPO_LABEL = {
  piscina: "Piscina", piscina_chica: "Piscina chica", beach: "Beach", cabana: "Cabaña",
  bar: "Bar", vip: "VIP", otra: "Área",
};

const CAT_ORDER = ["Bebidas", "Cervezas", "Cocteles", "Snacks", "Entradas", "Marinas", "Ensalada", "Ensaladas", "Tacos", "Pizza", "Pizzas", "Especialidades", "Especialidades de la Isla", "Parrilla", "De la Parrilla", "Complementos", "Postres"];
const catRank = (cat) => {
  const idx = CAT_ORDER.findIndex(c => c.toLowerCase() === (cat || "").toLowerCase());
  return idx === -1 ? 999 : idx;
};

export default function PoolServicePortal({ qr }) {
  const [area, setArea]     = useState(null);
  const [spot, setSpot]     = useState(null);  // modo cama: QR de un floorplan_spot
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [carrito, setCart]  = useState([]);
  const [filtroCat, setFC]  = useState("");
  const [seccion, setSeccion] = useState("comidas"); // comidas | bebidas | actividades
  const [registrado, setRegistrado] = useState(false); // el spot ya tiene huésped hoy
  const [step, setStep]     = useState("menu"); // menu | review | success
  const [huesped, setHuesped] = useState("");
  const [notas, setNotas]   = useState("");
  const [pax, setPax]       = useState(1);
  const [saving, setSaving] = useState(false);
  const [pedidoCodigo, setPedidoCodigo] = useState("");
  const [pedidoEstado, setPedidoEstado] = useState("");

  useEffect(() => {
    (async () => {
      if (!qr) return setLoad(false);
      const [{ data: a }, { data: i }] = await Promise.all([
        supabase.from("pool_service_areas").select("*").eq("qr_code", qr).eq("activo", true).maybeSingle(),
        supabase.from("menu_items").select("id, nombre, descripcion, precio, categoria, menu_tipo, loggro_id").in("menu_tipo", ["restaurant", "bebidas", "experiencias", "trans_acuatica"]).eq("activo", true),
      ]);
      setItems(i || []);
      if (a) {
        setArea(a);
      } else {
        // No es un área: probar como cama del floor plan (QR por spot_id)
        const { data: sp } = await supabase.from("floorplan_spots")
          .select("id, zona, loggro_mesa_id").eq("id", qr).eq("activo", true).maybeSingle();
        if (sp) {
          setSpot(sp);
          const zlbl = (sp.zona || "").replace("piscina_derecha", "Piscina Derecha").replace("piscina_izquierda", "Piscina Izquierda").replace("piscina_central", "Piscina Centro").replace("piscina_", "P. ").replace(/_/g, " ");
          setArea({ id: sp.id, nombre: sp.id, tipo: "piscina", _zona: zlbl }); // header del Shell
          // ¿Ya registraron a la persona en esta cama hoy? → saludar por nombre
          const hoy = new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).slice(0, 10);
          const { data: asg } = await supabase.from("floorplan_asignaciones")
            .select("huesped, pax").eq("spot_id", sp.id).eq("fecha", hoy)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle();
          if (asg?.huesped) { setHuesped(asg.huesped); setPax(asg.pax || 1); setRegistrado(true); }
        }
      }
      setLoad(false);
    })();
  }, [qr]);

  // Tracking de pedido en realtime
  useEffect(() => {
    if (!pedidoCodigo) return;
    const ch = supabase
      .channel(`pool-pedido-${pedidoCodigo}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pool_service_pedidos", filter: `codigo=eq.${pedidoCodigo}` }, (payload) => {
        if (payload.new?.estado) setPedidoEstado(payload.new.estado);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pedidoCodigo]);

  // Comidas = restaurant · Bebidas = bebidas · Actividades = experiencias/tours
  const SEC_TIPOS = { comidas: ["restaurant"], bebidas: ["bebidas"], actividades: ["experiencias", "trans_acuatica"] };
  const seccionItems = useMemo(
    () => items.filter(i => (SEC_TIPOS[seccion] || []).includes(i.menu_tipo)),
    [items, seccion]
  );

  const cats = useMemo(() => {
    const list = Array.from(new Set(seccionItems.map(i => i.categoria).filter(Boolean)));
    return list.sort((a, b) => {
      const ra = catRank(a), rb = catRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
  }, [seccionItems]);

  const itemsFiltered = useMemo(() => {
    const base = filtroCat ? seccionItems.filter(i => i.categoria === filtroCat) : seccionItems;
    return [...base].sort((a, b) => {
      const ra = catRank(a.categoria), rb = catRank(b.categoria);
      if (ra !== rb) return ra - rb;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });
  }, [seccionItems, filtroCat]);

  const subtotal = carrito.reduce((s, x) => s + x.precio * x.cantidad, 0);

  const add = (it) => setCart(prev => {
    const ex = prev.find(x => x.id === it.id);
    if (ex) return prev.map(x => x.id === it.id ? { ...x, cantidad: x.cantidad + 1 } : x);
    return [...prev, { id: it.id, nombre: it.nombre, precio: it.precio || 0, loggro_id: it.loggro_id || null, cantidad: 1, notas: "" }];
  });
  const setCant = (id, c) => {
    const n = Number(c);
    if (n <= 0) return setCart(prev => prev.filter(x => x.id !== id));
    setCart(prev => prev.map(x => x.id === id ? { ...x, cantidad: n } : x));
  };

  const enviar = async () => {
    if (carrito.length === 0) return alert("Agrega algo al pedido");
    setSaving(true);
    const codigo = `PS-${Date.now()}`;
    const row = spot
      ? { codigo, spot_id: spot.id, area_nombre: `${spot.id} · ${area._zona || ""}`, huesped: huesped || null, pax: Number(pax) || 1, items: carrito, subtotal, total: subtotal, notas: notas || null, estado: "recibido", creado_por: "huesped" }
      : { codigo, area_id: area.id, area_nombre: area.nombre, huesped: huesped || null, pax: Number(pax) || 1, items: carrito, subtotal, total: subtotal, notas: notas || null, estado: "recibido", creado_por: "huesped" };
    const { data: ins, error } = await supabase.from("pool_service_pedidos").insert(row).select().maybeSingle();
    if (error) { setSaving(false); return alert("Error al enviar el pedido: " + error.message); }

    // Modo cama: enviar a la mesa de Loggro del spot (igual que Room Service)
    if (spot?.loggro_mesa_id) {
      try {
        const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const lgItems = carrito.map(c => ({
          productId: c.loggro_id, qty: c.cantidad,
          unit_price: Number(c.precio) || 0,
          notes: c.notas ? [String(c.notas)] : (notas ? [String(notas)] : []),
        })).filter(x => x.productId);
        if (lgItems.length > 0) {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/create-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
            body: JSON.stringify({ mesaId: spot.loggro_mesa_id, groupName: `Pool · ${spot.id}${huesped ? " · " + huesped : ""}`, items: lgItems }),
          });
          const d = await res.json();
          if (d.ok) {
            const arr = Array.isArray(d.order) ? d.order : [d.order];
            await supabase.from("pool_service_pedidos").update({
              estado: "enviado_loggro", enviado_loggro_at: new Date().toISOString(),
              loggro_order_id: arr[0]?._id || arr[0]?.id || null,
              loggro_group_id: arr[0]?.group || null, loggro_response: d.order,
              updated_at: new Date().toISOString(),
            }).eq("id", ins?.id || codigo);
          }
        }
      } catch { /* el pedido ya quedó guardado; staff lo reenvía */ }
    }
    setSaving(false);
    setPedidoCodigo(codigo);
    setPedidoEstado("recibido");
    setStep("success");
  };

  if (loading) {
    return (
      <Shell>
        <div style={{ padding: 60, textAlign: "center", color: C.textMid }}>Cargando…</div>
      </Shell>
    );
  }
  if (!area) {
    return (
      <Shell>
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>Área no disponible</div>
          <div style={{ fontSize: 13, color: C.textMid }}>
            Este QR no corresponde a ninguna área activa. Pídele a un colaborador del muelle un código nuevo.
          </div>
        </div>
      </Shell>
    );
  }

  if (step === "success") {
    return <SuccessView area={area} codigo={pedidoCodigo} estado={pedidoEstado} />;
  }

  return (
    <Shell area={area}>
      {step === "menu" && (
        <>
          {/* Saludo si la persona ya está registrada en esta cama (como Room Service) */}
          {registrado && huesped && (
            <div style={{ background: "white", borderRadius: 14, padding: "16px 18px", marginBottom: 12, boxShadow: "0 1px 3px rgba(13,27,62,0.06)" }}>
              <div style={{ fontSize: 13, color: C.textMid }}>Hola 👋</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{String(huesped).split(" ")[0]}</div>
              <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>Pide a tu cama · {area?.nombre}</div>
            </div>
          )}

          {/* Secciones tipo Room Service */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { k: "comidas",     ic: "🍽", l: "Comidas" },
              { k: "bebidas",     ic: "🍹", l: "Bebidas" },
              { k: "actividades", ic: "🏖", l: "Actividades" },
            ].map(s => {
              const on = seccion === s.k;
              return (
                <button key={s.k} onClick={() => { setSeccion(s.k); setFC(""); }}
                  style={{ flex: 1, background: on ? C.primary : "white", color: on ? "#fff" : C.text, border: `1px solid ${on ? C.primary : C.border}`, borderRadius: 12, padding: "12px 4px", fontSize: 13, fontWeight: 800, cursor: "pointer", minHeight: 56 }}>
                  <div style={{ fontSize: 20 }}>{s.ic}</div>{s.l}
                </button>
              );
            })}
          </div>

          {/* Filtros de categoría */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 0 12px 0", marginBottom: 12 }}>
            <Chip label="Todo" active={filtroCat === ""} onClick={() => setFC("")} />
            {cats.map(c => (
              <Chip key={c} label={c} active={filtroCat === c} onClick={() => setFC(c)} />
            ))}
          </div>

          {/* Items */}
          {itemsFiltered.length === 0 && (
            <div style={{ background: "white", borderRadius: 12, padding: 28, textAlign: "center", color: C.textMid, fontSize: 13 }}>
              {seccion === "actividades"
                ? "Consulta las actividades y pasadías con tu anfitrión 🏖"
                : "No hay ítems en esta sección por ahora."}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {itemsFiltered.map(it => {
              const inCart = carrito.find(c => c.id === it.id);
              return (
                <div key={it.id} style={{ background: "white", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px rgba(13,27,62,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {it.categoria || "—"}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 2 }}>{it.nombre}</div>
                    {it.descripcion && <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{it.descripcion}</div>}
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginTop: 6 }}>{COP(it.precio)}</div>
                  </div>
                  {inCart ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => setCant(it.id, inCart.cantidad - 1)} style={qtyBtn}>−</button>
                      <span style={{ fontSize: 16, fontWeight: 800, minWidth: 22, textAlign: "center" }}>{inCart.cantidad}</span>
                      <button onClick={() => setCant(it.id, inCart.cantidad + 1)} style={qtyBtn}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => add(it)} style={addBtn}>+ Agregar</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom bar */}
          {carrito.length > 0 && (
            <div style={{ position: "sticky", bottom: 0, background: "white", padding: "12px 16px", margin: "12px -16px -16px -16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMid }}>{carrito.length} ítem{carrito.length !== 1 ? "s" : ""}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{COP(subtotal)}</div>
              </div>
              <button onClick={() => setStep("review")} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 48 }}>
                Revisar pedido →
              </button>
            </div>
          )}
        </>
      )}

      {step === "review" && (
        <div>
          <div style={{ background: "white", borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Tu pedido</div>
            {carrito.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
                <button onClick={() => setCant(c.id, c.cantidad - 1)} style={qtyBtnSm}>−</button>
                <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700 }}>{c.cantidad}</span>
                <button onClick={() => setCant(c.id, c.cantidad + 1)} style={qtyBtnSm}>+</button>
                <div style={{ flex: 1, fontSize: 13 }}>{c.nombre}</div>
                <div style={{ fontWeight: 700 }}>{COP(c.precio * c.cantidad)}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `2px solid ${C.text}`, marginTop: 6, fontWeight: 800, fontSize: 16 }}>
              <span>Total</span>
              <span>{COP(subtotal)}</span>
            </div>
          </div>

          <div style={{ background: "white", borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: C.textMid, marginBottom: 10 }}>
              Información para entrega (opcional)
            </div>
            <input value={huesped} onChange={e => setHuesped(e.target.value)} placeholder="Tu nombre"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, marginBottom: 8 }} />
            <input type="number" value={pax} onChange={e => setPax(e.target.value)} placeholder="Personas en la mesa" min={1}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, marginBottom: 8 }} />
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas especiales (alergias, ubicación exacta, etc.)"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, minHeight: 80, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("menu")}
              style={{ flex: 1, background: "white", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, fontWeight: 700, cursor: "pointer", minHeight: 48 }}>
              ← Agregar más
            </button>
            <button onClick={enviar} disabled={saving}
              style={{ flex: 2, background: saving ? C.textLight : C.primary, color: "#fff", border: "none", borderRadius: 10, padding: 14, fontWeight: 700, cursor: "pointer", minHeight: 48 }}>
              {saving ? "Enviando…" : `Enviar pedido · ${COP(subtotal)}`}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function SuccessView({ area, codigo, estado }) {
  const ESTADO_INFO = {
    recibido:   { emoji: "📥", label: "Recibido",   sub: "Tu pedido llegó al equipo." },
    preparando: { emoji: "👨‍🍳", label: "Preparando", sub: "Lo están preparando con cariño." },
    listo:      { emoji: "🍽️", label: "Listo",      sub: "Va en camino a tu área." },
    entregado:  { emoji: "✅", label: "Entregado",  sub: "¡Disfruta tu pedido!" },
    cancelado:  { emoji: "❌", label: "Cancelado",  sub: "El pedido fue cancelado." },
  };
  const info = ESTADO_INFO[estado] || ESTADO_INFO.recibido;
  return (
    <Shell area={area}>
      <div style={{ background: "white", borderRadius: 14, padding: 32, textAlign: "center", boxShadow: "0 6px 30px rgba(13,27,62,0.08)" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{info.emoji}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{info.label}</div>
        <div style={{ fontSize: 14, color: C.textMid, marginTop: 6 }}>{info.sub}</div>
        <div style={{ background: C.bg, padding: "10px 16px", borderRadius: 8, display: "inline-block", marginTop: 18, fontFamily: "monospace", fontSize: 12, color: C.text }}>
          Código: <strong>{codigo}</strong>
        </div>
        <div style={{ fontSize: 11, color: C.textLight, marginTop: 16 }}>
          Esta página se actualiza automáticamente cuando cambia el estado.
        </div>
      </div>
    </Shell>
  );
}

function Shell({ area, children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 0 }}>
      <div style={{ background: C.primary, color: "#fff", padding: "20px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>Atolón Beach Club</div>
        {area && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{area.nombre}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{TIPO_LABEL[area.tipo] || "Área"}</div>
          </>
        )}
      </div>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: 16 }}>
        {children}
      </div>
    </div>
  );
}

const qtyBtn = {
  width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${C.primary}`,
  background: "white", color: C.primary, fontSize: 18, fontWeight: 700,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};
const qtyBtnSm = { ...qtyBtn, width: 30, height: 30, fontSize: 16 };
const addBtn = {
  background: C.primary, color: "#fff", border: "none", borderRadius: 8,
  padding: "10px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
  whiteSpace: "nowrap",
};

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "8px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700,
        border: `1px solid ${active ? C.primary : C.border}`,
        background: active ? C.primary : "white",
        color: active ? "#fff" : C.text, cursor: "pointer", whiteSpace: "nowrap",
      }}>
      {label}
    </button>
  );
}
