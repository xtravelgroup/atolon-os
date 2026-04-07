import { useState, useEffect, useCallback } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { wompiCheckoutUrl } from "../lib/wompi";

const STAGES       = ["Consulta", "Cotizado", "Confirmado", "Realizado"];
const TIPOS_EVT    = ["Matrimonio", "Cumpleaños", "Corporativo", "Despedida de Solteros", "Aniversario", "Grado", "Otro"];
const TIPOS_GRUPO  = ["VIP Pass", "Exclusive Pass", "Atolon Experience", "After Island"];
const SLUG_MAP     = { "VIP Pass": "vip-pass", "Exclusive Pass": "exclusive-pass", "Atolon Experience": "atolon-experience", "After Island": "after-island" };

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const stageColor = (s) => ({ Consulta: B.warning, Cotizado: B.sky, Confirmado: B.success, Realizado: "rgba(255,255,255,0.3)" }[s] || B.sand);

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
  // Organizador mode
  const [pasadias,     setPasadias]     = useState([]);
  const [pasadiaId,    setPasadiaId]    = useState("");
  const [paxOrg,       setPaxOrg]       = useState(String(evento.pax || ""));
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
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{evento.nombre} · {fmtFecha(evento.fecha)}</div>
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
          <div>📅 <strong style={{ color: B.white }}>{fmtFecha(evento.fecha)}</strong></div>
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

