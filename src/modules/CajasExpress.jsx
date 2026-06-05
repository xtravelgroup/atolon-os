// CajasExpress — App mobile-first para cajeros del evento.
// Flujo: PIN entry → grid de productos → carrito → cobrar efectivo/tarjeta
// → envía orden a Loggro vía edge function existente loggro-sync/create-order.
//
// URL pública: /cajas
// Datos:
//   - cajas_evento_cajeros (auth PIN)
//   - cajas_evento_cajas (asigna mesa Loggro)
//   - cajas_evento_ventas (log de cada venta)
//   - items_catalogo (productos con evento_caja_visible=true)

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const COP = n => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;

// Paleta tema "Día" Atolón — background arena (B.sand), texto navy,
// botones navy con acentos sand. Coherente con la marca.
const C = {
  bg:      "#C8B99A",                  // arena (B.sand)
  bgCard:  "#FFFFFF",                  // tarjetas blancas sobre arena
  bgSoft:  "#F4EBD8",                  // cream para áreas grandes
  text:    "#0D1B3E",                  // navy (B.navy)
  textMid: "rgba(13,27,62,0.65)",
  textLow: "rgba(13,27,62,0.40)",
  border:  "rgba(13,27,62,0.18)",
  navy:    "#0D1B3E",
  navyMid: "#152650",
  sand:    "#C8B99A",
  cream:   "#F4EBD8",
  red:     "#D64545",                  // B.danger
  green:   "#4CAF7D",                  // B.success
  amber:   "#E8A020",                  // B.warning
  gold:    "#0D1B3E",                  // legacy alias → navy
};

const STORAGE_KEY = "cajas_express_session_v1";

