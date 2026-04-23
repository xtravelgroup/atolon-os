import { useState, useEffect, useCallback } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { wompiCheckoutUrl } from "../lib/wompi";
import EventoDetalle from "./EventoDetalle";
import FacturaElectronicaForm, { FacturaElectronicaToggle, FE_EMPTY, feValidate, fePayload } from "../lib/FacturaElectronicaForm.jsx";

const STAGES       = ["Consulta", "Cotizado", "Confirmado", "Realizado", "Perdido"];
const TIPOS_EVT    = ["Matrimonio", "Cumpleaños", "Corporativo", "Despedida de Solteros", "Aniversario", "Grado", "Otro"];
const TIPOS_GRUPO  = ["VIP Pass", "VIP Pass (Bebida + Impuesto de Muelle)", "Exclusive Pass", "Atolon Experience", "After Island", "STAFF", "Impuesto Muelle"];
const PRECIO_MUELLE = 18000; // precio fijo Impuesto Muelle
const SLUG_MAP     = { "VIP Pass": "vip-pass", "VIP Pass (Bebida + Impuesto de Muelle)": "vip-pass-grupo", "Exclusive Pass": "exclusive-pass", "Atolon Experience": "atolon-experience", "After Island": "after-island" };

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const stageColor = (s) => ({ Consulta: B.warning, Cotizado: B.sky, Confirmado: B.success, Realizado: "rgba(255,255,255,0.3)", Perdido: B.danger }[s] || B.sand);

// Calcula pax de evento/grupo: si ev.pax está seteado y > 0 lo usa,
// sino suma personas de pasadias_org (excluyendo Impuesto Muelle y STAFF).
function computePax(ev) {
  const paxOrg = (ev?.pasadias_org || [])
    .filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF")
    .reduce((s, p) => s + (Number(p.personas) || 0), 0);
  const n = Number(ev?.pax) || 0;
  return n > 0 ? n : paxOrg;
}

// ─── BEO Preview ─────────────────────────────────────────────────────────────
function BEOPreview({ evento, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.white, borderRadius: 16, padding: 40, width: 600, color: B.navy, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24, borderBottom: `2px solid ${B.sand}`, paddingBottom: 20 }}>
          <h2 style={{ fontSize: 24, color: B.navy }}>BANQUET EVENT ORDER</h2>
          <div style={{ fontSize: 14, color: "#666", marginTop: 4 }}>Atolon Beach Club — Cartagena</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, fontSize: 14 }}>
          <div><strong>Evento:</strong> {evento.nombre}</div>
          <div><strong>Tipo:</strong> {evento.tipo}</div>
          <div><strong>Fecha:</strong> {evento.fecha}</div>
          <div><strong>Pax:</strong> {evento.pax}</div>
          <div><strong>Contacto:</strong> {evento.contacto}</div>
          <div><strong>Valor:</strong> {COP(evento.valor)}</div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ color: B.navy, marginBottom: 8 }}>Servicios Incluidos</h4>
          <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20, color: "#444" }}>
            <li>Transporte ida y vuelta en embarcacion privada</li>
            <li>Uso exclusivo de zona asignada</li>
            <li>Servicio de bar premium (4 horas)</li>
            <li>Menu degustacion 3 tiempos</li>
            <li>DJ y sistema de sonido</li>
            <li>Decoracion tematica basica</li>
            <li>Coordinador de evento dedicado</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: B.navy, color: B.white, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Cerrar</button>
          <button style={{ flex: 1, padding: "12px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Descargar PDF</button>
        </div>
      </div>
    </div>
  );
}

