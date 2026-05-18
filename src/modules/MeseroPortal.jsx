// MeseroPortal — Portal MÓVIL para meseros (/meseros)
// Login: selecciona nombre (de RH de Loggro habilitados) + PIN.
//   1ª vez: entra con 0000 y configura su clave.
// Luego: elige un spot del floor plan de piscina, arma el pedido del
// menú A&B y lo envía → pool_service_pedidos (spot_id + creado_por) y
// se manda a la mesa de Loggro del spot (con el mesero como seller).
//
// Auth vía RPCs SECURITY DEFINER (mesero_list / mesero_login /
// mesero_set_pin) — empleados_loggro nunca se expone a anon.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#0D1B3E", card: "#16244d", line: "#243358",
  primary: "#2DD4BF", accent: "#C8B99A", text: "#fff",
  textMid: "rgba(255,255,255,0.65)", textLight: "rgba(255,255,255,0.4)",
  success: "#16a34a", danger: "#ef4444",
};
const COP = (n) => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const CAT_ORDER = ["Bebidas", "Cervezas", "Cocteles", "Snacks", "Entradas", "Marinas", "Ensalada", "Ensaladas", "Tacos", "Pizza", "Pizzas", "Especialidades", "Especialidades de la Isla", "Parrilla", "De la Parrilla", "Complementos", "Postres"];
const catRank = (c) => { const i = CAT_ORDER.findIndex(x => x.toLowerCase() === (c || "").toLowerCase()); return i === -1 ? 999 : i; };
const zonaLabel = (z) => (z || "").replace("piscina_derecha", "Piscina Der.").replace("piscina_izquierda", "Piscina Izq.").replace("piscina_central", "Piscina Centro").replace("piscina_", "P. ").replace(/_/g, " ");
const SS_KEY = "atolon_mesero";