// ─── Modal crear/editar ───────────────────────────────────────────────────────
export function EventoModal({ evento, categoria, salidas, aliados, vendedores, onClose, onSaved, onShowLink }) {
  const isEdit   = !!evento?.id;
  const isGrupo  = categoria === "grupo";
  const tiposOpt = isGrupo ? TIPOS_GRUPO : TIPOS_EVT;

  const [form, setForm]       = useState(isEdit
    ? { ...evento, pax: String(evento.pax || ""), valor: String(evento.valor || ""), aliado_id: evento.aliado_id || "", vendedor: evento.vendedor || "", salidas_grupo: evento.salidas_grupo || [], buy_out: evento.buy_out || false, modalidad_pago: evento.modalidad_pago || "individual", pasadias_org: evento.pasadias_org || [], precio_tipo: evento.precio_tipo || "publico" }
    : { nombre: "", tipo: tiposOpt[0], fecha: "", pax: "", valor: "", aliado_id: "", vendedor: "", salidas_grupo: [], contacto: "", tel: "", email: "", empresa: "", nit: "", cargo: "", direccion: "", montaje: "", hora_ini: "", hora_fin: "", vencimiento: "", stage: "Consulta", notas: "", categoria, buy_out: false, modalidad_pago: "individual", pasadias_org: [], precio_tipo: "publico" });
  const [saving,        setSaving]        = useState(false);
  const [horaInput,     setHoraInput]     = useState("");
  const [aliadoSearch,  setAliadoSearch]  = useState("");
  const [aliadoOpen,    setAliadoOpen]    = useState(false);
  const [pasadiasPrecios, setPasadiasPrecios] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Cargar precios de pasadías cuando es modo organizador
  useEffect(() => {
    if (!isGrupo) return;
    supabase.from("pasadias").select("id, nombre, precio, precio_neto_agencia").order("nombre")
      .then(({ data }) => setPasadiasPrecios((data || []).filter(p => p.precio > 0)));
  }, [isGrupo]);

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
  const setPasadiaOrg = (id, k, v) => setForm(f => ({
    ...f, pasadias_org: f.pasadias_org.map(p => p.id === id ? { ...p, [k]: v } : p)
  }));

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
    const reservasEnFecha = await checkReservasEnFecha(form.fecha);
    setCheckingDate(false);

    // Solo pedir aprobación GG si hay reservas Y el evento es buy-out (bloqueará la fecha)
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

    // Calcular valor total para modo organizador
    const calcValorOrg = () => {
      return (form.pasadias_org || []).reduce((s, p) => {
        const pr = pasadiasPrecios.find(x => x.nombre === p.tipo);
        if (!pr) return s;
        const precio = form.precio_tipo === "neto" ? (pr.precio_neto_agencia || pr.precio) : pr.precio;
        return s + precio * (Number(p.personas) || 0);
      }, 0);
    };
    const valorFinal = isGrupo && form.modalidad_pago === "organizador"
      ? calcValorOrg()
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
      if (!wasConfirmado && form.fecha) {
        // Primera vez que se confirma → crear cierre
        await supabase.from("cierres").insert({
          id: `CIE-${Date.now()}`,
          fecha: form.fecha,
          tipo: "total",
          motivo: `Buy-Out: ${form.nombre.trim()}`,
          activo: true,
          creado_por: "Eventos",
        });
      } else if (wasConfirmado && fechaCambio && evento?.fecha) {
        // Ya estaba confirmado y cambió la fecha → mover el cierre
        await supabase.from("cierres")
          .delete()
          .eq("creado_por", "Eventos")
          .eq("fecha", evento.fecha)
          .ilike("motivo", `%${evento.nombre}%`);
        await supabase.from("cierres").insert({
          id: `CIE-${Date.now()}`,
          fecha: form.fecha,
          tipo: "total",
          motivo: `Buy-Out: ${form.nombre.trim()}`,
          activo: true,
          creado_por: "Eventos",
        });
      }
    }
    setSaving(false);
    await onSaved();
    onClose();
    if (isGrupo && !isEdit) onShowLink({ ...payload, id: savedId });
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

          {/* 4. Nombre del contacto */}
          <div>
            <label style={LS}>Nombre del contacto / organizador</label>
            <input value={form.contacto} onChange={e => set("contacto", e.target.value)} style={IS} placeholder="Nombre del cliente o responsable" />
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

          {/* 8. Tipo + Fecha */}
          {/* Para organizador: solo fecha (el tipo va en cada pasadía) */}
          {isGrupo && form.modalidad_pago === "organizador" ? (
            <div>
              <label style={LS}>Fecha del evento</label>
              <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} style={IS} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={LS}>{isGrupo ? "Tipo de pasadía" : "Tipo de evento"}</label>
                <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>
                  {tiposOpt.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Fecha</label>
                <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} style={IS} />
              </div>
            </div>
          )}

          {/* Cupos máximos — solo individual */}
          {isGrupo && form.modalidad_pago !== "organizador" && (
            <div>
              <label style={LS}>Cupos máximos (0 = ilimitado)</label>
              <input type="number" value={form.pax} onChange={e => set("pax", e.target.value)} style={IS} placeholder="0" />
            </div>
          )}

          {/* Pasadías múltiples — solo organizador */}
          {isGrupo && form.modalidad_pago === "organizador" && (() => {
            const totalPax = form.pasadias_org.reduce((s, p) => s + (Number(p.personas) || 0), 0);
            const totalSal = form.salidas_grupo.reduce((s, x) => s + (Number(x.personas) || 0), 0);
            const mismatch = form.pasadias_org.length > 0 && form.salidas_grupo.length > 0 && totalPax > 0 && totalSal > 0 && totalPax !== totalSal;
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
                  {form.pasadias_org.map(p => (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 32px", gap: 8, alignItems: "center" }}>
                      <select value={p.tipo} onChange={e => setPasadiaOrg(p.id, "tipo", e.target.value)} style={IS}>
                        {TIPOS_GRUPO.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input type="number" value={p.personas} onChange={e => setPasadiaOrg(p.id, "personas", e.target.value)}
                        placeholder="# pax" style={{ ...IS, textAlign: "center" }} />
                      <button type="button" onClick={() => removePasadiaOrg(p.id)}
                        style={{ height: 38, borderRadius: 8, border: "none", background: B.danger + "33", color: B.danger, fontSize: 15, cursor: "pointer" }}>✕</button>
                    </div>
                  ))}
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

          {/* Valor estimado — solo eventos */}
          {!isGrupo && (
            <div>
              <label style={LS}>Valor estimado</label>
              <input type="number" value={form.valor} onChange={e => set("valor", e.target.value)} style={IS} placeholder="0" />
            </div>
          )}

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
            const getPrecio = (tipo) => {
              const p = pasadiasPrecios.find(p => p.nombre === tipo);
              if (!p) return null;
              return form.precio_tipo === "neto" ? (p.precio_neto_agencia || p.precio) : p.precio;
            };
            const lineas = form.pasadias_org.map(p => ({
              tipo: p.tipo,
              personas: Number(p.personas) || 0,
              precio: getPrecio(p.tipo),
            }));
            const total = lineas.reduce((s, l) => s + (l.precio || 0) * l.personas, 0);
            const sinPrecios = lineas.some(l => l.personas > 0 && l.precio === null);
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
                {lineas.filter(l => l.personas > 0).length > 0 && (
                  <div style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                    {lineas.filter(l => l.personas > 0).map((l, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 0", borderBottom: i < lineas.filter(x=>x.personas>0).length - 1 ? `1px solid ${B.navyLight}44` : "none",
                        fontSize: 13 }}>
                        <span style={{ color: "rgba(255,255,255,0.6)" }}>
                          {l.tipo} × {l.personas} pax
                        </span>
                        <span style={{ fontWeight: 700, color: l.precio !== null ? B.white : B.warning }}>
                          {l.precio !== null ? COP(l.precio * l.personas) : "—"}
                        </span>
                      </div>
                    ))}
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
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Al confirmar, cierra automáticamente la fecha para venta de pasadías</div>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label style={LS}>Notas</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Requerimientos especiales, observaciones..." />
          </div>
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
function KanbanBoard({ items, isGrupo, onEdit, onBeo, onLink, onCotizar, onReservas, aliados }) {
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
                  {ev.tipo} · {fmtFecha(ev.fecha)}
                  {(ev.salidas_grupo || []).length > 0 && ` · ⛵ ${[...ev.salidas_grupo].sort((a,b)=>a.hora.localeCompare(b.hora)).map(s=>s.hora).join(", ")}`}
                  {` · ${ev.pax || "∞"} pax`}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.sand, marginBottom: 6 }}>{ev.valor ? COP(ev.valor) : ""}</div>
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
                  {ev.categoria === "grupo" && ev.modalidad_pago === "organizador" && (
                    <button onClick={e => { e.stopPropagation(); onLink(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "#5B4CF533", color: "#a78bfa", border: `1px solid #5B4CF544`, cursor: "pointer", fontWeight: 600 }}>💳 Pago grupal</button>
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

const MENU_TIPOS = ["Menú de Banquetes", "Menú Restaurant", "Custom Menu"];

function SectionTable({ title, color, rows, setRows, showNoches = false, showMenuType = false, catalogItems = null, defaultIva = 19 }) {
  const [picker, setPicker] = useState(false);

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

  const hasPicker = showMenuType || catalogItems !== null;

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
          {/* Menu type picker (alimentos) */}
          {showMenuType && (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>Selecciona el tipo de menú:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {MENU_TIPOS.map(t => (
                  <button key={t} onClick={() => addRow({ menu_tipo: t })}
                    style={{ padding: "10px 16px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, cursor: "pointer", textAlign: "left", fontWeight: 600 }}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
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
  const [alojamientos,  setAlojamientos]  = useState(saved.alojamientos  || []);
  const [alimentos,     setAlimentos]     = useState(saved.alimentos     || []);
  const [servicios,     setServicios]     = useState(saved.servicios     || []);
  const [notas,         setNotas]         = useState(saved.notas         || "");
  const [saving,        setSaving]        = useState(false);
  const [espaciosCat,   setEspaciosCat]   = useState([]);
  const [serviciosCat,  setServiciosCat]  = useState([]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("menu_items").select("id,nombre,precio,tiene_iva").eq("menu_tipo", "espacios_renta").eq("activo", true).order("orden").order("nombre")
      .then(({ data }) => setEspaciosCat(data || []));
    supabase.from("menu_items").select("id,nombre,precio,tiene_iva").eq("menu_tipo", "otros_servicios").eq("activo", true).order("orden").order("nombre")
      .then(({ data }) => setServiciosCat(data || []));
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
  const totAloj = sumSection(alojamientos);
  const totAli  = sumSection(alimentos);
  const totSer  = sumSection(servicios);
  const grandTotal = totEsp.total + totAloj.total + totAli.total + totSer.total;

  const aliado = aliados.find(a => a.id === evento.aliado_id);

  async function guardar(marcarCotizado = false) {
    setSaving(true);
    const data = { espacios, alojamientos, alimentos, servicios, notas };
    const upd  = { cotizacion_data: data };
    if (marcarCotizado) upd.stage = "Cotizado";
    await supabase.from("eventos").update(upd).eq("id", evento.id);
    setSaving(false);
    onSaved();
    if (marcarCotizado) onClose();
  }

  function imprimir() {
    guardar();
    setTimeout(() => window.print(), 400);
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #cotizacion-print { display: block !important; position: fixed; inset: 0; background: white; z-index: 99999; padding: 32px; color: #000; }
          #cotizacion-print table { page-break-inside: avoid; }
        }
        #cotizacion-print { display: none; }
      `}</style>

      {/* Printable area */}
      <div id="cotizacion-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, borderBottom: "3px solid #1E3566", paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#1E3566" }}>ATOLON</div>
            <div style={{ fontSize: 12, color: "#666" }}>Beach Club · Cartagena, Colombia</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1E3566" }}>COTIZACIÓN</div>
            <div style={{ fontSize: 12, color: "#666" }}>{evento.id}</div>
            <div style={{ fontSize: 12, color: "#666" }}>Fecha: {new Date().toLocaleDateString("es-CO")}</div>
            {header.vencimiento && <div style={{ fontSize: 12, color: "#666" }}>Vence: {header.vencimiento}</div>}
          </div>
        </div>

        {/* Event info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", marginBottom: 20, fontSize: 12 }}>
          {[["EVENTO", evento.tipo], ["FECHA EVENTO", evento.fecha ? new Date(evento.fecha).toLocaleDateString("es-CO") : ""], ["EMPRESA / CLIENTE", header.empresa], ["NIT", header.nit], ["CONTACTO", header.contacto], ["CARGO", header.cargo], ["TELÉFONO", header.telefono], ["EMAIL", header.email], ["DIRECCIÓN", header.direccion], ["ALIADO B2B", aliado?.nombre || ""], ["TIPO DE MONTAJE", header.montaje], ["NÚM. PAX", evento.pax], ["HORA INICIO", header.hora_ini], ["HORA FINAL", header.hora_fin]].map(([k, v]) => v ? (
            <div key={k} style={{ borderBottom: "1px solid #eee", padding: "4px 0", display: "flex", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#1E3566", minWidth: 140 }}>{k}:</span>
              <span>{v}</span>
            </div>
          ) : null)}
        </div>

        {/* Sections */}
        {[["ESPACIOS", "#1E3566", espacios, false, "IVA"], ["ALOJAMIENTOS", "#0D47A1", alojamientos, true, "IVA"], ["ALIMENTOS Y BEBIDAS", "#2E7D52", alimentos, false, "ICO"], ["OTROS SERVICIOS", "#7B4F12", servicios, false, "IVA"]].map(([title, color, rows, noches, ivaLabel]) => rows.length > 0 && (
          <div key={title} style={{ marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: color, color: "white" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", width: "35%" }}>{title}</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>CANT.</th>
                  {noches && <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>NOCHES</th>}
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "15%" }}>VALOR UNIT.</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "12%" }}>SUBTOTAL</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>{ivaLabel}</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "14%" }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => {
                  const { sub, tax, total } = calcLine(l);
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#f9f9f9" : "white" }}>
                      <td style={{ padding: "5px 8px" }}>{l.concepto}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>{l.cantidad}</td>
                      {noches && <td style={{ padding: "5px 8px", textAlign: "center" }}>{l.noches}</td>}
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

        {/* Totals */}
        <div style={{ marginLeft: "auto", width: 320, borderTop: "2px solid #1E3566", paddingTop: 12, fontSize: 13 }}>
          {[["Total Espacios", totEsp.total], ["Total Alojamientos", totAloj.total], ["Total Alimentos & Bebidas", totAli.total], ["Total Otros Servicios", totSer.total]].map(([k, v]) => v > 0 && (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#444" }}>
              <span>{k}</span><span>{COP(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 900, fontSize: 16, color: "#1E3566", borderTop: "1px solid #1E3566", marginTop: 6 }}>
            <span>TOTAL EVENTO</span><span>{COP(grandTotal)}</span>
          </div>
        </div>

        {notas && (
          <div style={{ marginTop: 24, padding: "12px 16px", background: "#f5f5f5", borderLeft: "3px solid #1E3566", borderRadius: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#1E3566", textTransform: "uppercase", marginBottom: 6 }}>Notas y Condiciones</div>
            <div style={{ fontSize: 11, color: "#444", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{notas}</div>
          </div>
        )}
        <div style={{ marginTop: 24, fontSize: 10, color: "#aaa", textAlign: "center" }}>
          Esta cotización es válida hasta {header.vencimiento || "—"}. Los precios están en COP e incluyen IVA donde aplica.
        </div>
      </div>

      {/* Modal UI */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px 0" }}>
        <div style={{ background: B.navy, borderRadius: 16, width: "90vw", maxWidth: 900, padding: 28, margin: "auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Cotización — {evento.nombre}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{evento.tipo} · {evento.fecha ? new Date(evento.fecha).toLocaleDateString("es-CO") : ""} · {evento.pax} pax</div>
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
          <SectionTable title="Espacios"            color="#1E3566" rows={espacios}     setRows={setEspacios}     catalogItems={espaciosCat} />
          <SectionTable title="Alojamientos"        color="#0D47A1" rows={alojamientos} setRows={setAlojamientos} showNoches />
          <SectionTable title="Alimentos y Bebidas" color="#2E7D52" rows={alimentos}    setRows={setAlimentos}    showMenuType defaultIva={8} />
          <SectionTable title="Otros Servicios"     color="#7B4F12" rows={servicios}    setRows={setServicios}    catalogItems={serviciosCat} />

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
            {[["Espacios", totEsp.total], ["Alojamientos", totAloj.total], ["Alimentos", totAli.total], ["Servicios", totSer.total]].map(([k, v]) => v > 0 && (
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

// ─── Calendario de Eventos ────────────────────────────────────────────────────
const STAGE_COLOR = {
  Consulta:  B.warning,
  Cotizado:  B.sky,
  Confirmado: B.success,
  Realizado: "rgba(255,255,255,0.3)",
};
const STAGE_ICON = { Consulta: "💬", Cotizado: "📋", Confirmado: "✅", Realizado: "✓" };
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
  const filtered = todos.filter(e => {
    if (!e.fecha) return false;
    if (e.fecha < desde || e.fecha > hasta) return false;
    if (filtro !== "todos" && e.categoria !== filtro) return false;
    return true;
  });

  const porDia = {};
  filtered.forEach(e => {
    if (!porDia[e.fecha]) porDia[e.fecha] = [];
    porDia[e.fecha].push(e);
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
              {!isMobile && evs.slice(0, maxPerCell).map(ev => (
                <div key={ev.id}
                  style={{
                    fontSize: 9, padding: "2px 5px", borderRadius: 4,
                    background: (STAGE_COLOR[ev.stage] || B.sand) + "33",
                    color: STAGE_COLOR[ev.stage] || B.sand,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    borderLeft: `2px solid ${STAGE_COLOR[ev.stage] || B.sand}`,
                    lineHeight: 1.4,
                  }}>
                  {CAT_ICON[ev.categoria]} {ev.nombre}
                </div>
              ))}
              {!isMobile && evs.length > maxPerCell && (
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", paddingLeft: 5 }}>+{evs.length - maxPerCell} más</div>
              )}
              {/* Mobile: colored dots */}
              {isMobile && evs.length > 0 && (
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 2 }}>
                  {evs.slice(0, 4).map(ev => (
                    <span key={ev.id} style={{ width: 6, height: 6, borderRadius: 3, background: STAGE_COLOR[ev.stage] || B.sand, flexShrink: 0 }} />
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
              {eventosDelDia.map(ev => {
                const sc = STAGE_COLOR[ev.stage] || B.sand;
                return (
                  <div key={ev.id} onClick={() => onEdit(ev)}
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
                        {ev.valor > 0 && <span style={{ color: B.sand, marginLeft: 8 }}>{COP(ev.valor)}</span>}
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
  const [linkEvt,     setLinkEvt]    = useState(null);
  const [reservasEvt, setReservasEvt] = useState(null);
  const [cotizacion,  setCotizacion] = useState(null);

  const fetchTodos = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [evtR, salR, aliR, vendR] = await Promise.all([
      supabase.from("eventos").select("*").order("fecha", { ascending: true }),
      supabase.from("salidas").select("id, hora, nombre").eq("activo", true).order("orden"),
      supabase.from("aliados_b2b").select("id, nombre, tipo").order("nombre"),
      supabase.from("usuarios").select("id, nombre").in("rol_id", ["ventas", "gerente_ventas"]).eq("activo", true).order("nombre"),
    ]);
    if (evtR.data) setTodos(evtR.data.map(e => ({
      id: e.id, nombre: e.nombre, tipo: e.tipo, fecha: e.fecha,
      pax: e.pax || 0, valor: e.valor || 0, stage: e.stage,
      contacto: e.contacto || "", tel: e.tel || "", email: e.email || "",
      notas: e.notas || "", categoria: e.categoria || "evento",
      salidas_grupo: e.salidas_grupo || [], aliado_id: e.aliado_id || "",
      vendedor: e.vendedor || "", cotizacion_data: e.cotizacion_data || {},
      empresa: e.empresa || "", nit: e.nit || "", cargo: e.cargo || "",
      direccion: e.direccion || "", montaje: e.montaje || "",
      hora_ini: e.hora_ini || "", hora_fin: e.hora_fin || "", vencimiento: e.vencimiento || "",
      buy_out: e.buy_out || false,
      modalidad_pago: e.modalidad_pago || "individual",
    })));
    if (salR.data) setSalidas(salR.data);
    if (aliR.data) setAliados(aliR.data);
    if (vendR.data) setVendedores(vendR.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

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
        {!isCalendario && (
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
        ? <CalendarioEventos todos={todos} onEdit={ev => setModal(ev)} isMobile={isMobile} />
        : <KanbanBoard items={items} isGrupo={isGrupo} aliados={aliados} onEdit={ev => setModal(ev)} onBeo={setBeo} onLink={setLinkEvt} onCotizar={setCotizacion} onReservas={setReservasEvt} />
      }

      {beo          && <BEOPreview evento={beo} onClose={() => setBeo(null)} />}
      {linkEvt      && <GrupoLink evento={linkEvt} onClose={() => setLinkEvt(null)} />}
      {reservasEvt  && <ReservasGrupoModal evento={reservasEvt} onClose={() => setReservasEvt(null)} />}
      {cotizacion && <CotizacionModal evento={cotizacion} aliados={aliados} onClose={() => setCotizacion(null)} onSaved={fetchTodos} />}
      {modal   && (
        <EventoModal
          evento={modal === "new" ? null : modal}
          categoria={modal === "new" ? (tab === "grupo" ? "grupo" : "evento") : modal.categoria}
          salidas={salidas}
          aliados={aliados}
          vendedores={vendedores}
          onClose={() => setModal(null)}
          onSaved={fetchTodos}
          onShowLink={setLinkEvt}
        />
      )}
    </div>
  );
}
