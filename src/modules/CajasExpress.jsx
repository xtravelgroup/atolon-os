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

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const COP = n => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;

const C = {
  bg:      "#0A0A0A",
  bgCard:  "#1A1A1A",
  text:    "#FFFFFF",
  textMid: "rgba(255,255,255,0.65)",
  textLow: "rgba(255,255,255,0.40)",
  border:  "#2A2A2A",
  red:     "#E11D2A",
  green:   "#22C55E",
  amber:   "#F59E0B",
  gold:    "#D9A55B",
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
            backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M5 8l5 5 5-5z' fill='%23ffffff66'/%3E%3C/svg%3E\")",
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
              background: "#000", border: `2px solid ${error ? C.red : C.border}`, borderRadius: 10,
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
                padding: "14px", background: C.gold, color: "#000",
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
                    aspectRatio: "1.5/1", background: k === "del" ? C.bgCard : "#222",
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
  const [productos, setProductos] = useState([]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [pagandoCon, setPagandoCon] = useState(null); // null | "efectivo" | "tarjeta"
  const [exito, setExito] = useState(null); // { ventaId, total, metodo }

  useEffect(() => {
    if (!supabase) return;
    supabase.from("items_catalogo")
      .select("id, nombre, categoria, evento_caja_precio, foto_url, loggro_id, codigo, unidad")
      .eq("evento_caja_visible", true)
      .eq("activo", true)
      .order("categoria")
      .order("nombre")
      .then(({ data }) => {
        setProductos(data || []);
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
  const total = cartItems.reduce(
    (s, it) => s + (Number(it.producto.evento_caja_precio) || 0) * it.cantidad, 0
  );
  const cartCount = cartItems.reduce((s, it) => s + it.cantidad, 0);

  // ── Cobrar (envía a Loggro + guarda en BD) ──
  async function cobrar(metodo) {
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
      subtotal: total,
      total,
      metodo_pago: metodo,
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

    setExito({ ventaId, total, metodo });
    clearCart();
    setPagandoCon(null);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.textMid }}>Cargando productos…</div>;

  if (exito) return (
    <ExitoScreen exito={exito} onContinuar={() => setExito(null)} />
  );

  return (
    <div style={{ paddingBottom: cartCount > 0 ? 120 : 0 }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: C.bg, borderBottom: `1px solid ${C.border}`,
        padding: "12px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700 }}>
            {sesion.caja_nombre}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{sesion.cajero_nombre}</div>
        </div>
        <button onClick={() => { if (confirm("¿Cerrar sesión del cajero?")) onLogout(); }}
          style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 14px", color: C.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Salir</button>
      </div>

      {/* Grid de productos */}
      <div style={{ padding: 12 }}>
        {productos.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textLow }}>
            No hay productos configurados.<br />
            Pídele al admin que los agregue en /cajas-admin.
          </div>
        ) : (
          <ProductosGrid productos={productos} cart={cart} onAdd={addItem} onRemove={removeItem} />
        )}
      </div>

      {/* Carrito fijo abajo */}
      {cartCount > 0 && (
        <CarritoBar items={cartItems} total={total} count={cartCount}
          onCobrarEfectivo={() => cobrar("efectivo")}
          onCobrarTarjeta={() => cobrar("tarjeta")}
          onClear={clearCart}
          pagandoCon={pagandoCon} />
      )}
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
                          background: "#000", border: `1px solid ${C.red}`,
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

function CarritoBar({ items, total, count, onCobrarEfectivo, onCobrarTarjeta, onClear, pagandoCon }) {
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30,
      background: "#000", borderTop: `2px solid ${C.gold}`,
      padding: "12px 14px 18px",
      boxShadow: "0 -10px 30px rgba(0,0,0,0.6)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.12em", fontWeight: 700 }}>
            {count} {count === 1 ? "ÍTEM" : "ÍTEMS"}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.gold }}>{COP(total)}</div>
        </div>
        <button onClick={onClear} disabled={!!pagandoCon}
          style={{
            background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 14px", color: C.textMid, fontSize: 12, cursor: "pointer",
            opacity: pagandoCon ? 0.5 : 1,
          }}>Limpiar</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={onCobrarEfectivo} disabled={!!pagandoCon}
          style={{
            background: C.green, color: "#000", border: "none", borderRadius: 12,
            padding: "16px 12px", fontSize: 14, fontWeight: 900, cursor: "pointer",
            letterSpacing: "0.06em", opacity: pagandoCon === "efectivo" ? 0.6 : 1,
          }}>
          {pagandoCon === "efectivo" ? "PROCESANDO…" : "💵 EFECTIVO"}
        </button>
        <button onClick={onCobrarTarjeta} disabled={!!pagandoCon}
          style={{
            background: C.amber, color: "#000", border: "none", borderRadius: 12,
            padding: "16px 12px", fontSize: 14, fontWeight: 900, cursor: "pointer",
            letterSpacing: "0.06em", opacity: pagandoCon === "tarjeta" ? 0.6 : 1,
          }}>
          {pagandoCon === "tarjeta" ? "PROCESANDO…" : "💳 TARJETA"}
        </button>
      </div>
    </div>
  );
}

function ExitoScreen({ exito, onContinuar }) {
  useEffect(() => {
    const t = setTimeout(onContinuar, 2500);
    return () => clearTimeout(t);
  }, [onContinuar]);
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 30, textAlign: "center",
    }}>
      <div style={{ fontSize: 80, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>VENTA REGISTRADA</div>
      <div style={{ fontSize: 36, fontWeight: 900, color: C.gold, marginBottom: 12 }}>
        {COP(exito.total)}
      </div>
      <div style={{
        fontSize: 11, padding: "4px 12px", background: C.bgCard,
        border: `1px solid ${C.border}`, borderRadius: 20, color: C.textMid,
        letterSpacing: "0.12em", fontWeight: 700, marginBottom: 24,
      }}>
        {exito.metodo === "efectivo" ? "💵 EFECTIVO" : "💳 TARJETA"}
      </div>
      <button onClick={onContinuar} style={{
        background: C.gold, color: "#000", border: "none", borderRadius: 12,
        padding: "16px 32px", fontSize: 16, fontWeight: 900, cursor: "pointer",
        letterSpacing: "0.06em",
      }}>SIGUIENTE VENTA →</button>
      <div style={{ fontSize: 10, color: C.textLow, marginTop: 18 }}>
        {exito.ventaId}
      </div>
    </div>
  );
}