// ─── Link del grupo ───────────────────────────────────────────────────────────
function GrupoLink({ evento, onClose }) {
  const [copied,       setCopied]       = useState(false);
  const [showRes,      setShowRes]      = useState(false);
  const [reservas,     setReservas]     = useState(null);
  const [loadingR,     setLoadingR]     = useState(false);
  const [salidasDB,    setSalidasDB]    = useState([]);

  // Load salidas for hora_regreso
  useEffect(() => {
    if (!supabase) return;
    supabase.from("salidas").select("id, hora, hora_regreso").eq("activo", true).order("orden")
      .then(({ data }) => setSalidasDB(data || []));
  }, []);
  // Organizador mode
  const [pasadias,     setPasadias]     = useState([]);
  const [pasadiaId,    setPasadiaId]    = useState("");
  const [paxOrg,       setPaxOrg]       = useState(String(evento.pax || ""));
  const [feForm,       setFeForm]       = useState({ ...FE_EMPTY });
  const setFE = (k, v) => setFeForm(f => ({ ...f, [k]: v }));
  const [tipoPrecio,   setTipoPrecio]   = useState("publico");
  const [metodoPago,   setMetodoPago]   = useState("");
  const [cuentas,      setCuentas]      = useState(null);
  const [procesando,   setProcesando]   = useState(false);
  const [reservaId,    setReservaId]    = useState("");   // ID de la reserva creada
  const [wompiLink,    setWompiLink]    = useState("");
  const [copiedPago,   setCopiedPago]   = useState(false);
  const [errPago,      setErrPago]      = useState("");

  const url = `${window.location.origin}/booking?grupo=${evento.id}`;
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  // Cargar pasadías si es modo organizador
  useEffect(() => {
    if (evento.modalidad_pago !== "organizador" || pasadias.length > 0) return;
    supabase.from("pasadias").select("id, nombre, precio, precio_neto_agencia").order("nombre")
      .then(({ data }) => setPasadias((data || []).filter(p => p.precio > 0)));
  }, []);

  // Cargar cuentas bancarias cuando seleccionan transferencia
  useEffect(() => {
    if (metodoPago !== "transferencia" || cuentas !== null) return;
    supabase.from("configuracion").select("cuentas_bancarias").eq("id", "atolon").single()
      .then(({ data }) => setCuentas(data?.cuentas_bancarias || []));
  }, [metodoPago]);

  const toggleReservas = async () => {
    if (showRes) { setShowRes(false); return; }
    setShowRes(true);
    if (reservas !== null) return;
    setLoadingR(true);
    const { data } = await supabase.from("reservas").select("*")
      .eq("grupo_id", evento.id).order("created_at", { ascending: false });
    setReservas(data || []);
    setLoadingR(false);
  };

  const totalPax      = (reservas || []).reduce((s, r) => s + (r.pax || 0), 0);
  const totalCOP      = (reservas || []).reduce((s, r) => s + (r.total || 0), 0);
  const pasadiaActual = pasadias.find(p => p.id === pasadiaId);
  const tieneAliado   = !!evento.aliado_id;
  const precioUnit    = (tieneAliado && tipoPrecio === "neto" && pasadiaActual?.precio_neto_agencia)
    ? pasadiaActual.precio_neto_agencia : (pasadiaActual?.precio || 0);
  const totalOrgCOP   = precioUnit * Number(paxOrg || 0);
  const canProcesar   = !!pasadiaActual && Number(paxOrg) >= 1 && !!metodoPago;

  // Crear reserva y procesar pago
  const procesarPago = async () => {
    if (!canProcesar || procesando) return;
    const feFaltan = feValidate(feForm);
    if (feFaltan.length > 0) {
      setErrPago("Faltan datos de facturación electrónica: " + feFaltan.map(k => k.replace("fe_","")).join(", "));
      return;
    }
    setProcesando(true);
    setErrPago("");
    const rid = `GRP-ORG-${Date.now()}`;
    const fechaISO = (evento.fecha || "").split("T")[0];
    const estado   = metodoPago === "transferencia" ? "pendiente_comprobante" : "pendiente_pago";

    const { error } = await supabase.from("reservas").insert({
      id:              rid,
      fecha:           fechaISO,
      tipo:            evento.tipo,
      pax:             Number(paxOrg),
      nombre:          evento.contacto || evento.nombre,
      email:           evento.email    || "",
      telefono:        evento.tel      || "",
      total:           totalOrgCOP,
      precio_neto:     precioUnit,
      precio_publico:  pasadiaActual.precio,
      grupo_id:        evento.id,
      aliado_id:       evento.aliado_id || null,
      canal:           "GRUPO-ORG",
      forma_pago:      metodoPago,
      estado,
      notas:           `Pago grupal — ${evento.nombre} — ${tipoPrecio === "neto" ? "precio neto B2B" : "precio público"}`,
      ...fePayload(feForm),
    });

    if (error) { setErrPago(error.message || "Error al crear la reserva"); setProcesando(false); return; }
    setReservaId(rid);

    if (metodoPago === "wompi" || metodoPago === "link_pago") {
      const link = await wompiCheckoutUrl({ referencia: rid, totalCOP: totalOrgCOP, redirectUrl: `${window.location.origin}/` });
      setWompiLink(link);
      if (metodoPago === "wompi") window.open(link, "_blank");
    }
    setProcesando(false);
  };

  const resetOrg = () => { setReservaId(""); setWompiLink(""); setMetodoPago(""); setErrPago(""); };
  const copyPago = () => { navigator.clipboard.writeText(wompiLink); setCopiedPago(true); setTimeout(() => setCopiedPago(false), 2000); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{evento.modalidad_pago === "organizador" ? "💳" : "🔗"}</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
            {evento.modalidad_pago === "organizador" ? "Pago grupal único" : "Link del grupo"}
          </h3>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {evento.nombre} · {fmtFecha(evento.fecha)}
            {(evento.salidas_grupo||[]).length > 0 && (
              <div style={{ marginTop: 4 }}>
                {[...evento.salidas_grupo].sort((a,b)=>a.hora.localeCompare(b.hora)).map(s => {
                  const sal = salidasDB.find(x => x.id === s.id);
                  return <span key={s.hora} style={{ marginRight: 12 }}>⛵ Salida {s.hora}{sal?.hora_regreso ? ` → Regreso ${sal.hora_regreso}` : ""}</span>;
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── MODO: Individual ── */}
        {evento.modalidad_pago !== "organizador" && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center", marginBottom: 14 }}>
              Comparte este link. Cada persona entra y paga su pasadía de forma independiente.
            </div>
            <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", marginBottom: 10, wordBreak: "break-all", fontSize: 13, color: B.sky, fontFamily: "monospace" }}>
              {url}
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button onClick={copy} style={{ flex: 1, padding: "11px", background: copied ? B.success : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {copied ? "✓ Copiado!" : "📋 Copiar link"}
              </button>
              <button onClick={() => window.open(url, "_blank")} style={{ flex: 1, padding: "11px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                👁 Ver página
              </button>
              <button onClick={toggleReservas} style={{ flex: 1, padding: "11px", background: showRes ? B.sand + "33" : B.navyLight, color: showRes ? B.sand : B.white, border: `1px solid ${showRes ? B.sand + "55" : "transparent"}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                📋 Reservas{reservas ? ` (${reservas.length})` : ""}
              </button>
            </div>
          </>
        )}

        {/* ── MODO: Organizador ── */}
        {evento.modalidad_pago === "organizador" && (
          <>
            {/* ── ESTADO: Reserva ya procesada ── */}
            {reservaId ? (
              <div>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: B.success, marginBottom: 4 }}>Reserva registrada</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{reservaId}</div>
                </div>

                {/* Resumen */}
                <div style={{ background: B.navy, borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 13, lineHeight: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Pasadía</span>
                    <span style={{ fontWeight: 600 }}>{pasadiaActual?.nombre}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Pasadías</span>
                    <span style={{ fontWeight: 600 }}>{paxOrg}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Precio unitario</span>
                    <span>{COP(precioUnit)}{tieneAliado && tipoPrecio === "neto" ? " (neto)" : ""}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${B.navyLight}`, paddingTop: 8, marginTop: 4 }}>
                    <span style={{ color: B.sand, fontWeight: 700 }}>Total</span>
                    <span style={{ color: B.sand, fontWeight: 800, fontSize: 16 }}>{COP(totalOrgCOP)}</span>
                  </div>
                </div>

                {/* Wompi link si aplica */}
                {wompiLink && (
                  <>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
                      {metodoPago === "wompi" ? "Checkout abierto — también puedes compartir este link:" : "Link de pago para enviar al organizador:"}
                    </div>
                    <div style={{ background: B.navy, borderRadius: 9, padding: "10px 12px", marginBottom: 8, wordBreak: "break-all", fontSize: 11, color: B.sky, fontFamily: "monospace" }}>{wompiLink}</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      <button onClick={copyPago} style={{ flex: 2, padding: "11px", background: copiedPago ? B.success : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                        {copiedPago ? "✓ Copiado!" : "📋 Copiar link"}
                      </button>
                      <button onClick={() => window.open(wompiLink, "_blank")} style={{ flex: 1, padding: "11px", background: "#5B4CF522", color: "#a78bfa", border: `1px solid #5B4CF544`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Abrir →</button>
                    </div>
                  </>
                )}

                {/* Datos bancarios si es transferencia */}
                {metodoPago === "transferencia" && cuentas && cuentas.length > 0 && (
                  <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Datos para transferencia</div>
                    {cuentas.map((c, i) => (
                      <div key={i} style={{ fontSize: 12, lineHeight: 2.1 }}>
                        {[["Banco", c.banco], ["Tipo", c.tipo], ["Número", c.numero], ["Titular", c.titular], ["NIT", c.nit]].filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}</span>
                            <span style={{ fontWeight: k === "Número" ? 700 : 400, color: k === "Número" ? B.sky : B.white }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={resetOrg} style={{ width: "100%", padding: "10px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>
                  ↺ Nueva transacción
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center", marginBottom: 16 }}>
                  El organizador paga todos los cupos de una vez.
                </div>

                {/* Pasadía + Cantidad */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={LS}>Pasadía</label>
                    <select value={pasadiaId} onChange={e => { setPasadiaId(e.target.value); setMetodoPago(""); }} style={{ ...IS }}>
                      <option value="">— Selecciona —</option>
                      {pasadias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={LS}>Total de pasadías</label>
                    <input type="number" min="1" value={paxOrg}
                      onChange={e => { setPaxOrg(e.target.value); setMetodoPago(""); }}
                      style={{ ...IS }} placeholder="Cantidad exacta" />
                  </div>
                </div>

                {/* Toggle neto / público — solo si hay aliado B2B */}
                {tieneAliado && pasadiaActual && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {[
                      { value: "publico", label: "💰 Precio público",  precio: pasadiaActual.precio },
                      { value: "neto",    label: "🤝 Precio neto B2B", precio: pasadiaActual.precio_neto_agencia },
                    ].map(opt => (
                      <div key={opt.value} onClick={() => { setTipoPrecio(opt.value); setMetodoPago(""); }}
                        style={{ flex: 1, padding: "10px 12px", borderRadius: 9, cursor: "pointer",
                          background: tipoPrecio === opt.value ? B.sky + "22" : B.navyLight,
                          border: `2px solid ${tipoPrecio === opt.value ? B.sky : "transparent"}`, transition: "all 0.15s" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: tipoPrecio === opt.value ? B.sky : "rgba(255,255,255,0.6)", marginBottom: 2 }}>{opt.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: tipoPrecio === opt.value ? B.sky : B.white }}>{opt.precio ? COP(opt.precio) : "—"}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                {pasadiaActual && Number(paxOrg) >= 1 && (
                  <div style={{ background: B.navy, borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Total a cobrar</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: B.sand }}>{COP(totalOrgCOP)}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>
                      <div>{COP(precioUnit)} × {paxOrg} pasadías</div>
                      {tieneAliado && <div style={{ marginTop: 2, color: tipoPrecio === "neto" ? B.sky : "rgba(255,255,255,0.3)" }}>{tipoPrecio === "neto" ? "Precio neto B2B" : "Precio público"}</div>}
                    </div>
                  </div>
                )}

                {/* Métodos de pago */}
                {pasadiaActual && Number(paxOrg) >= 1 && (
                  <>
                    <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Método de pago</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                      {[
                        { id: "wompi",         icon: <div style={{ width: 34, height: 34, borderRadius: 8, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", fontSize: 14, fontWeight: 900, color: "#fff" }}>W</div>, label: "Wompi",        sub: "Pagar ahora" },
                        { id: "transferencia", icon: <div style={{ fontSize: 24, marginBottom: 6, textAlign: "center" }}>🏦</div>, label: "Transferencia", sub: "PSE / Banco" },
                        { id: "link_pago",     icon: <div style={{ fontSize: 24, marginBottom: 6, textAlign: "center" }}>📲</div>, label: "Link de pago",  sub: "Enviar al cliente" },
                      ].map(m => (
                        <div key={m.id} onClick={() => setMetodoPago(m.id)}
                          style={{ background: metodoPago === m.id ? B.sky + "22" : B.navy, borderRadius: 12, padding: "14px 8px", textAlign: "center", cursor: "pointer",
                            border: `2px solid ${metodoPago === m.id ? B.sky : B.navyLight}`, transition: "all 0.15s" }}>
                          {m.icon}
                          <div style={{ fontSize: 12, fontWeight: 700, color: metodoPago === m.id ? B.sky : B.white, marginBottom: 2 }}>{m.label}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{m.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Preview transferencia antes de procesar */}
                    {metodoPago === "transferencia" && (
                      <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Datos bancarios</div>
                        {cuentas === null ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
                          : cuentas.length === 0 ? <div style={{ fontSize: 12, color: B.warning }}>⚠️ Configura cuentas en Configuración → Cuentas Bancarias</div>
                          : cuentas.map((c, i) => (
                            <div key={i} style={{ fontSize: 12, lineHeight: 2.1 }}>
                              {[["Banco", c.banco], ["Tipo", c.tipo], ["Número", c.numero], ["Titular", c.titular], ["NIT", c.nit]].filter(([, v]) => v).map(([k, v]) => (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}</span>
                                  <span style={{ fontWeight: k === "Número" ? 700 : 400, color: k === "Número" ? B.sky : B.white }}>{v}</span>
                                </div>
                              ))}
                            </div>
                          ))
                        }
                      </div>
                    )}

                    {errPago && <div style={{ padding: "8px 12px", background: "rgba(220,53,69,0.15)", border: `1px solid rgba(220,53,69,0.4)`, borderRadius: 8, fontSize: 12, color: "#ff6b7a", marginBottom: 10 }}>⚠️ {errPago}</div>}

                    <div style={{ marginBottom: 12 }}>
                      <FacturaElectronicaToggle checked={feForm.factura_electronica} onChange={v => setFE("factura_electronica", v)} theme="dark" />
                      {feForm.factura_electronica && <FacturaElectronicaForm form={feForm} set={setFE} editing={true} theme="dark" />}
                    </div>

                    <button onClick={procesarPago} disabled={!canProcesar || procesando}
                      style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14, cursor: canProcesar && !procesando ? "pointer" : "default", marginBottom: 12,
                        background: !canProcesar || procesando ? B.navyLight : (metodoPago === "wompi" ? "#5B4CF5" : metodoPago === "link_pago" ? B.success : B.sky),
                        color: !canProcesar || procesando ? "rgba(255,255,255,0.3)" : (metodoPago === "link_pago" ? B.navy : "#fff") }}>
                      {procesando ? "Procesando..." : metodoPago === "wompi" ? "💳 Cobrar con Wompi" : metodoPago === "transferencia" ? "🏦 Registrar y mostrar datos" : metodoPago === "link_pago" ? "📲 Generar link de pago" : "Selecciona un método de pago"}
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Lista de reservas (compartida) ── */}
        {showRes && (
          <div style={{ background: B.navy, borderRadius: 10, padding: 16, marginBottom: 12 }}>
            {loadingR ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "16px 0" }}>Cargando...</div>
            ) : reservas?.length === 0 ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "16px 0" }}>Aún no hay reservas en este grupo</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 16, marginBottom: 12, padding: "8px 12px", background: B.navyMid, borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Total personas: <strong style={{ color: B.white }}>{totalPax}</strong></span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Total recaudado: <strong style={{ color: B.success }}>{COP(totalCOP)}</strong></span>
                </div>
                {reservas.map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${B.navyLight}`, fontSize: 13 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{r.id} · {r.pax} pax · {r.tipo}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: B.sand, fontSize: 13 }}>{COP(r.total)}</div>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: r.estado === "confirmado" ? B.success + "22" : B.warning + "22", color: r.estado === "confirmado" ? B.success : B.warning }}>
                        {r.estado}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Info card */}
        <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", fontSize: 13, lineHeight: 1.8, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
          <div>📅 <strong style={{ color: B.white }}>
            {evento.fecha_fin && evento.fecha_fin !== evento.fecha
              ? `${fmtFecha(evento.fecha)} → ${fmtFecha(evento.fecha_fin)}`
              : fmtFecha(evento.fecha)}
          </strong></div>
          <div>🌴 <strong style={{ color: B.white }}>{evento.tipo}</strong></div>
          {(evento.salidas_grupo || []).length > 0 && (
            <div>⛵ <strong style={{ color: B.white }}>{[...(evento.salidas_grupo)].sort((a,b)=>a.hora.localeCompare(b.hora)).map(s => s.hora).join(" · ")}</strong></div>
          )}
          <div>👥 Cupos: <strong style={{ color: B.white }}>{evento.pax || "ilimitado"}</strong></div>
        </div>

        <button onClick={onClose} style={{ width: "100%", padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cerrar</button>
      </div>
    </div>
  );
}

// ─── Build zarpe slots from pasadias_org (excluye Impuesto Muelle) ───────────
function buildZarpeSlots(pasadiasOrg) {
  const slots = [];
  (pasadiasOrg || []).forEach(p => {
    if (p.tipo === "Impuesto Muelle") return;
    const n = Number(p.personas) || 0;
    for (let i = 0; i < n; i++) {
      slots.push({ slot_id: `${p.id}-${i}`, tipo: p.tipo, idx: i + 1 });
    }
  });
  return slots;
}

// ─── Modal crear/editar ───────────────────────────────────────────────────────
export function EventoModal({ evento, categoria, salidas, aliados, vendedores, onClose, onSaved, onShowLink }) {
  const isEdit   = !!evento?.id;
  const isGrupo  = categoria === "grupo";
  const tiposOpt = isGrupo ? TIPOS_GRUPO : TIPOS_EVT;

  const [form, setForm]       = useState(isEdit
    ? { ...FE_EMPTY, ...evento, pax: String(evento.pax || ""), valor: String(evento.valor || ""), aliado_id: evento.aliado_id || "", vendedor: evento.vendedor || "", salidas_grupo: evento.salidas_grupo || [], buy_out: evento.buy_out || false, modalidad_pago: evento.modalidad_pago || "individual", pasadias_org: evento.pasadias_org || [], precio_tipo: evento.precio_tipo || "publico", fecha_fin: evento.fecha_fin || "", buy_out_fechas: evento.buy_out_fechas || [] }
    : { nombre: "", tipo: tiposOpt[0], fecha: "", fecha_fin: "", pax: "", valor: "", aliado_id: "", vendedor: "", salidas_grupo: [], contacto: "", tel: "", email: "", empresa: "", nit: "", cargo: "", direccion: "", nacionalidad: "", montaje: "", hora_ini: "", hora_fin: "", vencimiento: "", stage: "Consulta", notas: "", categoria, buy_out: false, buy_out_fechas: [], modalidad_pago: "individual", pasadias_org: [], precio_tipo: "publico", ...FE_EMPTY });
  const setFE = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [saving,          setSaving]          = useState(false);
  const [horaInput,       setHoraInput]       = useState("");
  const [aliadoSearch,    setAliadoSearch]    = useState("");
  const [aliadoOpen,      setAliadoOpen]      = useState(false);
  const [pasadiasPrecios, setPasadiasPrecios] = useState([]);
  // Pago organizador
  const [metodoPago,      setMetodoPago]      = useState("");
  const [cuentasPago,     setCuentasPago]     = useState(null);
  const [procesandoPago,  setProcesandoPago]  = useState(false);
  const [wompiLinkOrg,    setWompiLinkOrg]    = useState("");
  const [copiedOrg,       setCopiedOrg]       = useState(false);
  const [errPago,         setErrPago]         = useState("");
  const [reservasPrevias, setReservasPrevias] = useState(null);
  const [pagoProcesado,   setPagoProcesado]   = useState(null);
  const [montoPago,       setMontoPago]       = useState("");
  const [fechaPago,       setFechaPago]       = useState(todayStr);
  // Zarpe grupal
  const [zarpeData,       setZarpeData]       = useState(evento?.zarpe_data       || []);
  const [invitadosZarpe,  setInvitadosZarpe]  = useState(evento?.invitados_zarpe  || []);
  const [zarpeLabel,      setZarpeLabel]      = useState("");
  const [zarpeSlots,      setZarpeSlots]      = useState("1");
  const [zarpeCreating,   setZarpeCreating]   = useState(false);
  const [copiedZarpe,     setCopiedZarpe]     = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Cargar precios de pasadías cuando es grupo
  useEffect(() => {
    if (!isGrupo) return;
    supabase.from("pasadias").select("id, nombre, precio, precio_neto_agencia, precio_nino, precio_neto_nino").order("nombre")
      .then(({ data }) => setPasadiasPrecios((data || []).filter(p => p.precio > 0)));
  }, [isGrupo]);

  // Cargar reservas previas al editar grupo organizador
  useEffect(() => {
    if (!isEdit || !isGrupo || form.modalidad_pago !== "organizador" || !supabase) return;
    supabase.from("reservas")
      .select("id, total, pax, estado, created_at, notas, forma_pago")
      .eq("grupo_id", evento.id).eq("canal", "GRUPO-ORG")
      .order("created_at", { ascending: false })
      .then(({ data }) => setReservasPrevias(data || []));
  }, [isEdit, form.modalidad_pago]);

  // Cargar zarpe data al editar grupo organizador
  useEffect(() => {
    if (!isEdit || !isGrupo || form.modalidad_pago !== "organizador" || !supabase) return;
    supabase.from("eventos").select("zarpe_data, invitados_zarpe").eq("id", evento.id).single()
      .then(({ data }) => {
        if (data) {
          setZarpeData(data.zarpe_data || []);
          setInvitadosZarpe(data.invitados_zarpe || []);
        }
      });
  }, [isEdit, isGrupo, form.modalidad_pago]);

  // Cargar cuentas bancarias al seleccionar transferencia
  useEffect(() => {
    if (metodoPago !== "transferencia" || cuentasPago !== null || !supabase) return;
    supabase.from("configuracion").select("cuentas_bancarias").eq("id", "atolon").single()
      .then(({ data }) => setCuentasPago(data?.cuentas_bancarias || []));
  }, [metodoPago]);

  const aliadoSeleccionado = aliados.find(a => a.id === form.aliado_id);
  const aliadosFiltrados   = aliados.filter(a =>
    a.nombre.toLowerCase().includes(aliadoSearch.toLowerCase()) ||
    a.tipo.toLowerCase().includes(aliadoSearch.toLowerCase())
  );

  // Toggle existing salida on/off in salidas_grupo
  const toggleSalida = (s) => {
    setForm(f => {
      const exists = f.salidas_grupo.some(x => x.id === s.id);
      return { ...f, salidas_grupo: exists
        ? f.salidas_grupo.filter(x => x.id !== s.id)
        : [...f.salidas_grupo, { id: s.id, hora: s.hora, personas: "" }]
      };
    });
  };

  // Add a custom (manual) salida hour
  const addCustomHora = () => {
    const h = horaInput.trim();
    if (!h) return;
    // normalize to HH:MM
    const match = h.match(/^(\d{1,2}):?(\d{2})?$/);
    const hora = match ? `${match[1].padStart(2,"0")}:${match[2] || "00"}` : h;
    if (form.salidas_grupo.some(x => x.hora === hora)) { setHoraInput(""); return; }
    setForm(f => ({ ...f, salidas_grupo: [...f.salidas_grupo, { id: `custom-${hora}`, hora, custom: true, personas: "" }] }));
    setHoraInput("");
  };

  const removeSalida = (hora) => setForm(f => ({ ...f, salidas_grupo: f.salidas_grupo.filter(x => x.hora !== hora) }));

  const setSalidaPersonas = (hora, personas) => setForm(f => ({
    ...f, salidas_grupo: f.salidas_grupo.map(x => x.hora === hora ? { ...x, personas } : x)
  }));

  // Pasadías múltiples (organizador)
  const addPasadiaOrg = () => setForm(f => ({
    ...f, pasadias_org: [...f.pasadias_org, { id: `p-${Date.now()}`, tipo: TIPOS_GRUPO[0], personas: "" }]
  }));
  const removePasadiaOrg = (id) => setForm(f => ({ ...f, pasadias_org: f.pasadias_org.filter(p => p.id !== id) }));
  // Tipos que tienen precio niño diferente → pedir adultos + niños
  const TIPOS_CON_NINOS = ["VIP Pass", "VIP Pass (Bebida + Impuesto de Muelle)", "After Island", "TRANSPORTE + CAMA DE PLAYA (Zona Playa)"];
  const setPasadiaOrg = (id, k, v) => setForm(f => ({
    ...f, pasadias_org: f.pasadias_org.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [k]: v };
      // Auto-calc personas from adultos + ninos when applicable
      if (TIPOS_CON_NINOS.includes(updated.tipo) && (k === "adultos" || k === "ninos")) {
        updated.personas = String((Number(updated.adultos) || 0) + (Number(updated.ninos) || 0));
      }
      // When switching to a tipo with ninos, keep personas in sync
      if (k === "tipo" && TIPOS_CON_NINOS.includes(v)) {
        updated.personas = String((Number(updated.adultos) || 0) + (Number(updated.ninos) || 0));
      }
      return updated;
    })
  }));

  // Precio unitario por tipo de pasadía (adulto)
  const getPrecioTipo = (p) => {
    if (p.tipo === "Impuesto Muelle") return PRECIO_MUELLE;
    if (p.tipo === "STAFF") return Number(p.precio_manual) || 0;
    const match = pasadiasPrecios.find(x => x.nombre.toLowerCase() === p.tipo.toLowerCase());
    if (!match) return null;
    return form.precio_tipo === "neto" ? (match.precio_neto_agencia || match.precio) : match.precio;
  };
  // Precio unitario niño
  const getPrecioNino = (p) => {
    const match = pasadiasPrecios.find(x => x.nombre.toLowerCase() === p.tipo.toLowerCase());
    if (!match) return 0;
    return form.precio_tipo === "neto" ? (match.precio_neto_nino || 0) : (match.precio_nino || 0);
  };

  // Total nuevo basado en pasadias_org — con desglose adultos/niños
  const nuevoTotal = (isGrupo && form.modalidad_pago === "organizador")
    ? (form.pasadias_org || []).reduce((s, p) => {
        const precio     = getPrecioTipo(p) || 0;
        const adultos    = Number(p.adultos) || 0;
        const ninos      = Number(p.ninos)   || 0;
        if (adultos > 0 || ninos > 0) {
          return s + precio * adultos + getPrecioNino(p) * ninos;
        }
        return s + precio * (Number(p.personas) || 0);
      }, 0)
    : 0;

  // Total pagado historial (no cancelados)
  const totalPagado = (reservasPrevias || [])
    .filter(r => r.estado !== "cancelado")
    .reduce((s, r) => s + (r.total || 0), 0);

  // Saldo: + = pendiente, - = a favor
  const saldoPago = nuevoTotal - totalPagado;

  // Procesar pago organizador (puede recibir grupoId para nuevos grupos)
  const procesarPago = async (grupoId) => {
    if (!metodoPago || procesandoPago) return;
    const feFaltan = feValidate(form);
    if (feFaltan.length > 0) {
      setErrPago("Faltan datos de facturación electrónica: " + feFaltan.map(k => k.replace("fe_","")).join(", "));
      return;
    }
    setProcesandoPago(true);
    setErrPago("");
    const montoDefault = (reservasPrevias !== null && reservasPrevias.length > 0) ? saldoPago : nuevoTotal;
    const montoOp  = Number(montoPago) > 0 ? Number(montoPago) : montoDefault;
    if (montoOp <= 0) { setErrPago(montoDefault < 0 ? `Saldo a favor de ${COP(Math.abs(montoDefault))} — no hay cobro pendiente.` : "El monto debe ser mayor a 0."); setProcesandoPago(false); return; }

    // ── Link de pago: solo genera URL, NO crea registro en historial ──────────
    if (metodoPago === "link_pago") {
      const tempRef = `GRP-ORG-${Date.now()}`;
      const link = await wompiCheckoutUrl({ referencia: tempRef, totalCOP: montoOp, redirectUrl: `${window.location.origin}/` });
      setWompiLinkOrg(link);
      setPagoProcesado({ id: null, total: montoOp, soloLink: true });
      setMontoPago("");
      setProcesandoPago(false);
      return;
    }

    // ── Wompi / Transferencia: crea registro en historial ────────────────────
    const rid = `GRP-ORG-${Date.now()}`;
    const fechaISO = (form.fecha || "").split("T")[0];
    const estado   = metodoPago === "transferencia" ? "pendiente_comprobante" : "pendiente_pago";
    const esAjuste = reservasPrevias !== null && reservasPrevias.length > 0;
    const fechaTag = `Fecha pago: ${fechaPago || todayStr}`;
    const notas    = esAjuste
      ? `${fechaTag} | Ajuste — ${form.nombre} — Total nuevo: ${COP(nuevoTotal)} — Ya pagado: ${COP(totalPagado)} — Pendiente: ${COP(montoOp)}`
      : `${fechaTag} | Pago grupal — ${form.nombre} — ${form.precio_tipo === "neto" ? "precio neto B2B" : "precio público"}`;
    // Impuesto Muelle no cuenta como pax (es un cobro, no una persona)
    const totalPax = (form.pasadias_org || [])
      .filter(p => p.tipo !== "Impuesto Muelle")
      .reduce((s, p) => s + (Number(p.personas) || 0), 0);
    const { error } = await supabase.from("reservas").insert({
      id: rid, fecha: fechaISO,
      tipo: (form.pasadias_org?.[0]?.tipo) || form.tipo || "Grupo",
      pax: totalPax, nombre: form.contacto || form.nombre,
      email: form.email || "", telefono: form.tel || "",
      total: montoOp, grupo_id: grupoId,
      aliado_id: form.aliado_id || null,
      canal: "GRUPO-ORG", forma_pago: metodoPago, estado, notas,
      salida_id: null,
      ...fePayload(form),
    });
    if (error) { setErrPago(error.message); setProcesandoPago(false); return; }
    setPagoProcesado({ id: rid, total: montoOp });
    setMontoPago("");
    setFechaPago(todayStr);
    // Refrescar historial
    const { data: nuevasRes } = await supabase.from("reservas")
      .select("id, total, pax, estado, created_at, notas, forma_pago")
      .eq("grupo_id", grupoId).eq("canal", "GRUPO-ORG")
      .order("created_at", { ascending: false });
    setReservasPrevias(nuevasRes || []);
    if (metodoPago === "wompi") {
      const link = await wompiCheckoutUrl({ referencia: rid, totalCOP: montoOp, redirectUrl: `${window.location.origin}/` });
      setWompiLinkOrg(link);
      window.open(link, "_blank");
    }
    setProcesandoPago(false);
  };

  const [saveError,      setSaveError]      = useState("");
  const [overrideModal,  setOverrideModal]  = useState(null); // { reservas: [], gerentes: [] }
  const [overrideGG,     setOverrideGG]     = useState("");
  const [overrideMotivo, setOverrideMotivo] = useState("");
  const [checkingDate,   setCheckingDate]   = useState(false);

  // Verifica si la fecha destino tiene reservas — retorna lista
  const checkReservasEnFecha = async (fecha) => {
    if (!fecha || !supabase) return [];
    const { data } = await supabase
      .from("reservas")
      .select("id, nombre, pax, tipo, estado")
      .eq("fecha", fecha)
      .in("estado", ["confirmado", "pendiente", "pendiente_pago", "pendiente_comprobante"]);
    return data || [];
  };

  const confirmarOverride = async () => {
    if (!overrideGG) return;
    setOverrideModal(null);
    await doSave(overrideGG, overrideMotivo);
    setOverrideGG(""); setOverrideMotivo("");
  };

  const save = async () => {
    if (!supabase || !form.nombre.trim() || !form.fecha) return;
    setCheckingDate(true);

    // Para buy-out multi-día, revisar todas las fechas marcadas para buy-out
    let reservasEnFecha = [];
    if (form.buy_out) {
      const fechasARevisar = (form.buy_out_fechas && form.buy_out_fechas.length > 0)
        ? form.buy_out_fechas
        : [form.fecha];
      const results = await Promise.all(fechasARevisar.map(f => checkReservasEnFecha(f)));
      reservasEnFecha = results.flat();
    }
    setCheckingDate(false);

    // Solo pedir aprobación GG si hay reservas Y el evento es buy-out (bloqueará la(s) fecha(s))
    // Grupos no buy-out coexisten con reservas individuales sin conflicto
    if (reservasEnFecha.length > 0 && form.buy_out) {
      const { data: gerentes } = await supabase
        .from("usuarios")
        .select("id, nombre")
        .in("rol_id", ["gerente_general", "super_admin", "director"])
        .eq("activo", true)
        .order("nombre");
      setOverrideModal({ reservas: reservasEnFecha, gerentes: gerentes || [] });
      return;
    }

    await doSave();
  };

  const doSave = async (aprobadoPor = null, motivoOverride = null) => {
    setSaving(true);
    setSaveError("");

    const valorFinal = isGrupo && form.modalidad_pago === "organizador"
      ? nuevoTotal
      : Number(form.valor) || 0;

    const payload = {
      nombre:       form.nombre.trim(),
      tipo:         form.tipo,
      fecha:        form.fecha,
      pax:          Number(form.pax) || 0,
      valor:        valorFinal,
      salidas_grupo: form.salidas_grupo,
      contacto:     form.contacto,
      tel:          form.tel,
      email:        form.email,
      empresa:      form.empresa || "",
      nit:          form.nit || "",
      cargo:        form.cargo || "",
      direccion:    form.direccion || "",
      nacionalidad: form.nacionalidad || "",
      montaje:      form.montaje || "",
      hora_ini:     form.hora_ini || "",
      hora_fin:     form.hora_fin || "",
      vencimiento:  form.vencimiento || "",
      stage:        form.stage,
      notas:        form.notas,
      categoria:    (["evento","grupo"].includes(form.categoria) ? form.categoria : null) || (["evento","grupo"].includes(categoria) ? categoria : "evento"),
      aliado_id:      form.aliado_id || null,
      vendedor:       form.vendedor || "",
      buy_out:        form.buy_out || false,
      buy_out_fechas: form.buy_out_fechas || [],
      fecha_fin:      form.fecha_fin || null,
      modalidad_pago: form.modalidad_pago || "individual",
      pasadias_org:   form.pasadias_org || [],
      precio_tipo:    form.precio_tipo || "publico",
    };
    let savedId = evento?.id;
    let dbError = null;
    if (isEdit) {
      const { error } = await supabase.from("eventos").update(payload).eq("id", evento.id);
      dbError = error;
    } else {
      savedId = `EVT-${Date.now()}`;
      const { error } = await supabase.from("eventos").insert({ id: savedId, ...payload });
      dbError = error;
    }
    if (dbError) {
      setSaveError(dbError.message || "Error al guardar. Intenta de nuevo.");
      setSaving(false);
      return;
    }
    // Loguear override de GG si aplica
    if (aprobadoPor) {
      try {
        await supabase.from("eventos_overrides").insert({
          id: `OVR-${Date.now()}`,
          evento_id: savedId,
          fecha: form.fecha,
          aprobado_por: aprobadoPor,
          motivo: motivoOverride || "",
          created_at: new Date().toISOString(),
        });
      } catch { /* tabla opcional */ }
    }
    // Si es Buy-Out y se está confirmando, cerrar la fecha para pasadías
    const wasConfirmado = isEdit && evento?.stage === "Confirmado";
    const fechaCambio   = isEdit && evento?.fecha !== form.fecha;

    if (form.buy_out && form.stage === "Confirmado") {
      // Determinar qué fechas aplican buy-out
      // Si hay buy_out_fechas seleccionadas → usar esas; si no (evento 1 día) → solo form.fecha
      const buyOutFechasEfectivas = (form.buy_out_fechas && form.buy_out_fechas.length > 0)
        ? form.buy_out_fechas
        : (form.fecha ? [form.fecha] : []);

      if (!wasConfirmado && buyOutFechasEfectivas.length > 0) {
        // Primera vez que se confirma → crear cierres para cada fecha buy-out
        for (let i = 0; i < buyOutFechasEfectivas.length; i++) {
          await supabase.from("cierres").insert({
            id: `CIE-${Date.now()}-${i}`,
            fecha: buyOutFechasEfectivas[i],
            tipo: "total",
            motivo: `Buy-Out: ${form.nombre.trim()}`,
            activo: true,
            creado_por: "Eventos",
          });
        }
      } else if (wasConfirmado) {
        // Ya estaba confirmado → borrar cierres anteriores de este evento y recrear con nuevas fechas
        const nombreAnterior = evento?.nombre || form.nombre.trim();
        await supabase.from("cierres")
          .delete()
          .eq("creado_por", "Eventos")
          .ilike("motivo", `%${nombreAnterior}%`);
        for (let i = 0; i < buyOutFechasEfectivas.length; i++) {
          await supabase.from("cierres").insert({
            id: `CIE-${Date.now()}-${i}`,
            fecha: buyOutFechasEfectivas[i],
            tipo: "total",
            motivo: `Buy-Out: ${form.nombre.trim()}`,
            activo: true,
            creado_por: "Eventos",
          });
        }
      }
    }
    setSaving(false);
    await onSaved();
    // Para nuevo grupo organizador con método de pago: no cerrar, procesar pago
    if (!isEdit && isGrupo && form.modalidad_pago === "organizador" && metodoPago && nuevoTotal > 0) {
      setReservasPrevias([]); // marca como "ya cargadas" (vacío = nuevo)
      await procesarPago(savedId);
      return; // el modal queda abierto mostrando el resultado
    }
    onClose();
    if (isGrupo && !isEdit && form.modalidad_pago !== "organizador") onShowLink({ ...payload, id: savedId });
  };

  return (
    <>
    {/* ── Override GG Modal ─────────────────────────────────────────────── */}
    {overrideModal && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
        <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.7)", border: `2px solid ${B.danger}44` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: B.danger }}>Requiere Aprobación</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>La fecha seleccionada tiene reservas activas</div>
            </div>
          </div>

          {/* Lista de reservas afectadas */}
          <div style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 20, maxHeight: 180, overflowY: "auto" }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              {overrideModal.reservas.length} reserva{overrideModal.reservas.length !== 1 ? "s" : ""} en {form.fecha}
            </div>
            {overrideModal.reservas.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${B.navyLight}22`, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{r.nombre}</span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>{r.pax} pax · {r.tipo} · <span style={{ color: B.sand }}>{r.estado}</span></span>
              </div>
            ))}
          </div>

          {/* Seleccionar GG */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ ...{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" } }}>Aprobado por (Gerente General)</label>
            <select value={overrideGG} onChange={e => setOverrideGG(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${overrideGG ? B.success : B.danger}`, color: B.white, fontSize: 13, outline: "none" }}>
              <option value="">— Seleccionar Gerente —</option>
              {overrideModal.gerentes.length > 0
                ? overrideModal.gerentes.map(g => <option key={g.id} value={g.nombre}>{g.nombre}</option>)
                : <option value="Gerente General">Gerente General</option>
              }
            </select>
          </div>

          {/* Motivo */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Motivo del override</label>
            <input value={overrideMotivo} onChange={e => setOverrideMotivo(e.target.value)}
              placeholder="Ej: Cliente VIP, reagendamiento urgente..."
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setOverrideModal(null); setOverrideGG(""); setOverrideMotivo(""); }}
              style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={confirmarOverride} disabled={!overrideGG || saving}
              style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: !overrideGG ? B.navyLight : B.danger, color: !overrideGG ? "rgba(255,255,255,0.3)" : "#fff", fontSize: 13, fontWeight: 700, cursor: !overrideGG ? "default" : "pointer" }}>
              {saving ? "Guardando..." : "✓ Confirmar Override"}
            </button>
          </div>
        </div>
      </div>
    )}

    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>
          {isEdit ? `Editar: ${evento.nombre}` : isGrupo ? "Nuevo Grupo Pasadía" : "Nuevo Evento"}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 1. Nombre */}
          <div>
            <label style={LS}>{isGrupo ? "Nombre del grupo / empresa" : "Nombre del evento"}</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS}
              placeholder={isGrupo ? "Ej: Grupo Empresas XYZ" : "Ej: Matrimonio García & Pérez"} />
          </div>

          {/* 2. Modalidad de pago — solo grupos */}
          {isGrupo && (
            <div>
              <label style={LS}>Modalidad de pago del grupo</label>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { value: "individual",  icon: "👥", label: "Cada invitado reserva",    desc: "Cada persona entra al link y paga su propio cupo" },
                  { value: "organizador", icon: "💳", label: "El organizador paga todo", desc: "Un solo pago Wompi para todos los cupos" },
                ].map(opt => (
                  <div key={opt.value} onClick={() => set("modalidad_pago", opt.value)}
                    style={{ flex: 1, padding: "12px 14px", borderRadius: 10, cursor: "pointer", userSelect: "none",
                      background: form.modalidad_pago === opt.value ? B.sky + "22" : B.navyLight,
                      border: `2px solid ${form.modalidad_pago === opt.value ? B.sky : "transparent"}`,
                      transition: "all 0.15s" }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{opt.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: form.modalidad_pago === opt.value ? B.sky : B.white, marginBottom: 3 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Agencia B2B — searchable */}
          <div style={{ position: "relative" }}>
            <label style={LS}>{isGrupo ? "Agencia / Aliado B2B" : "Aliado B2B (agencia / hotel / comisionista)"}</label>
            <div
              onClick={() => { setAliadoOpen(o => !o); setAliadoSearch(""); }}
              style={{ ...IS, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}
            >
              <span style={{ color: aliadoSeleccionado ? B.white : "rgba(255,255,255,0.3)" }}>
                {aliadoSeleccionado ? `${aliadoSeleccionado.nombre} — ${aliadoSeleccionado.tipo}` : "Sin aliado (directo)"}
              </span>
              <span style={{ opacity: 0.4 }}>▾</span>
            </div>
            {aliadoOpen && (
              <div style={{
                position: "absolute", zIndex: 100, top: "100%", left: 0, right: 0,
                background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 10,
                boxShadow: "0 8px 24px #0006", marginTop: 4, overflow: "hidden",
              }}>
                <input autoFocus value={aliadoSearch} onChange={e => setAliadoSearch(e.target.value)}
                  placeholder="Buscar agencia, hotel, comisionista..."
                  style={{ width: "100%", padding: "10px 14px", background: B.navy, border: "none", borderBottom: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                <div style={{ maxHeight: 220, overflowY: "auto" }}>
                  <div onClick={() => { set("aliado_id", ""); setAliadoOpen(false); }}
                    style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.4)", borderBottom: `1px solid ${B.navyLight}22` }}
                    onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    Sin aliado (directo)
                  </div>
                  {aliadosFiltrados.map(a => (
                    <div key={a.id} onClick={() => { set("aliado_id", a.id); setAliadoOpen(false); }}
                      style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, borderBottom: `1px solid ${B.navyLight}22` }}
                      onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ color: B.white, fontWeight: 600 }}>{a.nombre}</span>
                      <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8, fontSize: 11 }}>{a.tipo}</span>
                    </div>
                  ))}
                  {aliadosFiltrados.length === 0 && (
                    <div style={{ padding: "12px 14px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Sin resultados</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. Nombre del contacto + Nacionalidad */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Nombre del contacto / organizador</label>
              <input value={form.contacto} onChange={e => set("contacto", e.target.value)} style={IS} placeholder="Nombre del cliente o responsable" />
            </div>
            <div>
              <label style={LS}>Nacionalidad</label>
              <input value={form.nacionalidad} onChange={e => set("nacionalidad", e.target.value)} style={IS} placeholder="Ej: Colombiana" />
            </div>
          </div>

          {/* 5. Email + Teléfono */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Email</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} style={IS} placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <label style={LS}>Teléfono / WhatsApp</label>
              <input value={form.tel} onChange={e => set("tel", e.target.value)} style={IS} placeholder="+57 300 000 0000" />
            </div>
          </div>

          {/* 6. Vendedor + 7. Stage */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Vendedor responsable</label>
              <select value={form.vendedor} onChange={e => set("vendedor", e.target.value)} style={IS}>
                <option value="">Sin asignar</option>
                {vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Stage</label>
              <select value={form.stage} onChange={e => set("stage", e.target.value)} style={IS}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* 8. Tipo + Fecha inicio + Fecha fin */}
          {/* Para organizador: solo fechas (el tipo va en cada pasadía) */}
          {isGrupo && form.modalidad_pago === "organizador" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={LS}>Fecha inicio</label>
                <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LS}>Fecha fin <span style={{ fontWeight: 400, opacity: 0.5 }}>(opcional)</span></label>
                <input type="date" value={form.fecha_fin} onChange={e => set("fecha_fin", e.target.value)} style={IS} min={form.fecha} />
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={LS}>{isGrupo ? "Tipo de pasadía" : "Tipo de evento"}</label>
                <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>
                  {tiposOpt.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Fecha inicio</label>
                <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LS}>Fecha fin <span style={{ fontWeight: 400, opacity: 0.5 }}>(opcional)</span></label>
                <input type="date" value={form.fecha_fin} onChange={e => set("fecha_fin", e.target.value)} style={IS} min={form.fecha} />
              </div>
            </div>
          )}

          {/* Pax / Cupos */}
          {isGrupo && form.modalidad_pago !== "organizador" && (
            <div>
              <label style={LS}>Cupos máximos (0 = ilimitado)</label>
              <input type="number" value={form.pax} onChange={e => set("pax", e.target.value)} style={IS} placeholder="0" />
            </div>
          )}
          {!isGrupo && (
            <div>
              <label style={LS}>Número de personas (pax)</label>
              <input type="number" value={form.pax} onChange={e => set("pax", e.target.value)} style={IS} placeholder="0" />
            </div>
          )}

          {/* Pasadías múltiples — solo organizador */}
          {isGrupo && form.modalidad_pago === "organizador" && (() => {
            // Impuesto Muelle no es pasajero → excluir del conteo de pax
            const totalPax = form.pasadias_org
              .filter(p => p.tipo !== "Impuesto Muelle")
              .reduce((s, p) => s + (Number(p.personas) || 0), 0);
            const totalSal = form.salidas_grupo.reduce((s, x) => s + (Number(x.personas) || 0), 0);
            const mismatch = form.pasadias_org.filter(p => p.tipo !== "Impuesto Muelle").length > 0 && form.salidas_grupo.length > 0 && totalPax > 0 && totalSal > 0 && totalPax !== totalSal;
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={LS}>Pasadías del grupo</label>
                  {totalPax > 0 && (
                    <span style={{ fontSize: 12, color: mismatch ? B.danger : B.success, fontWeight: 700 }}>
                      {mismatch ? `⚠ ${totalPax} personas` : `✓ ${totalPax} personas`}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {form.pasadias_org.map(p => {
                    const isStaff  = p.tipo === "STAFF";
                    const isMuelle = p.tipo === "Impuesto Muelle";
                    const showExtra = isStaff || isMuelle;
                    const conNinos = TIPOS_CON_NINOS.includes(p.tipo);
                    return (
                      <div key={p.id} style={{ background: B.navy + "44", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: showExtra ? "1fr 90px 120px 32px" : conNinos ? "1fr 32px" : "1fr 110px 32px", gap: 8, alignItems: "center" }}>
                          <select value={p.tipo} onChange={e => setPasadiaOrg(p.id, "tipo", e.target.value)} style={IS}>
                            {TIPOS_GRUPO.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          {!conNinos && !showExtra && (
                            <input type="number" value={p.personas} onChange={e => setPasadiaOrg(p.id, "personas", e.target.value)}
                              placeholder="# pax" style={{ ...IS, textAlign: "center" }} />
                          )}
                          {!conNinos && isStaff && (
                            <>
                              <input type="number" value={p.personas} onChange={e => setPasadiaOrg(p.id, "personas", e.target.value)}
                                placeholder="# pax" style={{ ...IS, textAlign: "center" }} />
                              <input type="number" value={p.precio_manual || ""} onChange={e => setPasadiaOrg(p.id, "precio_manual", e.target.value)}
                                placeholder="Precio c/u" style={{ ...IS, fontSize: 12 }} />
                            </>
                          )}
                          {!conNinos && isMuelle && (
                            <>
                              <input type="number" value={p.personas} onChange={e => setPasadiaOrg(p.id, "personas", e.target.value)}
                                placeholder="# cobros" style={{ ...IS, textAlign: "center" }} />
                              <div style={{ ...IS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: B.sand, cursor: "default" }}>
                                {COP(PRECIO_MUELLE)} c/u
                              </div>
                            </>
                          )}
                          <button type="button" onClick={() => removePasadiaOrg(p.id)}
                            style={{ height: 38, borderRadius: 8, border: "none", background: B.danger + "33", color: B.danger, fontSize: 15, cursor: "pointer" }}>✕</button>
                        </div>
                        {/* Adultos + Niños para tipos con precio diferenciado */}
                        {conNinos && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 8, marginTop: 8 }}>
                            <div>
                              <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>Adultos</label>
                              <input type="number" value={p.adultos || ""} onChange={e => setPasadiaOrg(p.id, "adultos", e.target.value)}
                                placeholder="0" style={{ ...IS, textAlign: "center" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>Niños</label>
                              <input type="number" value={p.ninos || ""} onChange={e => setPasadiaOrg(p.id, "ninos", e.target.value)}
                                placeholder="0" style={{ ...IS, textAlign: "center" }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>Total pax</label>
                              <div style={{ ...IS, textAlign: "center", background: "transparent", border: "1px solid rgba(255,255,255,0.06)", color: B.sky, fontWeight: 700 }}>
                                {(Number(p.adultos) || 0) + (Number(p.ninos) || 0)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={addPasadiaOrg}
                  style={{ width: "100%", padding: "9px", borderRadius: 8, border: `1px dashed ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                  + Agregar pasadía
                </button>
                {mismatch && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: B.danger + "22", border: `1px solid ${B.danger}55`, fontSize: 12, color: B.danger }}>
                    ⚠ Pasadías: {totalPax} personas — Salidas: {totalSal} personas. Los totales no coinciden.
                  </div>
                )}
              </div>
            );
          })()}


          {/* Horarios de salida — solo grupos */}
          {isGrupo && (
            <div>
              <label style={LS}>Horarios de salida</label>
              {/* Chips de salidas disponibles */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {salidas.map(s => {
                  const sel = form.salidas_grupo.some(x => x.id === s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleSalida(s)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: sel ? B.sky : B.navyLight, color: sel ? B.navy : "rgba(255,255,255,0.5)" }}>
                      {sel ? "✓ " : ""}Salida {s.hora}
                    </button>
                  );
                })}
              </div>
              {/* Hora manual */}
              <div style={{ display: "flex", gap: 8, marginBottom: form.salidas_grupo.length > 0 ? 12 : 0 }}>
                <input value={horaInput} onChange={e => setHoraInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustomHora()}
                  placeholder="Agregar hora manual: 14:00" style={{ ...IS, flex: 1 }} />
                <button type="button" onClick={addCustomHora}
                  style={{ padding: "9px 16px", borderRadius: 8, background: B.sand, color: B.navy, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  + Agregar
                </button>
              </div>
              {/* Salidas seleccionadas */}
              {form.salidas_grupo.length > 0 && (
                form.modalidad_pago === "organizador" ? (
                  /* Organizador: cada salida con campo de personas */
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[...form.salidas_grupo].sort((a,b) => a.hora.localeCompare(b.hora)).map(s => (
                      <div key={s.hora} style={{ display: "grid", gridTemplateColumns: "auto 1fr 32px", gap: 8, alignItems: "center",
                        padding: "8px 12px", borderRadius: 10, background: s.custom ? B.warning + "11" : B.sky + "11",
                        border: `1px solid ${s.custom ? B.warning : B.sky}44` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: s.custom ? B.warning : B.sky, whiteSpace: "nowrap" }}>
                          ⛵ Salida {s.hora}{s.custom ? " (manual)" : ""}
                        </div>
                        <input type="number" value={s.personas || ""} onChange={e => setSalidaPersonas(s.hora, e.target.value)}
                          placeholder="# personas en esta salida"
                          style={{ ...IS, fontSize: 12, padding: "6px 10px" }} />
                        <button type="button" onClick={() => removeSalida(s.hora)}
                          style={{ height: 34, borderRadius: 8, border: "none", background: B.danger + "33", color: B.danger, fontSize: 14, cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    {/* Total salidas */}
                    {(() => {
                      const tot = form.salidas_grupo.reduce((s, x) => s + (Number(x.personas) || 0), 0);
                      return tot > 0 ? (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>
                          Total en salidas: <strong style={{ color: B.sky }}>{tot} personas</strong>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  /* Individual: chips simples */
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[...form.salidas_grupo].sort((a,b) => a.hora.localeCompare(b.hora)).map(s => (
                      <div key={s.hora} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 12px", borderRadius: 20, background: s.custom ? B.warning + "33" : B.sky + "33", border: `1px solid ${s.custom ? B.warning : B.sky}55`, fontSize: 12, fontWeight: 600, color: s.custom ? B.warning : B.sky }}>
                        ⛵ {s.hora}{s.custom ? " (manual)" : ""}
                        <button type="button" onClick={() => removeSalida(s.hora)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* Datos de cotización — solo eventos */}
          {!isGrupo && (
            <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 16, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, fontWeight: 700 }}>Datos para cotización</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={LS}>Empresa / Cliente</label>
                    <input value={form.empresa} onChange={e => set("empresa", e.target.value)} style={IS} placeholder="Nombre de la empresa o cliente" />
                  </div>
                  <div>
                    <label style={LS}>NIT / Identificación</label>
                    <input value={form.nit} onChange={e => set("nit", e.target.value)} style={IS} placeholder="900123456-7" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={LS}>Cargo del contacto</label>
                    <input value={form.cargo} onChange={e => set("cargo", e.target.value)} style={IS} placeholder="Gerente, Organizador..." />
                  </div>
                  <div>
                    <label style={LS}>Dirección</label>
                    <input value={form.direccion} onChange={e => set("direccion", e.target.value)} style={IS} placeholder="Dirección del cliente" />
                  </div>
                </div>
                <div>
                  <label style={LS}>Tipo de Montaje</label>
                  <input value={form.montaje} onChange={e => set("montaje", e.target.value)} style={IS} placeholder="Coctel, Cena, Auditorio..." />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={LS}>Hora Inicio</label>
                    <input value={form.hora_ini} onChange={e => set("hora_ini", e.target.value)} style={IS} placeholder="10:00" />
                  </div>
                  <div>
                    <label style={LS}>Hora Final</label>
                    <input value={form.hora_fin} onChange={e => set("hora_fin", e.target.value)} style={IS} placeholder="18:00" />
                  </div>
                  <div>
                    <label style={LS}>Vencimiento cotización</label>
                    <input type="date" value={form.vencimiento} onChange={e => set("vencimiento", e.target.value)} style={IS} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Precio — solo organizador */}
          {isGrupo && form.modalidad_pago === "organizador" && (() => {
            const lineas = form.pasadias_org.map(p => ({
              tipo: p.tipo,
              personas: Number(p.personas) || 0,
              adultos:  Number(p.adultos)  || 0,
              ninos:    Number(p.ninos)    || 0,
              precio:   getPrecioTipo(p),
              precioNino: getPrecioNino(p),
            }));
            const total = nuevoTotal;
            const sinPrecios = lineas.some(l => l.personas > 0 && l.tipo !== "Impuesto Muelle" && l.tipo !== "STAFF" && l.precio === null);
            return (
              <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 16 }}>
                <label style={LS}>Monto a pagar</label>

                {/* Selector precio público / neto */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  {[
                    { value: "publico", label: "💰 Precio público", desc: "Tarifa venta al cliente final" },
                    { value: "neto",    label: "🏢 Precio neto",    desc: "Tarifa agencia / comisionista" },
                  ].map(opt => (
                    <div key={opt.value} onClick={() => set("precio_tipo", opt.value)}
                      style={{ flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer", userSelect: "none",
                        background: form.precio_tipo === opt.value ? B.success + "22" : B.navyLight,
                        border: `2px solid ${form.precio_tipo === opt.value ? B.success : "transparent"}`,
                        transition: "all 0.15s" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.precio_tipo === opt.value ? B.success : B.white, marginBottom: 2 }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Desglose por tipo */}
                {lineas.filter(l => (l.personas + l.adultos + l.ninos) > 0).length > 0 && (
                  <div style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                    {lineas.filter(l => (l.personas + l.adultos + l.ninos) > 0).map((l, i) => {
                      const tieneSplit = (l.adultos > 0 || l.ninos > 0);
                      const sub = tieneSplit
                        ? (l.precio || 0) * l.adultos + (l.precioNino || 0) * l.ninos
                        : (l.precio || 0) * l.personas;
                      return (
                        <div key={i} style={{ padding: "6px 0", borderBottom: i < lineas.filter(x => (x.personas + x.adultos + x.ninos) > 0).length - 1 ? `1px solid ${B.navyLight}44` : "none", fontSize: 13 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "rgba(255,255,255,0.6)" }}>{l.tipo}</span>
                            <span style={{ fontWeight: 700, color: l.precio !== null ? B.white : B.warning }}>
                              {l.precio !== null ? COP(sub) : "—"}
                            </span>
                          </div>
                          {tieneSplit ? (
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                              {l.adultos > 0 && (
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span>{l.adultos} adulto{l.adultos !== 1 ? "s" : ""} × {COP(l.precio || 0)}</span>
                                  <span>{COP((l.precio || 0) * l.adultos)}</span>
                                </div>
                              )}
                              {l.ninos > 0 && (
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span>{l.ninos} niño{l.ninos !== 1 ? "s" : ""} × {COP(l.precioNino || 0)}</span>
                                  <span>{COP((l.precioNino || 0) * l.ninos)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                              {l.personas} pax × {COP(l.precio || 0)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      paddingTop: 10, marginTop: 4, borderTop: `1px solid ${B.navyLight}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</span>
                      <span style={{ fontSize: 20, fontWeight: 900, color: total > 0 ? B.success : "rgba(255,255,255,0.3)" }}>
                        {total > 0 ? COP(total) : "—"}
                      </span>
                    </div>
                  </div>
                )}

                {sinPrecios && (
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: B.warning + "22", border: `1px solid ${B.warning}55`, fontSize: 12, color: B.warning }}>
                    ⚠ Algunos tipos de pasadía no tienen precio configurado en el sistema.
                  </div>
                )}

                {/* ── Sección de Pago ── */}
                <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 14, marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12, fontWeight: 700 }}>Pago</div>

                  {/* Saldo si hay historial previo */}
                  {reservasPrevias !== null && reservasPrevias.length > 0 && (
                    <div style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>Ya pagado</span>
                        <span style={{ fontWeight: 700, color: B.success }}>{COP(totalPagado)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>Total nuevo</span>
                        <span style={{ fontWeight: 700 }}>{COP(nuevoTotal)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${B.navyLight}`, paddingTop: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>Saldo</span>
                        <span style={{ fontSize: 16, fontWeight: 900, color: saldoPago > 0 ? B.danger : saldoPago < 0 ? B.success : "rgba(255,255,255,0.4)" }}>
                          {saldoPago > 0 ? `⚠ ${COP(saldoPago)} pendiente` : saldoPago < 0 ? `✓ ${COP(Math.abs(saldoPago))} a favor` : "✓ Sin saldo"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Historial de transacciones */}
                  {reservasPrevias !== null && reservasPrevias.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Historial de pagos</div>
                      {reservasPrevias.map(r => {
                        const fechaM = (r.notas || "").match(/Fecha pago: (\d{4}-\d{2}-\d{2})/);
                        const fechaDisp = fechaM
                          ? new Date(fechaM[1] + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" })
                          : new Date(r.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
                        return (
                        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${B.navyLight}22`, fontSize: 12 }}>
                          <div>
                            <span style={{ color: "rgba(255,255,255,0.6)", marginRight: 8 }}>
                              {r.forma_pago === "wompi" ? "💳" : r.forma_pago === "transferencia" ? "🏦" : "📲"}
                              {" "}{fechaDisp}
                            </span>
                            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6,
                              background: r.estado === "confirmado" ? B.success + "33" : r.estado === "cancelado" ? B.danger + "33" : B.warning + "33",
                              color: r.estado === "confirmado" ? B.success : r.estado === "cancelado" ? B.danger : B.warning }}>
                              {r.estado}
                            </span>
                          </div>
                          <span style={{ fontWeight: 700, color: B.sand }}>{COP(r.total)}</span>
                        </div>
                      );
                      })}
                    </div>
                  )}

                  {/* Resultado post-pago */}
                  {pagoProcesado ? (
                    <div style={{ textAlign: "center", padding: "16px 0" }}>
                      {pagoProcesado.soloLink ? (
                        /* ── Solo link de pago — sin registro en historial ── */
                        <>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>📲</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: B.sky, marginBottom: 4 }}>Link de pago generado</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                            El pago se registrará en el historial cuando el cliente complete la transacción
                          </div>
                        </>
                      ) : (
                        /* ── Pago registrado (Wompi / Transferencia) ── */
                        <>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: B.success, marginBottom: 4 }}>Pago registrado</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", marginBottom: 12 }}>{pagoProcesado.id}</div>
                        </>
                      )}
                      {wompiLinkOrg && (
                        <>
                          <div style={{ background: B.navy, borderRadius: 9, padding: "10px 12px", marginBottom: 8, wordBreak: "break-all", fontSize: 11, color: B.sky, fontFamily: "monospace" }}>{wompiLinkOrg}</div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                            <button onClick={() => { navigator.clipboard.writeText(wompiLinkOrg); setCopiedOrg(true); setTimeout(() => setCopiedOrg(false), 2000); }}
                              style={{ flex: 2, padding: "10px", background: copiedOrg ? B.success : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                              {copiedOrg ? "✓ Copiado!" : "📋 Copiar link de pago"}
                            </button>
                            <button onClick={() => window.open(wompiLinkOrg, "_blank")}
                              style={{ flex: 1, padding: "10px", background: "#5B4CF522", color: "#a78bfa", border: `1px solid #5B4CF544`, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>Abrir →</button>
                          </div>
                        </>
                      )}
                      <button onClick={() => { setPagoProcesado(null); setWompiLinkOrg(""); setMetodoPago(""); }}
                        style={{ width: "100%", padding: "9px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>
                        {pagoProcesado.soloLink ? "Generar otro link" : "+ Registrar otro pago"}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Selector método de pago */}
                      {(saldoPago > 0 || reservasPrevias === null || reservasPrevias.length === 0) && nuevoTotal > 0 && (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                            {[
                              { id: "wompi",         icon: <div style={{ width: 30, height: 30, borderRadius: 7, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px", fontSize: 13, fontWeight: 900, color: "#fff" }}>W</div>, label: "Wompi", sub: "Pagar ahora" },
                              { id: "transferencia", icon: <div style={{ fontSize: 22, marginBottom: 4, textAlign: "center" }}>🏦</div>, label: "Transferencia", sub: "PSE / Banco" },
                              { id: "link_pago",     icon: <div style={{ fontSize: 22, marginBottom: 4, textAlign: "center" }}>📲</div>, label: "Link de pago", sub: "Enviar al cliente" },
                            ].map(m => (
                              <div key={m.id} onClick={() => setMetodoPago(m.id)}
                                style={{ background: metodoPago === m.id ? B.sky + "22" : B.navy, borderRadius: 10, padding: "12px 6px", textAlign: "center", cursor: "pointer",
                                  border: `2px solid ${metodoPago === m.id ? B.sky : B.navyLight}`, transition: "all 0.15s" }}>
                                {m.icon}
                                <div style={{ fontSize: 11, fontWeight: 700, color: metodoPago === m.id ? B.sky : B.white }}>{m.label}</div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{m.sub}</div>
                              </div>
                            ))}
                          </div>

                          {/* Fecha de pago + Monto ajustable */}
                          {metodoPago && metodoPago !== "link_pago" && (() => {
                            const montoDefault = (reservasPrevias !== null && reservasPrevias.length > 0) ? saldoPago : nuevoTotal;
                            return (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                                <div>
                                  <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>Fecha de pago</label>
                                  <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} style={{ ...IS, fontSize: 12 }} />
                                </div>
                                <div>
                                  <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>Monto a cobrar</label>
                                  <input type="number" value={montoPago} onChange={e => setMontoPago(e.target.value)}
                                    placeholder={String(montoDefault)} style={{ ...IS, fontSize: 12 }} />
                                </div>
                              </div>
                            );
                          })()}

                          {/* Datos bancarios si transferencia */}
                          {metodoPago === "transferencia" && (
                            <div style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                              <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Datos bancarios</div>
                              {cuentasPago === null ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
                                : cuentasPago.length === 0 ? <div style={{ fontSize: 12, color: B.warning }}>⚠️ Configura cuentas en Configuración → Cuentas Bancarias</div>
                                : cuentasPago.map((c, i) => (
                                  <div key={i} style={{ fontSize: 12, lineHeight: 2 }}>
                                    {[["Banco", c.banco], ["Tipo", c.tipo], ["Número", c.numero], ["Titular", c.titular]].filter(([, v]) => v).map(([k, v]) => (
                                      <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "rgba(255,255,255,0.4)" }}>{k}</span>
                                        <span style={{ fontWeight: k === "Número" ? 700 : 400, color: k === "Número" ? B.sky : B.white }}>{v}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))
                              }
                            </div>
                          )}

                          {errPago && <div style={{ padding: "8px 12px", background: "rgba(220,53,69,0.15)", border: `1px solid rgba(220,53,69,0.4)`, borderRadius: 8, fontSize: 12, color: "#ff6b7a", marginBottom: 10 }}>⚠️ {errPago}</div>}

                          <div style={{ marginBottom: 12 }}>
                            <FacturaElectronicaToggle checked={form.factura_electronica} onChange={v => setFE("factura_electronica", v)} theme="dark" />
                            {form.factura_electronica && <FacturaElectronicaForm form={form} set={setFE} editing={true} theme="dark" />}
                          </div>

                          <button onClick={() => procesarPago(isEdit ? evento.id : null)} disabled={!metodoPago || procesandoPago}
                            style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: metodoPago && !procesandoPago ? "pointer" : "default",
                              background: !metodoPago || procesandoPago ? B.navyLight : metodoPago === "wompi" ? "#5B4CF5" : metodoPago === "link_pago" ? B.success : B.sky,
                              color: !metodoPago || procesandoPago ? "rgba(255,255,255,0.3)" : metodoPago === "link_pago" ? B.navy : "#fff" }}>
                            {procesandoPago ? "Procesando..." : (() => {
                              const montoDefault = (reservasPrevias !== null && reservasPrevias.length > 0) ? saldoPago : nuevoTotal;
                              const montoBtn = Number(montoPago) > 0 ? Number(montoPago) : montoDefault;
                              if (metodoPago === "wompi") return `💳 Cobrar ${COP(montoBtn)} con Wompi`;
                              if (metodoPago === "transferencia") return `🏦 Registrar transferencia de ${COP(montoBtn)}`;
                              if (metodoPago === "link_pago") return `📲 Generar link de ${COP(montoBtn)}`;
                              return `Selecciona método — ${COP(montoBtn)}`;
                            })()}
                          </button>
                        </>
                      )}

                      {/* Saldo a favor — sin cobro */}
                      {reservasPrevias !== null && reservasPrevias.length > 0 && saldoPago <= 0 && (
                        <div style={{ padding: "10px 14px", borderRadius: 8, background: B.success + "22", border: `1px solid ${B.success}44`, fontSize: 13, color: B.success, textAlign: "center" }}>
                          {saldoPago === 0 ? "✓ Pago completo — sin saldo pendiente" : `✓ Saldo a favor del cliente: ${COP(Math.abs(saldoPago))}`}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Buy-Out */}
          <div onClick={() => set("buy_out", !form.buy_out)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, cursor: "pointer",
              background: form.buy_out ? "rgba(255,180,0,0.12)" : B.navyLight,
              border: `1px solid ${form.buy_out ? "#FFB400" : "transparent"}`, transition: "all 0.2s" }}>
            <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${form.buy_out ? "#FFB400" : "rgba(255,255,255,0.25)"}`,
              background: form.buy_out ? "#FFB400" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.2s" }}>
              {form.buy_out && <span style={{ color: B.navy, fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: form.buy_out ? "#FFB400" : B.white }}>Buy-Out</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Al confirmar, cierra la(s) fecha(s) seleccionada(s) para venta de pasadías</div>
            </div>
          </div>

          {/* Buy-Out fechas — selector de días cuando el evento es multi-día */}
          {form.buy_out && form.fecha && (() => {
            // Generar lista de fechas entre fecha y fecha_fin
            const dias = [];
            const start = new Date(form.fecha + "T12:00:00");
            const end = form.fecha_fin ? new Date(form.fecha_fin + "T12:00:00") : start;
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
              dias.push(d.toISOString().slice(0, 10));
            }
            if (dias.length <= 1) {
              // Evento de 1 día: buy-out aplica automáticamente a esa fecha, no hay que elegir
              return null;
            }
            // Multi-día: mostrar checkboxes para seleccionar qué días aplica buy-out
            const toggleFecha = (fecha) => {
              const cur = form.buy_out_fechas || [];
              const next = cur.includes(fecha) ? cur.filter(f => f !== fecha) : [...cur, fecha];
              set("buy_out_fechas", next);
            };
            const allSelected = dias.every(d => (form.buy_out_fechas || []).includes(d));
            const toggleAll = () => set("buy_out_fechas", allSelected ? [] : [...dias]);
            return (
              <div style={{ background: "rgba(255,180,0,0.07)", border: "1px solid rgba(255,180,0,0.25)", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#FFB400" }}>Días con Buy-Out (cierre de pasadías)</div>
                  <button type="button" onClick={toggleAll}
                    style={{ fontSize: 11, background: "none", border: "1px solid rgba(255,180,0,0.4)", borderRadius: 6, color: "#FFB400", padding: "3px 10px", cursor: "pointer" }}>
                    {allSelected ? "Quitar todos" : "Todos"}
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {dias.map(dia => {
                    const checked = (form.buy_out_fechas || []).includes(dia);
                    const label = new Date(dia + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
                    return (
                      <div key={dia} onClick={() => toggleFecha(dia)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                          background: checked ? "rgba(255,180,0,0.2)" : B.navyLight,
                          border: `1px solid ${checked ? "#FFB400" : "transparent"}`, transition: "all 0.15s" }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${checked ? "#FFB400" : "rgba(255,255,255,0.3)"}`,
                          background: checked ? "#FFB400" : "transparent", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: checked ? "#FFB400" : "rgba(255,255,255,0.6)", fontWeight: checked ? 700 : 400 }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
                {(form.buy_out_fechas || []).length === 0 && (
                  <div style={{ fontSize: 11, color: "rgba(255,180,0,0.5)", marginTop: 8 }}>Selecciona al menos un día para aplicar buy-out</div>
                )}
              </div>
            );
          })()}

          {/* Notas */}
          <div>
            <label style={LS}>Notas</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Requerimientos especiales, observaciones..." />
          </div>

          {/* ── Zarpe Grupal — solo organizador editando grupo existente ── */}
          {isGrupo && isEdit && form.modalidad_pago === "organizador" && (() => {
            const allSlots  = buildZarpeSlots(form.pasadias_org);
            const totalPax  = allSlots.length;
            const completados = allSlots.filter(s => zarpeData.some(z => z.slot_id === s.slot_id && z.nombre?.trim())).length;
            const zarpeUrl  = `${window.location.origin}/zarpe-grupo?ev=${evento.id}`;

            // Assigned slot_ids across all invitados
            const assignedIds = (invitadosZarpe || []).flatMap(inv => inv.slot_ids || []);
            const disponibles = allSlots.filter(s => !assignedIds.includes(s.slot_id)).length;

            const crearInvitacion = async () => {
              const n = Number(zarpeSlots);
              if (!zarpeLabel.trim() || n < 1 || n > disponibles) return;
              setZarpeCreating(true);
              const tok = Math.random().toString(36).substring(2, 10);
              const unassigned = allSlots.filter(s => !assignedIds.includes(s.slot_id)).slice(0, n);
              const newInv = { id: `INV-${Date.now()}`, label: zarpeLabel.trim(), slot_ids: unassigned.map(s => s.slot_id), tok };
              const updated = [...(invitadosZarpe || []), newInv];
              await supabase.from("eventos").update({ invitados_zarpe: updated }).eq("id", evento.id);
              setInvitadosZarpe(updated);
              setZarpeLabel("");
              setZarpeSlots("1");
              setZarpeCreating(false);
            };

            const eliminarInvitacion = async (id) => {
              const updated = (invitadosZarpe || []).filter(i => i.id !== id);
              await supabase.from("eventos").update({ invitados_zarpe: updated }).eq("id", evento.id);
              setInvitadosZarpe(updated);
            };

            const copyLink = (url) => {
              navigator.clipboard.writeText(url);
              setCopiedZarpe(url);
              setTimeout(() => setCopiedZarpe(""), 2000);
            };

            return (
              <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>
                    🛳 Zarpe del grupo
                  </div>
                  <span style={{ fontSize: 12, color: completados === totalPax && totalPax > 0 ? B.success : "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                    {completados}/{totalPax} completados
                  </span>
                </div>

                {/* Barra de progreso */}
                {totalPax > 0 && (
                  <div style={{ height: 6, borderRadius: 3, background: B.navyLight, marginBottom: 14, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: completados === totalPax ? B.success : B.sky, width: `${(completados / totalPax) * 100}%`, transition: "width 0.4s" }} />
                  </div>
                )}

                {/* Botón llenar todo / ver */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button type="button" onClick={() => window.open(zarpeUrl, "_blank")}
                    style={{ flex: 2, padding: "10px", borderRadius: 9, border: "none",
                      background: B.sky + "22", color: B.sky, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    📋 {completados === 0 ? "Llenar zarpe del grupo" : "Ver / editar zarpe"}
                  </button>
                  <button type="button" onClick={() => copyLink(zarpeUrl)}
                    style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${B.navyLight}`,
                      background: copiedZarpe === zarpeUrl ? B.success + "22" : "none",
                      color: copiedZarpe === zarpeUrl ? B.success : "rgba(255,255,255,0.5)",
                      fontSize: 12, cursor: "pointer" }}>
                    {copiedZarpe === zarpeUrl ? "✓ Copiado" : "🔗 Copiar"}
                  </button>
                </div>

                {/* Lista invitaciones existentes */}
                {(invitadosZarpe || []).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Invitaciones enviadas
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(invitadosZarpe || []).map(inv => {
                        const invUrl = `${window.location.origin}/zarpe-grupo?ev=${evento.id}&tok=${inv.tok}`;
                        const filled = (inv.slot_ids || []).filter(sid => zarpeData.some(z => z.slot_id === sid && z.nombre?.trim())).length;
                        return (
                          <div key={inv.id} style={{ background: B.navy, borderRadius: 10, padding: "10px 12px",
                            display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, color: B.white }}>{inv.label}</div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                                {filled}/{inv.slot_ids?.length || 0} pasajeros · {(inv.slot_ids || []).length > 0 ? (zarpeData.find(z => z.slot_id === inv.slot_ids[0])?.tipo || "—") : "—"}
                              </div>
                            </div>
                            <button type="button" onClick={() => copyLink(invUrl)}
                              style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${B.navyLight}`,
                                background: copiedZarpe === invUrl ? B.success + "22" : "transparent",
                                color: copiedZarpe === invUrl ? B.success : "rgba(255,255,255,0.5)",
                                fontSize: 11, cursor: "pointer" }}>
                              {copiedZarpe === invUrl ? "✓" : "🔗"}
                            </button>
                            <button type="button" onClick={() => window.open(invUrl, "_blank")}
                              style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${B.navyLight}`,
                                background: "transparent", color: B.sky, fontSize: 11, cursor: "pointer" }}>
                              →
                            </button>
                            <button type="button" onClick={() => eliminarInvitacion(inv.id)}
                              style={{ padding: "5px 10px", borderRadius: 7, border: "none",
                                background: B.danger + "22", color: B.danger, fontSize: 11, cursor: "pointer" }}>
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Crear nueva invitación */}
                {disponibles > 0 && (
                  <div style={{ background: B.navy, borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      + Crear invitación ({disponibles} cupos disponibles)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px", gap: 8 }}>
                      <input value={zarpeLabel} onChange={e => setZarpeLabel(e.target.value)}
                        placeholder="Nombre / grupo (ej: Familia García)"
                        style={{ ...IS, fontSize: 12, padding: "7px 10px" }} />
                      <input type="number" value={zarpeSlots} min="1" max={String(disponibles)}
                        onChange={e => setZarpeSlots(e.target.value)}
                        placeholder="# pax" style={{ ...IS, fontSize: 12, padding: "7px 10px", textAlign: "center" }} />
                      <button type="button" onClick={crearInvitacion}
                        disabled={zarpeCreating || !zarpeLabel.trim() || Number(zarpeSlots) < 1 || Number(zarpeSlots) > disponibles}
                        style={{ padding: "7px", borderRadius: 8, border: "none",
                          background: zarpeLabel.trim() && Number(zarpeSlots) >= 1 && Number(zarpeSlots) <= disponibles ? B.success : B.navyLight,
                          color: zarpeLabel.trim() ? B.navy : "rgba(255,255,255,0.3)",
                          fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        {zarpeCreating ? "..." : "Crear →"}
                      </button>
                    </div>
                  </div>
                )}

                {totalPax === 0 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "8px 0" }}>
                    Agrega pasadías al grupo para habilitar el zarpe
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {saveError && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(220,53,69,0.15)", border: "1px solid rgba(220,53,69,0.4)", borderRadius: 8, fontSize: 12, color: "#ff6b7a" }}>
            ⚠️ {saveError}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving || checkingDate || !form.nombre.trim() || !form.fecha}
            style={{ flex: 2, padding: "11px", background: (saving || checkingDate) ? B.navyLight : B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {checkingDate ? "Verificando..." : saving ? "Guardando..." : isGrupo && !isEdit ? "Crear y generar link →" : isEdit ? "Guardar cambios" : "Crear Evento"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ─── Modal reservas de grupo ──────────────────────────────────────────────────
export function ReservasGrupoModal({ evento, onClose }) {
  const [reservas,    setReservas]    = useState(null);
  const [selected,    setSelected]    = useState(null); // reserva detalle
  const [sending,     setSending]     = useState(false);
  const [sendMsg,     setSendMsg]     = useState("");

  const load = () => {
    if (!supabase) return;
    supabase.from("reservas").select("*")
      .eq("grupo_id", evento.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setReservas(data || []));
  };
  useEffect(load, [evento]);

  const totalPax = (reservas || []).reduce((s, r) => s + (r.pax || 0), 0);
  const totalCOP = (reservas || []).reduce((s, r) => s + (r.total || 0), 0);

  const estadoColor = (e) => e === "confirmado" ? B.success : e === "cancelado" ? B.danger : B.warning;

  const reenviarEmail = async (r) => {
    setSending(true); setSendMsg("");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-confirmation`,
        { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }, body: JSON.stringify(r) }
      );
      setSendMsg(res.ok ? "✅ Correo reenviado" : "⚠️ Error al reenviar");
    } catch { setSendMsg("⚠️ Error de conexión"); }
    setSending(false);
    setTimeout(() => setSendMsg(""), 3000);
  };

  // ── Detalle de una reserva ──────────────────────────────────────────────────
  if (selected) {
    const r = selected;
    const confirmUrl = `${window.location.origin}/zarpe-info?id=${r.id}`;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
        onClick={e => e.target === e.currentTarget && setSelected(null)}>
        <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 500, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: B.sky, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 6 }}>← Volver al grupo</button>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>{r.nombre}</h3>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{r.id}</div>
            </div>
            <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 10, background: estadoColor(r.estado) + "22", color: estadoColor(r.estado), fontWeight: 700 }}>{r.estado}</span>
          </div>

          {/* Info */}
          <div style={{ background: B.navy, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
              {[
                ["📅 Fecha",    fmtFecha(r.fecha)],
                ["🎟 Tipo",     r.tipo],
                ["👥 Personas", `${r.pax} pax`],
                ["💵 Total",    COP(r.total)],
                ["📧 Email",    r.email || r.contacto || "—"],
                ["📱 Teléfono", r.telefono || "—"],
                ["💳 Forma pago", r.forma_pago || "—"],
                ["⛵ Salida",   r.salida_id || "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontWeight: 600, wordBreak: "break-all" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Acciones */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Ver certificado */}
            <a href={confirmUrl} target="_blank" rel="noreferrer"
              style={{ display: "block", padding: "11px", borderRadius: 8, background: B.sand + "22", border: `1px solid ${B.sand}44`, color: B.sand, fontSize: 13, fontWeight: 700, textAlign: "center", textDecoration: "none" }}>
              🎫 Ver certificado / confirmación
            </a>
            {/* Reenviar correo */}
            {(r.email || r.contacto) && (
              <button onClick={() => reenviarEmail(r)} disabled={sending}
                style={{ padding: "11px", borderRadius: 8, border: `1px solid ${B.sky}44`, background: B.sky + "22", color: B.sky, fontSize: 13, fontWeight: 700, cursor: sending ? "default" : "pointer", opacity: sending ? 0.6 : 1 }}>
                {sending ? "Enviando..." : `📧 Reenviar confirmación a ${r.email || r.contacto}`}
              </button>
            )}
            {sendMsg && <div style={{ textAlign: "center", fontSize: 13, color: sendMsg.startsWith("✅") ? B.success : B.warning }}>{sendMsg}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 540, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>👥 Reservas del grupo</h3>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{evento.nombre} · {fmtFecha(evento.fecha)}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {reservas === null ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
        ) : reservas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            Aún no hay reservas en este grupo.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 20, padding: "10px 14px", background: B.navy, borderRadius: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>👥 <strong style={{ color: B.white }}>{totalPax} personas</strong></span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>💵 <strong style={{ color: B.success }}>{COP(totalCOP)}</strong></span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>🎟 <strong style={{ color: B.white }}>{reservas.length} reservas</strong></span>
            </div>
            {reservas.map(r => (
              <div key={r.id} onClick={() => setSelected(r)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", borderRadius: 8, margin: "2px 0" }}
                onMouseEnter={e => e.currentTarget.style.background = B.navy}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.nombre}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                    {r.id} · {r.tipo} · {r.pax} {r.pax === 1 ? "persona" : "personas"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ fontWeight: 700, color: B.sand, fontSize: 14 }}>{COP(r.total)}</div>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10,
                    background: estadoColor(r.estado) + "22", color: estadoColor(r.estado) }}>
                    {r.estado}
                  </span>
                </div>
                <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 16 }}>›</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Kanban board ─────────────────────────────────────────────────────────────
function KanbanBoard({ items, isGrupo, onEdit, onBeo, onLink, onCotizar, onReservas, onExtras, aliados }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 16 }}>
      {STAGES.map(stage => (
        <div key={stage}>
          <div style={{ fontSize: 13, color: stageColor(stage), textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
            {stage} ({items.filter(e => e.stage === stage).length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.filter(e => e.stage === stage).map(ev => (
              <div key={ev.id} onClick={() => onEdit(ev)}
                style={{ background: B.navyMid, borderRadius: 12, padding: 16, cursor: "pointer", borderLeft: `3px solid ${stageColor(stage)}` }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{ev.nombre}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                  {ev.tipo} · {ev.fecha_fin && ev.fecha_fin !== ev.fecha ? `${fmtFecha(ev.fecha)} → ${fmtFecha(ev.fecha_fin)}` : fmtFecha(ev.fecha)}
                  {(ev.salidas_grupo || []).length > 0 && ` · ⛵ ${[...ev.salidas_grupo].sort((a,b)=>a.hora.localeCompare(b.hora)).map(s=>s.hora).join(", ")}`}
                  {` · ${computePax(ev)} pax`}
                </div>
                {ev.contacto && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{ev.contacto}</div>}
                {ev.aliado_id && <div style={{ fontSize: 11, color: B.sky, marginBottom: 4 }}>🤝 {aliados.find(a => a.id === ev.aliado_id)?.nombre || ev.aliado_id}</div>}
                {ev.vendedor && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>👤 {ev.vendedor}</div>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ev.categoria !== "grupo" && (
                    <button onClick={e => { e.stopPropagation(); onBeo(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.navyLight, color: B.white, border: "none", cursor: "pointer" }}>Ver BEO</button>
                  )}
                  {ev.categoria !== "grupo" && (
                    <button onClick={e => { e.stopPropagation(); onCotizar(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.sand + "33", color: B.sand, border: `1px solid ${B.sand}44`, cursor: "pointer", fontWeight: 600 }}>📋 Cotizar</button>
                  )}
                  {ev.categoria === "grupo" && ev.modalidad_pago !== "organizador" && (
                    <button onClick={e => { e.stopPropagation(); onLink(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.sky + "33", color: B.sky, border: `1px solid ${B.sky}44`, cursor: "pointer" }}>🔗 Ver link</button>
                  )}
                  {ev.categoria === "grupo" && ev.modalidad_pago !== "organizador" && (
                    <button onClick={e => { e.stopPropagation(); onReservas(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.sand + "22", color: B.sand, border: `1px solid ${B.sand}44`, cursor: "pointer" }}>👥 Reservas</button>
                  )}
                </div>
              </div>
            ))}
            {items.filter(e => e.stage === stage).length === 0 && (
              <div style={{ borderRadius: 10, border: `1.5px dashed ${B.navyLight}`, padding: "20px 12px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
                Sin registros
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Cotización Modal ──────────────────────────────────────────────────────────
const EMPTY_LINE = { concepto: "", cantidad: 1, noches: 1, valor_unit: 0, iva: 19 };

function calcLine(l) {
  const sub  = l.cantidad * (l.noches || 1) * l.valor_unit;
  const tax  = sub * (l.iva / 100);
  return { sub, tax, total: sub + tax };
}

const MENU_TIPOS = ["Menú de Banquetes", "Menú Restaurant", "Custom Menu", "Menú Bebidas"];

function SectionTable({ title, color, rows, setRows, showNoches = false, showMenuType = false, catalogItems = null, bebidasItems = null, menuCatalogs = null, defaultIva = 19 }) {
  const [picker,      setPicker]      = useState(false);
  const [activeCat,   setActiveCat]   = useState(null); // null | { label, items }

  const addRow = (overrides = {}) => {
    setRows(r => [...r, { ...EMPTY_LINE, iva: defaultIva, ...overrides }]);
    setPicker(false);
  };
  const upd = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const del = (i) => setRows(r => r.filter((_, j) => j !== i));

  const totals = rows.reduce((acc, l) => {
    const { sub, tax, total } = calcLine(l);
    return { sub: acc.sub + sub, tax: acc.tax + tax, total: acc.total + total };
  }, { sub: 0, tax: 0, total: 0 });

  const hasPicker = showMenuType || catalogItems !== null || bebidasItems !== null || menuCatalogs !== null;

  const th = { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: B.white, textTransform: "uppercase", letterSpacing: "0.05em", background: color, textAlign: "left" };
  const td = { padding: "6px 8px", fontSize: 12, borderBottom: `1px solid ${B.navyLight}` };
  const inp = (val, onChange, type = "text", w = "100%") => (
    <input type={type} value={val} onChange={onChange}
      style={{ width: w, background: "transparent", border: "none", color: B.white, fontSize: 12, outline: "none", padding: "2px 4px" }} />
  );

  return (
    <div style={{ marginBottom: 24, position: "relative" }}>
      <div style={{ background: color, padding: "10px 14px", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, color: B.white, fontSize: 14 }}>{title}</span>
        <button onClick={() => hasPicker ? setPicker(p => !p) : addRow()}
          style={{ background: "rgba(255,255,255,0.2)", border: "none", color: B.white, borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>+ Agregar</button>
      </div>

      {/* Picker dropdown */}
      {picker && (
        <div style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: 16, marginBottom: 0, position: "absolute", right: 0, top: 42, zIndex: 10, boxShadow: "0 8px 24px #0006", minWidth: 300, maxHeight: 320, overflowY: "auto" }}>
          {/* Catalog items (espacios from menu_items) */}
          {catalogItems !== null && (
            <>
              {catalogItems.length > 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Espacios disponibles</div>
              )}
              {catalogItems.map(item => (
                <button key={item.id} onClick={() => addRow({ concepto: item.nombre, valor_unit: item.precio, iva: item.tiene_iva === false ? 0 : 19 })}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, cursor: "pointer", textAlign: "left", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{item.nombre}</span>
                  {item.precio > 0 && <span style={{ fontSize: 11, color: B.sand }}>{COP(item.precio)}</span>}
                </button>
              ))}
              <button onClick={() => addRow()}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px dashed ${B.navyLight}`, color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", textAlign: "left", marginTop: 4 }}>
                ✏️ Otro (descripción manual)
              </button>
            </>
          )}
          {/* Multi-catalog menu picker (banquetes, restaurant, etc.) */}
          {menuCatalogs && !activeCat && (
            <>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Seleccionar menú</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {menuCatalogs.map(mc => (
                  <button key={mc.label} onClick={() => setActiveCat(mc)}
                    style={{ padding: "10px 16px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, cursor: "pointer", textAlign: "left", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{mc.label}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{mc.items.length} ítems ›</span>
                  </button>
                ))}
                <button onClick={() => addRow()}
                  style={{ width: "100%", padding: "9px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px dashed ${B.navyLight}`, color: "rgba(255,255,255,0.45)", fontSize: 13, cursor: "pointer", textAlign: "left", marginTop: 2 }}>
                  ✏️ Custom / descripción manual
                </button>
              </div>
            </>
          )}
          {/* Sub-picker: items of selected menu */}
          {menuCatalogs && activeCat && (() => {
            const bycat = activeCat.items.reduce((acc, it) => { if (!acc[it.categoria]) acc[it.categoria] = []; acc[it.categoria].push(it); return acc; }, {});
            return (
              <>
                <button onClick={() => setActiveCat(null)} style={{ background: "none", border: "none", color: B.sky, fontSize: 12, cursor: "pointer", marginBottom: 10, padding: 0, fontWeight: 600 }}>← {activeCat.label}</button>
                {Object.entries(bycat).map(([cat, its]) => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, paddingLeft: 2 }}>{cat}</div>
                    {its.map(it => (
                      <button key={it.id} onClick={() => { addRow({ concepto: it.nombre, valor_unit: it.precio, iva: it.tiene_iva === false ? 0 : defaultIva, menu_tipo: activeCat.label }); setActiveCat(null); }}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, cursor: "pointer", textAlign: "left", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{it.nombre}</span>
                        {it.precio > 0 && <span style={{ fontSize: 11, color: B.sand, flexShrink: 0, marginLeft: 8 }}>{COP(it.precio)}</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            );
          })()}
          {/* Bebidas catalog */}
          {bebidasItems !== null && bebidasItems.length > 0 && (() => {
            const bycat = bebidasItems.reduce((acc, it) => { if (!acc[it.categoria]) acc[it.categoria] = []; acc[it.categoria].push(it); return acc; }, {});
            return (
              <>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Menú Bebidas</div>
                {Object.entries(bycat).map(([cat, its]) => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, paddingLeft: 4 }}>{cat}</div>
                    {its.map(it => (
                      <button key={it.id} onClick={() => addRow({ concepto: it.nombre, valor_unit: it.precio, iva: it.tiene_iva === false ? 0 : defaultIva })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, cursor: "pointer", textAlign: "left", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{it.nombre}</span>
                        {it.precio > 0 && <span style={{ fontSize: 11, color: B.sand, flexShrink: 0, marginLeft: 8 }}>{COP(it.precio)}</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", background: B.navyMid }}>
        <thead>
          <tr>
            <th style={{ ...th, background: color + "cc", width: showMenuType ? "30%" : "35%" }}>Concepto</th>
            {showMenuType && <th style={{ ...th, background: color + "cc", width: "14%" }}>Tipo Menú</th>}
            <th style={{ ...th, background: color + "cc", width: "8%", textAlign: "center" }}>Cant.</th>
            {showNoches && <th style={{ ...th, background: color + "cc", width: "8%", textAlign: "center" }}>Noches</th>}
            <th style={{ ...th, background: color + "cc", width: "15%", textAlign: "right" }}>Valor Unit.</th>
            <th style={{ ...th, background: color + "cc", width: "8%", textAlign: "center" }}>{defaultIva === 8 ? "ICO" : "IVA"}</th>
            <th style={{ ...th, background: color + "cc", width: "12%", textAlign: "right" }}>Subtotal</th>
            <th style={{ ...th, background: color + "cc", width: "12%", textAlign: "right" }}>Total</th>
            <th style={{ ...th, background: color + "cc", width: "4%" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => {
            const { sub, total } = calcLine(l);
            return (
              <tr key={i}>
                <td style={td}>{inp(l.concepto, e => upd(i, "concepto", e.target.value))}</td>
                {showMenuType && (
                  <td style={td}>
                    <select value={l.menu_tipo || ""} onChange={e => upd(i, "menu_tipo", e.target.value)}
                      style={{ background: "transparent", border: "none", color: B.white, fontSize: 11, outline: "none", width: "100%", cursor: "pointer" }}>
                      <option value="">—</option>
                      {MENU_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                )}
                <td style={{ ...td, textAlign: "center" }}>{inp(l.cantidad, e => upd(i, "cantidad", Number(e.target.value)), "number", "60px")}</td>
                {showNoches && <td style={{ ...td, textAlign: "center" }}>{inp(l.noches, e => upd(i, "noches", Number(e.target.value)), "number", "60px")}</td>}
                <td style={{ ...td, textAlign: "right" }}>{inp(l.valor_unit, e => upd(i, "valor_unit", Number(e.target.value)), "number", "100px")}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => upd(i, "iva", l.iva > 0 ? 0 : defaultIva)}
                    style={{ padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                      background: l.iva > 0 ? "rgba(46,125,82,0.3)" : "rgba(255,255,255,0.08)",
                      color: l.iva > 0 ? "#4caf50" : "rgba(255,255,255,0.35)" }}>
                    {l.iva > 0 ? `${l.iva}%` : "No"}
                  </button>
                </td>
                <td style={{ ...td, textAlign: "right", color: B.sand }}>{COP(sub)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(total)}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => del(i)} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={showNoches ? (showMenuType ? 9 : 8) : (showMenuType ? 8 : 7)} style={{ ...td, textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 16 }}>Sin ítems — haz click en "+ Agregar"</td></tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={showNoches ? 5 : 4} style={{ padding: "8px 10px", fontSize: 12, color: B.sand, textAlign: "right", fontWeight: 600 }}>TOTAL {title.toUpperCase()}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: B.sand, fontSize: 12 }}>{COP(totals.sub)}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: B.white }}>{COP(totals.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function CotizacionModal({ evento, aliados, onClose, onSaved }) {
  const saved  = evento.cotizacion_data || {};
  const [espacios,      setEspacios]      = useState(saved.espacios      || []);
  const [hospedaje,     setHospedaje]     = useState(saved.hospedaje || saved.alojamientos || []);
  const [alimentos,     setAlimentos]     = useState(saved.alimentos     || []);
  const [servicios,     setServicios]     = useState(saved.servicios     || []);
  const [notas,         setNotas]         = useState(saved.notas         || "");
  const [saving,        setSaving]        = useState(false);
  const [espaciosCat,   setEspaciosCat]   = useState([]);
  const [serviciosCat,  setServiciosCat]  = useState([]);
  const [hospedajeCat,  setHospedajeCat]  = useState([]);
  const [bebidasCat,    setBebidasCat]    = useState([]);
  const [banquetesCat,  setBanquetesCat]  = useState([]);
  const [restaurantCat, setRestaurantCat] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    const q = (tipo, set) => supabase.from("menu_items").select("id,nombre,precio,tiene_iva,categoria").eq("menu_tipo", tipo).eq("activo", true).order("categoria").order("orden").order("nombre").then(({ data }) => set(data || []));
    q("espacios_renta",  setEspaciosCat);
    q("otros_servicios", setServiciosCat);
    q("hospedaje",       setHospedajeCat);
    q("bebidas",         setBebidasCat);
    q("banquetes",       setBanquetesCat);
    q("restaurant",      setRestaurantCat);
  }, []);

  // Header data comes directly from the evento record
  const header = {
    empresa:     evento.empresa    || evento.contacto || "",
    nit:         evento.nit        || "",
    contacto:    evento.contacto   || "",
    cargo:       evento.cargo      || "",
    telefono:    evento.tel        || "",
    email:       evento.email      || "",
    direccion:   evento.direccion  || "",
    montaje:     evento.montaje    || "",
    hora_ini:    evento.hora_ini   || "",
    hora_fin:    evento.hora_fin   || "",
    vencimiento: evento.vencimiento|| "",
  };

  const sumSection = (rows) => rows.reduce((acc, l) => {
    const { sub, tax, total } = calcLine(l);
    return { sub: acc.sub + sub, tax: acc.tax + tax, total: acc.total + total };
  }, { sub: 0, tax: 0, total: 0 });

  const totEsp  = sumSection(espacios);
  const totHosp = sumSection(hospedaje);
  const totAli  = sumSection(alimentos);
  const totSer  = sumSection(servicios);
  const grandTotal = totEsp.total + totHosp.total + totAli.total + totSer.total;

  const aliado = aliados.find(a => a.id === evento.aliado_id);

  async function guardar(marcarCotizado = false) {
    setSaving(true);
    const data = { espacios, hospedaje, alimentos, servicios, notas };
    const upd  = { cotizacion_data: data, valor: grandTotal };
    if (marcarCotizado) upd.stage = "Cotizado";
    await supabase.from("eventos").update(upd).eq("id", evento.id);
    setSaving(false);
    onSaved();
    if (marcarCotizado) onClose();
  }

  function imprimir() {
    guardar();
    setTimeout(() => window.print(), 600);
  }

  const fmtFechaLarga = (d) => {
    if (!d) return "";
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
    } catch { return d; }
  };

  return (
    <>
      {/* Print styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Barlow:wght@300;400;500;600;700&display=swap');

        @page { size: letter; margin: 18mm 16mm; }

        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #FAF6EE !important; }
          body * { visibility: hidden !important; }
          #cotizacion-print, #cotizacion-print * { visibility: visible !important; }
          #cotizacion-print { display: block !important; position: absolute !important; left: 0 !important; top: 0 !important; right: 0 !important; width: 100% !important; background: #FAF6EE !important; color: #0D1B3E !important; font-family: 'Barlow', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .cot-page { page-break-after: always; min-height: 95vh; }
          .cot-page:last-child { page-break-after: auto; }
          .cot-title { font-family: 'Playfair Display', serif; }
          .cot-story, .cot-italic { font-family: 'Cormorant Garamond', serif; font-style: italic; }
          table { page-break-inside: avoid; }
          tr { page-break-inside: avoid; }
        }
        #cotizacion-print { display: none; }
        #cotizacion-print .story, #cotizacion-print .cot-story, #cotizacion-print .cot-italic { font-family: 'Cormorant Garamond', 'Georgia', serif; font-style: italic; color: rgba(30, 53, 102, 0.9); }
        #cotizacion-print .cot-title { font-family: 'Playfair Display', serif; color: #0D1B3E; }
        #cotizacion-print .cot-eyebrow { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #C8B99A; font-weight: 600; }
        #cotizacion-print .cot-hairline { height: 1px; background: #C8B99A; border: 0; }
      `}</style>

      {/* Printable area */}
      <div id="cotizacion-print" style={{ background: "#FAF6EE", color: "#0D1B3E", fontFamily: "'Barlow', sans-serif" }}>

        {/* ========== PAGE 1 — COVER ========== */}
        <section className="cot-page" style={{ background: "#FAF6EE", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "95vh", padding: "20px 10px", textAlign: "center" }}>
          <div>
            <hr className="cot-hairline" style={{ width: 220, margin: "0 auto 40px", border: 0, height: 1, background: "#C8B99A" }} />
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
            <div className="cot-title" style={{ fontSize: 72, fontWeight: 700, letterSpacing: "0.15em", color: "#0D1B3E", lineHeight: 1 }}>ATOLÓN</div>
            <div style={{ fontSize: 11, letterSpacing: "0.28em", color: "#0D1B3E", marginTop: 18, textTransform: "uppercase", fontWeight: 500 }}>Beach Club · Cartagena de Indias</div>

            <div style={{ margin: "56px 0 48px", width: 80, height: 1, background: "#C8B99A" }} />

            <div className="cot-story" style={{ fontSize: 20, color: "#1E3566", maxWidth: 460, lineHeight: 1.4 }}>
              Una historia a orillas del Caribe, escrita para ustedes.
            </div>

            <div style={{ margin: "56px 0 0" }}>
              <div className="cot-italic" style={{ fontSize: 14, color: "#1E3566" }}>Propuesta para</div>
              <div className="cot-title" style={{ fontSize: 36, fontWeight: 700, color: "#0D1B3E", marginTop: 6, lineHeight: 1.15 }}>
                {header.empresa || evento.nombre || "—"}
              </div>
              {evento.tipo && <div className="cot-title" style={{ fontSize: 18, fontWeight: 400, color: "#1E3566", marginTop: 8, letterSpacing: "0.05em" }}>{evento.tipo}</div>}
              {evento.fecha && <div className="cot-italic" style={{ fontSize: 15, color: "#1E3566", marginTop: 14 }}>{fmtFechaLarga(evento.fecha)}</div>}
            </div>
          </div>

          <div>
            <hr className="cot-hairline" style={{ width: 220, margin: "0 auto 16px", border: 0, height: 1, background: "#C8B99A" }} />
            <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "#1E3566", textTransform: "uppercase" }}>
              Cotización {evento.id} &nbsp;·&nbsp; Emitida {new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })} &nbsp;·&nbsp; {evento.vendedor || "Atolón Eventos"}
            </div>
          </div>
        </section>

        {/* ========== PAGE 2 — UNA INVITACIÓN A ATOLÓN ========== */}
        <section className="cot-page" style={{ background: "#FAF6EE", padding: "40px 40px", minHeight: "95vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
            <div className="cot-eyebrow" style={{ marginBottom: 18 }}>Cartagena de Indias · Isla Tierra Bomba</div>
            <div className="cot-title" style={{ fontSize: 42, fontWeight: 700, color: "#0D1B3E", lineHeight: 1.1, marginBottom: 10 }}>
              Una invitación a Atolón
            </div>
            <div className="cot-italic" style={{ fontSize: 18, color: "#1E3566", marginBottom: 30 }}>
              Un refugio en el Caribe
            </div>
            <div style={{ width: 60, height: 1, background: "#C8B99A", margin: "0 auto 30px" }} />

            <div style={{ fontSize: 12, lineHeight: 1.8, color: "#1E3566", textAlign: "left", fontFamily: "'Barlow', sans-serif" }}>
              <p style={{ margin: "0 0 14px" }}>Soñamos alguna vez con un rincón del Caribe donde el tiempo avanzara al compás de las olas. A quince minutos de Cartagena, donde la arena blanca se rinde al azul y cada atardecer tiene el pulso de algo que apenas comienza.</p>
              <p style={{ margin: "0 0 14px" }}>Así nació Atolón: más que un club de playa, un refugio hecho para celebraciones íntimas, reencuentros que importan y esos momentos que la memoria escoge guardar.</p>
              <p style={{ margin: 0 }}>Hoy los invitamos a escribir, junto a nosotros, su propio capítulo a orillas del mar.</p>
            </div>

            <div className="cot-italic" style={{ fontSize: 16, color: "#1E3566", textAlign: "right", marginTop: 30 }}>
              — El equipo de Atolón
            </div>
          </div>
        </section>

        {/* ========== PAGE 3 — LOS ESPACIOS ========== */}
        <section className="cot-page" style={{ background: "#FAF6EE", padding: "30px 20px", minHeight: "95vh" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div className="cot-eyebrow" style={{ marginBottom: 14 }}>Nuestra isla</div>
            <div className="cot-title" style={{ fontSize: 36, fontWeight: 700, color: "#0D1B3E", marginBottom: 10 }}>Los espacios</div>
            <div className="cot-italic" style={{ fontSize: 16, color: "#1E3566", maxWidth: 440, margin: "0 auto" }}>
              Seis escenarios, una isla. Cada espacio cuenta una historia distinta.
            </div>
            <div style={{ width: 60, height: 1, background: "#C8B99A", margin: "20px auto 0" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 640, margin: "0 auto" }}>
            {[
              ["Beach Club principal", "Hasta 200 pax", "Donde el día se vive descalzo."],
              ["Restaurante", "Hasta 80 pax sentados", "Donde el mar se convierte en sobremesa."],
              ["Piscina y deck", "Cocktail hasta 150 pax", "Donde el atardecer abraza el brindis."],
              ["Salón privado Nairo", "Reuniones hasta 30 pax", "Donde las ideas encuentran calma."],
              ["Muelle y zona sunset", "Ceremonias hasta 60 pax", "Donde el 'sí, acepto' tiene horizonte."],
              ["Habitaciones boutique", "8 suites", "Donde la noche caribeña se queda."],
            ].map(([name, cap, line]) => (
              <div key={name} style={{ background: "#FFFDF7", borderLeft: "3px solid #C8B99A", padding: "14px 16px", borderTop: "1px solid #E5DFD0", borderRight: "1px solid #E5DFD0", borderBottom: "1px solid #E5DFD0" }}>
                <div className="cot-title" style={{ fontSize: 16, fontWeight: 700, color: "#0D1B3E", marginBottom: 6 }}>{name}</div>
                <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C8B99A", fontWeight: 600, marginBottom: 8 }}>{cap}</div>
                <div className="cot-italic" style={{ fontSize: 13, color: "#1E3566", lineHeight: 1.4 }}>{line}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ========== PAGE 4 — SU EVENTO ========== */}
        <section className="cot-page" style={{ background: "#FAF6EE", padding: "30px 20px", minHeight: "95vh" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div className="cot-eyebrow" style={{ marginBottom: 14 }}>Los detalles</div>
            <div className="cot-title" style={{ fontSize: 36, fontWeight: 700, color: "#0D1B3E", marginBottom: 16 }}>Su evento</div>
            <div style={{ width: 60, height: 1, background: "#C8B99A", margin: "0 auto 22px" }} />
            <div className="cot-italic" style={{ fontSize: 17, color: "#1E3566", maxWidth: 520, margin: "0 auto", lineHeight: 1.5 }}>
              "Cada evento en Atolón comienza mucho antes del primer invitado. Empieza en una conversación como esta."
            </div>
          </div>

          <div style={{ maxWidth: 620, margin: "28px auto 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
            {[
              ["Evento", evento.tipo],
              ["Fecha", evento.fecha ? fmtFechaLarga(evento.fecha) : ""],
              ["Horario", (header.hora_ini || header.hora_fin) ? `${header.hora_ini || "—"} a ${header.hora_fin || "—"}` : ""],
              ["Invitados", evento.pax ? `${evento.pax} pax` : ""],
              ["Montaje", header.montaje],
              ["Cliente", header.empresa],
              ["NIT", header.nit],
              ["Dirección", header.direccion],
              ["Contacto", [header.contacto, header.cargo].filter(Boolean).join(" · ")],
              ["Teléfono / Email", [header.telefono, header.email].filter(Boolean).join(" · ")],
              ["Aliado B2B", aliado?.nombre || ""],
            ].map(([k, v]) => v ? (
              <div key={k} style={{ padding: "10px 0", borderBottom: "1px solid #E5DFD0", display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "#C8B99A", fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 13, color: "#0D1B3E", fontFamily: "'Barlow', sans-serif", fontWeight: 500 }}>{v}</span>
              </div>
            ) : null)}
          </div>
        </section>

        {/* ========== PAGE 5 — LA PROPUESTA ========== */}
        <section className="cot-page" style={{ background: "#FAF6EE", padding: "30px 10px", minHeight: "95vh" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div className="cot-eyebrow" style={{ marginBottom: 14 }}>Lo que hemos preparado</div>
            <div className="cot-title" style={{ fontSize: 42, fontWeight: 700, color: "#0D1B3E", marginBottom: 10 }}>La propuesta</div>
            <div className="cot-italic" style={{ fontSize: 17, color: "#1E3566" }}>
              Las piezas que dan forma a su celebración.
            </div>
            <div style={{ width: 60, height: 1, background: "#C8B99A", margin: "20px auto 0" }} />
          </div>

          {[
            ["ESPACIOS",             espacios,  false, "IVA", "El escenario de lo que está por suceder."],
            ["HOSPEDAJE",            hospedaje, true,  "IVA", "Para quienes quieran quedarse a ver cómo termina la historia."],
            ["ALIMENTOS Y BEBIDAS",  alimentos, false, "ICO", "Cada plato, un capítulo. Cada copa, una pausa."],
            ["OTROS SERVICIOS",      servicios, false, "IVA", "Los detalles que convierten un evento en un recuerdo."],
          ].map(([title, rows, noches, ivaLabel, story]) => rows.length > 0 && (
            <div key={title} style={{ marginBottom: 24, pageBreakInside: "avoid" }}>
              <div className="cot-eyebrow" style={{ marginBottom: 6, textAlign: "left" }}>{title}</div>
              <div className="cot-italic" style={{ fontSize: 14, color: "#1E3566", marginBottom: 12, textAlign: "left" }}>{story}</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Barlow', sans-serif" }}>
                <thead>
                  <tr style={{ background: "#C8B99A", color: "#FFFFFF" }}>
                    <th style={{ padding: "10px 10px", textAlign: "left", width: "38%", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>Concepto</th>
                    <th style={{ padding: "10px 10px", textAlign: "center", width: "8%", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>Cant.</th>
                    {noches && <th style={{ padding: "10px 10px", textAlign: "center", width: "8%", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>Noches</th>}
                    <th style={{ padding: "10px 10px", textAlign: "right", width: "15%", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>Valor Unit.</th>
                    <th style={{ padding: "10px 10px", textAlign: "right", width: "12%", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>Subtotal</th>
                    <th style={{ padding: "10px 10px", textAlign: "center", width: "8%", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>{ivaLabel}</th>
                    <th style={{ padding: "10px 10px", textAlign: "right", width: "14%", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l, i) => {
                    const { sub, total } = calcLine(l);
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#FAF6EE" : "#FFFDF7", borderBottom: "1px solid #E5DFD0" }}>
                        <td style={{ padding: "10px 10px", color: "#0D1B3E" }}>{l.concepto}</td>
                        <td style={{ padding: "10px 10px", textAlign: "center", color: "#1E3566" }}>{l.cantidad}</td>
                        {noches && <td style={{ padding: "10px 10px", textAlign: "center", color: "#1E3566" }}>{l.noches}</td>}
                        <td style={{ padding: "10px 10px", textAlign: "right", color: "#1E3566" }}>{COP(l.valor_unit)}</td>
                        <td style={{ padding: "10px 10px", textAlign: "right", color: "#1E3566" }}>{COP(sub)}</td>
                        <td style={{ padding: "10px 10px", textAlign: "center", color: "#1E3566" }}>{l.iva}%</td>
                        <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 700, color: "#0D1B3E" }}>{COP(total)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#EFE7D3" }}>
                    <td colSpan={noches ? 6 : 5} style={{ padding: "10px 10px", textAlign: "right", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#0D1B3E", fontWeight: 600 }}>Subtotal {title.toLowerCase()}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", color: "#0D1B3E", fontWeight: 700 }}>
                      {COP(rows.reduce((a, l) => a + calcLine(l).total, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </section>

        {/* ========== PAGE — RESUMEN DE INVERSIÓN ========== */}
        <section className="cot-page" style={{ background: "#FAF6EE", padding: "40px 20px", minHeight: "95vh", pageBreakBefore: "always" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div className="cot-eyebrow" style={{ marginBottom: 14 }}>El conjunto</div>
            <div className="cot-title" style={{ fontSize: 36, fontWeight: 700, color: "#0D1B3E", marginBottom: 16 }}>Resumen de inversión</div>
            <div style={{ width: 60, height: 1, background: "#C8B99A", margin: "0 auto 22px" }} />
            <div className="cot-italic" style={{ fontSize: 16, color: "#1E3566", maxWidth: 520, margin: "0 auto", lineHeight: 1.5 }}>
              "Toda gran celebración tiene su arquitectura. Estas son las piezas que la sostienen."
            </div>
          </div>

          <div style={{ maxWidth: 520, margin: "30px auto 0" }}>
            {[["Espacios", totEsp.total], ["Hospedaje", totHosp.total], ["Alimentos y Bebidas", totAli.total], ["Otros Servicios", totSer.total]].map(([k, v]) => v > 0 && (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "14px 0", borderBottom: "1px solid #E5DFD0" }}>
                <span style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "#C8B99A", fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 15, color: "#1E3566", fontFamily: "'Barlow', sans-serif", fontWeight: 500 }}>{COP(v)}</span>
              </div>
            ))}

            <div style={{ marginTop: 32, background: "#C8B99A", padding: "22px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: "#FFFFFF", fontWeight: 700 }}>Inversión total</span>
              <span className="cot-title" style={{ fontSize: 32, fontWeight: 700, color: "#0D1B3E" }}>{COP(grandTotal)}</span>
            </div>

            <div className="cot-italic" style={{ fontSize: 12, color: "#1E3566", textAlign: "center", marginTop: 18, opacity: 0.8 }}>
              Valores expresados en pesos colombianos. Incluye IVA donde aplica.
            </div>
          </div>
        </section>

        {/* ========== PAGE — CONDICIONES ========== */}
        <section className="cot-page" style={{ background: "#FAF6EE", padding: "40px 20px", minHeight: "95vh", pageBreakBefore: "always" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div className="cot-eyebrow" style={{ marginBottom: 14 }}>El marco</div>
            <div className="cot-title" style={{ fontSize: 36, fontWeight: 700, color: "#0D1B3E", marginBottom: 16 }}>Condiciones y siguientes pasos</div>
            <div style={{ width: 60, height: 1, background: "#C8B99A", margin: "0 auto 22px" }} />
            <div className="cot-italic" style={{ fontSize: 16, color: "#1E3566", maxWidth: 540, margin: "0 auto", lineHeight: 1.5 }}>
              Como toda buena historia, la nuestra también necesita un marco. Estas son nuestras condiciones — pensadas para proteger su evento tanto como el nuestro.
            </div>
          </div>

          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <div style={{ marginTop: 24 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 12 }}>Condiciones generales</div>
              {notas ? (
                <div style={{ fontSize: 12, color: "#1E3566", lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "'Barlow', sans-serif" }}>{notas}</div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "#1E3566", fontSize: 12, lineHeight: 1.8, fontFamily: "'Barlow', sans-serif" }}>
                  {[
                    "Anticipo del 50% para reservar la fecha y los espacios.",
                    "Confirmación final de invitados y menú con al menos 7 días de anticipación.",
                    "Política de cancelación: el anticipo es no reembolsable dentro de los 30 días previos al evento.",
                    "Los huéspedes externos al club deben ser registrados previamente para acceso a la isla.",
                    "Garantía mínima de pax según lo acordado; ajustes al alza aceptados hasta 72 horas antes.",
                  ].map((t, i) => (
                    <li key={i} style={{ padding: "8px 0", borderBottom: "1px solid #E5DFD0", display: "flex", gap: 12 }}>
                      <span style={{ color: "#C8B99A", fontWeight: 700 }}>·</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ marginTop: 30 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 12 }}>Vigencia</div>
              <div style={{ fontSize: 13, color: "#1E3566", fontFamily: "'Barlow', sans-serif" }}>
                {header.vencimiento ? `Esta propuesta es válida hasta el ${fmtFechaLarga(header.vencimiento)}.` : "Esta propuesta es válida por 30 días desde la emisión."}
              </div>
            </div>

            <div style={{ marginTop: 30 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 12 }}>Siguientes pasos</div>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", color: "#1E3566", fontSize: 13, lineHeight: 1.8, fontFamily: "'Barlow', sans-serif" }}>
                {[
                  "Confirmación de la propuesta",
                  "Firma del contrato",
                  "Pago del anticipo",
                  "Coordinación con nuestro event planner",
                ].map((t, i) => (
                  <li key={i} style={{ padding: "8px 0", borderBottom: "1px solid #E5DFD0", display: "flex", gap: 14 }}>
                    <span className="cot-title" style={{ color: "#C8B99A", fontWeight: 700, minWidth: 22 }}>{String(i + 1).padStart(2, "0")}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ========== BACK COVER ========== */}
        <section className="cot-page" style={{ background: "#FAF6EE", padding: "40px 20px", minHeight: "95vh", pageBreakBefore: "always", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div className="cot-title" style={{ fontSize: 36, fontWeight: 700, color: "#0D1B3E", maxWidth: 520, lineHeight: 1.2 }}>
            Gracias por dejarnos ser parte de su historia.
          </div>

          <div style={{ width: 80, height: 1, background: "#C8B99A", margin: "40px 0" }} />

          <div style={{ fontFamily: "'Barlow', sans-serif", color: "#0D1B3E", lineHeight: 1.9 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.25em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Atolón Beach Club</div>
            <div style={{ fontSize: 12, color: "#1E3566" }}>Isla Tierra Bomba · Cartagena de Indias · Colombia</div>
            <div style={{ fontSize: 12, color: "#1E3566" }}>eventos@atolon.co</div>
            <div style={{ fontSize: 12, color: "#1E3566" }}>www.atolon.co</div>
          </div>

          <div style={{ marginTop: 60 }}>
            <div className="cot-italic" style={{ fontSize: 14, color: "#1E3566" }}>
              Una propuesta creada exclusivamente para {header.empresa || evento.nombre || "ustedes"}.
            </div>
          </div>

          <div style={{ marginTop: 60 }}>
            <div className="cot-italic" style={{ fontSize: 13, color: "#1E3566", opacity: 0.85 }}>
              Escrito a mano en la isla, con vista al Caribe.
            </div>
          </div>
        </section>

      </div>

      {/* Modal UI */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px 0" }}>
        <div style={{ background: B.navy, borderRadius: 16, width: "90vw", maxWidth: 900, padding: 28, margin: "auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Cotización — {evento.nombre}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{evento.tipo} · {evento.fecha ? new Date(evento.fecha).toLocaleDateString("es-CO") : ""} · {computePax(evento)} pax</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>

          {/* Client info — read-only summary from evento */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Datos del cliente</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Editables desde el evento ✏️</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 16px" }}>
              {[["Empresa", header.empresa], ["NIT", header.nit], ["Contacto", header.contacto], ["Cargo", header.cargo], ["Teléfono", header.telefono], ["Email", header.email], ["Dirección", header.direccion], ["Montaje", header.montaje], ["Hora inicio", header.hora_ini], ["Hora final", header.hora_fin], ["Vencimiento", header.vencimiento]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                  <div style={{ fontSize: 13, color: v ? B.white : "rgba(255,255,255,0.2)" }}>{v || "—"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sections */}
          <SectionTable title="Espacios"            color="#1E3566" rows={espacios}   setRows={setEspacios}   catalogItems={espaciosCat} />
          <SectionTable title="Hospedaje"           color="#0f766e" rows={hospedaje}  setRows={setHospedaje}  showNoches catalogItems={hospedajeCat} />
          <SectionTable title="Alimentos y Bebidas" color="#2E7D52" rows={alimentos}  setRows={setAlimentos}  defaultIva={8}
            menuCatalogs={[
              { label: "Menú Restaurant",   items: restaurantCat },
              { label: "Menú de Banquetes", items: banquetesCat  },
              { label: "Menú Bebidas",      items: bebidasCat    },
            ]}
          />
          <SectionTable title="Otros Servicios"     color="#7B4F12" rows={servicios}  setRows={setServicios}  catalogItems={serviciosCat} />

          {/* Notas de la cotización */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 700 }}>Notas / Condiciones de la cotización</div>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              placeholder="Condiciones de pago, política de cancelación, observaciones especiales..."
              style={{ width: "100%", padding: "10px 12px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>

          {/* Grand total */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 32 }}>
            {[["Espacios", totEsp.total], ["Hospedaje", totHosp.total], ["Alimentos", totAli.total], ["Servicios", totSer.total]].map(([k, v]) => v > 0 && (
              <div key={k} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{COP(v)}</div>
              </div>
            ))}
            <div style={{ textAlign: "right", borderLeft: `2px solid ${B.sand}`, paddingLeft: 24 }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase" }}>Total Evento</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: B.sand }}>{COP(grandTotal)}</div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={() => guardar(false)} disabled={saving} style={{ padding: "11px 20px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Guardando..." : "💾 Guardar"}
            </button>
            <button onClick={imprimir} style={{ padding: "11px 20px", background: B.sky + "33", color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              🖨 Imprimir / PDF
            </button>
            <button onClick={() => guardar(true)} disabled={saving} style={{ flex: 1, padding: "11px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              ✓ Guardar y Marcar Cotizado
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Cobros Extra Grupo ────────────────────────────────────────────────────────
function GrupoExtrasModal({ evento, onClose, onSaved }) {
  const saved       = evento.extras_data || {};
  const [transporte,  setTransporte]  = useState(saved.transporte  || []);
  const [alimentos,   setAlimentos]   = useState(saved.alimentos   || []);
  const [servicios,   setServicios]   = useState(saved.servicios   || []);
  const [notas,       setNotas]       = useState(saved.notas       || "");
  const [saving,      setSaving]      = useState(false);

  const sumSection = (rows) => rows.reduce((acc, l) => {
    const { sub, tax, total } = calcLine(l);
    return { sub: acc.sub + sub, tax: acc.tax + tax, total: acc.total + total };
  }, { sub: 0, tax: 0, total: 0 });

  const totTrans  = sumSection(transporte);
  const totAli    = sumSection(alimentos);
  const totSer    = sumSection(servicios);
  const grandTotal = totTrans.total + totAli.total + totSer.total;

  async function guardar() {
    setSaving(true);
    const data = { transporte, alimentos, servicios, notas };
    await supabase.from("eventos").update({ extras_data: data, valor_extras: grandTotal }).eq("id", evento.id);
    setSaving(false);
    onSaved();
    onClose();
  }

  function imprimir() {
    guardar();
    setTimeout(() => window.print(), 400);
  }

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #grupo-extras-print { display: block !important; position: fixed; inset: 0; background: white; z-index: 99999; padding: 32px; color: #000; }
          #grupo-extras-print table { page-break-inside: avoid; }
        }
        #grupo-extras-print { display: none; }
      `}</style>

      {/* Printable */}
      <div id="grupo-extras-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, borderBottom: "3px solid #1E3566", paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#1E3566" }}>ATOLON</div>
            <div style={{ fontSize: 12, color: "#666" }}>Beach Club · Cartagena, Colombia</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1E3566" }}>COBROS ADICIONALES</div>
            <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>{evento.nombre} — {evento.tipo}</div>
            <div style={{ fontSize: 12, color: "#666" }}>Fecha: {evento.fecha ? new Date(evento.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}</div>
            <div style={{ fontSize: 12, color: "#666" }}>{computePax(evento)} pax</div>
          </div>
        </div>

        {[["TRANSPORTE", "#1E3566", transporte], ["ALIMENTOS Y BEBIDAS", "#2E7D52", alimentos], ["SERVICIOS ADICIONALES", "#7B4F12", servicios]].map(([title, color, rows]) => rows.length > 0 && (
          <div key={title} style={{ marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: color, color: "white" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", width: "45%" }}>{title}</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>CANT.</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "15%" }}>VALOR UNIT.</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "12%" }}>SUBTOTAL</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>IVA</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "12%" }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => {
                  const { sub, total } = calcLine(l);
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#f9f9f9" : "white" }}>
                      <td style={{ padding: "5px 8px" }}>{l.concepto}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>{l.cantidad}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>{COP(l.valor_unit)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>{COP(sub)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>{l.iva}%</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{COP(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ marginLeft: "auto", width: 280, borderTop: "2px solid #1E3566", paddingTop: 12, fontSize: 13 }}>
          {[["Transporte", totTrans.total], ["Alimentos & Bebidas", totAli.total], ["Servicios Adicionales", totSer.total]].map(([k, v]) => v > 0 && (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#444" }}>
              <span>{k}</span><span>{COP(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 900, fontSize: 16, color: "#1E3566", borderTop: "1px solid #1E3566", marginTop: 6 }}>
            <span>TOTAL COBROS</span><span>{COP(grandTotal)}</span>
          </div>
        </div>
        {notas && <div style={{ marginTop: 16, padding: "10px 14px", background: "#f5f5f5", borderLeft: "3px solid #1E3566", fontSize: 11, color: "#444", whiteSpace: "pre-wrap" }}>{notas}</div>}
      </div>

      {/* Modal UI */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px 0" }}>
        <div style={{ background: B.navy, borderRadius: 16, width: "90vw", maxWidth: 860, padding: 28, margin: "auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>💰 Cobros Adicionales — {evento.nombre}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {evento.tipo} · {evento.fecha ? new Date(evento.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : ""} · {computePax(evento)} pax
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>

          {/* Sections */}
          <SectionTable title="Transporte"            color="#1E3566" rows={transporte} setRows={setTransporte} />
          <SectionTable title="Alimentos y Bebidas"   color="#2E7D52" rows={alimentos}  setRows={setAlimentos}  showMenuType defaultIva={8} />
          <SectionTable title="Servicios Adicionales" color="#7B4F12" rows={servicios}  setRows={setServicios} />

          {/* Notas */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 700 }}>Notas</div>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Observaciones, condiciones, acuerdos especiales..."
              style={{ width: "100%", padding: "10px 12px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </div>

          {/* Grand total */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 32 }}>
            {[["Transporte", totTrans.total], ["Alimentos", totAli.total], ["Servicios", totSer.total]].map(([k, v]) => v > 0 && (
              <div key={k} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{COP(v)}</div>
              </div>
            ))}
            <div style={{ textAlign: "right", borderLeft: `2px solid ${B.sand}`, paddingLeft: 24 }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase" }}>Total Cobros</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: B.sand }}>{COP(grandTotal)}</div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={imprimir} style={{ padding: "11px 20px", background: B.sky + "33", color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>🖨 Imprimir / PDF</button>
            <button onClick={guardar} disabled={saving}
              style={{ flex: 1, padding: "11px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Guardando..." : "💾 Guardar Cobros"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Calendario de Eventos ────────────────────────────────────────────────────
const STAGE_COLOR = {
  Consulta:  B.warning,
  Cotizado:  B.sky,
  Confirmado: B.success,
  Realizado: "rgba(255,255,255,0.3)",
  Perdido:   B.danger,
};
const STAGE_ICON = { Consulta: "💬", Cotizado: "📋", Confirmado: "✅", Realizado: "✓", Perdido: "❌" };
const CAT_ICON   = { evento: "🎉", grupo: "👥" };

function CalendarioEventos({ todos, onEdit, isMobile }) {
  const hoy = todayStr();
  const [mesOffset, setMesOffset]   = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [filtro, setFiltro]         = useState("todos"); // "todos" | "evento" | "grupo"

  const now     = new Date();
  const mesDate = new Date(now.getFullYear(), now.getMonth() + mesOffset, 1);
  const year    = mesDate.getFullYear();
  const month   = mesDate.getMonth();
  const mesNombre  = mesDate.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const primerDia  = new Date(year, month, 1).getDay();
  const diasEnMes  = new Date(year, month + 1, 0).getDate();

  // Build day map from todos filtered by visible month
  const desde = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const hasta = `${year}-${String(month + 1).padStart(2, "0")}-${String(diasEnMes).padStart(2, "0")}`;

  // Para eventos (no grupos): puede haber fecha_fin → incluir si el rango overlapa con el mes visible
  const filtered = todos.filter(e => {
    if (!e.fecha) return false;
    const fin = (e.categoria === "evento" && e.fecha_fin && e.fecha_fin > e.fecha) ? e.fecha_fin : e.fecha;
    if (fin < desde || e.fecha > hasta) return false; // sin overlap con el mes
    if (filtro !== "todos" && e.categoria !== filtro) return false;
    return true;
  });

  // porDia: para eventos multi-día, agregar entrada en cada día del rango
  const porDia = {};
  filtered.forEach(e => {
    const fin = (e.categoria === "evento" && e.fecha_fin && e.fecha_fin > e.fecha) ? e.fecha_fin : e.fecha;
    const startD = e.fecha > desde ? e.fecha : desde; // no salir del mes visible
    const endD   = fin   < hasta  ? fin   : hasta;

    let cur = new Date(startD + "T12:00:00");
    const endDate = new Date(endD + "T12:00:00");
    while (cur <= endDate) {
      const dStr = cur.toISOString().slice(0, 10);
      if (!porDia[dStr]) porDia[dStr] = [];
      porDia[dStr].push({
        ...e,
        _isCont:  dStr !== e.fecha,           // día de continuación (no es el inicio)
        _isEnd:   dStr === fin && dStr !== e.fecha, // último día (multi-día)
        _isStart: dStr === e.fecha,
        _fin:     fin,
      });
      cur.setDate(cur.getDate() + 1);
    }
  });

  const dias = [];
  for (let i = 0; i < primerDia; i++) dias.push(null);
  for (let d = 1; d <= diasEnMes; d++) dias.push(d);

  const maxPerCell = isMobile ? 2 : 3;
  const eventosDelDia = selectedDay ? (porDia[selectedDay] || []) : [];

  const btnNav = { background: B.navyLight, border: "none", borderRadius: 8, padding: isMobile ? "8px 14px" : "8px 18px", color: B.white, cursor: "pointer", fontSize: 16, minHeight: 38 };

  return (
    <div>
      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { setMesOffset(m => m - 1); setSelectedDay(null); }} style={btnNav}>←</button>
          <h3 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "capitalize", minWidth: isMobile ? 120 : 180, textAlign: "center" }}>{mesNombre}</h3>
          <button onClick={() => { setMesOffset(m => m + 1); setSelectedDay(null); }} style={btnNav}>→</button>
        </div>
        {/* Filtro */}
        <div style={{ display: "flex", gap: 4 }}>
          {[["todos", "Todos"], ["evento", "🎉 Eventos"], ["grupo", "👥 Grupos"]].map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: filtro === k ? B.sand : B.navyLight,
                color:      filtro === k ? B.navy : "rgba(255,255,255,0.55)" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: isMobile ? 8 : 16, marginBottom: 14, flexWrap: "wrap" }}>
        {STAGES.map(s => (
          <span key={s} style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: STAGE_COLOR[s], flexShrink: 0 }} />
            {s}
          </span>
        ))}
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
        {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, color: B.sand, padding: "5px 0", fontWeight: 600 }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {dias.map((dia, i) => {
          if (!dia) return <div key={`e-${i}`} />;
          const fecha = `${year}-${String(month + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
          const evs   = porDia[fecha] || [];
          const isHoy = fecha === hoy;
          const isPast = fecha < hoy;
          const isSelected = selectedDay === fecha;
          return (
            <div key={dia}
              onClick={() => setSelectedDay(isSelected ? null : fecha)}
              style={{
                background: isHoy ? B.sky + "18" : isSelected ? B.sand + "15" : B.navyMid,
                borderRadius: 8, padding: isMobile ? "6px 4px" : "8px 6px",
                minHeight: isMobile ? 64 : 90, cursor: "pointer",
                border: isHoy ? `2px solid ${B.sky}` : isSelected ? `2px solid ${B.sand}` : `1px solid ${B.navyLight}`,
                opacity: isPast ? 0.55 : 1,
                transition: "border 0.12s",
                display: "flex", flexDirection: "column", gap: 2,
              }}>
              {/* Day number */}
              <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: isHoy ? 700 : 400, color: isHoy ? B.sky : B.white, lineHeight: 1 }}>
                {dia}
                {evs.length > 0 && isMobile && (
                  <span style={{ marginLeft: 4, fontSize: 9, background: B.sand + "33", color: B.sand, borderRadius: 8, padding: "1px 5px" }}>{evs.length}</span>
                )}
              </span>
              {/* Event chips — desktop */}
              {!isMobile && evs.slice(0, maxPerCell).map(ev => {
                const color = STAGE_COLOR[ev.stage] || B.sand;
                return (
                  <div key={ev.id + ev._isCont}
                    style={{
                      fontSize: 9,
                      padding: ev._isCont ? "2px 4px" : "2px 5px",
                      borderRadius: ev._isCont ? (ev._isEnd ? "0 4px 4px 0" : "0") : (ev._fin !== ev.fecha ? "4px 0 0 4px" : 4),
                      background: color + (ev._isCont ? "22" : "33"),
                      color: ev._isCont ? color + "bb" : color,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      borderLeft: ev._isCont ? `1px dashed ${color}55` : `2px solid ${color}`,
                      borderRight: (!ev._isCont && ev._fin !== ev.fecha) ? "none" : undefined,
                      lineHeight: 1.4,
                      fontStyle: ev._isCont ? "italic" : "normal",
                    }}>
                    {ev._isCont ? `  ${ev.nombre}` : `${CAT_ICON[ev.categoria]} ${ev.nombre}`}
                  </div>
                );
              })}
              {!isMobile && evs.length > maxPerCell && (
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", paddingLeft: 5 }}>+{evs.length - maxPerCell} más</div>
              )}
              {/* Mobile: colored dots */}
              {isMobile && evs.length > 0 && (
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 2 }}>
                  {evs.slice(0, 4).map(ev => (
                    <span key={ev.id + ev._isCont} style={{ width: 6, height: 6, borderRadius: ev._isCont ? 1 : 3, background: STAGE_COLOR[ev.stage] || B.sand, flexShrink: 0, opacity: ev._isCont ? 0.5 : 1 }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <div style={{ marginTop: 16, background: B.navyMid, borderRadius: 14, padding: isMobile ? 14 : 20, border: `1px solid ${B.sand}33` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                {eventosDelDia.length === 0 ? "Sin eventos" : `${eventosDelDia.length} evento${eventosDelDia.length !== 1 ? "s" : ""}`}
              </div>
            </div>
            <button onClick={() => setSelectedDay(null)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>

          {eventosDelDia.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
              No hay eventos este día
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Dedup: mostrar cada evento solo una vez en el panel de detalle */}
              {[...new Map(eventosDelDia.map(ev => [ev.id, ev])).values()].map(ev => {
                const sc = STAGE_COLOR[ev.stage] || B.sand;
                // Calcular día N de M para eventos multi-día
                let diaLabel = null;
                if (ev._fin && ev._fin !== ev.fecha) {
                  const start = new Date(ev.fecha + "T12:00:00");
                  const end   = new Date(ev._fin  + "T12:00:00");
                  const sel   = new Date(selectedDay + "T12:00:00");
                  const nDias = Math.round((end - start) / 86400000) + 1;
                  const diaN  = Math.round((sel  - start) / 86400000) + 1;
                  diaLabel = `Día ${diaN} de ${nDias}`;
                }
                // Pasar el evento original sin props internas al editor
                const { _isCont, _isEnd, _isStart, _fin, ...evOriginal } = ev;
                return (
                  <div key={ev.id} onClick={() => onEdit(evOriginal)}
                    style={{
                      background: B.navy, borderRadius: 10, padding: "14px 16px",
                      cursor: "pointer", borderLeft: `3px solid ${sc}`,
                      display: "flex", alignItems: "center", gap: 14,
                      transition: "opacity 0.12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    <span style={{ fontSize: 24 }}>{CAT_ICON[ev.categoria] || "🎉"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.nombre}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                        {ev.tipo} · {ev.pax} pax
                        {diaLabel && <span style={{ marginLeft: 8, color: B.sand, fontWeight: 600 }}>{diaLabel}</span>}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: sc + "22", color: sc, border: `1px solid ${sc}44`, fontWeight: 700 }}>
                        {STAGE_ICON[ev.stage]} {ev.stage}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Eventos() {
  const isMobile = useMobile();
  const [todos,     setTodos]     = useState([]);
  const [salidas,   setSalidas]   = useState([]);
  const [aliados,   setAliados]   = useState([]);
  const [vendedores,setVendedores]= useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,        setTab]        = useState("todos");
  const [beo,        setBeo]        = useState(null);
  const [modal,      setModal]      = useState(null);
  const [detalleEvento, setDetalleEvento] = useState(null);
  const [linkEvt,     setLinkEvt]    = useState(null);
  const [reservasEvt, setReservasEvt] = useState(null);
  const [cotizacion,  setCotizacion] = useState(null);
  const [extrasGrupo, setExtrasGrupo] = useState(null);
  const [userRol,     setUserRol]     = useState("");

  // Detectar rol del usuario para permisos de edición
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.email) return;
      const { data } = await supabase.from("usuarios").select("rol_id").eq("email", session.user.email.toLowerCase()).single();
      if (data?.rol_id) setUserRol(data.rol_id);
    });
  }, []);

  // Roles con permiso de edición en eventos
  const canEdit = !userRol
    || userRol === "super_admin"
    || userRol === "ventas"
    || userRol === "gerente_ventas"
    || userRol.startsWith("gerente_general");

  const fetchTodos = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const hoy = todayStr();
    const [evtR, salR, aliR, vendR] = await Promise.all([
      supabase.from("eventos").select("*").order("fecha", { ascending: true }),
      supabase.from("salidas").select("id, hora, nombre").eq("activo", true).order("orden"),
      supabase.from("aliados_b2b").select("id, nombre, tipo").order("nombre"),
      supabase.from("usuarios").select("id, nombre").in("rol_id", ["ventas", "gerente_ventas"]).eq("activo", true).order("nombre"),
    ]);

    // Auto-pasar Confirmado → Realizado cuando la fecha del evento ya pasó
    if (evtR.data) {
      const vencidos = evtR.data.filter(e => {
        if (e.stage !== "Confirmado") return false;
        const fechaFin = (e.fecha_fin && e.fecha_fin > e.fecha) ? e.fecha_fin : e.fecha;
        return fechaFin < hoy;
      });
      if (vencidos.length > 0) {
        await supabase.from("eventos")
          .update({ stage: "Realizado" })
          .in("id", vencidos.map(e => e.id));
        vencidos.forEach(e => { e.stage = "Realizado"; });
      }
    }

    if (evtR.data) setTodos(evtR.data.map(e => ({
      id: e.id, nombre: e.nombre, tipo: e.tipo, fecha: e.fecha,
      pax: e.pax || 0, valor: e.valor || 0, stage: e.stage,
      contacto: e.contacto || "", tel: e.tel || "", email: e.email || "",
      notas: e.notas || "", categoria: e.categoria || "evento",
      salidas_grupo: e.salidas_grupo || [], aliado_id: e.aliado_id || "",
      vendedor: e.vendedor || "", cotizacion_data: e.cotizacion_data || {}, extras_data: e.extras_data || {},
      empresa: e.empresa || "", nit: e.nit || "", cargo: e.cargo || "",
      direccion: e.direccion || "", nacionalidad: e.nacionalidad || "", montaje: e.montaje || "",
      hora_ini: e.hora_ini || "", hora_fin: e.hora_fin || "", vencimiento: e.vencimiento || "",
      buy_out: e.buy_out || false,
      modalidad_pago: e.modalidad_pago || "individual",
      pasadias_org:     e.pasadias_org     || [],
      precio_tipo:      e.precio_tipo      || "publico",
      zarpe_data:       e.zarpe_data       || [],
      invitados_zarpe:  e.invitados_zarpe  || [],
      // Event Planner fields
      timeline_items:            e.timeline_items            || [],
      contactos_rapidos:         e.contactos_rapidos         || [],
      transporte_detalle:        e.transporte_detalle        || [],
      transp_terrestre:          e.transp_terrestre          || [],
      transp_acuatica:           e.transp_acuatica           || [],
      menus_detalle:             e.menus_detalle             || {},
      embarcaciones_evento:      e.embarcaciones_evento      || [],
      historial_cambios:         e.historial_cambios         || [],
      beo_notas:                 e.beo_notas                 || {},
      incidentes:                e.incidentes                || [],
      restricciones_dieteticas:  e.restricciones_dieteticas  || [],
      servicios_contratados:     e.servicios_contratados     || [],
      notas_operativas:          e.notas_operativas          || "",
      responsable_evento:        e.responsable_evento        || "",
      fecha_fin:                 e.fecha_fin                 || "",
    })));
    if (salR.data) setSalidas(salR.data);
    if (aliR.data) setAliados(aliR.data);
    if (vendR.data) setVendedores(vendR.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  // ── Pantalla detalle del evento (reemplaza la lista) ────────────────────────
  if (detalleEvento) {
    return (
      <div>
        <EventoDetalle
          evento={detalleEvento}
          canEdit={canEdit}
          onBack={() => setDetalleEvento(null)}
          onEdit={() => { setModal(detalleEvento); }}
          onSaved={() => {
            fetchTodos();
            // Refresh the detalleEvento with fresh data
            if (supabase) {
              supabase.from("eventos").select("*").eq("id", detalleEvento.id).single()
                .then(({ data }) => { if (data) setDetalleEvento(prev => ({ ...prev, ...data })); });
            }
          }}
        />
        {modal && (
          <EventoModal
            evento={modal === "new" ? null : modal}
            categoria={modal === "new" ? "evento" : modal.categoria}
            salidas={salidas}
            aliados={aliados}
            vendedores={vendedores}
            onClose={() => setModal(null)}
            onSaved={() => {
              fetchTodos();
              setModal(null);
              if (supabase) {
                supabase.from("eventos").select("*").eq("id", detalleEvento.id).single()
                  .then(({ data }) => { if (data) setDetalleEvento(prev => ({ ...prev, ...data })); });
              }
            }}
            onShowLink={setLinkEvt}
          />
        )}
      </div>
    );
  }

  const isCalendario = tab === "calendario";
  const items   = tab === "todos" ? todos : todos.filter(e => e.categoria === tab);
  const isGrupo = tab === "grupo";
  const TABS    = [
    { key: "todos",      label: "📌 Todos" },
    { key: "evento",     label: "🎉 Eventos" },
    { key: "grupo",      label: "👥 Grupos" },
    { key: "calendario", label: "📅 Calendario" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Eventos</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        {!isCalendario && canEdit && (
          <button onClick={() => setModal("new")}
            style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
            + {tab === "grupo" ? "Nuevo Grupo" : "Nuevo Evento"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: B.navyMid, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "8px 20px", borderRadius: 7, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: tab === t.key ? B.navy : "transparent",
              color: tab === t.key ? B.white : "rgba(255,255,255,0.45)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      {!isCalendario && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Pipeline Total", val: COP(items.reduce((s, e) => s + e.valor, 0)), color: B.sand },
            { label: "Confirmados",    val: items.filter(e => e.stage === "Confirmado").length, color: B.success },
            { label: "Por Cotizar",    val: items.filter(e => e.stage === "Consulta").length, color: B.warning },
            { label: "Pax Total",      val: items.reduce((s, e) => s + e.pax, 0), color: B.sky },
          ].map(s => (
            <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", flex: 1, minWidth: 130, borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {isCalendario
        ? <CalendarioEventos todos={todos} onEdit={ev => setDetalleEvento(ev)} isMobile={isMobile} />
        : <KanbanBoard items={items} isGrupo={isGrupo} aliados={aliados} onEdit={ev => setDetalleEvento(ev)} onBeo={setBeo} onLink={setLinkEvt} onCotizar={setCotizacion} onReservas={setReservasEvt} onExtras={setExtrasGrupo} />
      }

      {beo          && <BEOPreview evento={beo} onClose={() => setBeo(null)} />}
      {linkEvt      && <GrupoLink evento={linkEvt} onClose={() => setLinkEvt(null)} />}
      {reservasEvt  && <ReservasGrupoModal evento={reservasEvt} onClose={() => setReservasEvt(null)} />}
      {extrasGrupo && <GrupoExtrasModal evento={extrasGrupo} onClose={() => setExtrasGrupo(null)} onSaved={fetchTodos} />}
      {cotizacion && <CotizacionModal evento={cotizacion} aliados={aliados} onClose={() => setCotizacion(null)} onSaved={fetchTodos} />}
      {modal   && (
        <EventoModal
          evento={modal === "new" ? null : modal}
          categoria={modal === "new" ? (tab === "grupo" ? "grupo" : "evento") : modal.categoria}
          salidas={salidas}
          aliados={aliados}
          vendedores={vendedores}
          onClose={() => setModal(null)}
          onSaved={() => { fetchTodos(); }}
          onShowLink={setLinkEvt}
        />
      )}
    </div>
  );
}
