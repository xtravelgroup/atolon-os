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
import PoolFloorPlanPicker from "../components/PoolFloorPlanPicker.jsx";

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
  const [step, setStep]   = useState("login");   // login|setpin|spots|datos|menu|review|success
  const [spot, setSpot]   = useState(null);
  const [cart, setCart]   = useState([]);
  const [fc, setFc]       = useState("");
  const [notas, setNotas] = useState("");
  const [pax, setPax]     = useState(2);
  const [huesped, setHuesped] = useState("");
  const [reservaId, setReservaId] = useState(null);
  const [pasadias, setPasadias] = useState([]); // pasadías de hoy sin mesa asignada
  const [huespedes, setHuespedes] = useState([]); // huéspedes hotel en check-in sin mesa
  const [huespedSel, setHuespedSel] = useState(""); // estancia id elegida en el dropdown
  const [okCodigo, setOkCodigo] = useState("");
  const [okPedidoId, setOkPedidoId] = useState(null); // uuid del pedido para reintentar
  const [reintentando, setReintentando] = useState(false);
  const [okRegistro, setOkRegistro] = useState(false); // se registró mesa sin pedido
  const [modItem, setModItem] = useState(null); // ítem con variantes abierto
  const [okLoggro, setOkLoggro] = useState(false);
  const [loggroErr, setLoggroErr] = useState("");

  useEffect(() => {
    (async () => {
      // El floor plan lo renderiza PoolFloorPlanPicker (mismo de Pool Service),
      // que trae sus propios spots/asignaciones. Aquí solo meseros + menú.
      const hoy = new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).slice(0, 10);
      const [{ data: ml }, { data: it }, { data: rv }, { data: asg }, { data: est }] = await Promise.all([
        supabase.rpc("mesero_list"),
        supabase.from("menu_items").select("id, nombre, descripcion, precio, categoria, menu_tipo, loggro_id, precio_botella, loggro_id_botella, modificadores, variantes").in("menu_tipo", ["restaurant", "bebidas"]).eq("activo", true),
        // NS (no_show) NO aparece: solo confirmado / check_in
        supabase.from("reservas").select("id, nombre, pax, pax_a, pax_n").eq("fecha", hoy).in("estado", ["confirmado", "check_in"]),
        supabase.from("floorplan_asignaciones").select("reserva_id, huesped").eq("fecha", hoy),
        supabase.from("hotel_estancias").select("id, huesped_id, pax_adultos, pax_ninos").eq("estado", "in_house"),
      ]);
      setMeseros(ml || []);
      setItems(it || []);
      const conMesaRes = new Set((asg || []).map(a => a.reserva_id).filter(Boolean));
      const conMesaNom = new Set((asg || []).map(a => (a.huesped || "").trim().toLowerCase()).filter(Boolean));
      setPasadias((rv || [])
        .filter(r => r.nombre && !conMesaRes.has(r.id))
        .map(r => ({ id: r.id, nombre: r.nombre, pax: r.pax || ((r.pax_a || 0) + (r.pax_n || 0)) || 2 }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)));
      // Huéspedes de hotel en check-in (in_house), sin mesa asignada
      const estList = est || [];
      const hids = estList.map(e => e.huesped_id).filter(Boolean);
      let hmap = {};
      if (hids.length > 0) {
        const { data: hs } = await supabase.from("hotel_huespedes").select("id, nombre, apellido").in("id", hids);
        hmap = Object.fromEntries((hs || []).map(h => [h.id, `${h.nombre || ""} ${h.apellido || ""}`.trim()]));
      }
      setHuespedes(estList
        .map(e => ({ id: e.id, nombre: hmap[e.huesped_id] || "", pax: (e.pax_adultos || 0) + (e.pax_ninos || 0) || 2 }))
        .filter(h => h.nombre && !conMesaNom.has(h.nombre.toLowerCase()))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)));
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
  // variante: "trago" usa precio + loggro_id; "botella" usa precio_botella
  // + loggro_id_botella. Cada variante es una línea de carrito distinta.
  const add = (it, variante = "trago") => setCart(p => {
    const key = `${it.id}:${variante}`;
    const e = p.find(x => x.key === key);
    if (e) return p.map(x => x.key === key ? { ...x, cantidad: x.cantidad + 1 } : x);
    const esBot = variante === "botella";
    return [...p, {
      key, id: it.id, variante,
      nombre: it.nombre + (esBot ? " · Botella" : (it.precio_botella > 0 ? " · Trago" : "")),
      precio: (esBot ? it.precio_botella : it.precio) || 0,
      loggro_id: (esBot ? it.loggro_id_botella : it.loggro_id) || null,
      cantidad: 1, notas: "",
    }];
  });
  // Variantes (subProducts de Loggro: Cerveza/Michelada/Clamato) +
  // modificadores (mismo modelo que Room Service). Si hay variante, el
  // precio y loggro_id vienen de ella; los modifiers suman precio_delta.
  const addChoice = (it, variante, mods) => setCart(p => {
    const variKey = variante ? `${variante.loggro_id || variante.nombre}` : "";
    const modsKey = (mods || []).map(m => m.nombre).join("|");
    const key = `${it.id}::${variKey}::${modsKey}`;
    const e = p.find(x => x.key === key);
    if (e) return p.map(x => x.key === key ? { ...x, cantidad: x.cantidad + 1 } : x);
    const delta = (mods || []).reduce((s, m) => s + (Number(m.precio_delta) || 0), 0);
    const baseNombre = variante ? variante.nombre : it.nombre;
    const basePrecio = variante ? Number(variante.precio) || 0 : Number(it.precio) || 0;
    const baseLoggro = variante ? variante.loggro_id : it.loggro_id;
    return [...p, {
      key, id: it.id,
      nombre: baseNombre + ((mods || []).length ? ` (${mods.map(m => m.nombre).join(", ")})` : ""),
      precio: basePrecio + delta,
      loggro_id: baseLoggro || null,
      notas: (mods || []).map(m => `${m.grupo}: ${m.nombre}`).join(" · "),
      cantidad: 1,
    }];
  });
  // Mantener firma vieja para compatibilidad (solo modificadores)
  const addMods = (it, mods) => addChoice(it, null, mods);
  const setQ = (key, c) => { const n = Number(c); if (n <= 0) return setCart(p => p.filter(x => x.key !== key)); setCart(p => p.map(x => x.key === key ? { ...x, cantidad: n } : x)); };
  // Nota por plato: cocina/bar la ve impresa en la comanda. La nota
  // general del pedido funciona como fallback si esta queda vacía.
  const setNotaItem = (key, nota) => setCart(p => p.map(x => x.key === key ? { ...x, notas: nota } : x));

  // Tocar una cama: si ya tiene huésped registrado hoy → directo al menú
  // (no vuelve a pedir nombre/pax). Si no → paso de datos.
  const abrirSpot = async (s) => {
    setSpot(s);
    const hoy = new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).slice(0, 10);
    const { data: asg } = await supabase.from("floorplan_asignaciones")
      .select("huesped, pax, reserva_id").eq("spot_id", s.id).eq("fecha", hoy)
      .not("huesped", "is", null)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (asg?.huesped) {
      setHuesped(asg.huesped); setPax(asg.pax || 1); setReservaId(asg.reserva_id || null);
      setStep("menu");
    } else {
      setStep("datos");
    }
  };

  // Registrar la mesa/huésped en el spot SIN pedir comida (asignación del día).
  // Es lo que hace que el QR de la cama salude por nombre.
  const registrarMesa = async () => {
    if (!String(huesped).trim()) return alert("Indica el nombre");
    if (!spot) return;
    setBusy(true);
    const hoy = new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).slice(0, 10);
    const payload = {
      spot_id: spot.id, fecha: hoy, estado: "ocupada",
      huesped: huesped.trim(), pax: Number(pax) || 1,
      reserva_id: reservaId || null,
      asignado_por: mesero?.nombre || "mesero",
      updated_at: new Date().toISOString(),
    };
    const { data: ex } = await supabase.from("floorplan_asignaciones")
      .select("id").eq("spot_id", spot.id).eq("fecha", hoy)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const { error } = ex
      ? await supabase.from("floorplan_asignaciones").update(payload).eq("id", ex.id)
      : await supabase.from("floorplan_asignaciones").insert({ id: `FPA-${Date.now()}`, ...payload, created_at: new Date().toISOString() });
    setBusy(false);
    if (error) return alert("No se pudo registrar la mesa:\n" + error.message);
    setOkRegistro(true); setOkCodigo(""); setStep("success");
  };

  // Envía un pedido (recién guardado o existente) a Loggro con reintento
  // automático con backoff exponencial. Devuelve { ok, error } y SIEMPRE
  // persiste el resultado en pool_service_pedidos para visibilidad.
  const enviarPedidoALoggro = async ({ pedidoId, codigo, spot, cart, notas, mesero, intentos = 3 }) => {
    const grabarError = async (motivo, extra = {}) => {
      console.error("[MeseroPortal] " + motivo);
      try {
        await supabase.from("pool_service_pedidos").update({
          loggro_response: { error: motivo, attempted_at: new Date().toISOString(), ...extra },
          updated_at: new Date().toISOString(),
        }).eq("id", pedidoId || codigo);
      } catch (_) { /* el mesero verá el mensaje en la UI igual */ }
    };

    if (!spot?.loggro_mesa_id) {
      const msg = `Spot ${spot?.id || "?"} sin loggro_mesa_id configurado. Pedido guardado local, NO enviado a Loggro.`;
      await grabarError(msg);
      return { ok: false, error: msg };
    }

    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const lgItems = cart.map(c => ({
      productId: c.loggro_id, qty: c.cantidad,
      unit_price: Number(c.precio) || 0,
      notes: c.notas ? [String(c.notas)] : (notas ? [String(notas)] : []),
    })).filter(i => i.productId);
    const sinId = cart.length - lgItems.length;

    if (lgItems.length === 0) {
      const msg = "Ningún ítem tiene loggro_id mapeado. Revisa el catálogo en Admin → Loggro.";
      await grabarError(msg);
      return { ok: false, error: msg };
    }

    // Hasta `intentos` intentos con backoff 0s, 2s, 5s. Si todos fallan,
    // graba el último error en loggro_response.
    let ultimoError = "";
    for (let i = 0; i < intentos; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, i === 1 ? 2000 : 5000));
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/create-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
          body: JSON.stringify({
            mesaId:    spot.loggro_mesa_id,
            seller:    mesero?.loggro_id || undefined,
            groupName: `Pool · ${spot.id} · ${mesero?.nombre || ""}`,
            items:     lgItems,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timeoutId);
        const d = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status} sin body JSON` }));
        if (d.ok) {
          const arr = Array.isArray(d.order) ? d.order : [d.order];
          const updPayload = {
            estado: "enviado_loggro", enviado_loggro_at: new Date().toISOString(),
            loggro_order_id: arr[0]?._id || arr[0]?.id || null,
            loggro_group_id: arr[0]?.group || null, loggro_response: d.order,
            updated_at: new Date().toISOString(),
          };
          await supabase.from("pool_service_pedidos").update(updPayload).eq("id", pedidoId || codigo);
          const advertencia = sinId > 0 ? `Advertencia: ${sinId} ítem(s) sin loggro_id se omitieron.` : "";
          return { ok: true, error: advertencia, intentos: i + 1 };
        }
        ultimoError = `Loggro rechazó el pedido: ${d.error || JSON.stringify(d).slice(0, 240)}`;
      } catch (err) {
        clearTimeout(timeoutId);
        ultimoError = err?.name === "AbortError"
          ? `Loggro no respondió en 15s (timeout intento ${i + 1}/${intentos})`
          : `No se pudo contactar a Loggro (intento ${i + 1}/${intentos}): ${err?.message || String(err)}`;
      }
    }
    await grabarError(`${ultimoError}. Pedido guardado local — staff debe reenviar desde Pool Service.`, { intentos });
    return { ok: false, error: ultimoError };
  };

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
      huesped:     huesped || null,
      reserva_id:  reservaId || null,
      estado:      "recibido",
      creado_por:  mesero?.nombre || "mesero",
    }).select().maybeSingle();
    if (error) { setBusy(false); return alert("Error al guardar: " + error.message); }

    const res = await enviarPedidoALoggro({ pedidoId: ins?.id, codigo, spot, cart, notas, mesero });
    setBusy(false);
    setOkRegistro(false);
    setOkCodigo(codigo);
    setOkPedidoId(ins?.id || null);
    setOkLoggro(!!res.ok);
    setLoggroErr(res.error || "");
    setStep("success");
  };

  const reintentar = async () => {
    if (!okPedidoId && !okCodigo) return;
    setReintentando(true);
    const res = await enviarPedidoALoggro({ pedidoId: okPedidoId, codigo: okCodigo, spot, cart, notas, mesero });
    setReintentando(false);
    setOkLoggro(!!res.ok);
    setLoggroErr(res.error || "");
  };

  const nuevoPedido = () => { setCart([]); setNotas(""); setPax(2); setHuesped(""); setReservaId(null); setHuespedSel(""); setSpot(null); setStep("spots"); setOkCodigo(""); setOkRegistro(false); };

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

  // Éxito (o pedido guardado pero NO enviado a Loggro)
  if (step === "success") {
    const huboLoggroErr = !okRegistro && !okLoggro && loggroErr;
    return (
      <Wrap title={mesero?.nombre}>
        <div style={{ background: C.card, borderRadius: 16, padding: 32, textAlign: "center", marginTop: 24 }}>
          <div style={{ fontSize: 56 }}>{okRegistro ? "📝" : (okLoggro ? "✅" : "⚠️")}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginTop: 8 }}>
            {okRegistro ? "Mesa registrada" : (okLoggro ? "Pedido en cocina" : "Pedido guardado — NO en Loggro")}
          </div>
          <div style={{ fontSize: 13, color: C.textMid, marginTop: 6 }}>
            {okRegistro
              ? `${spot?.id} · ${huesped} · ${pax} pax — ya pueden pedir por el QR`
              : (okLoggro ? "Enviado a la mesa de Loggro." : "El pedido se guardó pero NO llegó a Loggro. Avisa al administrador para reenviar.")}
          </div>
          {okCodigo && (
            <div style={{ display: "inline-block", background: C.bg, padding: "8px 14px", borderRadius: 8, marginTop: 16, fontFamily: "monospace", fontSize: 12, color: C.text }}>
              {okCodigo}
            </div>
          )}
          {huboLoggroErr && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "12px 14px", marginTop: 16, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>⚠ Error de sincronización Loggro</div>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.45, marginBottom: 12 }}>{loggroErr}</div>
              <button onClick={reintentar} disabled={reintentando}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: reintentando ? "#374151" : "#ef4444",
                  color: "#fff", border: "none", fontWeight: 700, fontSize: 13,
                  cursor: reintentando ? "wait" : "pointer",
                }}>
                {reintentando ? "Reintentando…" : "🔄 Reintentar envío a Loggro"}
              </button>
            </div>
          )}
          <Btn onClick={nuevoPedido}>{okRegistro ? "+ Otra mesa" : "+ Nuevo pedido"}</Btn>
        </div>
      </Wrap>
    );
  }

  // Selección de spot
  if (step === "spots") {
    return (
      <Wrap title={mesero?.nombre} onLogout={salir}>
        <div style={{ fontSize: 13, color: C.textMid, margin: "16px 0 12px" }}>Toca la cama del pedido en el plano:</div>
        <PoolFloorPlanPicker
          selectedSpotId={spot?.id || null}
          onSelectSpot={abrirSpot}
          showEstadoColor={true}
          size="lg"
        />
      </Wrap>
    );
  }

  // Menú / Review
  return (
    <Wrap
      title={`${spot?.id} · ${mesero?.nombre || ""}`}
      onBack={
        step === "datos"  ? () => { setSpot(null); setReservaId(null); setStep("spots"); }
        : step === "menu" ? () => setStep("datos")
        : () => setStep("menu")
      }
      backLabel={step === "datos" ? "Volver al plano" : step === "menu" ? "Volver" : "Volver al menú"}
    >
      {step === "datos" && (
        <div style={{ paddingBottom: 90 }}>
          <div style={{ fontSize: 13, color: C.textMid, margin: "16px 0 10px" }}>¿A nombre de quién es el pedido?</div>

          <Label>Pasadía (sin mesa)</Label>
          <select
            value={reservaId || ""}
            onChange={e => {
              const p = pasadias.find(x => x.id === e.target.value);
              if (p) { setHuesped(p.nombre); setReservaId(p.id); setPax(p.pax); setHuespedSel(""); }
              else setReservaId("");
            }}
            style={{ ...inp, cursor: "pointer" }}>
            <option value="">{pasadias.length ? "— Elegir pasadía —" : "— Sin pasadías hoy —"}</option>
            {pasadias.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.pax} pax</option>)}
          </select>

          <Label style={{ marginTop: 14 }}>Huésped en check-in (sin mesa)</Label>
          <select
            value={huespedSel}
            onChange={e => {
              const h = huespedes.find(x => x.id === e.target.value);
              if (h) { setHuesped(h.nombre); setHuespedSel(h.id); setPax(h.pax); setReservaId(null); }
              else setHuespedSel("");
            }}
            style={{ ...inp, cursor: "pointer" }}>
            <option value="">{huespedes.length ? "— Elegir huésped —" : "— Sin huéspedes en check-in —"}</option>
            {huespedes.map(h => <option key={h.id} value={h.id}>{h.nombre} · {h.pax} pax</option>)}
          </select>

          <Label style={{ marginTop: 14 }}>O escribe el nombre</Label>
          <input value={huesped} onChange={e => { setHuesped(e.target.value); setReservaId(null); setHuespedSel(""); }}
            placeholder="Nombre del huésped / mesa" style={inp} />

          <Label style={{ marginTop: 14 }}>Número de personas</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <button onClick={() => setPax(p => Math.max(1, Number(p) - 1))} style={{ ...qbtn, width: 48, height: 48, fontSize: 22 }}>−</button>
            <span style={{ fontSize: 26, fontWeight: 800, minWidth: 40, textAlign: "center" }}>{pax}</span>
            <button onClick={() => setPax(p => Number(p) + 1)} style={{ ...qbtn, width: 48, height: 48, fontSize: 22 }}>+</button>
          </div>

          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: C.card, borderTop: `1px solid ${C.line}`, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={registrarMesa} disabled={busy}
              style={{ width: "100%", background: C.primary, color: C.bg, border: "none", borderRadius: 12, padding: 16, fontWeight: 800, fontSize: 16, cursor: "pointer", minHeight: 54 }}>
              {busy ? "…" : "Grabar"}
            </button>
            <button onClick={() => { if (!String(huesped).trim()) return alert("Indica el nombre"); setStep("menu"); }}
              style={{ width: "100%", background: "transparent", color: C.text, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 48 }}>
              Tomar pedido →
            </button>
          </div>
        </div>
      )}

      {step === "menu" && (
        <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 0" }}>
            <Chip label="Todo" active={fc === ""} onClick={() => setFc("")} />
            {cats.map(c => <Chip key={c} label={c} active={fc === c} onClick={() => setFc(c)} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: cart.length ? 90 : 16 }}>
            {itemsF.map(it => {
              const hasT = (it.precio > 0) && !!it.loggro_id;
              const hasB = (it.precio_botella > 0) && !!it.loggro_id_botella;
              const hasMods = (it.modificadores || []).length > 0;
              const hasVar = Array.isArray(it.variantes) && it.variantes.length > 0;
              const both = hasT && hasB;
              const onlyVar = (hasB && !hasT) ? "botella" : "trago";
              const cT = cart.find(c => c.key === `${it.id}:trago`);
              const cB = cart.find(c => c.key === `${it.id}:botella`);
              const cO = cart.find(c => c.key === `${it.id}:${onlyVar}`);
              const step = (ck) => (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => setQ(ck.key, ck.cantidad - 1)} style={qbtn}>−</button>
                  <span style={{ fontSize: 16, fontWeight: 800, minWidth: 20, textAlign: "center", color: C.text }}>{ck.cantidad}</span>
                  <button onClick={() => setQ(ck.key, ck.cantidad + 1)} style={qbtn}>+</button>
                </div>
              );
              const vbtn = (label, v) => (
                <button onClick={() => add(it, v)} style={{ background: C.primary, color: C.bg, border: "none", borderRadius: 8, padding: "10px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", minHeight: 42, whiteSpace: "nowrap" }}>{label}</button>
              );
              return (
                <div key={it.id} style={{ background: C.card, borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: C.textLight, textTransform: "uppercase" }}>{it.categoria || "—"}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{it.nombre}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.primary, marginTop: 2 }}>
                      {both
                        ? `🥃 ${COP(it.precio)}  ·  🍾 ${COP(it.precio_botella)}`
                        : COP(onlyVar === "botella" ? it.precio_botella : it.precio)}
                    </div>
                  </div>
                  {(hasMods || hasVar) ? (
                    <button onClick={() => setModItem(it)} style={{ background: C.primary, color: C.bg, border: "none", borderRadius: 8, padding: "12px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", minHeight: 44, whiteSpace: "nowrap" }}>Elegir</button>
                  ) : both ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      {cT ? step(cT) : vbtn("🥃 Trago", "trago")}
                      {cB ? step(cB) : vbtn("🍾 Botella", "botella")}
                    </div>
                  ) : (
                    cO ? step(cO)
                       : <button onClick={() => add(it, onlyVar)} style={{ background: C.primary, color: C.bg, border: "none", borderRadius: 8, padding: "12px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", minHeight: 44 }}>+ Agregar</button>
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

      {step === "review" && (() => {
        // Pre-validación visible para el mesero antes de enviar:
        // ítems sin loggro_id (no llegan a Loggro) y sin precio (ticket en $0).
        const itemsSinLoggro = cart.filter(c => !c.loggro_id).length;
        const itemsSinPrecio = cart.filter(c => Number(c.precio) === 0).length;
        const haySpotSinMesa = !spot?.loggro_mesa_id;
        return (
        <div style={{ paddingBottom: 16 }}>
          {(itemsSinLoggro > 0 || itemsSinPrecio > 0 || haySpotSinMesa) && (
            <div style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.5)", borderRadius: 10, padding: "12px 14px", margin: "16px 0 0" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#f59e0b", marginBottom: 6 }}>⚠ Antes de enviar — revisa:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                {haySpotSinMesa && <li>El spot <b>{spot?.id || "?"}</b> NO está mapeado a una mesa en Loggro. El pedido se guardará pero no llegará a cocina.</li>}
                {itemsSinLoggro > 0 && <li><b>{itemsSinLoggro}</b> ítem(s) sin <code>loggro_id</code> → no llegarán a Loggro (los demás sí).</li>}
                {itemsSinPrecio > 0 && <li><b>{itemsSinPrecio}</b> ítem(s) con precio $0 → el ticket sale sin valor en cocina.</li>}
              </ul>
            </div>
          )}
          <div style={{ background: C.card, borderRadius: 12, padding: 16, margin: "12px 0 12px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>Pedido · {spot?.id}</div>
            {cart.map(c => {
              const sinLoggro = !c.loggro_id;
              const sinPrecio = Number(c.precio) === 0;
              return (
              <div key={c.key} style={{ padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setQ(c.key, c.cantidad - 1)} style={qbtn}>−</button>
                  <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800, color: C.text }}>{c.cantidad}</span>
                  <button onClick={() => setQ(c.key, c.cantidad + 1)} style={qbtn}>+</button>
                  <div style={{ flex: 1, fontSize: 13, color: C.text, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>{c.nombre}</span>
                    {(sinLoggro || sinPrecio) && (
                      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {sinLoggro && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#ef444433", color: "#ef4444", fontWeight: 700 }}>⚠ Sin Loggro</span>}
                        {sinPrecio && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#f59e0b33", color: "#f59e0b", fontWeight: 700 }}>⚠ Sin precio</span>}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 800, color: sinPrecio ? "#f59e0b" : C.text }}>{COP(c.precio * c.cantidad)}</div>
                </div>
                <input
                  value={c.notas || ""}
                  onChange={e => setNotaItem(c.key, e.target.value)}
                  placeholder="Nota para cocina (sin cebolla, término medio…)"
                  style={{ width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 12, background: C.bg, color: C.text, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `2px solid ${C.line}`, marginTop: 6, fontWeight: 800, fontSize: 16, color: C.text }}>
              <span>Total</span><span>{COP(subtotal)}</span>
            </div>
          </div>
          <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textLight, textTransform: "uppercase" }}>Cliente</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{huesped || "—"} · {pax} pax</div>
              </div>
              <button onClick={() => setStep("datos")} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.primary, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 40 }}>Editar</button>
            </div>
            <Label>Nota general del pedido (opcional)</Label>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: -8, marginBottom: 6 }}>
              Para instrucciones que apliquen a TODO el pedido. Las notas por plato van arriba en cada línea.
            </div>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Alergias, ubicación de mesa, etc."
              style={{ ...inp, minHeight: 60, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("menu")} style={{ flex: 1, background: "transparent", color: C.text, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, fontWeight: 700, cursor: "pointer", minHeight: 52 }}>← Agregar</button>
            <button onClick={enviar} disabled={busy} style={{ flex: 2, background: busy ? C.textLight : C.success, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontWeight: 800, cursor: "pointer", minHeight: 52 }}>
              {busy ? "Enviando…" : `Enviar · ${COP(subtotal)}`}
            </button>
          </div>
        </div>
        );
      })()}

      {modItem && (
        <ModSheet
          item={modItem}
          onClose={() => setModItem(null)}
          onAdd={({ variante, mods }) => { addChoice(modItem, variante, mods); setModItem(null); }}
        />
      )}
    </Wrap>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────
function Wrap({ title, children, onBack, backLabel = "Volver", onLogout }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: C.bg, borderBottom: `1px solid ${C.line}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>Atolón · Meseros</div>
          {title && <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>}
        </div>
        {onLogout && <button onClick={onLogout} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.textMid, fontSize: 11, borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>Salir</button>}
      </div>
      {onBack && (
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: C.card, border: "none", borderBottom: `1px solid ${C.line}`, color: C.primary, fontSize: 16, fontWeight: 800, padding: "16px", cursor: "pointer", minHeight: 56 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>‹</span> {backLabel}
        </button>
      )}
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

