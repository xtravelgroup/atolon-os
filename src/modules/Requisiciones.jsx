import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { getCart, clearCart } from "../lib/requisicionCart";

// ─── Constantes ──────────────────────────────────────────────────────────────
const ESTADOS = ["Borrador", "Pendiente", "Aprobada", "En Compra", "Recibida Parcial", "Recibida", "Rechazada"];
const ESTADO_COLOR = {
  Borrador:           { bg: B.navyLight, accent: "rgba(255,255,255,0.5)" },
  Pendiente:          { bg: "#2A220A",   accent: B.warning },
  Aprobada:           { bg: "#153322",   accent: B.success },
  "En Compra":        { bg: "#1E3566",   accent: B.sky },
  "Recibida Parcial": { bg: "#1E3F2A",   accent: "#a3e635" },
  Recibida:           { bg: "#153322",   accent: "#6DD4A0" },
  Rechazada:          { bg: "#2A1515",   accent: B.danger },
};
const TIPOS = ["OPEX", "CAPEX"];
const CATEGORIAS = ["Alimentos", "Combustible", "Mantenimiento", "Equipos", "Mobiliario", "Tecnología", "Marketing", "Uniformes", "Limpieza", "Servicios", "Otro"];
const AREAS = ["Operaciones", "Cocina", "Bar", "Administración", "Flota", "Mantenimiento", "Marketing", "Deportes", "Hotel", "Eventos"];
const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];
const PRIO_COLOR = { Baja: B.sky, Media: B.sand, Alta: B.warning, Urgente: B.danger };
const ROLES_APROBADOR = ["auto", "ventas", "operador", "gerente_general_op", "gerente_general_admin", "super_admin", "contabilidad"];

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });

