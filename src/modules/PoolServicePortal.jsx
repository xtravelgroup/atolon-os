// PoolServicePortal — Portal público para huéspedes en /pool/:qr
// El cliente escanea el QR del área (cabaña) o de una cama (floorplan_spot),
// arma su pedido y lo envía. Bilingüe ES/EN.
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
  es: { piscina: "Piscina", piscina_chica: "Piscina chica", beach: "Beach", cabana: "Cabaña", bar: "Bar", vip: "VIP", otra: "Área" },
  en: { piscina: "Pool", piscina_chica: "Small pool", beach: "Beach", cabana: "Cabana", bar: "Bar", vip: "VIP", otra: "Area" },
};

const CAT_ORDER = ["Bebidas", "Cervezas", "Cocteles", "Snacks", "Entradas", "Marinas", "Ensalada", "Ensaladas", "Tacos", "Pizza", "Pizzas", "Especialidades", "Especialidades de la Isla", "Parrilla", "De la Parrilla", "Complementos", "Postres"];
const catRank = (cat) => {
  const idx = CAT_ORDER.findIndex(c => c.toLowerCase() === (cat || "").toLowerCase());
  return idx === -1 ? 999 : idx;
};

// ── i18n ────────────────────────────────────────────────────────────────────
const STR = {
  loading:        { es: "Cargando…", en: "Loading…" },
  na_title:       { es: "Área no disponible", en: "Area unavailable" },
  na_sub:         { es: "Este QR no corresponde a ningún área activa. Pídele a un colaborador un código nuevo.", en: "This QR doesn't match any active area. Ask a team member for a new code." },
  hola:           { es: "Hola 👋", en: "Hi 👋" },
  pide_cama:      { es: "Pide a tu cama", en: "Order to your daybed" },
  comidas:        { es: "Comidas", en: "Food" },
  bebidas:        { es: "Bebidas", en: "Drinks" },
  actividades:    { es: "Actividades", en: "Activities" },
  todo:           { es: "Todo", en: "All" },
  vacio_act:      { es: "Consulta las actividades y pasadías con tu anfitrión 🏖", en: "Ask your host about activities & day passes 🏖" },
  vacio:          { es: "No hay ítems en esta sección por ahora.", en: "No items in this section yet." },
  agregar:        { es: "+ Agregar", en: "+ Add" },
  revisar:        { es: "Revisar pedido →", en: "Review order →" },
  tu_pedido:      { es: "Tu pedido", en: "Your order" },
  total:          { es: "Total", en: "Total" },
  info_entrega:   { es: "Información para entrega (opcional)", en: "Delivery info (optional)" },
  tu_nombre:      { es: "Tu nombre", en: "Your name" },
  personas:       { es: "Personas en la mesa", en: "People at the table" },
  notas_ph:       { es: "Notas especiales (alergias, ubicación exacta, etc.)", en: "Special notes (allergies, exact location, etc.)" },
  agregar_mas:    { es: "← Agregar más", en: "← Add more" },
  enviando:       { es: "Enviando…", en: "Sending…" },
  enviar:         { es: "Enviar pedido", en: "Send order" },
  add_algo:       { es: "Agrega algo al pedido", en: "Add something to your order" },
  err_enviar:     { es: "Error al enviar el pedido: ", en: "Error sending the order: " },
  codigo:         { es: "Código", en: "Code" },
  auto_refresh:   { es: "Esta página se actualiza automáticamente cuando cambia el estado.", en: "This page updates automatically when the status changes." },
};
const EST = {
  recibido:   { emoji: "📥", l: { es: "Recibido", en: "Received" },   s: { es: "Tu pedido llegó al equipo.", en: "Your order reached the team." } },
  preparando: { emoji: "👨‍🍳", l: { es: "Preparando", en: "Preparing" }, s: { es: "Lo están preparando con cariño.", en: "Being prepared with care." } },
  listo:      { emoji: "🍽️", l: { es: "Listo", en: "Ready" },        s: { es: "Va en camino a tu área.", en: "On its way to you." } },
  entregado:  { emoji: "✅", l: { es: "Entregado", en: "Delivered" },  s: { es: "¡Disfruta tu pedido!", en: "Enjoy your order!" } },
  cancelado:  { emoji: "❌", l: { es: "Cancelado", en: "Cancelled" },  s: { es: "El pedido fue cancelado.", en: "The order was cancelled." } },
};
function initLang() {
  try {
    const p = new URLSearchParams(window.location.search).get("lang");
    if (p === "en" || p === "es") return p;
    return (navigator.language || "es").slice(0, 2).toLowerCase() === "en" ? "en" : "es";
  } catch { return "es"; }
}