export default function MeseroPortal() {
  const [boot, setBoot]   = useState(true);
  const [meseros, setMeseros] = useState([]);
  const [spots, setSpots] = useState([]);
  const [items, setItems] = useState([]);

  // sesión mesero
  const [sel, setSel]     = useState("");        // loggro_id elegido en el dropdown
  const [pin, setPin]     = useState("");
  const [mesero, setMesero] = useState(null);    // { loggro_id, nombre } autenticado
  const [err, setErr]     = useState("");
  const [busy, setBusy]   = useState(false);

  // set-pin
  const [np1, setNp1] = useState("");
  const [np2, setNp2] = useState("");

  // pedido
  const [step, setStep]   = useState("login");   // login | setpin | spots | menu | review | success
  const [spot, setSpot]   = useState(null);
  const [cart, setCart]   = useState([]);
  const [fc, setFc]       = useState("");
  const [notas, setNotas] = useState("");
  const [pax, setPax]     = useState(1);
  const [okCodigo, setOkCodigo] = useState("");
  const [okLoggro, setOkLoggro] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: ml }, { data: sp }, { data: it }] = await Promise.all([
        supabase.rpc("mesero_list"),
        supabase.from("floorplan_spots").select("id, zona, tipo, capacidad, loggro_mesa_id").eq("area", "piscina").eq("activo", true).order("zona").order("orden"),
        supabase.from("menu_items").select("id, nombre, descripcion, precio, categoria, menu_tipo, loggro_id").in("menu_tipo", ["restaurant", "bebidas"]).eq("activo", true),
      ]);
      setMeseros(ml || []);
      setSpots(sp || []);
      setItems(it || []);
      try {
        const s = JSON.parse(sessionStorage.getItem(SS_KEY) || "null");
        if (s?.loggro_id && s?.nombre) { setMesero(s); setStep("spots"); }
      } catch { /* noop */ }
      setBoot(false);
    })();
  }, []);

  const cats = useMemo(() => {
    const l = Array.from(new Set(items.map(i => i.categoria).filter(Boolean)));
    return l.sort((a, b) => (catRank(a) - catRank(b)) || a.localeCompare(b));
  }, [items]);
  const itemsF = useMemo(() => {
    const base = fc ? items.filter(i => i.categoria === fc) : items;
    return [...base].sort((a, b) => (catRank(a.categoria) - catRank(b.categoria)) || (a.nombre || "").localeCompare(b.nombre || ""));
  }, [items, fc]);
  const subtotal = cart.reduce((s, x) => s + x.precio * x.cantidad, 0);

  const spotsByZona = useMemo(() => {
    const m = {};
    spots.forEach(s => { (m[s.zona] = m[s.zona] || []).push(s); });
    return m;
  }, [spots]);

  // ── Auth ──────────────────────────────────────────────────────────────
  const entrar = async () => {
    if (!sel) return setErr("Elige tu nombre");
    if (pin.length < 4) return setErr("Ingresa tu PIN");
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("mesero_login", { p_id: sel, p_pin: pin });
    setBusy(false);
    if (error) return setErr("Error de conexión");
    if (!data?.ok) return setErr(data?.error === "pin_incorrecto" ? "PIN incorrecto" : "No habilitado para el portal");
    if (data.needs_setup) { setStep("setpin"); return; }
    const m = { loggro_id: data.loggro_id, nombre: data.nombre };
    setMesero(m);
    sessionStorage.setItem(SS_KEY, JSON.stringify(m));
    setStep("spots");
  };

  const guardarPin = async () => {
    if (np1.length !== 4 || !/^\d{4}$/.test(np1)) return setErr("El PIN debe ser 4 dígitos");
    if (np1 !== np2) return setErr("Los PIN no coinciden");
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("mesero_set_pin", { p_id: sel, p_current: pin || "0000", p_new: np1 });
    setBusy(false);
    if (error || !data?.ok) return setErr("No se pudo guardar el PIN");
    // re-login con el nuevo
    const { data: lg } = await supabase.rpc("mesero_login", { p_id: sel, p_pin: np1 });
    if (lg?.ok) {
      const m = { loggro_id: lg.loggro_id, nombre: lg.nombre };
      setMesero(m); sessionStorage.setItem(SS_KEY, JSON.stringify(m)); setStep("spots");
    }
  };

  const salir = () => { sessionStorage.removeItem(SS_KEY); setMesero(null); setSel(""); setPin(""); setStep("login"); setCart([]); setSpot(null); };

  // ── Carrito ───────────────────────────────────────────────────────────
  const add = (it) => setCart(p => {
    const e = p.find(x => x.id === it.id);
    if (e) return p.map(x => x.id === it.id ? { ...x, cantidad: x.cantidad + 1 } : x);
    return [...p, { id: it.id, nombre: it.nombre, precio: it.precio || 0, loggro_id: it.loggro_id || null, cantidad: 1, notas: "" }];
  });
  const setQ = (id, c) => { const n = Number(c); if (n <= 0) return setCart(p => p.filter(x => x.id !== id)); setCart(p => p.map(x => x.id === id ? { ...x, cantidad: n } : x)); };

  const enviar = async () => {
    if (cart.length === 0) return alert("Agrega ítems al pedido");
    setBusy(true);
    const codigo = `PS-${Date.now()}`;
    const { data: ins, error } = await supabase.from("pool_service_pedidos").insert({
      codigo,
      spot_id:     spot.id,
      area_nombre: `${spot.id} · ${zonaLabel(spot.zona)}`,
      pax:         Number(pax) || 1,
      items:       cart,
      subtotal,
      total:       subtotal,
      notas:       notas || null,
      estado:      "recibido",
      creado_por:  mesero?.nombre || "mesero",
    }).select().maybeSingle();
    if (error) { setBusy(false); return alert("Error al guardar: " + error.message); }

    // Enviar a la mesa de Loggro del spot (con el mesero como seller)
    let loggroOk = false;
    if (spot.loggro_mesa_id) {
      try {
        const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const lgItems = cart.map(c => ({
          productId: c.loggro_id, qty: c.cantidad,
          unit_price: Number(c.precio) || 0,
          notes: c.notas ? [String(c.notas)] : (notas ? [String(notas)] : []),
        })).filter(i => i.productId);
        if (lgItems.length > 0) {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/create-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
            body: JSON.stringify({
              mesaId:    spot.loggro_mesa_id,
              seller:    mesero?.loggro_id || undefined,
              groupName: `Pool · ${spot.id} · ${mesero?.nombre || ""}`,
              items:     lgItems,
            }),
          });
          const d = await res.json();
          if (d.ok) {
            loggroOk = true;
            const arr = Array.isArray(d.order) ? d.order : [d.order];
            await supabase.from("pool_service_pedidos").update({
              estado: "enviado_loggro", enviado_loggro_at: new Date().toISOString(),
              loggro_order_id: arr[0]?._id || arr[0]?.id || null,
              loggro_group_id: arr[0]?.group || null, loggro_response: d.order,
              updated_at: new Date().toISOString(),
            }).eq("id", ins?.id || codigo);
          }
        }
      } catch { /* el pedido ya quedó guardado; staff puede reenviar */ }
    }
    setBusy(false);
    setOkCodigo(codigo); setOkLoggro(loggroOk); setStep("success");
  };

  const nuevoPedido = () => { setCart([]); setNotas(""); setPax(1); setSpot(null); setStep("spots"); setOkCodigo(""); };

  // ── UI ────────────────────────────────────────────────────────────────
  if (boot) return <Wrap><div style={{ padding: 60, textAlign: "center", color: C.textMid }}>Cargando…</div></Wrap>;

  // Login
  if (step === "login" || step === "setpin") {
    return (
      <Wrap title="Portal Meseros">
        <div style={{ background: C.card, borderRadius: 16, padding: 20, marginTop: 24 }}>
          {step === "login" ? (
            <>
              <Label>Tu nombre</Label>
              <select value={sel} onChange={e => { setSel(e.target.value); setErr(""); }} style={inp}>
                <option value="">— Selecciona —</option>
                {meseros.map(m => <option key={m.loggro_id} value={m.loggro_id}>{m.nombre}</option>)}
              </select>
              <Label style={{ marginTop: 14 }}>PIN</Label>
              <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
                type="tel" inputMode="numeric" placeholder="• • • •" maxLength={4}
                style={{ ...inp, fontSize: 24, letterSpacing: 8, textAlign: "center" }} />
              <div style={{ fontSize: 11, color: C.textLight, marginTop: 6 }}>
                Primera vez: ingresa <strong>0000</strong> y luego crea tu clave.
              </div>
              {err && <Err>{err}</Err>}
              <Btn onClick={entrar} busy={busy}>Entrar</Btn>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Crea tu PIN</div>
              <div style={{ fontSize: 12, color: C.textMid, marginBottom: 14 }}>4 dígitos. Lo usarás para entrar siempre.</div>
              <Label>Nuevo PIN</Label>
              <input value={np1} onChange={e => { setNp1(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
                type="tel" inputMode="numeric" maxLength={4} placeholder="• • • •"
                style={{ ...inp, fontSize: 24, letterSpacing: 8, textAlign: "center" }} />
              <Label style={{ marginTop: 14 }}>Confirmar PIN</Label>
              <input value={np2} onChange={e => { setNp2(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
                type="tel" inputMode="numeric" maxLength={4} placeholder="• • • •"
                style={{ ...inp, fontSize: 24, letterSpacing: 8, textAlign: "center" }} />
              {err && <Err>{err}</Err>}
              <Btn onClick={guardarPin} busy={busy}>Guardar y entrar</Btn>
            </>
          )}
        </div>
      </Wrap>
    );
  }

  // Éxito
  if (step === "success") {
    return (
      <Wrap title={mesero?.nombre}>
        <div style={{ background: C.card, borderRadius: 16, padding: 32, textAlign: "center", marginTop: 24 }}>
          <div style={{ fontSize: 56 }}>{okLoggro ? "✅" : "📥"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginTop: 8 }}>
            {okLoggro ? "Pedido en cocina" : "Pedido guardado"}
          </div>
          <div style={{ fontSize: 13, color: C.textMid, marginTop: 6 }}>
            {okLoggro ? "Enviado a la mesa de Loggro." : "El equipo lo enviará a Loggro."}
          </div>
          <div style={{ display: "inline-block", background: C.bg, padding: "8px 14px", borderRadius: 8, marginTop: 16, fontFamily: "monospace", fontSize: 12, color: C.text }}>
            {okCodigo}
          </div>
          <Btn onClick={nuevoPedido}>+ Nuevo pedido</Btn>
        </div>
      </Wrap>
    );
  }

  // Selección de spot
  if (step === "spots") {
    return (
      <Wrap title={mesero?.nombre} onLogout={salir}>
        <div style={{ fontSize: 13, color: C.textMid, margin: "16px 0 12px" }}>¿En qué cama es el pedido?</div>
        {Object.keys(spotsByZona).sort().map(z => (
          <div key={z} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{zonaLabel(z)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {spotsByZona[z].map(s => (
                <button key={s.id} onClick={() => { setSpot(s); setStep("menu"); }}
                  style={{ background: C.card, border: `1px solid ${s.loggro_mesa_id ? C.line : C.danger}`, color: C.text, borderRadius: 12, padding: "16px 4px", fontSize: 15, fontWeight: 800, cursor: "pointer", minHeight: 56 }}>
                  {s.id}
                  {!s.loggro_mesa_id && <div style={{ fontSize: 8, color: C.danger, fontWeight: 600 }}>sin mesa</div>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Wrap>
    );
  }

  // Menú / Review
  return (
    <Wrap title={`${spot?.id} · ${mesero?.nombre || ""}`} onBack={step === "menu" ? () => { setSpot(null); setStep("spots"); } : () => setStep("menu")}>
      {step === "menu" && (
        <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 0" }}>
            <Chip label="Todo" active={fc === ""} onClick={() => setFc("")} />
            {cats.map(c => <Chip key={c} label={c} active={fc === c} onClick={() => setFc(c)} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: cart.length ? 90 : 16 }}>
            {itemsF.map(it => {
              const ic = cart.find(c => c.id === it.id);
              return (
                <div key={it.id} style={{ background: C.card, borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: C.textLight, textTransform: "uppercase" }}>{it.categoria || "—"}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{it.nombre}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginTop: 2 }}>{COP(it.precio)}</div>
                  </div>
                  {ic ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => setQ(it.id, ic.cantidad - 1)} style={qbtn}>−</button>
                      <span style={{ fontSize: 16, fontWeight: 800, minWidth: 20, textAlign: "center", color: C.text }}>{ic.cantidad}</span>
                      <button onClick={() => setQ(it.id, ic.cantidad + 1)} style={qbtn}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => add(it)} style={{ background: C.primary, color: C.bg, border: "none", borderRadius: 8, padding: "12px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", minHeight: 44 }}>+ Agregar</button>
                  )}
                </div>
              );
            })}
          </div>
          {cart.length > 0 && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: C.card, borderTop: `1px solid ${C.line}`, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMid }}>{cart.reduce((s, x) => s + x.cantidad, 0)} ítems</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{COP(subtotal)}</div>
              </div>
              <button onClick={() => setStep("review")} style={{ background: C.primary, color: C.bg, border: "none", borderRadius: 12, padding: "14px 22px", fontWeight: 800, fontSize: 15, cursor: "pointer", minHeight: 48 }}>
                Revisar →
              </button>
            </div>
          )}
        </>
      )}

      {step === "review" && (
        <div style={{ paddingBottom: 16 }}>
          <div style={{ background: C.card, borderRadius: 12, padding: 16, margin: "16px 0 12px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>Pedido · {spot?.id}</div>
            {cart.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
                <button onClick={() => setQ(c.id, c.cantidad - 1)} style={qbtn}>−</button>
                <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, color: C.text }}>{c.cantidad}</span>
                <button onClick={() => setQ(c.id, c.cantidad + 1)} style={qbtn}>+</button>
                <div style={{ flex: 1, fontSize: 13, color: C.text }}>{c.nombre}</div>
                <div style={{ fontWeight: 800, color: C.text }}>{COP(c.precio * c.cantidad)}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `2px solid ${C.line}`, marginTop: 6, fontWeight: 800, fontSize: 16, color: C.text }}>
              <span>Total</span><span>{COP(subtotal)}</span>
            </div>
          </div>
          <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <Label>Pax</Label>
            <input type="tel" inputMode="numeric" value={pax} onChange={e => setPax(e.target.value.replace(/\D/g, ""))} style={inp} />
            <Label style={{ marginTop: 12 }}>Notas (opcional)</Label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Sin hielo, alergias, etc."
              style={{ ...inp, minHeight: 70, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("menu")} style={{ flex: 1, background: "transparent", color: C.text, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, fontWeight: 700, cursor: "pointer", minHeight: 52 }}>← Agregar</button>
            <button onClick={enviar} disabled={busy} style={{ flex: 2, background: busy ? C.textLight : C.success, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontWeight: 800, cursor: "pointer", minHeight: 52 }}>
              {busy ? "Enviando…" : `Enviar · ${COP(subtotal)}`}
            </button>
          </div>
        </div>
      )}
    </Wrap>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────
function Wrap({ title, children, onBack, onLogout }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: C.bg, borderBottom: `1px solid ${C.line}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && <button onClick={onBack} style={{ background: "transparent", border: "none", color: C.primary, fontSize: 22, cursor: "pointer", padding: 0 }}>‹</button>}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>Atolón · Meseros</div>
          {title && <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>}
        </div>
        {onLogout && <button onClick={onLogout} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.textMid, fontSize: 11, borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>Salir</button>}
      </div>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>{children}</div>
    </div>
  );
}
const inp = { width: "100%", padding: "14px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 15, background: C.bg, color: C.text, boxSizing: "border-box" };
const qbtn = { width: 38, height: 38, borderRadius: "50%", border: `1.5px solid ${C.primary}`, background: "transparent", color: C.primary, fontSize: 18, fontWeight: 800, cursor: "pointer" };
function Label({ children, style }) { return <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 6, ...style }}>{children}</div>; }
function Err({ children }) { return <div style={{ background: `${C.danger}22`, color: C.danger, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginTop: 12, textAlign: "center" }}>{children}</div>; }
function Btn({ children, onClick, busy }) {
  return <button onClick={onClick} disabled={busy} style={{ width: "100%", marginTop: 18, padding: 16, background: busy ? C.textLight : C.primary, color: C.bg, border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: busy ? "default" : "pointer", minHeight: 54 }}>{busy ? "…" : children}</button>;
}
function Chip({ label, active, onClick }) {
  return <button onClick={onClick} style={{ padding: "9px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: `1px solid ${active ? C.primary : C.line}`, background: active ? C.primary : "transparent", color: active ? C.bg : C.text, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>;
}