function uid() { return Math.random().toString(36).slice(2, 11); }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Badge({ text, bg, color }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", background: bg, color }}>{text}</span>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", flex: "1 1 200px", borderLeft: `4px solid ${color}`, minWidth: 180 }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Calcular qué regla aplica a un monto + área
function findReglaForAmount(reglas, monto, area) {
  return reglas.find(r => {
    if (!r.activo) return false;
    if (r.area && r.area !== area) return false;
    if (Number(r.monto_min) > monto) return false;
    if (r.monto_max != null && Number(r.monto_max) < monto) return false;
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function Requisiciones() {
  const [tab, setTab] = useState("solicitudes");
  const [reqs, setReqs] = useState([]);
  const [reglas, setReglas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [currentUser, setCurrentUser] = useState({ id: "", nombre: "Usuario", rol: "operador" });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [showNew, setShowNew] = useState(null); // null | "pick" | "OPEX" | "CAPEX" | {tipo,area}
  const [newReqArea, setNewReqArea] = useState(null); // "OPEX" when picking area
  const [showRegla, setShowRegla] = useState(null);
  const [showProvNuevo, setShowProvNuevo] = useState(false);

  // Auto-abrir modal si venimos del carrito de Items
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === "nuevaDesdeCarrito" || (e.detail?.modulo === "requisiciones" && e.detail?.action === "nuevaDesdeCarrito")) {
        const cart = getCart();
        if (cart.length > 0) {
          // Detectar el área según la categoría del primer item (Alimentos → Cocina, etc.)
          setNewReqArea(null);
          setShowNew("OPEX");
        }
      }
    };
    window.addEventListener("atolon-navigate", handler);
    // También al montar — si ya estamos aquí y el carrito tiene cosas
    const cart = getCart();
    if (cart.length > 0 && !showNew) {
      // No abrimos auto al montar para no sorprender; el banner del carrito en Items los trae
    }
    return () => window.removeEventListener("atolon-navigate", handler);
  }, []); // eslint-disable-line

  // Cargar usuario actual
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        const { data: u } = await supabase.from("usuarios").select("id, nombre, rol_id").eq("email", data.user.email).maybeSingle();
        if (u) setCurrentUser({ id: u.id, nombre: u.nombre, rol: u.rol_id });
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [rR, rgR, pR, oR, uR] = await Promise.all([
      supabase.from("requisiciones").select("*").order("fecha", { ascending: false }),
      supabase.from("req_reglas_aprobacion").select("*").order("orden"),
      supabase.from("proveedores").select("id, nombre, nit, telefono, email").order("nombre"),
      supabase.from("ordenes_compra").select("*").order("created_at", { ascending: false }),
      supabase.from("usuarios").select("id, nombre, email, rol_id, activo").eq("activo", true).order("nombre"),
    ]);
    setReqs((rR.data || []).map(r => ({
      id: r.id, desc: r.descripcion, tipo: r.tipo, cat: r.categoria, area: r.area,
      solicitante: r.solicitante, solicitante_id: r.solicitante_id,
      aprobador_id: r.aprobador_id, aprobador_nombre: r.aprobador_nombre,
      proveedor_id: r.proveedor_id, proveedor_nombre: r.proveedor_nombre,
      proveedor: r.proveedor || r.proveedor_nombre || "",
      prioridad: r.prioridad, estado: r.estado,
      fecha: r.fecha, fechaNecesaria: r.fecha_necesaria,
      justificacion: r.justificacion || "",
      items: r.items || [], total: Number(r.total) || 0,
      timeline: r.timeline || [], adjuntos: r.adjuntos || [], recibidos: r.recibidos || [],
      regla_aprobacion_id: r.regla_aprobacion_id, aprobada_at: r.aprobada_at,
      nivel_aprobacion: r.nivel_aprobacion || "gerente_general",
      aprobaciones: r.aprobaciones || [],
    })));
    setReglas(rgR.data || []);
    setProveedores(pR.data || []);
    setOrdenes(oR.data || []);
    setUsuarios(uR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel("req-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "requisiciones" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_compra" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // KPIs
  const pendientes = reqs.filter(r => r.estado === "Pendiente").length;
  const aprobadas = reqs.filter(r => r.estado === "Aprobada").length;
  const enCompra = reqs.filter(r => r.estado === "En Compra" || r.estado === "Recibida Parcial").length;
  const totalMes = reqs.filter(r => r.estado !== "Rechazada" && r.estado !== "Borrador").reduce((s, r) => s + r.total, 0);

  // ── Reglas de aprobación fijas ──────────────────────────────────────────────
  // Todas las req → gerente_general
  // Si monto > $12M o total semanal > $30M → requiere también dirección (super_admin)
  const UMBRAL_DIRECCION = 12_000_000;
  const UMBRAL_SEMANAL = 30_000_000;

  // Total aprobado esta semana (lunes a domingo)
  const totalSemanal = useMemo(() => {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const lunesStr = lunes.toISOString().slice(0, 10);
    return reqs
      .filter(r => ["Aprobada", "En Compra", "Recibida Parcial", "Recibida"].includes(r.estado) && r.fecha >= lunesStr)
      .reduce((s, r) => s + (r.total || 0), 0);
  }, [reqs]);

  // Determinar nivel de aprobación necesario para una req
  const nivelAprobacion = (r) => {
    if (r.total >= UMBRAL_DIRECCION) return "direccion";
    if (totalSemanal + r.total > UMBRAL_SEMANAL) return "direccion";
    return "gerente_general";
  };

  // Para tab Aprobaciones: filtrar requisiciones que necesitan aprobación del usuario actual
  const requierenAprobacion = reqs.filter(r => {
    if (r.estado !== "Pendiente") return false;
    const nivel = r.nivel_aprobacion || nivelAprobacion(r);
    // Gerente general ve todas las pendientes
    if (currentUser.rol === "gerente_general_op" || currentUser.rol === "gerente_general_admin") return true;
    // Dirección ve solo las que requieren dirección
    if (currentUser.rol === "super_admin" || currentUser.rol === "direccion") return nivel === "direccion";
    return false;
  });

  // ── Crear nueva requisición ──────────────────────────────────────────────
  const handleSave = async (newReq) => {
    if (!supabase) return;
    const monto = Number(newReq.total) || 0;
    const nivel = monto >= UMBRAL_DIRECCION || (totalSemanal + monto > UMBRAL_SEMANAL) ? "direccion" : "gerente_general";

    const row = {
      id: newReq.id,
      descripcion: newReq.desc,
      tipo: newReq.tipo,
      categoria: newReq.cat,
      area: newReq.area,
      solicitante: currentUser.nombre,
      solicitante_id: currentUser.id || null,
      prioridad: newReq.prioridad,
      estado: newReq.estado === "Borrador" ? "Borrador" : "Pendiente",
      fecha: newReq.fecha,
      fecha_necesaria: newReq.fechaNecesaria || null,
      proveedor_id: newReq.proveedor_id || null,
      proveedor_nombre: newReq.proveedor_nombre || newReq.proveedor || null,
      proveedor: newReq.proveedor || newReq.proveedor_nombre || null,
      justificacion: newReq.justificacion || null,
      items: newReq.items,
      total: monto,
      timeline: newReq.timeline,
      adjuntos: newReq.adjuntos || [],
      nivel_aprobacion: nivel,
      aprobada_at: null,
    };
    if (false) { // auto-aprobación desactivada — todas pasan a gerente
      row.timeline = [...(newReq.timeline || []), {
        quien: "Sistema",
        accion: "Auto-aprobada",
        fecha: new Date().toLocaleString("es-CO"),
        comentario: `Bajo el umbral de la regla "${regla.nombre}"`,
      }];
    }
    await supabase.from("requisiciones").insert(row);
    setShowNew(false);
    load();
  };

  // ── Update estado / aprobar / rechazar ───────────────────────────────────
  const handleUpdate = async (updated, extras = {}) => {
    if (!supabase) return;
    const patch = {
      estado: updated.estado,
      timeline: updated.timeline,
      ...extras,
    };
    await supabase.from("requisiciones").update(patch).eq("id", updated.id);
    setDetail(null);
    load();
  };

  // ── Crear orden de compra desde una requisición aprobada ─────────────────
  const generarOC = async (req) => {
    if (!supabase) return;
    if (!req.proveedor_id && !req.proveedor_nombre) {
      alert("Asigna un proveedor a la requisición primero (editando desde el detalle)");
      return;
    }
    const prov = proveedores.find(p => p.id === req.proveedor_id);
    const codigo = `OC-${new Date().getFullYear()}-${String(ordenes.length + 1).padStart(4, "0")}`;
    const subtotal = req.items.reduce((s, it) => s + (Number(it.subtotal) || it.cant * it.precioU || 0), 0);
    const oc = {
      codigo,
      requisicion_id: req.id,
      proveedor_id: req.proveedor_id || null,
      proveedor_nombre: prov?.nombre || req.proveedor_nombre || req.proveedor || "—",
      proveedor_nit: prov?.nit || null,
      proveedor_email: prov?.email || null,
      proveedor_telefono: prov?.telefono || null,
      fecha_emision: todayStr(),
      fecha_entrega: req.fechaNecesaria || null,
      items: req.items,
      subtotal,
      iva: 0,
      total: subtotal,
      estado: "emitida",
      emitida_por: currentUser.nombre,
      notas: req.justificacion || "",
    };
    const { data, error } = await supabase.from("ordenes_compra").insert(oc).select().single();
    if (error) { alert("Error: " + error.message); return; }
    // Marcar requisición como En Compra
    await supabase.from("requisiciones").update({
      estado: "En Compra",
      timeline: [...(req.timeline || []), {
        quien: currentUser.nombre,
        accion: "OC generada",
        fecha: new Date().toLocaleString("es-CO"),
        comentario: `Orden de compra ${codigo}`,
      }],
    }).eq("id", req.id);
    load();
    return data;
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 800 }}>📋 Requisiciones de compras</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            Solicitudes · Aprobaciones · Órdenes de compra · Recepciones
            {supabase && <span style={{ marginLeft: 10, fontSize: 9, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
          </div>
        </div>
        <button onClick={() => setShowNew("pick")} style={BTN(B.sky, B.navy)}>+ Nueva requisición</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Pendientes aprobación" value={pendientes} sub={`${reqs.filter(r => r.estado === "Pendiente" && r.prioridad === "Urgente").length} urgentes`} color={B.warning} />
        <StatCard label="Aprobadas listas para OC" value={aprobadas} color={B.success} />
        <StatCard label="En proceso de compra" value={enCompra} color={B.sky} />
        <StatCard label="Gasto comprometido" value={COP(totalMes)} color={B.sand} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${B.navyLight}`, overflowX: "auto" }}>
        {[
          ["solicitudes",  `📋 Solicitudes (${reqs.length})`],
          ["aprobaciones", `✅ Aprobaciones (${requierenAprobacion.length})`],
          ["ordenes",      `🧾 Órdenes de compra (${ordenes.length})`],
          ["recepciones",  `📦 Recepciones`],
          ["reglas",       `⚙ Reglas`],
          ["reportes",     `📊 Reportes`],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 400,
              background: "none", color: tab === k ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: tab === k ? `2px solid ${B.sky}` : "2px solid transparent", whiteSpace: "nowrap" }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : tab === "solicitudes" ? (
        <TabSolicitudes reqs={reqs} reglas={reglas} onOpen={setDetail} />
      ) : tab === "aprobaciones" ? (
        <TabAprobaciones reqs={requierenAprobacion} reglas={reglas} onOpen={setDetail} currentUser={currentUser} reload={load} />
      ) : tab === "ordenes" ? (
        <TabOrdenes ordenes={ordenes} reload={load} />
      ) : tab === "recepciones" ? (
        <TabRecepciones reqs={reqs.filter(r => r.estado === "En Compra" || r.estado === "Recibida Parcial")} ordenes={ordenes} reload={load} currentUser={currentUser} />
      ) : tab === "reglas" ? (
        <TabReglas reglas={reglas} onEdit={setShowRegla} reload={load} />
      ) : (
        <TabReportes reqs={reqs} ordenes={ordenes} />
      )}

      {/* Modales */}
      {/* Paso 1: Picker OPEX / CAPEX */}
      {showNew === "pick" && (
        <div onClick={e => e.target === e.currentTarget && setShowNew(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 440, maxWidth: "95vw", border: `1px solid ${B.navyLight}`, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 6 }}>📋 Nueva Requisición</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>¿Qué tipo de gasto es?</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              {[
                { key: "OPEX", label: "Operacional", desc: "Gastos recurrentes del día a día", icon: "🔄", color: B.sky },
                { key: "CAPEX", label: "CAPEX", desc: "Inversión en activos o equipos", icon: "🏗️", color: B.warning },
              ].map(t => (
                <button key={t.key} onClick={() => t.key === "OPEX" ? setNewReqArea("OPEX") || setShowNew("pickArea") : setShowNew(t.key)}
                  style={{
                    flex: 1, padding: "24px 16px", borderRadius: 14, border: `2px solid ${t.color}33`,
                    background: `${t.color}11`, color: B.white, cursor: "pointer", transition: "all 0.15s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${t.color}22`; e.currentTarget.style.borderColor = t.color; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${t.color}11`; e.currentTarget.style.borderColor = `${t.color}33`; }}
                >
                  <span style={{ fontSize: 32 }}>{t.icon}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{t.desc}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowNew(null)} style={{ marginTop: 18, background: "none", border: "none", color: B.sand, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}
      {/* Paso 2: Picker de departamento (solo OPEX) */}
      {showNew === "pickArea" && (
        <div onClick={e => e.target === e.currentTarget && setShowNew(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 520, maxWidth: "95vw", border: `1px solid ${B.navyLight}`, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 6 }}>🔄 Requisición Operacional</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>¿Para qué departamento?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { key: "Alimentos", icon: "🍳", color: "#f59e0b" },
                { key: "Bar", icon: "🍹", color: "#a78bfa" },
                { key: "Ama de Llaves", icon: "🛏️", color: "#34d399" },
                { key: "Mantenimiento", icon: "🔧", color: "#f97316" },
                { key: "Comercial", icon: "📊", color: B.sky },
                { key: "Contabilidad", icon: "📒", color: "#fbbf24" },
                { key: "Flota", icon: "🚤", color: "#38bdf8" },
                { key: "Otros", icon: "📦", color: "rgba(255,255,255,0.4)" },
              ].map(a => (
                <button key={a.key} onClick={() => { setNewReqArea(a.key); setShowNew("OPEX"); }}
                  style={{
                    padding: "18px 8px", borderRadius: 12, border: `1px solid ${a.color}33`,
                    background: `${a.color}11`, color: B.white, cursor: "pointer", transition: "all 0.15s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${a.color}22`; e.currentTarget.style.borderColor = a.color; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${a.color}11`; e.currentTarget.style.borderColor = `${a.color}33`; }}
                >
                  <span style={{ fontSize: 24 }}>{a.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{a.key}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowNew("pick")} style={{ marginTop: 18, background: "none", border: "none", color: B.sand, fontSize: 12, cursor: "pointer" }}>← Atrás</button>
          </div>
        </div>
      )}
      {(showNew === "OPEX" || showNew === "CAPEX") && <NewReqModal tipoInicial={showNew} areaInicial={newReqArea !== "OPEX" ? newReqArea : null} onClose={() => { setShowNew(null); setNewReqArea(null); }} onSave={handleSave} proveedores={proveedores} reglas={reglas} currentUser={currentUser} onProvNuevo={() => setShowProvNuevo(true)} />}
      {detail && <DetailModal req={detail} onClose={() => setDetail(null)} onUpdate={handleUpdate} onGenerarOC={generarOC} proveedores={proveedores} reglas={reglas} currentUser={currentUser} reload={load} />}
      {showRegla !== null && <ReglaModal regla={showRegla} onClose={() => setShowRegla(null)} reload={load} />}
      {showProvNuevo && <ProveedorRapidoModal onClose={() => setShowProvNuevo(false)} reload={load} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB SOLICITUDES — Kanban
// ═══════════════════════════════════════════════════════════════════════════
function TabSolicitudes({ reqs, reglas, onOpen }) {
  const [filterArea, setFilterArea] = useState("Todas");
  const [filterEstado, setFilterEstado] = useState("Todos");
  const [search, setSearch] = useState("");

  const filtered = reqs.filter(r => {
    if (filterArea !== "Todas" && r.area !== filterArea) return false;
    if (filterEstado !== "Todos" && r.estado !== filterEstado) return false;
    if (search && !r.desc?.toLowerCase().includes(search.toLowerCase()) && !r.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filterArea} onChange={e => setFilterArea(e.target.value)} style={{ ...IS, width: "auto", padding: "7px 12px" }}>
          <option>Todas</option>{AREAS.map(a => <option key={a}>{a}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ ...IS, width: "auto", padding: "7px 12px" }}>
          <option>Todos</option>{ESTADOS.map(e => <option key={e}>{e}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
          style={{ ...IS, marginLeft: "auto", width: 220, padding: "7px 12px" }} />
      </div>

      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {ESTADOS.map(estado => {
          const ec = ESTADO_COLOR[estado];
          const cards = filtered.filter(r => r.estado === estado);
          const colTotal = cards.reduce((s, r) => s + r.total, 0);
          return (
            <div key={estado} style={{ background: B.navy, borderRadius: 12, padding: "14px 12px", minWidth: 230, flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: ec.accent }} />
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{estado}</span>
                </div>
                <span style={{ background: ec.accent + "22", color: ec.accent, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{cards.length}</span>
              </div>
              {colTotal > 0 && <div style={{ fontSize: 10, color: B.sand, marginBottom: 10 }}>{COP(colTotal)}</div>}
              <div style={{ flex: 1, minHeight: 80 }}>
                {cards.map(r => <ReqCard key={r.id} req={r} reglas={reglas} onSelect={onOpen} />)}
                {cards.length === 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingTop: 20 }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReqCard({ req, reglas, onSelect }) {
  const ec = ESTADO_COLOR[req.estado] || ESTADO_COLOR.Borrador;
  const pc = PRIO_COLOR[req.prioridad] || B.sky;
  const regla = reglas.find(r => r.id === req.regla_aprobacion_id);
  return (
    <div onClick={() => onSelect(req)} style={{
      background: ec.bg, borderRadius: 10, padding: "10px 12px", marginBottom: 8,
      border: `1px solid ${ec.accent}33`, cursor: "pointer",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{req.id}</span>
        <Badge text={req.tipo} bg={req.tipo === "CAPEX" ? "#2A1E3E" : B.navyLight} color={req.tipo === "CAPEX" ? "#A78BFA" : B.sand} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: B.white, marginBottom: 4, lineHeight: 1.3 }}>{req.desc}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{req.area} · {req.solicitante}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(req.total)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {(req.adjuntos || []).length > 0 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>📎{req.adjuntos.length}</span>}
          <div style={{ width: 6, height: 6, borderRadius: 3, background: pc }} />
          <span style={{ fontSize: 9, color: pc }}>{req.prioridad}</span>
        </div>
      </div>
      {regla && req.estado === "Pendiente" && (
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 4, fontStyle: "italic" }}>
          → {regla.rol_aprobador}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB APROBACIONES — Lista de pendientes que requieren acción del usuario
// ═══════════════════════════════════════════════════════════════════════════
function TabAprobaciones({ reqs, reglas, onOpen, currentUser, reload }) {
  const aprobar = async (r, accion) => {
    if (!supabase) return;
    const aprobaciones = [...(r.aprobaciones || []), {
      quien: currentUser.nombre,
      rol: currentUser.rol,
      fecha: new Date().toLocaleString("es-CO"),
      accion,
    }];
    const timeline = [...(r.timeline || []), {
      quien: currentUser.nombre,
      accion: accion === "rechazada" ? "Rechazada" : "Aprobada por " + currentUser.nombre,
      fecha: new Date().toLocaleString("es-CO"),
    }];

    if (accion === "rechazada") {
      await supabase.from("requisiciones").update({
        estado: "Rechazada", aprobaciones, timeline, updated_at: new Date().toISOString(),
      }).eq("id", r.id);
    } else {
      // Verificar si necesita más aprobaciones
      const nivel = r.nivel_aprobacion || "gerente_general";
      const yaGerenteAprobo = aprobaciones.some(a => a.accion === "aprobada" && (a.rol === "gerente_general_op" || a.rol === "gerente_general_admin"));
      const yaDireccionAprobo = aprobaciones.some(a => a.accion === "aprobada" && (a.rol === "super_admin" || a.rol === "direccion"));

      let nuevoEstado = "Pendiente";
      if (nivel === "gerente_general" && yaGerenteAprobo) {
        nuevoEstado = "Aprobada"; // Gerente aprobó, pasa a compras
      } else if (nivel === "direccion" && yaGerenteAprobo && yaDireccionAprobo) {
        nuevoEstado = "Aprobada"; // Ambos aprobaron, pasa a compras
      } else if (nivel === "direccion" && yaGerenteAprobo && !yaDireccionAprobo) {
        nuevoEstado = "Pendiente"; // Gerente aprobó, falta dirección
      }

      await supabase.from("requisiciones").update({
        estado: nuevoEstado,
        aprobaciones,
        timeline,
        aprobada_at: nuevoEstado === "Aprobada" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", r.id);
    }
    reload();
  };

  if (reqs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div>No tienes requisiciones pendientes de aprobar</div>
        <div style={{ fontSize: 11, marginTop: 6 }}>Rol actual: {currentUser.rol}</div>
      </div>
    );
  }

  const totalPend = reqs.reduce((s, r) => s + r.total, 0);
  const esGerente = currentUser.rol === "gerente_general_op" || currentUser.rol === "gerente_general_admin";
  const esDireccion = currentUser.rol === "super_admin" || currentUser.rol === "direccion";

  return (
    <div>
      <div style={{ background: `${B.warning}11`, border: `1px solid ${B.warning}55`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 22 }}>⏳</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: B.warning, fontWeight: 700 }}>{reqs.length} requisición{reqs.length !== 1 ? "es" : ""} requieren tu aprobación</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Monto total pendiente: <strong style={{ color: B.sand }}>{COP(totalPend)}</strong></div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reqs.map(r => {
          const nivel = r.nivel_aprobacion || "gerente_general";
          const yaGerenteAprobo = (r.aprobaciones || []).some(a => a.accion === "aprobada" && (a.rol === "gerente_general_op" || a.rol === "gerente_general_admin"));
          const reqDireccion = nivel === "direccion";
          const esperaDireccion = reqDireccion && yaGerenteAprobo;
          const borderColor = reqDireccion ? B.warning : B.sky;

          return (
            <div key={r.id} style={{ background: B.navy, borderRadius: 12, padding: "14px 18px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${borderColor}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, cursor: "pointer" }} onClick={() => onOpen(r)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{r.desc}</span>
                    <Badge text={r.prioridad} bg={PRIO_COLOR[r.prioridad] + "22"} color={PRIO_COLOR[r.prioridad]} />
                    {reqDireccion && <Badge text="🏢 Dirección" bg={B.warning + "22"} color={B.warning} />}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    {r.id} · {r.area} · {r.solicitante} · {fmtFecha(r.fecha)}
                  </div>
                  {/* Progreso de aprobación */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: yaGerenteAprobo ? `${B.success}22` : `${B.sand}22`, color: yaGerenteAprobo ? B.success : B.sand }}>
                      {yaGerenteAprobo ? "✅ Gerente" : "⏳ Gerente"}
                    </span>
                    {reqDireccion && (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${B.sand}22`, color: B.sand }}>
                        {esperaDireccion ? "⏳ Dirección" : "— Dirección"}
                      </span>
                    )}
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${B.navyLight}`, color: "rgba(255,255,255,0.3)" }}>
                      → Compras
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(r.total)}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{r.items.length} ítems</div>
                </div>
              </div>
              {/* Botones de acción */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                <button onClick={() => { if (confirm("¿Rechazar esta requisición?")) aprobar(r, "rechazada"); }}
                  style={{ ...BTN(B.navyLight, B.danger), fontSize: 11, padding: "6px 14px" }}>✗ Rechazar</button>
                <button onClick={() => aprobar(r, "aprobada")}
                  style={{ ...BTN(B.success, B.navy), fontSize: 11, padding: "6px 14px" }}>✓ Aprobar</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB ÓRDENES DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════
function TabOrdenes({ ordenes, reload }) {
  const [showOC, setShowOC] = useState(null);
  if (ordenes.length === 0) {
    return <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>Sin órdenes de compra</div>;
  }
  return (
    <>
      <div style={{ background: B.navy, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: B.navyMid }}>
              {["Código", "Proveedor", "Fecha", "Items", "Total", "Estado", ""].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenes.map(o => (
              <tr key={o.id} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                <td style={{ padding: "12px", fontSize: 12, fontWeight: 700, color: B.sand, fontFamily: "monospace" }}>{o.codigo}</td>
                <td style={{ padding: "12px", fontSize: 12 }}>{o.proveedor_nombre || "—"}</td>
                <td style={{ padding: "12px", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{o.fecha_emision}</td>
                <td style={{ padding: "12px", fontSize: 11 }}>{(o.items || []).length}</td>
                <td style={{ padding: "12px", fontSize: 13, color: B.sand, fontWeight: 700 }}>{COP(o.total)}</td>
                <td style={{ padding: "12px" }}>
                  <Badge text={o.estado} bg={B.navyLight} color={B.sand} />
                </td>
                <td style={{ padding: "12px" }}>
                  <button onClick={() => setShowOC(o)} style={{ ...BTN(B.sky), color: B.navy, fontSize: 11, padding: "5px 10px" }}>Ver / PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showOC && <OCDetalleModal oc={showOC} onClose={() => setShowOC(null)} reload={reload} />}
    </>
  );
}

function OCDetalleModal({ oc, onClose, reload }) {
  const descargar = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Orden de Compra ${oc.codigo}</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; color: #0D1B3E; max-width: 800px; margin: 0 auto; padding: 32px; background: #fff; }
    h1 { font-family: 'Barlow Condensed', sans-serif; font-size: 32px; margin: 0; letter-spacing: 0.04em; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #C8B99A; margin-bottom: 24px; }
    .meta { font-size: 11px; color: #666; margin-top: 6px; }
    .codigo { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 800; color: #C8B99A; letter-spacing: 0.06em; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; }
    .grid div { font-size: 12px; }
    .label { font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 3px; }
    .value { font-size: 13px; color: #0D1B3E; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #0D1B3E; color: #C8B99A; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 12px; text-align: left; font-weight: 700; }
    td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
    tr:nth-child(even) td { background: #fafafa; }
    .totales { display: flex; justify-content: flex-end; }
    .totales-box { width: 280px; }
    .totales-box .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .totales-box .total { border-top: 2px solid #0D1B3E; padding-top: 10px; margin-top: 6px; font-size: 16px; font-weight: 800; color: #0D1B3E; font-family: 'Barlow Condensed', sans-serif; }
    .footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #999; text-align: center; }
    .actions { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; }
    .actions button { padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-weight: 700; font-size: 13px; }
    .btn-print { background: #0D1B3E; color: #fff; }
    .btn-close { background: #e5e7eb; color: #0D1B3E; }
    @media print { .actions { display: none; } body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="actions">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / PDF</button>
    <button class="btn-close" onclick="window.close()">✕</button>
  </div>
  <div class="header">
    <div>
      <h1>ATOLON BEACH CLUB</h1>
      <div class="meta">Cartagena de Indias · NIT 901.xxx.xxx</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Orden de Compra</div>
      <div class="codigo">${oc.codigo}</div>
      <div class="meta">Emitida: ${oc.fecha_emision}${oc.fecha_entrega ? ` · Entrega: ${oc.fecha_entrega}` : ""}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="label">Proveedor</div>
      <div class="value">${oc.proveedor_nombre || "—"}</div>
      ${oc.proveedor_nit ? `<div style="font-size: 11px; color: #666;">NIT: ${oc.proveedor_nit}</div>` : ""}
      ${oc.proveedor_email ? `<div style="font-size: 11px; color: #666;">${oc.proveedor_email}</div>` : ""}
      ${oc.proveedor_telefono ? `<div style="font-size: 11px; color: #666;">${oc.proveedor_telefono}</div>` : ""}
    </div>
    <div>
      <div class="label">Referencia interna</div>
      <div class="value">${oc.requisicion_id || "—"}</div>
      <div style="font-size: 11px; color: #666; margin-top: 8px;">Emitida por: ${oc.emitida_por || "—"}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Cant.</th>
        <th>Unidad</th>
        <th style="text-align: right;">P. Unit.</th>
        <th style="text-align: right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${(oc.items || []).map(it => `
        <tr>
          <td>${it.item || ""}</td>
          <td>${it.cant || 0}</td>
          <td>${it.unidad || ""}</td>
          <td style="text-align: right;">${(Number(it.precioU) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</td>
          <td style="text-align: right; font-weight: 700;">${(Number(it.subtotal) || it.cant * it.precioU || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="totales">
    <div class="totales-box">
      <div class="row"><span>Subtotal</span><span>${(Number(oc.subtotal) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</span></div>
      ${oc.iva > 0 ? `<div class="row"><span>IVA</span><span>${(Number(oc.iva) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</span></div>` : ""}
      <div class="row total"><span>TOTAL</span><span>${(Number(oc.total) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</span></div>
    </div>
  </div>

  ${oc.notas ? `<div style="margin-top: 24px; padding: 14px; background: #f5f5f5; border-radius: 8px; font-size: 12px; color: #555;"><strong>Notas:</strong> ${oc.notas}</div>` : ""}

  <div class="footer">
    Esta orden de compra es válida con la firma autorizada de Atolon Beach Club. Los precios y condiciones aquí establecidos son vinculantes para ambas partes.
  </div>
</body>
</html>
    `;
    w.document.write(html);
    w.document.close();
  };

  const cambiarEstado = async (estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    if (estado === "enviada") patch.enviada_at = new Date().toISOString();
    if (estado === "recibida") patch.recibida_at = new Date().toISOString();
    await supabase.from("ordenes_compra").update(patch).eq("id", oc.id);
    onClose();
    reload();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 700, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Orden de Compra</div>
            <div style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.sand }}>{oc.codigo}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Emitida {oc.fecha_emision} por {oc.emitida_por}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Proveedor</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{oc.proveedor_nombre || "—"}</div>
          {oc.proveedor_nit && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>NIT: {oc.proveedor_nit}</div>}
          {oc.proveedor_email && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{oc.proveedor_email}</div>}
          {oc.proveedor_telefono && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{oc.proveedor_telefono}</div>}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr><th style={{ padding: "8px", textAlign: "left", fontSize: 10, color: B.sand }}>Item</th><th style={{ padding: "8px", fontSize: 10, color: B.sand }}>Cant</th><th style={{ padding: "8px", textAlign: "right", fontSize: 10, color: B.sand }}>Subtotal</th></tr>
          </thead>
          <tbody>
            {(oc.items || []).map((it, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                <td style={{ padding: "8px", fontSize: 12 }}>{it.item}</td>
                <td style={{ padding: "8px", fontSize: 12, textAlign: "center" }}>{it.cant}</td>
                <td style={{ padding: "8px", fontSize: 12, textAlign: "right", color: B.sand, fontWeight: 700 }}>{COP(it.subtotal || it.cant * it.precioU || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Total</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(oc.total)}</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={descargar} style={BTN(B.sand, B.navy)}>📄 Descargar PDF</button>
          {oc.estado === "emitida" && <button onClick={() => cambiarEstado("enviada")} style={BTN(B.sky, B.navy)}>📧 Marcar enviada al proveedor</button>}
          {oc.estado === "enviada" && <button onClick={() => cambiarEstado("confirmada")} style={BTN(B.success)}>✓ Confirmada por proveedor</button>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB RECEPCIONES — Recibir items parcial o totalmente
// ═══════════════════════════════════════════════════════════════════════════
function TabRecepciones({ reqs, ordenes, reload, currentUser }) {
  const [openReq, setOpenReq] = useState(null);

  if (reqs.length === 0) {
    return <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
      <div>Sin recepciones pendientes</div>
    </div>;
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reqs.map(r => {
          const totalLineas = r.items.length;
          const recibidos = r.recibidos || [];
          const completas = recibidos.filter(rx => {
            const item = r.items.find(it => it.id === rx.item_id || r.items.indexOf(it) === rx.idx);
            return item && rx.cant_recibida >= item.cant;
          }).length;
          return (
            <div key={r.id} onClick={() => setOpenReq(r)}
              style={{ background: B.navy, borderRadius: 12, padding: "14px 18px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${B.sky}`, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{r.desc}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                    {r.id} · {r.proveedor_nombre || r.proveedor || "Sin proveedor"} · {r.area}
                  </div>
                  <div style={{ fontSize: 11, color: B.sky, marginTop: 4 }}>
                    📦 {completas}/{totalLineas} líneas recibidas completas
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(r.total)}</div>
                  <Badge text={r.estado} bg={ESTADO_COLOR[r.estado].bg} color={ESTADO_COLOR[r.estado].accent} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {openReq && <RecepcionModal req={openReq} onClose={() => setOpenReq(null)} reload={reload} currentUser={currentUser} />}
    </>
  );
}

function RecepcionModal({ req, onClose, reload, currentUser }) {
  const [recibidos, setRecibidos] = useState(() => {
    const map = {};
    (req.recibidos || []).forEach(r => { map[r.item_id] = r.cant_recibida; });
    return req.items.map(it => ({ ...it, cant_recibida: map[it.id] || 0 }));
  });
  const [notas, setNotas] = useState(req.notas_recibo || "");
  const [saving, setSaving] = useState(false);

  const setRecibido = (idx, val) => {
    setRecibidos(prev => prev.map((r, i) => i === idx ? { ...r, cant_recibida: Math.max(0, Math.min(r.cant, Number(val) || 0)) } : r));
  };
  const recibirTodo = () => setRecibidos(prev => prev.map(r => ({ ...r, cant_recibida: r.cant })));

  const guardar = async () => {
    setSaving(true);
    const totalEsperado = req.items.reduce((s, it) => s + Number(it.cant), 0);
    const totalRecibido = recibidos.reduce((s, r) => s + Number(r.cant_recibida || 0), 0);
    const todoRecibido = recibidos.every(r => r.cant_recibida >= r.cant);
    const algoRecibido = totalRecibido > 0;

    let nuevoEstado = req.estado;
    if (todoRecibido) nuevoEstado = "Recibida";
    else if (algoRecibido) nuevoEstado = "Recibida Parcial";

    await supabase.from("requisiciones").update({
      estado: nuevoEstado,
      recibidos: recibidos.map(r => ({ item_id: r.id, cant_recibida: r.cant_recibida })),
      notas_recibo: notas,
      timeline: [...(req.timeline || []), {
        quien: currentUser.nombre,
        accion: todoRecibido ? "Recibida completa" : "Recibida parcial",
        fecha: new Date().toLocaleString("es-CO"),
        comentario: `${totalRecibido}/${totalEsperado} unidades${notas ? ` — ${notas}` : ""}`,
      }],
    }).eq("id", req.id);
    setSaving(false);
    onClose();
    reload();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Recepción de mercancía</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{req.desc}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{req.id} · {req.proveedor_nombre || req.proveedor}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Items</span>
          <button onClick={recibirTodo} style={{ ...BTN(B.success), fontSize: 11, padding: "5px 12px" }}>✓ Recibir todo</button>
        </div>

        <div style={{ background: B.navy, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: B.navyLight }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: B.sand }}>Item</th>
                <th style={{ padding: "10px 12px", textAlign: "center", fontSize: 10, color: B.sand }}>Pedido</th>
                <th style={{ padding: "10px 12px", textAlign: "center", fontSize: 10, color: B.sand }}>Recibido</th>
                <th style={{ padding: "10px 12px", textAlign: "center", fontSize: 10, color: B.sand }}>Pendiente</th>
                <th style={{ padding: "10px 12px", fontSize: 10, color: B.sand }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {recibidos.map((r, i) => {
                const pendiente = r.cant - r.cant_recibida;
                const completo = r.cant_recibida >= r.cant;
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                    <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.item}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "center" }}>{r.cant} {r.unidad}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <input type="number" value={r.cant_recibida} min="0" max={r.cant}
                        onChange={e => setRecibido(i, e.target.value)}
                        style={{ ...IS, width: 70, padding: "5px 8px", textAlign: "center", fontSize: 12 }} />
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "center", color: pendiente > 0 ? B.warning : "rgba(255,255,255,0.3)" }}>
                      {pendiente > 0 ? pendiente : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {completo ? (
                        <span style={{ fontSize: 10, color: B.success, fontWeight: 700 }}>✓ Completo</span>
                      ) : r.cant_recibida > 0 ? (
                        <span style={{ fontSize: 10, color: B.warning, fontWeight: 700 }}>Parcial</span>
                      ) : (
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Pendiente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={LS}>Notas de recepción</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
            placeholder="Faltantes, daños, observaciones del proveedor…"
            style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={BTN(B.success)}>{saving ? "Guardando..." : "Guardar recepción"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB REGLAS — Configurar las reglas de aprobación
// ═══════════════════════════════════════════════════════════════════════════
function TabReglas({ reglas, onEdit, reload }) {
  const eliminar = async (id) => {
    if (!confirm("¿Eliminar regla?")) return;
    await supabase.from("req_reglas_aprobacion").delete().eq("id", id);
    reload();
  };
  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Define quién aprueba las requisiciones según el monto y área.</div>
        <button onClick={() => onEdit({})} style={BTN(B.sky, B.navy)}>+ Nueva regla</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reglas.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.3)" }}>Sin reglas configuradas</div>}
        {reglas.map(r => (
          <div key={r.id} style={{ background: B.navy, borderRadius: 10, padding: "14px 18px", border: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.nombre}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                {COP(r.monto_min)} {r.monto_max != null ? ` – ${COP(r.monto_max)}` : "+"} ·
                {r.area ? ` Área: ${r.area} · ` : " Cualquier área · "}
                Aprueba: <strong style={{ color: B.sand }}>{r.rol_aprobador}</strong>
              </div>
            </div>
            <button onClick={() => onEdit(r)} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "5px 10px" }}>✏️</button>
            <button onClick={() => eliminar(r.id)} style={{ ...BTN(B.danger + "33"), color: B.danger, fontSize: 11, padding: "5px 10px" }}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReglaModal({ regla, onClose, reload }) {
  const isEdit = !!regla.id;
  const [form, setForm] = useState({
    nombre: regla.nombre || "",
    monto_min: regla.monto_min || 0,
    monto_max: regla.monto_max || "",
    area: regla.area || "",
    rol_aprobador: regla.rol_aprobador || "gerente_general_op",
    orden: regla.orden || 0,
    activo: regla.activo !== false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = async () => {
    if (!form.nombre.trim()) return alert("Nombre obligatorio");
    const payload = {
      nombre: form.nombre.trim(),
      monto_min: Number(form.monto_min) || 0,
      monto_max: form.monto_max ? Number(form.monto_max) : null,
      area: form.area || null,
      rol_aprobador: form.rol_aprobador,
      orden: Number(form.orden) || 0,
      activo: form.activo,
    };
    if (isEdit) await supabase.from("req_reglas_aprobacion").update(payload).eq("id", regla.id);
    else await supabase.from("req_reglas_aprobacion").insert(payload);
    onClose();
    reload();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 480, maxWidth: "100%", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>{isEdit ? "Editar regla" : "Nueva regla de aprobación"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={LS}>Nombre</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Ej: Gerencia (≤ $5M)" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LS}>Monto mínimo</label>
              <input type="number" value={form.monto_min} onChange={e => set("monto_min", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Monto máximo (vacío = sin límite)</label>
              <input type="number" value={form.monto_max} onChange={e => set("monto_max", e.target.value)} style={IS} />
            </div>
          </div>
          <div>
            <label style={LS}>Área específica (opcional)</label>
            <select value={form.area} onChange={e => set("area", e.target.value)} style={{ ...IS, cursor: "pointer" }}>
              <option value="">Cualquier área</option>
              {AREAS.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={LS}>Rol que aprueba</label>
            <select value={form.rol_aprobador} onChange={e => set("rol_aprobador", e.target.value)} style={{ ...IS, cursor: "pointer" }}>
              {ROLES_APROBADOR.map(r => <option key={r}>{r}</option>)}
            </select>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              "auto" = aprobación automática sin necesidad de revisar
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={form.activo} onChange={e => set("activo", e.target.checked)} id="reg-activo" />
            <label htmlFor="reg-activo" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>Regla activa</label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
          <button onClick={guardar} style={BTN(B.success)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB REPORTES
// ═══════════════════════════════════════════════════════════════════════════
function TabReportes({ reqs, ordenes }) {
  const stats = useMemo(() => {
    const totalReqs = reqs.length;
    const totalApr = reqs.filter(r => ["Aprobada", "En Compra", "Recibida Parcial", "Recibida"].includes(r.estado)).reduce((s, r) => s + r.total, 0);
    const totalRech = reqs.filter(r => r.estado === "Rechazada").reduce((s, r) => s + r.total, 0);
    const porArea = {};
    const porCat = {};
    const porTipo = { OPEX: 0, CAPEX: 0 };
    reqs.forEach(r => {
      if (r.estado === "Rechazada" || r.estado === "Borrador") return;
      porArea[r.area] = (porArea[r.area] || 0) + r.total;
      porCat[r.cat] = (porCat[r.cat] || 0) + r.total;
      porTipo[r.tipo] = (porTipo[r.tipo] || 0) + r.total;
    });
    return { totalReqs, totalApr, totalRech, porArea, porCat, porTipo };
  }, [reqs]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Total requisiciones" value={stats.totalReqs} color={B.sky} />
        <StatCard label="Aprobadas" value={COP(stats.totalApr)} color={B.success} />
        <StatCard label="Rechazadas" value={COP(stats.totalRech)} color={B.danger} />
        <StatCard label="OPEX vs CAPEX" value={`${COP(stats.porTipo.OPEX)} / ${COP(stats.porTipo.CAPEX)}`} color={B.sand} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <ChartBox title="Por área" data={stats.porArea} />
        <ChartBox title="Por categoría" data={stats.porCat} />
      </div>
    </div>
  );
}

function ChartBox({ title, data }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(0, ...entries.map(e => e[1]));
  return (
    <div style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", border: `1px solid ${B.navyLight}` }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, fontWeight: 700 }}>{title}</div>
      {entries.length === 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Sin datos</div>}
      {entries.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{k}</span>
            <span style={{ color: B.sand, fontWeight: 700 }}>{COP(v)}</span>
          </div>
          <div style={{ height: 5, background: B.navyMid, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${max > 0 ? (v / max * 100) : 0}%`, background: B.sand }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Nueva requisición
// ═══════════════════════════════════════════════════════════════════════════
// ─── Item Search Autocomplete ───────────────────────────────────────────────
function ItemSearchInput({ value, catalogoItems, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const [popupQuery, setPopupQuery] = useState("");
  const activeQuery = open ? popupQuery : query;
  const matches = useMemo(() => {
    if (!activeQuery || activeQuery.length < 2) return catalogoItems.slice(0, 30); // show first 30 when popup open with no query
    const q = activeQuery.toLowerCase();
    return catalogoItems.filter(i => i.nombre.toLowerCase().includes(q)).slice(0, 30);
  }, [activeQuery, catalogoItems, open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value, null); }}
        onFocus={() => { if (query.length >= 2) setOpen(true); }}
        placeholder="Buscar producto..."
        style={{ ...IS, padding: "6px 8px", fontSize: 11, cursor: "pointer" }}
        onClick={() => setOpen(true)}
        readOnly={false}
      />
      {open && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100,
          background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{
            background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 14,
            width: 520, maxWidth: "90vw", maxHeight: "70vh", overflow: "hidden",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>🔍</span>
              <input
                value={popupQuery}
                onChange={e => setPopupQuery(e.target.value)}
                placeholder="Buscar producto..."
                autoFocus
                style={{ ...IS, border: "none", background: "transparent", fontSize: 14, padding: 0, flex: 1 }}
              />
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: B.sand, fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {matches.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>Sin resultados</div>
              ) : matches.map(m => (
                <div key={m.id}
                  onClick={() => { onChange(m.nombre, m); setQuery(m.nombre); setPopupQuery(""); setOpen(false); }}
                  style={{
                    padding: "12px 18px", cursor: "pointer",
                    borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ color: B.white, fontSize: 14, fontWeight: 600 }}>{m.nombre}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{m.categoria} · {m.unidad}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 18px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
              {matches.length} resultado{matches.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Map área de requisición → departamento de items
const AREA_TO_DEPTO = { Alimentos: "Cocina", Bar: "Bar", "Ama de Llaves": "Cocina", Mantenimiento: "Cocina", Comercial: "Cocina", Contabilidad: "Cocina", Flota: "Cocina", Otros: "Cocina" };

function NewReqModal({ tipoInicial, areaInicial, onClose, onSave, proveedores, reglas, currentUser, onProvNuevo }) {
  // Cargar desde carrito si existe
  const cartInicial = getCart();
  const [form, setForm] = useState({
    desc: "", tipo: tipoInicial || "OPEX", cat: areaInicial || "Alimentos", area: areaInicial || "Operaciones", prioridad: "Media",
    proveedor_id: "", proveedor_nombre: "", fechaNecesaria: "", justificacion: "",
    items: cartInicial.length > 0
      ? cartInicial.map(c => ({
          id: uid(),
          item: c.nombre,
          item_id: c.item_id,
          cant: c.cant,
          unidad: c.unidad || "Unidades",
          precioU: c.precioU || 0,
          subtotal: (Number(c.cant) || 0) * (Number(c.precioU) || 0),
        }))
      : [{ id: uid(), item: "", cant: 1, unidad: "Unidades", precioU: 0, subtotal: 0 }],
    adjuntos: [],
  });
  const [cargadoDesdeCart] = useState(cartInicial.length > 0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Cargar catálogo de items filtrado por departamento
  const [catalogoItems, setCatalogoItems] = useState([]);
  const [catalogoCats, setCatalogoCats] = useState([]);
  useEffect(() => {
    if (!supabase) return;
    const depto = AREA_TO_DEPTO[areaInicial] || "Cocina";
    Promise.all([
      supabase.from("items_categorias").select("nombre, departamento").eq("activo", true),
      supabase.from("items_catalogo").select("id, nombre, unidad, categoria").eq("activo", true).order("nombre"),
    ]).then(([catR, itemR]) => {
      const catsDepto = (catR.data || []).filter(c => c.departamento === depto).map(c => c.nombre);
      setCatalogoCats(catsDepto);
      const filtered = (itemR.data || []).filter(i => catsDepto.includes(i.categoria));
      setCatalogoItems(filtered);
    });
  }, [areaInicial]);

  const updateItem = (i, k, v) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [k]: v };
      if (k === "cant" || k === "precioU") items[i].subtotal = (Number(items[i].cant) || 0) * (Number(items[i].precioU) || 0);
      return { ...f, items };
    });
  };
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { id: uid(), item: "", cant: 1, unidad: "Unidades", precioU: 0, subtotal: 0 }] }));
  const removeItem = i => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const total = form.items.reduce((s, it) => s + (it.subtotal || 0), 0);

  const subirAdjunto = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    const adjuntosNuevos = [];
    for (const file of files) {
      const path = `cotizaciones/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("requisiciones").upload(path, file, { upsert: false });
      if (!error) {
        const { data } = supabase.storage.from("requisiciones").getPublicUrl(path);
        adjuntosNuevos.push({ nombre: file.name, url: data.publicUrl, size: file.size });
      }
    }
    setForm(f => ({ ...f, adjuntos: [...f.adjuntos, ...adjuntosNuevos] }));
    setUploading(false);
  };

  // Mostrar la regla que aplicará
  const reglaQueAplica = useMemo(() => findReglaForAmount(reglas, total, form.area), [reglas, total, form.area]);

  const handleSave = (asBorrador) => {
    if (!form.desc.trim()) return alert("Descripción obligatoria");
    const prov = proveedores.find(p => p.id === form.proveedor_id);
    onSave({
      ...form,
      id: `REQ-${Date.now().toString().slice(-6)}`,
      proveedor_nombre: prov?.nombre || form.proveedor_nombre || "",
      proveedor: prov?.nombre || form.proveedor_nombre || "",
      estado: asBorrador ? "Borrador" : "Pendiente",
      fecha: todayStr(),
      total,
      timeline: [{
        quien: currentUser.nombre,
        accion: asBorrador ? "Creada" : "Enviada a aprobación",
        fecha: new Date().toLocaleString("es-CO"),
        comentario: cargadoDesdeCart ? "Ítems agregados desde módulo Items" : "",
      }],
    });
    if (cargadoDesdeCart) clearCart();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>📋 Nueva requisición</span>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>Solicitante: <span style={{ color: B.sky, fontWeight: 600 }}>{currentUser.nombre}</span></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {cargadoDesdeCart && (
          <div style={{ background: B.success + "18", border: `1px solid ${B.success}55`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: B.success, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            🛒 <span><strong>{form.items.length} ítem{form.items.length !== 1 ? "s" : ""}</strong> cargado{form.items.length !== 1 ? "s" : ""} desde el módulo Items. Revisa cantidades y precios antes de enviar.</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px", marginBottom: 14 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LS}>Descripción</label>
            <input value={form.desc} onChange={e => set("desc", e.target.value)} placeholder="Descripción de la compra" style={IS} autoFocus />
          </div>
          <div>
            <label style={LS}>Tipo</label>
            {tipoInicial ? (
              <div style={{ ...IS, background: tipoInicial === "OPEX" ? `${B.sky}22` : `${B.warning}22`, border: `1px solid ${tipoInicial === "OPEX" ? B.sky : B.warning}44`, color: tipoInicial === "OPEX" ? B.sky : B.warning, fontWeight: 700, fontSize: 13 }}>
                {tipoInicial === "OPEX" ? "🔄 Operacional" : "🏗️ CAPEX"}
              </div>
            ) : (
              <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select>
            )}
          </div>
          <div>
            <label style={LS}>Departamento</label>
            {areaInicial ? (
              <div style={{ ...IS, background: `rgba(255,255,255,0.05)`, fontWeight: 600, fontSize: 13 }}>
                {areaInicial}
              </div>
            ) : (
              <select value={form.area} onChange={e => set("area", e.target.value)} style={IS}>{AREAS.map(a => <option key={a}>{a}</option>)}</select>
            )}
          </div>
          <div>
            <label style={LS}>Prioridad</label>
            <select value={form.prioridad} onChange={e => set("prioridad", e.target.value)} style={IS}>{PRIORIDADES.map(p => <option key={p}>{p}</option>)}</select>
          </div>
          <div>
            <label style={LS}>Fecha necesaria</label>
            <input type="date" value={form.fechaNecesaria} onChange={e => set("fechaNecesaria", e.target.value)} style={IS} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LS}>Justificación</label>
            <textarea value={form.justificacion} onChange={e => set("justificacion", e.target.value)} rows={2} placeholder="¿Por qué se necesita esta compra?" style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        </div>

        {/* Items */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Items</span>
            <button onClick={addItem} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "5px 12px", color: B.sky }}>+ Agregar item</button>
          </div>
          <div style={{ background: B.navy, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2.5fr 0.7fr 1fr 1fr 1fr 36px", gap: 0, padding: "8px 12px", borderBottom: `1px solid ${B.navyLight}`, background: B.navyLight }}>
              {["Item", "Cant", "Unidad", "P. Unit", "Subtotal", ""].map(h => <span key={h} style={{ fontSize: 9, color: B.sand, textTransform: "uppercase" }}>{h}</span>)}
            </div>
            {form.items.map((it, i) => (
              <div key={it.id} style={{ display: "grid", gridTemplateColumns: "2.5fr 0.7fr 1fr 1fr 1fr 36px", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${B.navyLight}`, alignItems: "center" }}>
                <ItemSearchInput
                  value={it.item}
                  catalogoItems={catalogoItems}
                  onChange={(val, selectedItem) => {
                    updateItem(i, "item", val);
                    if (selectedItem) {
                      updateItem(i, "unidad", selectedItem.unidad || "Unidades");
                      updateItem(i, "item_catalogo_id", selectedItem.id);
                    }
                  }}
                />
                <input type="number" value={it.cant} onChange={e => updateItem(i, "cant", Number(e.target.value))} style={{ ...IS, padding: "6px 8px", fontSize: 11, textAlign: "center" }} />
                <input value={it.unidad} onChange={e => updateItem(i, "unidad", e.target.value)} style={{ ...IS, padding: "6px 8px", fontSize: 11 }} />
                <input type="number" value={it.precioU} onChange={e => updateItem(i, "precioU", Number(e.target.value))} style={{ ...IS, padding: "6px 8px", fontSize: 11, textAlign: "right" }} />
                <span style={{ fontSize: 11, color: B.sand, textAlign: "right", fontWeight: 700 }}>{COP(it.subtotal)}</span>
                {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>×</button>}
              </div>
            ))}
            <div style={{ padding: "10px 14px", borderTop: `2px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(total)}</span>
            </div>
          </div>
        </div>

        {/* Adjuntos */}
        <div style={{ marginBottom: 14 }}>
          <label style={LS}>Adjuntos / cotizaciones</label>
          <input ref={fileInputRef} type="file" multiple onChange={subirAdjunto} style={{ display: "none" }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            style={{ ...BTN(B.navyLight), border: `1px dashed ${B.sand}55`, color: B.sand, padding: "10px 16px", width: "100%" }}>
            {uploading ? "Subiendo…" : "📎 Adjuntar archivo(s)"}
          </button>
          {form.adjuntos.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {form.adjuntos.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: B.navy, borderRadius: 6, fontSize: 11 }}>
                  <span>📄</span>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: B.sky, textDecoration: "none", flex: 1 }}>{a.nombre}</a>
                  <button onClick={() => set("adjuntos", form.adjuntos.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer" }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aviso de nivel de aprobación */}
        {total > 0 && (() => {
          const reqDireccion = total >= 12_000_000;
          const color = reqDireccion ? B.warning : B.sky;
          return (
            <div style={{ marginBottom: 14, padding: "10px 14px", background: `${color}11`, border: `1px solid ${color}55`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {reqDireccion ? "🏢 Requiere aprobación de Dirección" : "👩‍💼 Requiere aprobación de Gerente General"}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: "rgba(255,255,255,0.6)" }}>
                {reqDireccion
                  ? `Monto ≥ $12.000.000 — pasa a Gerente General → Dirección`
                  : "Todas las requisiciones pasan por Gerente General"}
                {" → una vez aprobada pasa a Compras"}
              </div>
            </div>
          );
        })()}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ ...BTN(B.navyLight), flex: 1 }}>Cancelar</button>
          <button onClick={() => handleSave(true)} style={{ ...BTN(B.navyLight), flex: 1 }}>💾 Borrador</button>
          <button onClick={() => handleSave(false)} style={{ ...BTN(B.sky, B.navy), flex: 2 }}>📤 Enviar a aprobación</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Detalle de requisición
// ═══════════════════════════════════════════════════════════════════════════
function DetailModal({ req, onClose, onUpdate, onGenerarOC, proveedores, reglas, currentUser, reload }) {
  const [comment, setComment] = useState("");
  const [editingProv, setEditingProv] = useState(false);
  const [provSel, setProvSel] = useState(req.proveedor_id || "");
  const ec = ESTADO_COLOR[req.estado] || ESTADO_COLOR.Borrador;
  const regla = reglas.find(r => r.id === req.regla_aprobacion_id);
  const puedeAprobar = req.estado === "Pendiente" && (currentUser.rol === "super_admin" || (regla && regla.rol_aprobador === currentUser.rol));

  const advance = (nuevoEstado, accion, extras = {}) => {
    onUpdate({
      ...req,
      estado: nuevoEstado,
      timeline: [...req.timeline, { quien: currentUser.nombre, accion, fecha: new Date().toLocaleString("es-CO"), comentario: comment }],
    }, extras);
    setComment("");
  };

  const guardarProveedor = async () => {
    const prov = proveedores.find(p => p.id === provSel);
    await supabase.from("requisiciones").update({
      proveedor_id: provSel || null,
      proveedor_nombre: prov?.nombre || null,
    }).eq("id", req.id);
    setEditingProv(false);
    reload();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 760, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{req.id}</span>
              <Badge text={req.estado} bg={ec.bg} color={ec.accent} />
              <Badge text={req.tipo} bg={req.tipo === "CAPEX" ? "#2A1E3E" : B.navyLight} color={req.tipo === "CAPEX" ? "#A78BFA" : B.sand} />
              <Badge text={req.prioridad} bg={PRIO_COLOR[req.prioridad] + "22"} color={PRIO_COLOR[req.prioridad]} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{req.desc}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px", marginBottom: 16, fontSize: 12 }}>
          {[
            ["Área", req.area],
            ["Categoría", req.cat],
            ["Solicitante", req.solicitante],
            ["Fecha", req.fecha],
            ["Necesaria", req.fechaNecesaria || "—"],
            ["Total", COP(req.total)],
          ].map(([l, v]) => (
            <div key={l}>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{l}:</span>{" "}
              <span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Proveedor (editable) */}
        <div style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Proveedor</span>
            {!editingProv && <button onClick={() => setEditingProv(true)} style={{ background: "none", border: "none", color: B.sky, fontSize: 11, cursor: "pointer" }}>✏️ Cambiar</button>}
          </div>
          {editingProv ? (
            <div style={{ display: "flex", gap: 8 }}>
              <select value={provSel} onChange={e => setProvSel(e.target.value)} style={{ ...IS, cursor: "pointer", flex: 1 }}>
                <option value="">Sin proveedor</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <button onClick={guardarProveedor} style={BTN(B.success)}>Guardar</button>
            </div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 700 }}>{req.proveedor_nombre || req.proveedor || "Sin asignar"}</div>
          )}
        </div>

        {req.justificacion && (
          <div style={{ background: B.navy, borderRadius: 8, padding: "12px 16px", marginBottom: 14, fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
            <span style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4, fontWeight: 700 }}>Justificación</span>
            {req.justificacion}
          </div>
        )}

        {/* Items */}
        <div style={{ background: B.navy, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Items</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total: <span style={{ color: B.sand }}>{COP(req.total)}</span></span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Item", "Cant.", "Unidad", "P. Unit.", "Subtotal"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: h === "Item" ? "left" : "right", fontSize: 9, color: B.sand, textTransform: "uppercase", borderBottom: `1px solid ${B.navyLight}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {req.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                  <td style={{ padding: "10px 12px", fontSize: 12 }}>{it.item}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>{it.cant}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{it.unidad}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>{COP(it.precioU)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right", fontWeight: 700, color: B.sand }}>{COP(it.subtotal || it.cant * it.precioU || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Adjuntos */}
        {(req.adjuntos || []).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontWeight: 700 }}>📎 Adjuntos</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {req.adjuntos.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: B.navy, borderRadius: 6, fontSize: 12, color: B.sky, textDecoration: "none" }}>
                  📄 {a.nombre}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8, fontWeight: 700 }}>Historial</span>
          <div style={{ borderLeft: `2px solid ${B.navyLight}`, marginLeft: 8, paddingLeft: 18 }}>
            {req.timeline.map((t, i) => (
              <div key={i} style={{ position: "relative", marginBottom: 12 }}>
                <div style={{ position: "absolute", left: -25, top: 4, width: 10, height: 10, borderRadius: 5, background: B.sand, border: `2px solid ${B.navyMid}` }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{t.quien}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{t.accion}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{t.fecha}</span>
                </div>
                {t.comentario && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>{t.comentario}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 14 }}>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentario (opcional)" style={{ ...IS, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {req.estado === "Borrador" && (
              <button onClick={() => advance("Pendiente", "Enviada a aprobación")} style={BTN(B.sky, B.navy)}>📤 Enviar a aprobación</button>
            )}
            {puedeAprobar && (
              <>
                <button onClick={() => advance("Aprobada", "Aprobada", { aprobador_id: currentUser.id, aprobador_nombre: currentUser.nombre, aprobada_at: new Date().toISOString() })} style={BTN(B.success)}>✓ Aprobar</button>
                <button onClick={() => advance("Rechazada", "Rechazada", { rechazada_motivo: comment })} style={BTN(B.danger)}>✕ Rechazar</button>
              </>
            )}
            {req.estado === "Aprobada" && (
              <button onClick={() => onGenerarOC(req)} style={BTN(B.sand, B.navy)}>🧾 Generar OC</button>
            )}
            {(req.estado === "En Compra" || req.estado === "Recibida Parcial") && (
              <button onClick={() => alert("Ve al tab Recepciones para registrar")} style={BTN(B.sky, B.navy)}>📦 Recepción en tab Recepciones</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Crear proveedor rápido
// ═══════════════════════════════════════════════════════════════════════════
function ProveedorRapidoModal({ onClose, reload }) {
  const [form, setForm] = useState({ nombre: "", nit: "", telefono: "", email: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = async () => {
    if (!form.nombre.trim()) return alert("Nombre obligatorio");
    await supabase.from("proveedores").insert({
      id: `PROV-${Date.now()}`,
      nombre: form.nombre.trim(),
      nit: form.nit || null,
      telefono: form.telefono || null,
      email: form.email || null,
    });
    onClose();
    reload();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 420, maxWidth: "100%", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>+ Nuevo proveedor rápido</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={LS}>Nombre *</label><input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS} autoFocus /></div>
          <div><label style={LS}>NIT</label><input value={form.nit} onChange={e => set("nit", e.target.value)} style={IS} /></div>
          <div><label style={LS}>Teléfono</label><input value={form.telefono} onChange={e => set("telefono", e.target.value)} style={IS} /></div>
          <div><label style={LS}>Email</label><input value={form.email} onChange={e => set("email", e.target.value)} style={IS} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
          <button onClick={guardar} style={BTN(B.success)}>Crear</button>
        </div>
      </div>
    </div>
  );
}