export default function PoolServicePortal({ qr }) {
  const [lang, setLang]     = useState(initLang);
  const t = (k) => STR[k]?.[lang] ?? STR[k]?.es ?? k;

  const [area, setArea]     = useState(null);
  const [spot, setSpot]     = useState(null);  // modo cama: QR de un floorplan_spot
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [carrito, setCart]  = useState([]);
  const [filtroCat, setFC]  = useState("");
  const [seccion, setSeccion] = useState("comidas"); // comidas | bebidas | actividades
  const [registrado, setRegistrado] = useState(false);
  const [step, setStep]     = useState("menu"); // menu | review | success
  const [huesped, setHuesped] = useState("");
  const [notas, setNotas]   = useState("");
  const [pax, setPax]       = useState(1);
  const [saving, setSaving] = useState(false);
  const [pedidoCodigo, setPedidoCodigo] = useState("");
  const [pedidoEstado, setPedidoEstado] = useState("");
  const [modItem, setModItem] = useState(null); // ítem con variantes abierto

  // nombre/desc/categoría según idioma
  const nm = (it) => (lang === "en" && it.nombre_en) ? it.nombre_en : it.nombre;
  const ds = (it) => (lang === "en" && it.descripcion_en) ? it.descripcion_en : it.descripcion;
  const ct = (it) => (lang === "en" && it.categoria_en) ? it.categoria_en : it.categoria;

  useEffect(() => {
    (async () => {
      if (!qr) return setLoad(false);
      const [{ data: a }, { data: i }, { data: acts }] = await Promise.all([
        supabase.from("pool_service_areas").select("*").eq("qr_code", qr).eq("activo", true).maybeSingle(),
        supabase.from("menu_items").select("id, nombre, nombre_en, descripcion, descripcion_en, precio, categoria, categoria_en, menu_tipo, loggro_id, modificadores, variantes, precio_botella, loggro_id_botella").in("menu_tipo", ["restaurant", "bebidas"]).eq("activo", true),
        supabase.from("actividades").select("id, nombre, descripcion, precio, categoria").eq("self_service", true).eq("activo", true).order("orden").order("nombre"),
      ]);
      // Actividades marcadas como self-service → se inyectan como sección "actividades"
      const actItems = (acts || []).map(x => ({
        id: x.id, nombre: x.nombre, nombre_en: null,
        descripcion: x.descripcion || null, descripcion_en: null,
        precio: x.precio || 0, categoria: x.categoria || "Actividades",
        categoria_en: null, menu_tipo: "actividad", loggro_id: null, modificadores: [],
      }));
      setItems([...(i || []), ...actItems]);
      if (a) {
        setArea(a);
      } else {
        const { data: sp } = await supabase.from("floorplan_spots")
          .select("id, zona, loggro_mesa_id").eq("id", qr).eq("activo", true).maybeSingle();
        if (sp) {
          setSpot(sp);
          const zlbl = (sp.zona || "").replace("piscina_derecha", "Piscina Derecha").replace("piscina_izquierda", "Piscina Izquierda").replace("piscina_central", "Piscina Centro").replace("piscina_", "P. ").replace(/_/g, " ");
          setArea({ id: sp.id, nombre: sp.id, tipo: "piscina", _zona: zlbl });
          // ¿Ya registraron a la persona en esta cama hoy? Reconoce 2 fuentes:
          // 1) asignación del Floor Plan, 2) pedido del mesero para esa cama hoy.
          const hoy = new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).slice(0, 10);
          const { data: asg } = await supabase.from("floorplan_asignaciones")
            .select("huesped, pax").eq("spot_id", sp.id).eq("fecha", hoy)
            .not("huesped", "is", null)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle();
          if (asg?.huesped) {
            setHuesped(asg.huesped); setPax(asg.pax || 1); setRegistrado(true);
          } else {
            const { data: ped } = await supabase.from("pool_service_pedidos")
              .select("huesped, pax").eq("spot_id", sp.id)
              .gte("created_at", `${hoy}T00:00:00`)
              .not("huesped", "is", null)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (ped?.huesped) { setHuesped(ped.huesped); setPax(ped.pax || 1); setRegistrado(true); }
          }
        }
      }
      setLoad(false);
    })();
  }, [qr]);

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

  const SEC_TIPOS = { comidas: ["restaurant"], bebidas: ["bebidas"], actividades: ["actividad"] };
  const seccionItems = useMemo(
    () => items.filter(i => (SEC_TIPOS[seccion] || []).includes(i.menu_tipo)),
    [items, seccion]
  );

  // categorías: clave canónica = categoria (es); etiqueta = según idioma
  const cats = useMemo(() => {
    const map = new Map();
    seccionItems.forEach(i => { if (i.categoria && !map.has(i.categoria)) map.set(i.categoria, ct(i)); });
    return Array.from(map.entries())
      .sort((a, b) => (catRank(a[0]) - catRank(b[0])) || a[0].localeCompare(b[0]))
      .map(([key, label]) => ({ key, label }));
  }, [seccionItems, lang]);

  const itemsFiltered = useMemo(() => {
    const base = filtroCat ? seccionItems.filter(i => i.categoria === filtroCat) : seccionItems;
    return [...base].sort((a, b) => (catRank(a.categoria) - catRank(b.categoria)) || (a.nombre || "").localeCompare(b.nombre || ""));
  }, [seccionItems, filtroCat]);

  const subtotal = carrito.reduce((s, x) => s + x.precio * x.cantidad, 0);

  // mods = [{ grupo, nombre, precio_delta }] — cada combinación es una línea.
  // variante: null | "trago" | "botella" (botella usa precio_botella + loggro_id_botella)
  const add = (it, mods = [], variante = null) => setCart(prev => {
    // `variante` puede ser:
    //   · "trago" / "botella"     — caso histórico licor (string)
    //   · objeto {nombre, precio, loggro_id} — subProduct de Loggro
    //     (ej. Cerveza/Michelada/Clamato). Define el precio y loggro_id.
    //   · null — base del ítem
    const isSubVar = variante && typeof variante === "object";
    const esBot = variante === "botella";
    const baseKey = isSubVar ? `${it.id}:${variante.loggro_id || variante.nombre}` : (variante ? `${it.id}:${variante}` : it.id);
    const key = mods.length ? `${baseKey}::${mods.map(m => m.nombre).join("|")}` : baseKey;
    const ex = prev.find(x => x.key === key);
    if (ex) return prev.map(x => x.key === key ? { ...x, cantidad: x.cantidad + 1 } : x);
    const mSuf = mods.length ? ` (${mods.map(m => m.nombre).join(", ")})` : "";
    const delta = mods.reduce((s, m) => s + (Number(m.precio_delta) || 0), 0);
    let nombre, nombre_en, precio, loggro_id;
    if (isSubVar) {
      nombre    = variante.nombre + mSuf;
      nombre_en = variante.nombre + mSuf;
      precio    = (Number(variante.precio) || 0) + delta;
      loggro_id = variante.loggro_id || null;
    } else {
      const vEs = esBot ? " · Botella" : (variante === "trago" ? " · Trago" : "");
      const vEn = esBot ? " · Bottle"  : (variante === "trago" ? " · Glass" : "");
      nombre    = it.nombre + vEs + mSuf;
      nombre_en = (it.nombre_en || it.nombre) + vEn + mSuf;
      precio    = (esBot ? (it.precio_botella || 0) : (it.precio || 0)) + delta;
      loggro_id = (esBot ? it.loggro_id_botella : it.loggro_id) || null;
    }
    return [...prev, {
      key, id: it.id, nombre, nombre_en, precio, loggro_id,
      notas: mods.map(m => `${m.grupo}: ${m.nombre}`).join(" · "),
      cantidad: 1,
    }];
  });
  const addItem = (it) => (((it.modificadores || []).length > 0 || (Array.isArray(it.variantes) && it.variantes.length > 0)) ? setModItem(it) : add(it));
  const setCant = (key, c) => {
    const n = Number(c);
    if (n <= 0) return setCart(prev => prev.filter(x => (x.key ?? x.id) !== key));
    setCart(prev => prev.map(x => (x.key ?? x.id) === key ? { ...x, cantidad: n } : x));
  };
  const cnm = (c) => (lang === "en" && c.nombre_en) ? c.nombre_en : c.nombre;

  const enviar = async () => {
    if (carrito.length === 0) return alert(t("add_algo"));
    setSaving(true);
    const codigo = `PS-${Date.now()}`;
    const row = spot
      ? { codigo, spot_id: spot.id, area_nombre: `${spot.id} · ${area._zona || ""}`, huesped: huesped || null, pax: Number(pax) || 1, items: carrito, subtotal, total: subtotal, notas: notas || null, estado: "recibido", creado_por: "huesped" }
      : { codigo, area_id: area.id, area_nombre: area.nombre, huesped: huesped || null, pax: Number(pax) || 1, items: carrito, subtotal, total: subtotal, notas: notas || null, estado: "recibido", creado_por: "huesped" };
    const { data: ins, error } = await supabase.from("pool_service_pedidos").insert(row).select().maybeSingle();
    if (error) { setSaving(false); return alert(t("err_enviar") + error.message); }

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
    return <Shell lang={lang} setLang={setLang}><div style={{ padding: 60, textAlign: "center", color: C.textMid }}>{t("loading")}</div></Shell>;
  }
  if (!area) {
    return (
      <Shell lang={lang} setLang={setLang}>
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>{t("na_title")}</div>
          <div style={{ fontSize: 13, color: C.textMid }}>{t("na_sub")}</div>
        </div>
      </Shell>
    );
  }

  if (step === "success") {
    return <SuccessView area={area} codigo={pedidoCodigo} estado={pedidoEstado} lang={lang} setLang={setLang} />;
  }

  return (
    <Shell area={area} lang={lang} setLang={setLang}>
      {step === "menu" && (
        <>
          {registrado && huesped && (
            <div style={{ background: "white", borderRadius: 14, padding: "16px 18px", marginBottom: 12, boxShadow: "0 1px 3px rgba(13,27,62,0.06)" }}>
              <div style={{ fontSize: 13, color: C.textMid }}>{t("hola")}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{String(huesped).split(" ")[0]}</div>
              <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>{t("pide_cama")} · {area?.nombre}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { k: "comidas", ic: "🍽" },
              { k: "bebidas", ic: "🍹" },
              { k: "actividades", ic: "🏖" },
            ].map(s => {
              const on = seccion === s.k;
              return (
                <button key={s.k} onClick={() => { setSeccion(s.k); setFC(""); }}
                  style={{ flex: 1, background: on ? C.primary : "white", color: on ? "#fff" : C.text, border: `1px solid ${on ? C.primary : C.border}`, borderRadius: 12, padding: "12px 4px", fontSize: 13, fontWeight: 800, cursor: "pointer", minHeight: 56 }}>
                  <div style={{ fontSize: 20 }}>{s.ic}</div>{t(s.k)}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 0 12px 0", marginBottom: 12 }}>
            <Chip label={t("todo")} active={filtroCat === ""} onClick={() => setFC("")} />
            {cats.map(c => (
              <Chip key={c.key} label={c.label} active={filtroCat === c.key} onClick={() => setFC(c.key)} />
            ))}
          </div>

          {itemsFiltered.length === 0 && (
            <div style={{ background: "white", borderRadius: 12, padding: 28, textAlign: "center", color: C.textMid, fontSize: 13 }}>
              {seccion === "actividades" ? t("vacio_act") : t("vacio")}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {itemsFiltered.map(it => {
              const hasMods = (it.modificadores || []).length > 0 || (Array.isArray(it.variantes) && it.variantes.length > 0);
              const hasB = (it.precio_botella > 0) && !!it.loggro_id_botella;
              const inCart = (!hasMods && !hasB) && carrito.find(c => (c.key ?? c.id) === it.id);
              const cT = hasB && carrito.find(c => c.key === `${it.id}:trago`);
              const cB = hasB && carrito.find(c => c.key === `${it.id}:botella`);
              const step = (ck) => (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => setCant(ck.key, ck.cantidad - 1)} style={qtyBtn}>−</button>
                  <span style={{ fontSize: 16, fontWeight: 800, minWidth: 22, textAlign: "center" }}>{ck.cantidad}</span>
                  <button onClick={() => setCant(ck.key, ck.cantidad + 1)} style={qtyBtn}>+</button>
                </div>
              );
              const vbtn = (label, v) => (
                <button onClick={() => add(it, [], v)} style={{ ...addBtn, padding: "10px 12px" }}>{label}</button>
              );
              return (
                <div key={it.id} style={{ background: "white", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px rgba(13,27,62,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.05em" }}>{ct(it) || "—"}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 2 }}>{nm(it)}</div>
                    {ds(it) && <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{ds(it)}</div>}
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginTop: 6 }}>
                      {hasB
                        ? `🥃 ${COP(it.precio)}  ·  🍾 ${COP(it.precio_botella)}`
                        : <>{COP(it.precio)}{hasMods && <span style={{ fontSize: 11, fontWeight: 600, color: C.textMid }}> · {lang === "en" ? "options" : "opciones"}</span>}</>}
                    </div>
                  </div>
                  {hasMods ? (
                    <button onClick={() => addItem(it)} style={addBtn}>{lang === "en" ? "Choose" : "Elegir"}</button>
                  ) : hasB ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      {cT ? step(cT) : vbtn(lang === "en" ? "🥃 Glass" : "🥃 Trago", "trago")}
                      {cB ? step(cB) : vbtn(lang === "en" ? "🍾 Bottle" : "🍾 Botella", "botella")}
                    </div>
                  ) : inCart ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => setCant(it.id, inCart.cantidad - 1)} style={qtyBtn}>−</button>
                      <span style={{ fontSize: 16, fontWeight: 800, minWidth: 22, textAlign: "center" }}>{inCart.cantidad}</span>
                      <button onClick={() => setCant(it.id, inCart.cantidad + 1)} style={qtyBtn}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => addItem(it)} style={addBtn}>{t("agregar")}</button>
                  )}
                </div>
              );
            })}
          </div>

          {carrito.length > 0 && (
            <div style={{ position: "sticky", bottom: 0, background: "white", padding: "12px 16px", margin: "12px -16px -16px -16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMid }}>{carrito.reduce((s, x) => s + x.cantidad, 0)} {lang === "en" ? "items" : "ítems"}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{COP(subtotal)}</div>
              </div>
              <button onClick={() => setStep("review")} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 48 }}>
                {t("revisar")}
              </button>
            </div>
          )}
        </>
      )}

      {step === "review" && (
        <div>
          <div style={{ background: "white", borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{t("tu_pedido")}</div>
            {carrito.map(c => (
              <div key={c.key ?? c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
                <button onClick={() => setCant(c.key ?? c.id, c.cantidad - 1)} style={qtyBtnSm}>−</button>
                <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700 }}>{c.cantidad}</span>
                <button onClick={() => setCant(c.key ?? c.id, c.cantidad + 1)} style={qtyBtnSm}>+</button>
                <div style={{ flex: 1, fontSize: 13 }}>{cnm(c)}</div>
                <div style={{ fontWeight: 700 }}>{COP(c.precio * c.cantidad)}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `2px solid ${C.text}`, marginTop: 6, fontWeight: 800, fontSize: 16 }}>
              <span>{t("total")}</span>
              <span>{COP(subtotal)}</span>
            </div>
          </div>

          <div style={{ background: "white", borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: C.textMid, marginBottom: 10 }}>{t("info_entrega")}</div>
            <input value={huesped} onChange={e => setHuesped(e.target.value)} placeholder={t("tu_nombre")}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, marginBottom: 8 }} />
            <input type="number" value={pax} onChange={e => setPax(e.target.value)} placeholder={t("personas")} min={1}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, marginBottom: 8 }} />
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder={t("notas_ph")}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, minHeight: 80, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("menu")}
              style={{ flex: 1, background: "white", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, fontWeight: 700, cursor: "pointer", minHeight: 48 }}>
              {t("agregar_mas")}
            </button>
            <button onClick={enviar} disabled={saving}
              style={{ flex: 2, background: saving ? C.textLight : C.primary, color: "#fff", border: "none", borderRadius: 10, padding: 14, fontWeight: 700, cursor: "pointer", minHeight: 48 }}>
              {saving ? t("enviando") : `${t("enviar")} · ${COP(subtotal)}`}
            </button>
          </div>
        </div>
      )}

      {modItem && (
        <ModSheet
          item={modItem} lang={lang}
          onClose={() => setModItem(null)}
          onAdd={({ variante, mods }) => { add(modItem, mods, variante); setModItem(null); }}
        />
      )}
    </Shell>
  );
}

