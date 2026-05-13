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
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [carrito, setCart]  = useState([]);
  const [filtroCat, setFC]  = useState("");
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
        supabase.from("menu_items").select("id, nombre, descripcion, precio, categoria, menu_tipo").in("menu_tipo", ["restaurant", "bebidas"]).eq("activo", true),
      ]);
      setArea(a);
      setItems(i || []);
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

  const cats = useMemo(() => {
    const list = Array.from(new Set(items.map(i => i.categoria).filter(Boolean)));
    return list.sort((a, b) => {
      const ra = catRank(a), rb = catRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
  }, [items]);

  const itemsFiltered = useMemo(() => {
    const base = filtroCat ? items.filter(i => i.categoria === filtroCat) : items;
    return [...base].sort((a, b) => {
      const ra = catRank(a.categoria), rb = catRank(b.categoria);
      if (ra !== rb) return ra - rb;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });
  }, [items, filtroCat]);

  const subtotal = carrito.reduce((s, x) => s + x.precio * x.cantidad, 0);

  const add = (it) => setCart(prev => {
    const ex = prev.find(x => x.id === it.id);
    if (ex) return prev.map(x => x.id === it.id ? { ...x, cantidad: x.cantidad + 1 } : x);
    return [...prev, { id: it.id, nombre: it.nombre, precio: it.precio || 0, cantidad: 1, notas: "" }];
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
    const { error } = await supabase.from("pool_service_pedidos").insert({
      codigo,
      area_id:     area.id,
      area_nombre: area.nombre,
      huesped:     huesped || null,
      pax:         Number(pax) || 1,
      items:       carrito,
      subtotal,
      total:       subtotal,
      notas:       notas || null,
      estado:      "recibido",
      creado_por:  "huesped",
    });
    setSaving(false);
    if (error) return alert("Error al enviar el pedido: " + error.message);
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
          {/* Filtros de categoría */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 0 12px 0", marginBottom: 12 }}>
            <Chip label="Todo" active={filtroCat === ""} onClick={() => setFC("")} />
            {cats.map(c => (
              <Chip key={c} label={c} active={filtroCat === c} onClick={() => setFC(c)} />
            ))}
          </div>

          {/* Items */}
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