export default function CajasExpress() {
  const [sesion, setSesion] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const persist = (s) => {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else   sessionStorage.removeItem(STORAGE_KEY);
    setSesion(s);
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      WebkitTapHighlightColor: "transparent",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.97); }
      `}</style>
      {sesion ? <CajaScreen sesion={sesion} onLogout={() => persist(null)} />
              : <PinScreen onAuth={persist} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PIN SCREEN
// ──────────────────────────────────────────────────────────────────────
function PinScreen({ onAuth }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cajas, setCajas] = useState([]);
  const [selectedCaja, setSelectedCaja] = useState(() => {
    try { return localStorage.getItem("caja_express_id") || ""; } catch { return ""; }
  });
  // Modo registro: cuando el PIN no existe, pasamos a esta vista para
  // capturar el nombre del cajero y crear el cajero on-the-fly.
  const [registro, setRegistro] = useState(null); // null | { pin, nombre }

  useEffect(() => {
    if (!supabase) return;
    supabase.from("cajas_evento_cajas")
      .select("id, nombre, loggro_mesa_id")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setCajas(data || []));
  }, []);

  const enterAs = (cajero) => {
    try { localStorage.setItem("caja_express_id", selectedCaja); } catch {}
    const cajaObj = cajas.find(c => c.id === selectedCaja);
    onAuth({
      cajero_id: cajero.id, cajero_nombre: cajero.nombre, loggro_seller_id: cajero.loggro_seller_id,
      caja_id: cajaObj?.id, caja_nombre: cajaObj?.nombre, loggro_mesa_id: cajaObj?.loggro_mesa_id,
      started_at: new Date().toISOString(),
    });
  };

  // Intento login con PIN. Si no existe, abre formulario de registro
  // pre-llenado con el PIN escogido (no obliga al usuario a re-tipear).
  const tryLogin = async (fullPin) => {
    if (!selectedCaja) { setError("Selecciona la caja"); return; }
    if (fullPin.length < 4) return;
    setBusy(true);
    setError("");
    const { data } = await supabase.from("cajas_evento_cajeros")
      .select("id, nombre, loggro_seller_id")
      .eq("pin", fullPin)
      .eq("activo", true)
      .maybeSingle();
    setBusy(false);
    if (data) {
      enterAs(data);
      return;
    }
    // PIN nuevo → modo registro
    setRegistro({ pin: fullPin, nombre: "" });
    setPin("");
  };

  // Crea el cajero con el nombre + PIN escogidos y entra.
  const guardarRegistro = async () => {
    const nombre = (registro?.nombre || "").trim();
    if (!nombre) { setError("Pon tu nombre"); return; }
    if (nombre.length < 2) { setError("Nombre muy corto"); return; }
    setBusy(true);
    setError("");
    const id = `CAJERO-${Date.now()}`;
    const { data, error: insErr } = await supabase.from("cajas_evento_cajeros").insert({
      id, nombre, pin: registro.pin, activo: true,
    }).select().single();
    setBusy(false);
    if (insErr) {
      if (insErr.code === "23505") setError("Ese PIN ya fue usado por otro cajero");
      else setError(insErr.message);
      return;
    }
    enterAs(data);
  };

  const pressKey = (k) => {
    if (busy || registro) return;
    setError("");
    if (k === "del") { setPin(p => p.slice(0, -1)); return; }
    setPin(p => {
      const next = (p + k).slice(0, 6);
      if (next.length >= 4) tryLogin(next);
      return next;
    });
  };

  return (
    <div style={{ padding: "32px 20px", maxWidth: 380, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "0.04em", color: C.gold }}>
          ATOLÓN · CAJAS
        </div>
        <div style={{ fontSize: 12, letterSpacing: "0.2em", color: C.textLow, fontWeight: 600, marginTop: 4 }}>
          PUNTO DE VENTA EXPRESS
        </div>
      </div>

      {/* Selector de caja */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 8 }}>
          CAJA
        </div>
        <select value={selectedCaja} onChange={e => { setSelectedCaja(e.target.value); setError(""); }}
          style={{
            width: "100%", padding: "16px 16px", fontSize: 18, fontWeight: 700,
            background: C.bgCard, border: `2px solid ${C.border}`, borderRadius: 10,
            color: C.text, outline: "none", appearance: "none",
            backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M5 8l5 5 5-5z' fill='%230D1B3E66'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", backgroundSize: "20px",
            paddingRight: 40,
          }}>
          <option value="">Selecciona caja…</option>
          {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Modo registro: pide nombre cuando el PIN es nuevo */}
      {registro ? (
        <div style={{
          background: C.bgCard, border: `2px solid ${C.gold}`, borderRadius: 12,
          padding: "22px 20px", marginBottom: 18,
        }}>
          <div style={{ fontSize: 11, color: C.gold, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 6, textAlign: "center" }}>
            👋 PRIMERA VEZ
          </div>
          <div style={{ fontSize: 14, color: C.textMid, marginBottom: 18, textAlign: "center", lineHeight: 1.4 }}>
            Tu PIN <strong style={{ color: C.gold, letterSpacing: "0.15em" }}>{registro.pin}</strong> queda guardado.<br/>
            ¿Cómo te llamas?
          </div>
          <input value={registro.nombre} autoFocus
            onChange={e => { setRegistro(r => ({ ...r, nombre: e.target.value })); setError(""); }}
            onKeyDown={e => e.key === "Enter" && guardarRegistro()}
            placeholder="Nombre y apellido"
            style={{
              width: "100%", padding: "14px 16px", fontSize: 16,
              background: C.bgCard, border: `2px solid ${error ? C.red : C.border}`, borderRadius: 10,
              color: C.text, outline: "none", boxSizing: "border-box", fontWeight: 600,
            }} />
          {error && <div style={{ marginTop: 10, fontSize: 13, color: C.red, fontWeight: 700 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <button onClick={() => { setRegistro(null); setError(""); }} disabled={busy}
              style={{
                padding: "14px", background: "none", color: C.textMid,
                border: `1.5px solid ${C.border}`, borderRadius: 10,
                fontSize: 13, cursor: "pointer", fontWeight: 600,
              }}>← Volver</button>
            <button onClick={guardarRegistro} disabled={busy}
              style={{
                padding: "14px", background: C.gold, color: "#fff",
                border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 900, letterSpacing: "0.06em",
                cursor: "pointer", opacity: busy ? 0.6 : 1,
              }}>{busy ? "..." : "ENTRAR →"}</button>
          </div>
        </div>
      ) : (
        <>
          {/* PIN display */}
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "20px", marginBottom: 18, textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 10 }}>
              TU PIN
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: "0.5em", color: C.gold, height: 44, lineHeight: 1.1 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} style={{ display: "inline-block", width: 16, opacity: i < pin.length ? 1 : 0.18 }}>•</span>
              ))}
            </div>
            {error && (
              <div style={{ marginTop: 10, fontSize: 13, color: C.red, fontWeight: 700 }}>{error}</div>
            )}
            <div style={{ marginTop: 10, fontSize: 11, color: C.textLow }}>
              4 a 6 dígitos · Primera vez te pedimos tu nombre
            </div>
          </div>

          {/* Keypad */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {["1","2","3","4","5","6","7","8","9","","0","del"].map((k, i) =>
              k === "" ? <div key={i} /> : (
                <button key={i} onClick={() => pressKey(k)} disabled={busy}
                  style={{
                    aspectRatio: "1.5/1", background: k === "del" ? C.bgCard : "#fff",
                    border: `1px solid ${C.border}`, borderRadius: 12,
                    color: C.text, fontSize: 28, fontWeight: 800,
                    cursor: "pointer", transition: "transform 0.05s, background 0.1s",
                    touchAction: "manipulation",
                  }}>
                  {k === "del" ? "⌫" : k}
                </button>
              )
            )}
          </div>
        </>
      )}

      <div style={{ fontSize: 10, color: C.textLow, marginTop: 22, textAlign: "center", letterSpacing: "0.15em" }}>
        ATOLON BEACH CLUB
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CAJA SCREEN (grid + carrito + cobrar)
// ──────────────────────────────────────────────────────────────────────
function CajaScreen({ sesion, onLogout }) {
  // vista: null = home con 3 opciones · "comida" · "bebida" · "cierre"
  const [vista, setVista] = useState(null);
  const [productos, setProductos] = useState([]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [pagandoCon, setPagandoCon] = useState(null); // null | "efectivo" | "tarjeta"
  const [exito, setExito] = useState(null); // { ventaId, total, metodo }

  // Carga el menú propio del evento (cajas_evento_menu) — desacoplado de
  // items_catalogo. Subcategorías custom: Barco, Entradas, Pizzas, Grill, Sides
  // para comida; las que el equipo configure para bebida.
  useEffect(() => {
    if (!supabase) return;
    supabase.from("cajas_evento_menu")
      .select("id, tipo, subcategoria, nombre, precio, loggro_id, orden")
      .eq("activo", true)
      .order("tipo")
      .order("subcategoria")
      .order("orden")
      .order("nombre")
      .then(({ data }) => {
        // Adaptamos al shape que usa el grid (mantiene compatibilidad con
        // el resto del código que esperaba `evento_caja_precio` y `categoria`).
        const adapted = (data || []).map(m => ({
          id: m.id,
          nombre: m.nombre,
          categoria: m.subcategoria,
          tipo: m.tipo, // "comida" | "bebida" — filtra el grid según la vista
          evento_caja_precio: m.precio,
          loggro_id: m.loggro_id || null,
        }));
        setProductos(adapted);
        setLoading(false);
      });
  }, []);

  const addItem = (p) => {
    setCart(c => ({ ...c, [p.id]: { producto: p, cantidad: (c[p.id]?.cantidad || 0) + 1 } }));
  };
  const removeItem = (id) => {
    setCart(c => {
      const item = c[id];
      if (!item) return c;
      const next = { ...c };
      if (item.cantidad <= 1) delete next[id];
      else next[id] = { ...item, cantidad: item.cantidad - 1 };
      return next;
    });
  };
  const clearCart = () => setCart({});

  const cartItems = Object.values(cart);
  const subtotal = cartItems.reduce(
    (s, it) => s + (Number(it.producto.evento_caja_precio) || 0) * it.cantidad, 0
  );
  const [propinaActiva, setPropinaActiva] = useState(false);
  const propinaPct = 0.10;
  const propinaMonto = propinaActiva ? Math.round(subtotal * propinaPct) : 0;
  const total = subtotal + propinaMonto;
  const cartCount = cartItems.reduce((s, it) => s + it.cantidad, 0);
  // Modal de efectivo (selección de billete / USD)
  const [modalEfectivo, setModalEfectivo] = useState(false);

  // ── Cobrar (envía a Loggro + guarda en BD) ──
  // pagoDetalle (opcional, solo efectivo): { moneda, monto, monto_cop, tasa_cambio, cambio_cop }
  async function cobrar(metodo, pagoDetalle = null) {
    if (cartItems.length === 0 || pagandoCon) return;
    setPagandoCon(metodo);
    const ventaId = `VTE-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const items = cartItems.map(it => ({
      id: it.producto.id,
      loggro_id: it.producto.loggro_id || null,
      nombre: it.producto.nombre,
      precio: Number(it.producto.evento_caja_precio) || 0,
      cantidad: it.cantidad,
      subtotal: (Number(it.producto.evento_caja_precio) || 0) * it.cantidad,
    }));
    const payload = {
      id: ventaId,
      caja_id: sesion.caja_id,
      cajero_id: sesion.cajero_id,
      cajero_nombre: sesion.cajero_nombre,
      items,
      subtotal,
      propina: propinaMonto,
      total,
      metodo_pago: metodo,
      pago_recibido: pagoDetalle || {},
    };
    const { error: insErr } = await supabase.from("cajas_evento_ventas").insert(payload);
    if (insErr) {
      setPagandoCon(null);
      alert("Error guardando venta: " + insErr.message);
      return;
    }

    // Enviar a Loggro (fire-and-forget — si falla, queda registrada localmente
    // y se reintenta luego). El edge function loggro-sync/create-order ya existe
    // y maneja el create-invoice + pago.
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/create-order`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          mesa_id: sesion.loggro_mesa_id,
          seller_id: sesion.loggro_seller_id || null,
          items: items.filter(i => i.loggro_id).map(i => ({
            id: i.loggro_id, name: i.nombre, price: i.precio, quantity: i.cantidad,
          })),
          payment_method: metodo === "efectivo" ? "cash" : "card",
          reference: ventaId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && !data.error;
      await supabase.from("cajas_evento_ventas").update({
        loggro_estado: ok ? "sent" : "failed",
        loggro_order_id: data.order_id || data.id || null,
        loggro_response: data,
        loggro_error: ok ? null : (data.error || `HTTP ${res.status}`),
        updated_at: new Date().toISOString(),
      }).eq("id", ventaId);
    } catch (e) {
      console.error("[caja/loggro]", e);
      supabase.from("cajas_evento_ventas").update({
        loggro_estado: "failed",
        loggro_error: e.message || String(e),
        updated_at: new Date().toISOString(),
      }).eq("id", ventaId).then(() => {});
    }

    setExito({
      ventaId, total, metodo, propina: propinaMonto, pago: pagoDetalle,
      items, when: new Date().toISOString(),
    });
    clearCart();
    setPropinaActiva(false);
    setPagandoCon(null);
    setModalEfectivo(false);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.textMid }}>Cargando…</div>;

  if (exito) return (
    <ExitoScreen exito={exito} sesion={sesion} onContinuar={() => setExito(null)} />
  );

  // Filtra productos según vista (comida o bebida). En home no se usa.
  const productosFiltrados = productos.filter(p => p.tipo === vista);

  return (
    <div style={{ paddingBottom: cartCount > 0 && (vista === "comida" || vista === "bebida") ? 120 : 0 }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: C.bg, borderBottom: `1px solid ${C.border}`,
        padding: "12px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
      }}>
        {vista ? (
          <button onClick={() => { setVista(null); }}
            style={{
              background: "none", border: "none", color: C.text,
              fontSize: 14, fontWeight: 700, cursor: "pointer", padding: 6,
            }}>← Inicio</button>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700 }}>
              {sesion.caja_nombre}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{sesion.cajero_nombre}</div>
          </div>
        )}
        <div style={{ flex: 1, textAlign: "center" }}>
          {vista === "comida" && <span style={{ fontWeight: 800, letterSpacing: "0.06em" }}>🍔 COMIDA</span>}
          {vista === "bebida" && <span style={{ fontWeight: 800, letterSpacing: "0.06em" }}>🍺 BEBIDA</span>}
          {vista === "cierre" && <span style={{ fontWeight: 800, letterSpacing: "0.06em" }}>📊 CIERRE</span>}
        </div>
        <button onClick={() => { if (confirm("¿Cerrar sesión del cajero?")) onLogout(); }}
          style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 14px", color: C.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Salir</button>
      </div>

      {/* Vista Home con 3 opciones */}
      {!vista && (
        <HomeOpciones onSelect={setVista} cart={cart} />
      )}

      {/* Vista Comida / Bebida (grid) */}
      {(vista === "comida" || vista === "bebida") && (
        <div style={{ padding: 12 }}>
          {productosFiltrados.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textLow }}>
              No hay productos configurados aún en {vista}.<br />
              Pídele al admin que los agregue.
            </div>
          ) : (
            <ProductosGrid productos={productosFiltrados} cart={cart} onAdd={addItem} onRemove={removeItem} />
          )}
        </div>
      )}

      {/* Vista Cierre de Caja */}
      {vista === "cierre" && (
        <CierreCajaScreen sesion={sesion} onLogout={onLogout} />
      )}

      {/* Carrito fijo abajo (solo en grids de comida/bebida) */}
      {cartCount > 0 && (vista === "comida" || vista === "bebida") && (
        <CarritoBar items={cartItems}
          subtotal={subtotal} propinaActiva={propinaActiva} propinaMonto={propinaMonto}
          onTogglePropina={() => setPropinaActiva(p => !p)}
          total={total} count={cartCount}
          onCobrarEfectivo={() => setModalEfectivo(true)}
          onCobrarTarjeta={() => cobrar("tarjeta")}
          onClear={clearCart}
          pagandoCon={pagandoCon} />
      )}

      {/* Modal de efectivo: COP/USD + selección de billete + cambio */}
      {modalEfectivo && (
        <ModalEfectivo total={total}
          onClose={() => setModalEfectivo(false)}
          onConfirmar={(detalle) => cobrar("efectivo", detalle)}
          pagandoCon={pagandoCon} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// HOME: 3 opciones grandes
// ──────────────────────────────────────────────────────────────────────
function HomeOpciones({ onSelect, cart }) {
  const cartCount = Object.values(cart).reduce((s, it) => s + it.cantidad, 0);
  const opciones = [
    { key: "comida",  icon: "🍔", label: "COMIDA",         desc: "Barco · Entradas · Pizzas · Grill · Sides", color: C.green },
    { key: "bebida",  icon: "🍺", label: "BEBIDA",         desc: "Cervezas · Cocteles · Licores",            color: C.amber },
    { key: "cierre",  icon: "📊", label: "CIERRE DE CAJA", desc: "Resumen del turno + cerrar sesión",        color: C.navy },
  ];
  return (
    <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto" }}>
      {cartCount > 0 && (
        <div style={{
          background: C.cream, border: `1.5px solid ${C.text}`, borderRadius: 10,
          padding: "12px 16px", marginBottom: 18, textAlign: "center",
        }}>
          <div style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>
            🛒 Tienes {cartCount} {cartCount === 1 ? "ítem" : "ítems"} en el carrito
          </div>
          <div style={{ fontSize: 11, color: C.textLow, marginTop: 2 }}>
            Vuelve a Comida o Bebida para seguir o cobrar
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: 14 }}>
        {opciones.map(o => (
          <button key={o.key} onClick={() => onSelect(o.key)}
            style={{
              background: C.bgCard,
              border: `2px solid ${C.border}`,
              borderLeft: `8px solid ${o.color}`,
              borderRadius: 14, padding: "22px 18px",
              cursor: "pointer", textAlign: "left", color: C.text,
              display: "flex", alignItems: "center", gap: 16,
              touchAction: "manipulation",
            }}>
            <div style={{ fontSize: 44, lineHeight: 1 }}>{o.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.05em" }}>
                {o.label}
              </div>
              <div style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>{o.desc}</div>
            </div>
            <div style={{ fontSize: 24, color: C.textLow }}>→</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CIERRE DE CAJA
// ──────────────────────────────────────────────────────────────────────
function CierreCajaScreen({ sesion, onLogout }) {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("cajas_evento_ventas")
      .select("id, total, metodo_pago, items, created_at, estado")
      .eq("cajero_id", sesion.cajero_id)
      .eq("caja_id", sesion.caja_id)
      .gte("created_at", sesion.started_at)
      .neq("estado", "anulada")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setVentas(data || []);
        setLoading(false);
      });
  }, [sesion]);

  const totales = useMemo(() => {
    const t = { count: 0, total: 0, efectivo: 0, tarjeta: 0, items: 0 };
    ventas.forEach(v => {
      t.count++;
      t.total += Number(v.total) || 0;
      if (v.metodo_pago === "efectivo") t.efectivo += Number(v.total) || 0;
      if (v.metodo_pago === "tarjeta")  t.tarjeta  += Number(v.total) || 0;
      t.items += (v.items || []).reduce((s, i) => s + (i.cantidad || 0), 0);
    });
    return t;
  }, [ventas]);

  const cerrar = () => {
    if (!confirm(`¿Cerrar tu turno?\n\n${totales.count} ventas · ${totales.items} ítems\nTotal: $${Math.round(totales.total).toLocaleString("es-CO")}`)) return;
    setConfirmando(true);
    setTimeout(() => onLogout(), 300);
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.textMid }}>Cargando ventas…</div>;

  return (
    <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>
      {/* Resumen */}
      <div style={{
        background: C.bgCard, border: `2px solid ${C.text}`, borderRadius: 12,
        padding: "18px 20px", marginBottom: 18,
      }}>
        <div style={{ fontSize: 10, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 4 }}>
          RESUMEN DE TU TURNO
        </div>
        <div style={{ fontSize: 13, color: C.textMid, marginBottom: 14 }}>
          {sesion.cajero_nombre} · {sesion.caja_nombre}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <RowKpi label="Ventas" valor={totales.count} />
          <RowKpi label="Ítems vendidos" valor={totales.items} />
          <RowKpi label="💵 Efectivo" valor={COP(totales.efectivo)} color={C.green} />
          <RowKpi label="💳 Tarjeta" valor={COP(totales.tarjeta)} color={C.amber} />
          <div style={{ borderTop: `2px solid ${C.text}`, paddingTop: 10, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: "0.06em" }}>TOTAL</span>
              <span style={{ fontWeight: 900, fontSize: 26, color: C.text }}>{COP(totales.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de ventas del turno */}
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 14, marginBottom: 18,
      }}>
        <div style={{ fontSize: 10, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 10 }}>
          VENTAS ({ventas.length})
        </div>
        {ventas.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: C.textLow, fontSize: 13 }}>
            Aún no has hecho ninguna venta en este turno.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {ventas.map(v => (
              <div key={v.id} style={{
                padding: "8px 10px", background: C.bgSoft, borderRadius: 6,
                display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, fontSize: 12,
              }}>
                <span style={{ fontFamily: "monospace", color: C.textMid }}>
                  {new Date(v.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span>{v.metodo_pago === "efectivo" ? "💵" : "💳"} {(v.items || []).length} ítem{(v.items || []).length !== 1 ? "s" : ""}</span>
                <span style={{ fontWeight: 700 }}>{COP(v.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={cerrar} disabled={confirmando}
        style={{
          width: "100%", padding: "18px", background: C.red, color: "#fff",
          border: "none", borderRadius: 12, fontSize: 15, fontWeight: 900,
          letterSpacing: "0.1em", cursor: confirmando ? "wait" : "pointer",
          opacity: confirmando ? 0.6 : 1,
        }}>
        {confirmando ? "CERRANDO…" : "🔒 CONFIRMAR CIERRE DE TURNO"}
      </button>
      <div style={{ fontSize: 11, color: C.textLow, marginTop: 10, textAlign: "center" }}>
        Al cerrar saldrás de la caja y la próxima persona deberá ingresar su PIN
      </div>
    </div>
  );
}

function RowKpi({ label, valor, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
      <span style={{ color: C.textMid }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || C.text }}>{valor}</span>
    </div>
  );
}

function ProductosGrid({ productos, cart, onAdd, onRemove }) {
  // Agrupar por categoría
  const grupos = useMemo(() => {
    const g = {};
    productos.forEach(p => {
      const cat = p.categoria || "OTROS";
      if (!g[cat]) g[cat] = [];
      g[cat].push(p);
    });
    return g;
  }, [productos]);

  return (
    <div>
      {Object.entries(grupos).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, letterSpacing: "0.2em", color: C.gold, fontWeight: 700,
            padding: "4px 4px 10px",
          }}>
            {cat}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {items.map(p => {
              const cantidad = cart[p.id]?.cantidad || 0;
              return (
                <button key={p.id} onClick={() => onAdd(p)}
                  style={{
                    background: cantidad > 0 ? C.red + "33" : C.bgCard,
                    border: `2px solid ${cantidad > 0 ? C.red : C.border}`,
                    borderRadius: 12, padding: "14px 12px",
                    textAlign: "left", cursor: "pointer", color: C.text,
                    minHeight: 110, display: "flex", flexDirection: "column", justifyContent: "space-between",
                    position: "relative", touchAction: "manipulation",
                  }}>
                  {cantidad > 0 && (
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      background: C.red, color: "#fff",
                      borderRadius: "50%", width: 28, height: 28,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: 14,
                    }}>{cantidad}</div>
                  )}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>
                      {p.nombre}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C.gold }}>
                      {COP(p.evento_caja_precio)}
                    </div>
                    {cantidad > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); onRemove(p.id); }}
                        style={{
                          background: C.cream, border: `1px solid ${C.red}`,
                          color: C.red, borderRadius: 8, width: 32, height: 32,
                          fontSize: 18, fontWeight: 900, cursor: "pointer",
                        }}>−</button>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CarritoBar({
  items, subtotal, propinaActiva, propinaMonto, onTogglePropina,
  total, count, onCobrarEfectivo, onCobrarTarjeta, onClear, pagandoCon,
}) {
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30,
      background: C.navy, borderTop: `2px solid ${C.sand}`,
      padding: "12px 14px 18px",
      boxShadow: "0 -10px 30px rgba(0,0,0,0.3)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", letterSpacing: "0.12em", fontWeight: 700 }}>
            {count} {count === 1 ? "ÍTEM" : "ÍTEMS"}{propinaActiva ? ` · +10% propina` : ""}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.sand }}>{COP(total)}</div>
          {propinaActiva && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              Subtotal {COP(subtotal)} + propina {COP(propinaMonto)}
            </div>
          )}
        </div>
        <button onClick={onClear} disabled={!!pagandoCon}
          style={{
            background: "none", border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 8,
            padding: "8px 14px", color: "rgba(255,255,255,0.7)", fontSize: 12, cursor: "pointer",
            opacity: pagandoCon ? 0.5 : 1,
          }}>Limpiar</button>
      </div>

      {/* Toggle propina */}
      <button onClick={onTogglePropina} disabled={!!pagandoCon}
        style={{
          width: "100%", padding: "10px 12px", marginBottom: 10,
          background: propinaActiva ? C.sand : "transparent",
          color: propinaActiva ? C.navy : "rgba(255,255,255,0.85)",
          border: `1.5px solid ${propinaActiva ? C.sand : "rgba(255,255,255,0.25)"}`,
          borderRadius: 10, fontSize: 13, fontWeight: 800,
          cursor: pagandoCon ? "not-allowed" : "pointer",
          letterSpacing: "0.06em",
        }}>
        {propinaActiva ? `✓ PROPINA 10% (${COP(propinaMonto)})` : "+ AGREGAR PROPINA 10%"}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={onCobrarEfectivo} disabled={!!pagandoCon}
          style={{
            background: C.green, color: "#fff", border: "none", borderRadius: 12,
            padding: "16px 12px", fontSize: 14, fontWeight: 900, cursor: "pointer",
            letterSpacing: "0.06em", opacity: pagandoCon === "efectivo" ? 0.6 : 1,
          }}>
          {pagandoCon === "efectivo" ? "PROCESANDO…" : "💵 EFECTIVO"}
        </button>
        <button onClick={onCobrarTarjeta} disabled={!!pagandoCon}
          style={{
            background: C.amber, color: "#fff", border: "none", borderRadius: 12,
            padding: "16px 12px", fontSize: 14, fontWeight: 900, cursor: "pointer",
            letterSpacing: "0.06em", opacity: pagandoCon === "tarjeta" ? 0.6 : 1,
          }}>
          {pagandoCon === "tarjeta" ? "PROCESANDO…" : "💳 TARJETA"}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MODAL DE EFECTIVO — selección billete COP o USD + cálculo de cambio
// ──────────────────────────────────────────────────────────────────────
const TRM_USD = 3400; // pesos por dólar — fijado por la administración
const BILLETES_COP = [10000, 20000, 50000, 100000];

function ModalEfectivo({ total, onClose, onConfirmar, pagandoCon }) {
  const [moneda, setMoneda] = useState("COP"); // COP | USD
  const [monto, setMonto] = useState("");      // string editable

  const montoNum = Number(monto) || 0;
  const montoCop = moneda === "USD" ? Math.round(montoNum * TRM_USD) : montoNum;
  const cambio = montoCop - total;
  const faltante = total - montoCop;

  const confirmar = () => {
    if (montoCop < total) return;
    onConfirmar({
      moneda,
      monto: montoNum,
      monto_cop: montoCop,
      tasa_cambio: moneda === "USD" ? TRM_USD : 1,
      cambio_cop: Math.max(0, cambio),
    });
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: "fixed", inset: 0, background: "rgba(13,27,62,0.7)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        padding: 20, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 -20px 40px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700 }}>
              TOTAL A COBRAR
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 30, fontWeight: 900, color: C.text }}>
              {COP(total)}
            </div>
            {moneda === "USD" && (
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 800, color: C.green, marginTop: 2 }}>
                ≈ US$ {(total / TRM_USD).toFixed(2)}
                <span style={{ fontSize: 10, color: C.textMid, fontWeight: 500, marginLeft: 8, fontFamily: "inherit" }}>
                  @ {TRM_USD}
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: C.textMid,
            fontSize: 28, cursor: "pointer", padding: 4, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Selector moneda */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { v: "COP", l: "💵 COP", sub: "Pesos colombianos" },
            { v: "USD", l: "💵 USD", sub: `Dólar @ ${TRM_USD}` },
          ].map(o => (
            <button key={o.v} onClick={() => { setMoneda(o.v); setMonto(""); }}
              style={{
                padding: "14px 12px", borderRadius: 10,
                background: moneda === o.v ? C.navy : C.bgCard,
                color: moneda === o.v ? "#fff" : C.text,
                border: `2px solid ${moneda === o.v ? C.navy : C.border}`,
                fontSize: 16, fontWeight: 800, cursor: "pointer",
                textAlign: "center", letterSpacing: "0.04em",
              }}>
              <div>{o.l}</div>
              <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.75, marginTop: 3 }}>{o.sub}</div>
            </button>
          ))}
        </div>

        {/* Quick bills (solo COP) */}
        {moneda === "COP" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700, marginBottom: 8 }}>
              BILLETE RECIBIDO
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {BILLETES_COP.map(b => (
                <button key={b} onClick={() => setMonto(String(b))}
                  style={{
                    padding: "12px 4px", borderRadius: 8,
                    background: montoNum === b ? C.sand : C.bgCard,
                    border: `2px solid ${montoNum === b ? C.text : C.border}`,
                    fontSize: 13, fontWeight: 800, cursor: "pointer",
                    color: C.text,
                  }}>
                  ${(b/1000)}k
                </button>
              ))}
            </div>
            <button onClick={() => setMonto(String(total))}
              style={{
                width: "100%", padding: "10px 12px", marginTop: 8,
                background: "transparent", border: `1.5px dashed ${C.border}`,
                borderRadius: 8, fontSize: 12, color: C.textMid,
                cursor: "pointer", fontWeight: 600,
              }}>
              💯 Monto exacto ({COP(total)})
            </button>
          </div>
        )}

        {/* Monto manual */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700, marginBottom: 6 }}>
            {moneda === "USD" ? "MONTO EN USD" : "O INGRESA OTRO MONTO (COP)"}
          </div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: C.textMid, fontWeight: 700 }}>
              {moneda === "USD" ? "US$" : "$"}
            </span>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
              placeholder="0"
              style={{
                width: "100%", padding: "14px 16px 14px 50px",
                fontSize: 20, fontWeight: 800,
                border: `2px solid ${C.border}`, borderRadius: 10,
                background: C.bgCard, color: C.text, outline: "none", boxSizing: "border-box",
                fontFamily: "monospace",
              }} />
          </div>
          {moneda === "USD" && montoNum > 0 && (
            <div style={{ fontSize: 12, color: C.textMid, marginTop: 6, textAlign: "right" }}>
              = {COP(montoCop)} COP ({montoNum} × {TRM_USD})
            </div>
          )}
        </div>

        {/* Cambio o faltante */}
        {montoNum > 0 && (
          <div style={{
            padding: "14px 18px", borderRadius: 12, marginBottom: 14,
            background: cambio >= 0 ? C.green + "22" : C.red + "22",
            border: `1.5px solid ${cambio >= 0 ? C.green : C.red}`,
          }}>
            {cambio >= 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: C.green, fontWeight: 800, letterSpacing: "0.08em" }}>
                  CAMBIO A ENTREGAR
                </span>
                <span style={{ fontSize: 24, color: C.green, fontWeight: 900, fontFamily: "monospace" }}>
                  {COP(cambio)}
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: C.red, fontWeight: 800, letterSpacing: "0.06em" }}>
                  FALTA
                </span>
                <span style={{ fontSize: 22, color: C.red, fontWeight: 900, fontFamily: "monospace" }}>
                  {COP(faltante)}
                </span>
              </div>
            )}
          </div>
        )}

        <button onClick={confirmar} disabled={!!pagandoCon || montoCop < total}
          style={{
            width: "100%", padding: "18px",
            background: montoCop >= total ? C.green : "#ccc",
            color: "#fff", border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 900, letterSpacing: "0.08em",
            cursor: montoCop >= total ? "pointer" : "not-allowed",
            opacity: pagandoCon ? 0.6 : 1,
          }}>
          {pagandoCon ? "PROCESANDO…" : "✓ CONFIRMAR PAGO"}
        </button>
      </div>
    </div>
  );
}

function ExitoScreen({ exito, sesion, onContinuar }) {
  const printedRef = useRef(false);
  const [printStatus, setPrintStatus] = useState(""); // "" | "ok" | "err"

  // Auto-imprimir tickets al entrar — una sola vez. Si el cajero quiere
  // re-imprimir usa el botón. localStorage "caja_express_noprint" desactiva.
  useEffect(() => {
    if (printedRef.current) return;
    printedRef.current = true;
    const off = (() => {
      try { return localStorage.getItem("caja_express_noprint") === "1"; }
      catch { return false; }
    })();
    if (off) return;
    setTimeout(() => triggerPrint(exito, sesion, setPrintStatus), 200);
  }, [exito, sesion]);

  // Auto-continuar (más tiempo que antes para que la impresión termine)
  useEffect(() => {
    const t = setTimeout(onContinuar, 6500);
    return () => clearTimeout(t);
  }, [onContinuar]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 72, marginBottom: 12 }}>✅</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>VENTA REGISTRADA</div>
      <div style={{ fontSize: 34, fontWeight: 900, color: C.gold, marginBottom: 10 }}>
        {COP(exito.total)}
      </div>
      <div style={{
        fontSize: 11, padding: "4px 12px", background: C.bgCard,
        border: `1px solid ${C.border}`, borderRadius: 20, color: C.textMid,
        letterSpacing: "0.12em", fontWeight: 700, marginBottom: 18,
      }}>
        {exito.metodo === "efectivo" ? "💵 EFECTIVO" : "💳 TARJETA"}
        {" · "}
        {(exito.items || []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0)}
        {" ticket"}
        {(exito.items || []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0) === 1 ? "" : "s"}
      </div>

      {printStatus === "ok" && (
        <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginBottom: 12 }}>
          🖨 Enviando tickets a la impresora…
        </div>
      )}
      {printStatus === "err" && (
        <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginBottom: 12 }}>
          ⚠ No se pudo imprimir. Toca "Reimprimir".
        </div>
      )}

      <div style={{ display: "grid", gap: 10, width: "100%", maxWidth: 320 }}>
        <button onClick={() => triggerPrint(exito, sesion, setPrintStatus)} style={{
          background: C.bgCard, color: C.text,
          border: `2px solid ${C.text}`, borderRadius: 12,
          padding: "14px 22px", fontSize: 14, fontWeight: 900, cursor: "pointer",
          letterSpacing: "0.06em",
        }}>🖨 REIMPRIMIR TICKETS</button>

        <button onClick={onContinuar} style={{
          background: C.gold, color: "#fff", border: "none", borderRadius: 12,
          padding: "16px 22px", fontSize: 15, fontWeight: 900, cursor: "pointer",
          letterSpacing: "0.06em",
        }}>SIGUIENTE VENTA →</button>
      </div>

      <div style={{ fontSize: 10, color: C.textLow, marginTop: 14 }}>
        {exito.ventaId}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// IMPRESIÓN DE TICKETS — DIG-E200I (papel 72mm × 72mm)
// ──────────────────────────────────────────────────────────────────────
// Genera 1 ticket por LÍNEA del carrito (ej: Burger × 3 = 1 papel con
// "BURGER × 3"). Cada ticket es una página de 72×72 mm con el nombre
// del item escalado al ancho del papel (truco SVG textLength) + la
// cantidad debajo. Footer pequeño con caja, cajero, hora y ventaId
// para que cocina rastree.
//
// Implementación: iframe oculto + window.print() del iframe. Funciona
// tanto en iOS como Android — el navegador abre el diálogo del
// sistema y el cajero confirma con la impresora ya pareada (Bluetooth
// o WiFi). El nombre usa SVG con `textLength` + `lengthAdjust` para
// que un "YUCA" se vea igual de grande que un "COCKTAIL CAMARONES".

function triggerPrint(exito, sesion, setStatus) {
  try {
    imprimirTickets({
      items: exito?.items || [],
      ventaId: exito?.ventaId,
      cajaNombre: sesion?.caja_nombre,
      cajeroNombre: sesion?.cajero_nombre,
      cuandoIso: exito?.when,
    });
    setStatus && setStatus("ok");
  } catch (e) {
    console.error("[caja/print]", e);
    setStatus && setStatus("err");
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function imprimirTickets({ items, ventaId, cajaNombre, cajeroNombre, cuandoIso }) {
  if (!items || items.length === 0) return;

  const fecha = new Date(cuandoIso || Date.now());
  const horaTxt = fecha.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  // Expandimos cada línea en N tickets individuales (uno por unidad).
  // Burger × 3 → 3 papeles separados. Cada uno lleva su posición
  // dentro del item (1/3, 2/3, 3/3) y dentro de toda la venta (#3/#7).
  const unidades = [];
  items.forEach((it) => {
    const cant = Math.max(1, Number(it.cantidad) || 1);
    for (let n = 1; n <= cant; n++) {
      unidades.push({
        nombre: String(it.nombre || "").toUpperCase(),
        posLine: n, totalLine: cant,
      });
    }
  });
  const totalGlobal = unidades.length;

  // SVG con textLength="94" + lengthAdjust="spacingAndGlyphs" fuerza
  // al texto a ocupar el ancho completo del viewBox sin importar
  // si la palabra tiene 4 o 18 letras. Resultado: el nombre siempre
  // se ve enorme y ocupa todo el papel.
  const ticketsHtml = unidades.map((u, idx) => {
    const nombre = u.nombre;
    // Si el nombre tiene 2 palabras y es largo, lo partimos en 2 líneas
    // para no perder tamaño visual.
    const palabras = nombre.split(/\s+/);
    const partirEnDos = nombre.length > 11 && palabras.length >= 2;
    let l1 = nombre, l2 = "";
    if (partirEnDos) {
      const mid = Math.ceil(palabras.length / 2);
      l1 = palabras.slice(0, mid).join(" ");
      l2 = palabras.slice(mid).join(" ");
    }

    const renderLinea = (txt, y) => `
      <text x="50" y="${y}" text-anchor="middle"
            font-family="'Arial Black','Helvetica Neue','Helvetica',sans-serif"
            font-weight="900" font-size="22"
            textLength="94" lengthAdjust="spacingAndGlyphs">${escapeHtml(txt)}</text>`;

    const svg = partirEnDos
      ? `<svg class="big" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet">
           ${renderLinea(l1, 22)}
           ${renderLinea(l2, 46)}
         </svg>`
      : `<svg class="big" viewBox="0 0 100 25" preserveAspectRatio="xMidYMid meet">
           ${renderLinea(l1, 20)}
         </svg>`;

    // Sub-posición solo si la línea tenía cantidad > 1 — para 1 unidad
    // sería redundante mostrar "1 / 1".
    const subPos = u.totalLine > 1
      ? `<div class="qty">${u.posLine} / ${u.totalLine}</div>`
      : "";

    return `
      <section class="t">
        <div class="hdr">
          <span>#${idx + 1} / ${totalGlobal}</span>
          <span>${escapeHtml(cajaNombre || "")}</span>
        </div>
        <div class="body">
          ${svg}
          ${subPos}
        </div>
        <div class="ftr">
          <span>${escapeHtml(cajeroNombre || "")}</span>
          <span>${horaTxt}</span>
        </div>
        <div class="vid">${escapeHtml(ventaId || "")}</div>
      </section>
    `;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tickets</title>
<style>
  @page { size: 72mm 72mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: 'Arial Black','Helvetica',sans-serif; }
  .t {
    width: 72mm; height: 72mm;
    padding: 3mm 3mm 2mm;
    display: flex; flex-direction: column;
    page-break-after: always; break-after: page;
    overflow: hidden;
  }
  .t:last-child { page-break-after: auto; break-after: auto; }
  .hdr {
    display: flex; justify-content: space-between;
    font-size: 9pt; font-weight: 800; letter-spacing: 0.04em;
  }
  .body {
    flex: 1;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    gap: 2mm;
  }
  .big { width: 64mm; height: 38mm; display: block; }
  .qty {
    font-size: 28pt; font-weight: 900; letter-spacing: 0.04em;
    margin-top: 1mm;
  }
  .ftr {
    display: flex; justify-content: space-between;
    font-size: 7pt; font-weight: 700; color: #333;
  }
  .vid {
    font-family: monospace; font-size: 6pt; color: #888;
    text-align: center; margin-top: 0.5mm;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>${ticketsHtml}</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = [
    "position:fixed",
    "right:0", "bottom:0",
    "width:80mm", "height:80mm",
    "border:0", "opacity:0", "pointer-events:none",
    "z-index:-1",
  ].join(";");
  document.body.appendChild(iframe);

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch {}
  };

  iframe.onload = () => {
    try {
      const w = iframe.contentWindow;
      w.focus();
      // pequeño delay para asegurar que el SVG renderizó
      setTimeout(() => {
        try { w.print(); } catch (e) { console.error("[caja/print/win]", e); }
        // Limpiar después de que cierre el diálogo (~6s) o si nunca abre
        setTimeout(cleanup, 8000);
      }, 250);
    } catch (e) {
      console.error("[caja/print/load]", e);
      cleanup();
    }
  };

  // srcdoc dispara onload de forma fiable en iOS y Android Chrome
  iframe.srcdoc = html;
}