function SuccessView({ area, codigo, estado, lang, setLang }) {
  const t = (k) => STR[k]?.[lang] ?? STR[k]?.es ?? k;
  const info = EST[estado] || EST.recibido;
  return (
    <Shell area={area} lang={lang} setLang={setLang}>
      <div style={{ background: "white", borderRadius: 14, padding: 32, textAlign: "center", boxShadow: "0 6px 30px rgba(13,27,62,0.08)" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{info.emoji}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{info.l[lang] || info.l.es}</div>
        <div style={{ fontSize: 14, color: C.textMid, marginTop: 6 }}>{info.s[lang] || info.s.es}</div>
        <div style={{ background: C.bg, padding: "10px 16px", borderRadius: 8, display: "inline-block", marginTop: 18, fontFamily: "monospace", fontSize: 12, color: C.text }}>
          {t("codigo")}: <strong>{codigo}</strong>
        </div>
        <div style={{ fontSize: 11, color: C.textLight, marginTop: 16 }}>{t("auto_refresh")}</div>
      </div>
    </Shell>
  );
}

function Shell({ area, children, lang, setLang }) {
  const tipo = area ? (TIPO_LABEL[lang]?.[area.tipo] || TIPO_LABEL.es[area.tipo] || (lang === "en" ? "Area" : "Área")) : "";
  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 0 }}>
      <div style={{ background: C.primary, color: "#fff", padding: "16px", position: "relative" }}>
        {/* Toggle ES / EN */}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 4 }}>
          {["es", "en"].map(L => (
            <button key={L} onClick={() => setLang(L)}
              style={{ background: lang === L ? "#fff" : "transparent", color: lang === L ? C.primary : "#fff", border: `1px solid ${lang === L ? "#fff" : "rgba(255,255,255,0.4)"}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", minWidth: 38 }}>
              {L.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>Atolón Beach Club</div>
          {area && (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{area.nombre}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{tipo}</div>
            </>
          )}
        </div>
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

// Bottom-sheet de variantes/modificadores (mismo modelo que Room Service:
// item.modificadores = [{ grupo, min, max, opciones:[{ nombre, precio_delta }] }])
function ModSheet({ item, lang, onClose, onAdd }) {
  const variantes = Array.isArray(item.variantes) ? item.variantes : [];
  const grupos = item.modificadores || [];
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
    if (variantes.length > 0 && varIdx < 0) {
      return alert(lang === "en" ? "Choose a variant" : "Elige una variante");
    }
    for (let gi = 0; gi < grupos.length; gi++) {
      const g = grupos[gi];
      if (((sel[gi] || []).length) < (g.min || 0)) {
        return alert(`${lang === "en" ? "Choose at least" : "Elige al menos"} ${g.min} — "${g.grupo}"`);
      }
    }
    onAdd({ variante, mods: flat });
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", width: "100%", maxHeight: "88vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: 20 }}>
        <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 14px" }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 12 }}>{(lang === "en" && item.nombre_en) ? item.nombre_en : item.nombre}</div>
        {variantes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              {lang === "en" ? "Variant" : "Variante"}<span style={{ color: C.danger }}> *</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {variantes.map((v, i) => {
                const on = varIdx === i;
                return (
                  <button key={i} onClick={() => setVarIdx(i)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 10, border: `1px solid ${on ? C.primary : C.border}`, background: on ? `${C.primary}11` : "white", color: C.text, cursor: "pointer", minHeight: 48, fontWeight: 700, fontSize: 14 }}>
                    <span>{v.nombre}</span>
                    <span style={{ fontWeight: 800, color: C.textMid }}>{COP(Number(v.precio) || 0)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {grupos.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              {g.grupo}{g.min > 0 && <span style={{ color: C.danger }}> *</span>}{g.max > 1 && <span style={{ fontWeight: 500, textTransform: "none" }}> ({lang === "en" ? "up to" : "hasta"} {g.max})</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(g.opciones || []).map((o, oi) => {
                const on = (sel[gi] || []).includes(oi);
                return (
                  <button key={oi} onClick={() => toggle(gi, oi, g.max || 1)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 10, border: `1px solid ${on ? C.primary : C.border}`, background: on ? `${C.primary}11` : "white", color: C.text, cursor: "pointer", minHeight: 48, fontWeight: 700, fontSize: 14 }}>
                    <span>{o.nombre}</span>
                    <span style={{ fontWeight: 800, color: C.textMid }}>{Number(o.precio_delta) > 0 ? `+${COP(o.precio_delta)}` : (on ? "✓" : "")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button onClick={confirmar} style={{ width: "100%", marginTop: 6, background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: 16, fontWeight: 800, fontSize: 16, cursor: "pointer", minHeight: 54 }}>
          {lang === "en" ? "Add" : "Agregar"} · {COP(basePrecio + delta)}
        </button>
      </div>
    </div>
  );
}