// Bottom-sheet de variantes/modificadores (modelo Room Service):
//   · item.variantes = subProducts de Loggro (ej. Cerveza / Michelada /
//     Clamato). Single-choice obligatorio; el seleccionado define el
//     precio y loggro_id de la línea del pedido.
//   · item.modificadores = [{ grupo, min, max, opciones:[{nombre, precio_delta}] }]
function ModSheet({ item, onClose, onAdd }) {
  const variantes = Array.isArray(item.variantes) ? item.variantes : [];
  const grupos = item.modificadores || [];
  // Default: primera variante seleccionada
  const [varIdx, setVarIdx] = useState(variantes.length > 0 ? 0 : -1);
  const [sel, setSel] = useState({});
  const variante = varIdx >= 0 ? variantes[varIdx] : null;
  const basePrecio = variante ? Number(variante.precio) || 0 : Number(item.precio) || 0;
  const flat = [];
  grupos.forEach((g, gi) => (sel[gi] || []).forEach(oi => {
    const o = g.opciones?.[oi];
    if (o) flat.push({ grupo: g.grupo, nombre: o.nombre, precio_delta: Number(o.precio_delta) || 0 });
  }));
  const delta = flat.reduce((s, o) => s + o.precio_delta, 0);
  const toggle = (gi, oi, max) => setSel(p => {
    const cur = p[gi] || [], has = cur.includes(oi);
    let n;
    if (has) n = cur.filter(x => x !== oi);
    else if (max === 1) n = [oi];
    else if (cur.length < max) n = [...cur, oi];
    else n = cur;
    return { ...p, [gi]: n };
  });
  const confirmar = () => {
    if (variantes.length > 0 && varIdx < 0) return alert("Elige una variante");
    for (let gi = 0; gi < grupos.length; gi++) {
      const g = grupos[gi];
      if (((sel[gi] || []).length) < (g.min || 0)) return alert(`Elige al menos ${g.min} — "${g.grupo}"`);
    }
    onAdd({ variante, mods: flat });
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, width: "100%", maxHeight: "88vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: 20 }}>
        <div style={{ width: 40, height: 4, background: C.line, borderRadius: 2, margin: "0 auto 14px" }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 12 }}>{item.nombre}</div>
        {variantes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Variante<span style={{ color: C.danger }}> *</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {variantes.map((v, i) => {
                const on = varIdx === i;
                return (
                  <button key={i} onClick={() => setVarIdx(i)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "14px", borderRadius: 10, border: `1px solid ${on ? C.primary : C.line}`, background: on ? C.card : "transparent", color: C.text, cursor: "pointer", minHeight: 50, fontWeight: 700, fontSize: 14 }}>
                    <span>{v.nombre}</span>
                    <span style={{ fontWeight: 800, color: C.accent }}>{COP(Number(v.precio) || 0)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {grupos.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              {g.grupo}{g.min > 0 && <span style={{ color: C.danger }}> *</span>}{g.max > 1 && <span style={{ fontWeight: 500, textTransform: "none" }}> (hasta {g.max})</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(g.opciones || []).map((o, oi) => {
                const on = (sel[gi] || []).includes(oi);
                return (
                  <button key={oi} onClick={() => toggle(gi, oi, g.max || 1)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "14px", borderRadius: 10, border: `1px solid ${on ? C.primary : C.line}`, background: on ? C.card : "transparent", color: C.text, cursor: "pointer", minHeight: 50, fontWeight: 700, fontSize: 14 }}>
                    <span>{o.nombre}</span>
                    <span style={{ fontWeight: 800, color: C.accent }}>{Number(o.precio_delta) > 0 ? `+${COP(o.precio_delta)}` : (on ? "✓" : "")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button onClick={confirmar} style={{ width: "100%", marginTop: 6, background: C.primary, color: C.bg, border: "none", borderRadius: 12, padding: 16, fontWeight: 800, fontSize: 16, cursor: "pointer", minHeight: 54 }}>
          Agregar · {COP(basePrecio + delta)}
        </button>
      </div>
    </div>
  );
}
