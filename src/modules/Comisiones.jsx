import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";
import { useMobile } from "../lib/useMobile";

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWeekBounds(offset = 0) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const day = now.getDay(); // 0=Dom, 1=Lun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt   = d => d.toLocaleDateString("en-CA");
  const short = d => d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return {
    inicio: fmt(monday),
    fin:    fmt(sunday),
    label:  `${short(monday)} – ${short(sunday)}, ${monday.getFullYear()}`,
  };
}

const fmtFecha = (d) => {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : d;
};
const fmtDT = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CO", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

// ── Commission calc — same logic as B2B.jsx ──────────────────────────────────
function calcComision(r, pasadiasMap) {
  // Cortesías no generan comisión (total = 0)
  if (r.canal === "Cortesía" || r.forma_pago === "Cortesía") return 0;
  if (!r._esGrupo && (Number(r.total) || 0) === 0) return 0;

  // For grupo entries, calculate per pasadía line
  if (r._esGrupo && r._pasadias_org) {
    let total = 0;
    (r._pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").forEach(p => {
      const key = (p.tipo || "").toLowerCase();
      const pas = pasadiasMap[key] || {};
      const cobradoA = pas.precio || 0;
      const netoA    = pas.neto   || 0;
      const cobradoN = pas.precio_nino || 0;
      const netoN    = pas.neto_nino   || 0;
      const adultos  = Number(p.adultos) || 0;
      const ninos    = Number(p.ninos)   || 0;
      const personas = Number(p.personas) || 0;
      if (adultos > 0 || ninos > 0) {
        total += (cobradoA - netoA) * adultos;
        if (cobradoN > 0 && netoN > 0) total += (cobradoN - netoN) * ninos;
      } else {
        total += (cobradoA - netoA) * personas;
      }
    });
    return Math.max(0, total);
  }

  const key      = (r.tipo || "").toLowerCase();
  const pasadia  = pasadiasMap[key] || {};
  const cobradoA = r.precio_u    || pasadia.precio      || 0;
  const netoA    = r.precio_neto || pasadia.neto        || 0;
  const cobradoN = r.precio_nino || pasadia.precio_nino || 0;
  const netoN    =                  pasadia.neto_nino   || 0;
  const paxA     = r.pax_a || r.pax || 1;
  const paxN     = r.pax_n || 0;
  const desc     = r.descuento_agencia || 0;
  if (netoA > 0 && cobradoA > 0) {
    const mA = (cobradoA - netoA) * paxA;
    const mN = cobradoN > 0 && netoN > 0 ? (cobradoN - netoN) * paxN : 0;
    return Math.max(0, mA + mN - desc);
  }
  if (r.total > 0) return Math.max(0, r.total - (netoA * paxA + netoN * paxN) - desc);
  return 0;
}

// ── Modal de confirmación ─────────────────────────────────────────────────────
function ConfirmModal({ data, onConfirm, onCancel, saving }) {
  const [docs, setDocs] = useState({
    cuenta_cobro: { file: null, url: "", uploading: false },
    rut:          { file: null, url: "", uploading: false },
    cert:         { file: null, url: "", uploading: false },
  });
  // Reset docs cada vez que se abre el modal con otra comisión
  useEffect(() => {
    if (data) setDocs({
      cuenta_cobro: { file: null, url: "", uploading: false },
      rut:          { file: null, url: "", uploading: false },
      cert:         { file: null, url: "", uploading: false },
    });
  }, [data?.aliado_id]);

  const uploadDoc = async (key, file) => {
    if (!file || !supabase) return;
    setDocs(d => ({ ...d, [key]: { file, url: "", uploading: true } }));
    const path = `comisiones/${data.aliado_id}/${Date.now()}-${key}-${file.name.replace(/\s+/g, "_")}`;
    const { error } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      alert("Error subiendo archivo: " + error.message);
      setDocs(d => ({ ...d, [key]: { file: null, url: "", uploading: false } }));
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("b2b-docs").getPublicUrl(path);
    setDocs(d => ({ ...d, [key]: { file, url: publicUrl, uploading: false } }));
  };

  if (!data) return null;
  const { nombre, monto, reservas } = data;

  const puedeAprobar = !!docs.cuenta_cobro.url && !Object.values(docs).some(d => d.uploading);

  const DocInput = ({ dkey, label, required, accept = "application/pdf,image/*" }) => {
    const d = docs[dkey];
    return (
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 14px", border: `1px dashed ${d.url ? "#4ade80" : required ? "#f87171" : B.navyLight}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.white }}>
              {label} {required && <span style={{ color: "#f87171" }}>*</span>}
              {!required && <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400, fontSize: 11 }}> (opcional)</span>}
            </div>
            {d.file && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{d.file.name}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {d.uploading && <span style={{ fontSize: 11, color: B.sky }}>⏳</span>}
            {d.url && !d.uploading && <span style={{ fontSize: 14, color: "#4ade80" }}>✓</span>}
            <label style={{ background: d.url ? B.navyLight : B.sky + "33", color: d.url ? "rgba(255,255,255,0.6)" : B.sky, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {d.url ? "Cambiar" : "Subir"}
              <input type="file" accept={accept} style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) uploadDoc(dkey, e.target.files[0]); }} />
            </label>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "#00000088",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 540,
        maxHeight: "85vh", overflowY: "auto", padding: 28, border: `1px solid ${B.navyLight}` }}>

        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.sand, marginBottom: 4 }}>
          Aprobar comisión
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
          Esta semana quedará cerrada para <strong style={{ color: B.white }}>{nombre}</strong>. Las nuevas reservas entrarán a la siguiente semana.
        </div>

        {/* Resumen */}
        <div style={{ background: "#0D1B3E", borderRadius: 12, padding: "16px 20px", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total a aprobar</div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: "#a78bfa" }}>{COP(monto)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Reservas</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: B.white }}>{reservas.length}</div>
          </div>
        </div>

        {/* Detalle de reservas */}
        <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8 }}>
          Reservas incluidas
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20, maxHeight: 280, overflowY: "auto" }}>
          {reservas.map(r => (
            <div key={r.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: B.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nombre}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  {fmtFecha(r.fecha)} · {r.tipo} · {r.pax_a}A{r.pax_n > 0 ? ` ${r.pax_n}N` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: B.white }}>{COP(r.total)}</div>
                <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600 }}>{COP(r.comision)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Documentos de soporte ── */}
        <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8 }}>
          Documentos de soporte
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          <DocInput dkey="cuenta_cobro" label="Cuenta de Cobro" required />
          <DocInput dkey="rut" label="RUT" />
          <DocInput dkey="cert" label="Certificación Bancaria" />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={saving}
            style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${B.navyLight}`,
              background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 600 }}>
            Cancelar
          </button>
          <button onClick={() => onConfirm({
              cuenta_cobro_url:  docs.cuenta_cobro.url,
              rut_url:           docs.rut.url || null,
              cert_bancaria_url: docs.cert.url || null,
            })} disabled={saving || !puedeAprobar}
            title={!puedeAprobar ? "Debes subir la Cuenta de Cobro" : ""}
            style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none",
              background: (saving || !puedeAprobar) ? B.navyLight : "#7c3aed",
              color: B.white,
              cursor: (saving || !puedeAprobar) ? "not-allowed" : "pointer",
              fontWeight: 700, fontSize: 14, opacity: !puedeAprobar ? 0.6 : 1 }}>
            {saving ? "Aprobando..." : !puedeAprobar ? "Sube la Cuenta de Cobro" : `✓ Aprobar ${COP(monto)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Comisiones() {
  const [userEmail, setUserEmail] = useState("");
  const isMobile = useMobile();
  const [weekOffset, setWeekOffset]   = useState(0);
  const [tab, setTab]                 = useState("pendientes");
  const [pendientes, setPendientes]   = useState([]);
  const [aprobadas, setAprobadas]     = useState([]);
  const [loading, setLoading]         = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [saving, setSaving]           = useState(false);
  const [ejecutando, setEjecutando]   = useState(null);
  const [expanded, setExpanded]       = useState({}); // aliado_id → bool (pendientes)
  const [expandedA, setExpandedA]     = useState({}); // id → bool (aprobadas)
  const [filtroEstado, setFiltroEstado] = useState("aprobado");

  const { inicio, fin, label } = getWeekBounds(weekOffset);

  // ── Cargar pendientes (cálculo en vivo) ──────────────────────────────────
  const loadPendientes = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // IDs ya aprobados (en cualquier semana)
      const { data: comRows } = await supabase.from("comisiones_semanas").select("reservas_ids");
      const usedIds = new Set((comRows || []).flatMap(c => c.reservas_ids || []));

      // Reservas B2B de la semana seleccionada — solo pagadas (saldo = 0)
      const [{ data: reservas }, { data: gruposB2B }] = await Promise.all([
        supabase.from("reservas")
          .select("id, nombre, fecha, tipo, pax_a, pax_n, pax, total, precio_u, precio_neto, descuento_agencia, aliado_id, estado, saldo")
          .gte("fecha", inicio).lte("fecha", fin)
          .not("aliado_id", "is", null)
          .in("estado", ["confirmado", "check_in"])
          .lte("saldo", 0),
        // Grupos B2B (Confirmado/Realizado con aliado)
        supabase.from("eventos")
          .select("id, nombre, fecha, aliado_id, pasadias_org, precio_tipo, categoria, stage")
          .gte("fecha", inicio).lte("fecha", fin)
          .not("aliado_id", "is", null)
          .eq("categoria", "grupo")
          .in("stage", ["Confirmado", "Realizado"]),
      ]);

      // Convert grupos to virtual reserva entries for commission calculation
      const grupoReservas = (gruposB2B || []).map(g => {
        const org = (g.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF");
        const paxTotal = org.reduce((s, p) => s + (Number(p.personas) || 0), 0);
        return {
          id: g.id,
          nombre: g.nombre,
          fecha: g.fecha,
          tipo: org[0]?.tipo || "Grupo",
          aliado_id: g.aliado_id,
          pax_a: org.reduce((s, p) => s + (Number(p.adultos) || Number(p.personas) || 0), 0),
          pax_n: org.reduce((s, p) => s + (Number(p.ninos) || 0), 0),
          pax: paxTotal,
          total: 0,
          estado: g.stage === "Realizado" ? "check_in" : "confirmado",
          saldo: 0,
          _esGrupo: true,
          _pasadias_org: g.pasadias_org,
          _precio_tipo: g.precio_tipo,
        };
      });

      const allReservas = [...(reservas || []), ...grupoReservas];
      if (!allReservas.length) { setPendientes([]); setLoading(false); return; }

      // Excluir ya aprobadas
      const nuevas = allReservas.filter(r => !usedIds.has(r.id));
      if (!nuevas.length) { setPendientes([]); setLoading(false); return; }

      const aliadoIds = [...new Set(nuevas.map(r => r.aliado_id))];

      // Aliados + convenios
      const [{ data: aliados }, { data: pasadias }, { data: convenios }] = await Promise.all([
        supabase.from("aliados_b2b").select("id, nombre, comision").in("id", aliadoIds),
        supabase.from("pasadias").select("nombre, precio, precio_neto_agencia, precio_nino, precio_neto_nino").eq("activo", true),
        supabase.from("b2b_convenios").select("aliado_id, tipo_pasadia, tarifa_publica, tarifa_neta, tarifa_publica_nino, tarifa_neta_nino").in("aliado_id", aliadoIds),
      ]);

      const aliadoMap = {};
      (aliados || []).forEach(a => { aliadoMap[a.id] = a; });

      // Build pasadiasMap por aliado (same logic as B2B.jsx)
      const pasadiasBaseMap = {};
      (pasadias || []).forEach(p => {
        pasadiasBaseMap[p.nombre.toLowerCase()] = {
          precio:      p.precio              || 0,
          neto:        p.precio_neto_agencia || 0,
          precio_nino: p.precio_nino         || 0,
          neto_nino:   p.precio_neto_nino    || 0,
        };
      });

      // Build per-aliado pasadiasMap (convenio overrides base)
      const convByAliado = {};
      (convenios || []).forEach(c => {
        if (!convByAliado[c.aliado_id]) convByAliado[c.aliado_id] = {};
        convByAliado[c.aliado_id][c.tipo_pasadia.toLowerCase()] = c;
      });

      const getPasadiasMap = (aliadoId) => {
        const convs = convByAliado[aliadoId] || {};
        const pm = { ...pasadiasBaseMap };
        Object.entries(convs).forEach(([k, c]) => {
          pm[k] = {
            precio:      c.tarifa_publica      ?? pm[k]?.precio      ?? 0,
            neto:        c.tarifa_neta         ?? pm[k]?.neto        ?? 0,
            precio_nino: c.tarifa_publica_nino ?? pm[k]?.precio_nino ?? 0,
            neto_nino:   c.tarifa_neta_nino    ?? pm[k]?.neto_nino   ?? 0,
          };
        });
        return pm;
      };

      // Agrupar por aliado
      const byAliado = {};
      nuevas.forEach(r => {
        if (!byAliado[r.aliado_id]) {
          byAliado[r.aliado_id] = {
            aliado_id: r.aliado_id,
            nombre: aliadoMap[r.aliado_id]?.nombre || r.aliado_id,
            reservas: [],
            monto: 0,
            paxTotal: 0,
          };
        }
        const pm = getPasadiasMap(r.aliado_id);
        const comision = calcComision(r, pm);
        byAliado[r.aliado_id].reservas.push({ ...r, comision });
        byAliado[r.aliado_id].monto += comision;
        byAliado[r.aliado_id].paxTotal += (r.pax_a || r.pax || 0) + (r.pax_n || 0);
      });

      setPendientes(Object.values(byAliado).filter(a => a.monto > 0).sort((a, b) => b.monto - a.monto));
    } catch (e) {
      console.error("Comisiones loadPendientes:", e);
    }
    setLoading(false);
  }, [inicio, fin]);

  // ── Cargar aprobadas/ejecutadas ───────────────────────────────────────────
  const loadAprobadas = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("comisiones_semanas")
      .select("*").order("aprobado_at", { ascending: false }).limit(200);
    setAprobadas(data || []);
  }, []);

  useEffect(() => { supabase?.auth.getUser().then(({ data }) => { if (data?.user?.email) setUserEmail(data.user.email); }); }, []);
  useEffect(() => { loadPendientes(); }, [loadPendientes]);
  useEffect(() => { loadAprobadas(); }, [loadAprobadas]);

  // ── Aprobar ───────────────────────────────────────────────────────────────
  const aprobar = async (docs = {}) => {
    if (!confirmData || !supabase) return;
    setSaving(true);
    const { aliado_id, nombre, monto, reservas } = confirmData;
    const { error } = await supabase.from("comisiones_semanas").insert({
      id:              `COM-${Date.now()}`,
      aliado_id,
      aliado_nombre:   nombre,
      semana_inicio:   inicio,
      semana_fin:      fin,
      reservas_ids:    reservas.map(r => r.id),
      reservas_detalle: reservas,
      monto_comision:  monto,
      estado:          "aprobado",
      aprobado_por:    userEmail || "—",
      aprobado_at:     new Date().toISOString(),
      cuenta_cobro_url:  docs.cuenta_cobro_url  || null,
      rut_url:           docs.rut_url           || null,
      cert_bancaria_url: docs.cert_bancaria_url || null,
    });
    setSaving(false);
    if (!error) {
      setConfirmData(null);
      loadPendientes();
      loadAprobadas();
    } else {
      alert("Error al aprobar: " + error.message);
    }
  };

  // ── Ejecutar ──────────────────────────────────────────────────────────────
  const ejecutar = async (id) => {
    if (!supabase) return;
    setEjecutando(id);
    await supabase.from("comisiones_semanas").update({
      estado:       "ejecutado",
      ejecutado_por: userEmail || "—",
      ejecutado_at:  new Date().toISOString(),
    }).eq("id", id);
    setEjecutando(null);
    loadAprobadas();
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalPendiente = pendientes.reduce((s, a) => s + a.monto, 0);
  const aprobFiltradas = aprobadas.filter(c => filtroEstado === "all" || c.estado === filtroEstado);
  const totalAprobado  = aprobadas.filter(c => c.estado === "aprobado").reduce((s, c) => s + (c.monto_comision || 0), 0);
  const totalEjecutado = aprobadas.filter(c => c.estado === "ejecutado").reduce((s, c) => s + (c.monto_comision || 0), 0);

  // ── Shared styles ─────────────────────────────────────────────────────────
  const card = {
    background: B.navyMid, borderRadius: 12,
    border: `1px solid ${B.navyLight}`, overflow: "hidden",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: B.sand, margin: 0 }}>
            💜 Comisiones B2B
          </h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Gestión y aprobación de comisiones semanales de agencias
          </div>
        </div>

        {/* KPIs rápidos */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Por aprobar", val: COP(totalPendiente), color: B.warning },
            { label: "Aprobado",    val: COP(totalAprobado),  color: "#a78bfa" },
            { label: "Ejecutado",   val: COP(totalEjecutado), color: B.success },
          ].map(k => (
            <div key={k.label} style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{k.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${B.navyLight}`, gap: 0 }}>
        {[
          ["pendientes", "⏳ Por Aprobar"],
          ["aprobadas",  "📋 Historial"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            background: "none", border: "none", borderBottom: `3px solid ${tab === k ? B.sand : "transparent"}`,
            color: tab === k ? B.sand : "rgba(255,255,255,0.45)",
            padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: tab === k ? 700 : 400,
            transition: "all 0.15s",
          }}>{l}</button>
        ))}
      </div>

      {/* ══ TAB: PENDIENTES ══════════════════════════════════════════════════ */}
      {tab === "pendientes" && (
        <>
          {/* Selector de semana */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: "6px 10px" }}>
              <button onClick={() => setWeekOffset(o => o - 1)}
                style={{ background: "none", border: "none", color: B.sand, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>‹</button>
              <span style={{ fontSize: 14, fontWeight: 600, color: B.white, minWidth: 180, textAlign: "center" }}>{label}</span>
              <button onClick={() => setWeekOffset(o => o + 1)}
                style={{ background: "none", border: "none", color: B.sand, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>›</button>
            </div>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)}
                style={{ background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12, padding: "6px 12px" }}>
                Semana actual
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>Cargando comisiones...
            </div>
          ) : pendientes.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>Sin comisiones pendientes</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No hay reservas B2B confirmadas para esta semana que no hayan sido aprobadas.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pendientes.map(ag => {
                const open = !!expanded[ag.aliado_id];
                return (
                  <div key={ag.aliado_id} style={card}>
                    {/* Row header */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "16px 20px", cursor: "pointer", gap: 12,
                    }} onClick={() => setExpanded(e => ({ ...e, [ag.aliado_id]: !open }))}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: B.white }}>{ag.nombre}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                          {ag.reservas.length} reserva{ag.reservas.length !== 1 ? "s" : ""} · {ag.paxTotal} pax
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Comisión</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa", fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(ag.monto)}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmData(ag); }}
                          style={{ padding: "9px 18px", borderRadius: 8, border: "none",
                            background: "#7c3aed", color: B.white, fontWeight: 700,
                            cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
                          ✓ Aprobar
                        </button>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>{open ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Detalle de reservas */}
                    {open && (
                      <div style={{ borderTop: `1px solid ${B.navyLight}`, padding: "12px 20px 16px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 80px 100px 80px 100px", gap: "0 8px",
                          fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em",
                          fontWeight: 700, padding: "0 4px 8px", borderBottom: `1px solid rgba(255,255,255,0.06)`, marginBottom: 6 }}>
                          {!isMobile && <><span>Titular</span><span>Fecha</span><span>Tipo</span><span style={{textAlign:"right"}}>Pax</span><span style={{textAlign:"right"}}>Comisión</span></>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {ag.reservas.map(r => {
                            const openReserva = (e) => {
                              e.stopPropagation();
                              if (r._esGrupo) {
                                // Abrir el grupo en Eventos — por simplicidad dirigir a Reservas si no hay handler de eventos
                                return;
                              }
                              window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "reservas", reservaId: r.id } }));
                            };
                            return (
                            <div key={r.id} onClick={openReserva}
                              style={{
                                display: isMobile ? "block" : "grid",
                                gridTemplateColumns: "1fr 80px 100px 80px 100px",
                                gap: "0 8px", padding: "7px 4px",
                                borderBottom: `1px solid rgba(255,255,255,0.04)`,
                                fontSize: 13,
                                cursor: r._esGrupo ? "default" : "pointer",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={e => { if (!r._esGrupo) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                              <span style={{ color: B.white, fontWeight: 600 }}>{r.nombre}{r._esGrupo && " (grupo)"}</span>
                              <span style={{ color: "rgba(255,255,255,0.45)" }}>{fmtFecha(r.fecha)}</span>
                              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{r.tipo}</span>
                              <span style={{ color: "rgba(255,255,255,0.45)", textAlign: isMobile ? "left" : "right" }}>
                                {r.pax_a}A{r.pax_n > 0 ? ` ${r.pax_n}N` : ""}
                              </span>
                              <span style={{ color: "#a78bfa", fontWeight: 700, textAlign: isMobile ? "left" : "right" }}>{COP(r.comision)}</span>
                            </div>
                            );
                          })}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, marginTop: 4,
                          borderTop: `1px solid rgba(255,255,255,0.08)` }}>
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginRight: 12 }}>Total semana:</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa" }}>{COP(ag.monto)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Resumen total */}
              <div style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)",
                borderRadius: 12, padding: "14px 20px",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                  Total semana · {pendientes.length} agencia{pendientes.length !== 1 ? "s" : ""}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa", fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {COP(totalPendiente)}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ TAB: HISTORIAL ═══════════════════════════════════════════════════ */}
      {tab === "aprobadas" && (
        <>
          {/* Filtro de estado + totales */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[["aprobado", "⏳ Por ejecutar"], ["ejecutado", "✅ Ejecutado"], ["all", "Todos"]].map(([k, l]) => (
                <button key={k} onClick={() => setFiltroEstado(k)} style={{
                  padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: filtroEstado === k ? (k === "aprobado" ? "#7c3aed" : k === "ejecutado" ? B.success : B.navyLight) : "rgba(255,255,255,0.07)",
                  color: filtroEstado === k ? B.white : "rgba(255,255,255,0.5)",
                }}>{l}</button>
              ))}
            </div>
          </div>

          {aprobFiltradas.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>No hay comisiones en esta categoría.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {aprobFiltradas.map(c => {
                const isOpen = !!expandedA[c.id];
                const detalles = c.reservas_detalle || [];
                return (
                  <div key={c.id} style={card}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "16px 20px", cursor: "pointer", gap: 12 }}
                      onClick={() => setExpandedA(e => ({ ...e, [c.id]: !isOpen }))}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: B.white }}>{c.aliado_nombre}</span>
                          <span style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700,
                            background: c.estado === "ejecutado" ? B.success + "22" : "#7c3aed22",
                            color: c.estado === "ejecutado" ? B.success : "#a78bfa",
                          }}>
                            {c.estado === "ejecutado" ? "✅ Ejecutado" : "⏳ Por ejecutar"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                          Semana {fmtFecha(c.semana_inicio)} – {fmtFecha(c.semana_fin)} · {detalles.length} reservas
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                          Aprobado por {c.aprobado_por} · {fmtDT(c.aprobado_at)}
                          {c.estado === "ejecutado" && c.ejecutado_at && (
                            <> · Ejecutado {fmtDT(c.ejecutado_at)}</>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Comisión</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: c.estado === "ejecutado" ? B.success : "#a78bfa", fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {COP(c.monto_comision)}
                          </div>
                        </div>
                        {c.estado === "aprobado" && (
                          <button onClick={(e) => { e.stopPropagation(); ejecutar(c.id); }}
                            disabled={ejecutando === c.id}
                            style={{ padding: "9px 16px", borderRadius: 8, border: "none",
                              background: ejecutando === c.id ? B.navyLight : B.success, color: B.white,
                              fontWeight: 700, cursor: "pointer", fontSize: 12, flexShrink: 0 }}>
                            {ejecutando === c.id ? "..." : "💸 Ejecutar"}
                          </button>
                        )}
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Detalle de reservas */}
                    {isOpen && detalles.length > 0 && (
                      <div style={{ borderTop: `1px solid ${B.navyLight}`, padding: "12px 20px 16px" }}>
                        <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                          Reservas incluidas
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {detalles.map((r, i) => (
                            <div key={r.id || i} style={{
                              display: isMobile ? "block" : "grid",
                              gridTemplateColumns: "1fr 80px 100px 80px 100px",
                              gap: "0 8px", padding: "7px 4px",
                              borderBottom: `1px solid rgba(255,255,255,0.04)`,
                              fontSize: 13,
                            }}>
                              <span style={{ color: B.white, fontWeight: 600 }}>{r.nombre}</span>
                              <span style={{ color: "rgba(255,255,255,0.45)" }}>{fmtFecha(r.fecha)}</span>
                              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{r.tipo}</span>
                              <span style={{ color: "rgba(255,255,255,0.45)", textAlign: isMobile ? "left" : "right" }}>
                                {r.pax_a}A{r.pax_n > 0 ? ` ${r.pax_n}N` : ""}
                              </span>
                              <span style={{ color: "#a78bfa", fontWeight: 700, textAlign: isMobile ? "left" : "right" }}>{COP(r.comision)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Resumen filtrado */}
              <div style={{ background: filtroEstado === "ejecutado" ? B.success + "11" : "rgba(124,58,237,0.12)",
                border: `1px solid ${filtroEstado === "ejecutado" ? B.success + "33" : "rgba(124,58,237,0.3)"}`,
                borderRadius: 12, padding: "14px 20px",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                  {filtroEstado === "aprobado" ? "Total por ejecutar" :
                   filtroEstado === "ejecutado" ? "Total ejecutado" : "Total histórico"}
                  {" · "}{aprobFiltradas.length} registro{aprobFiltradas.length !== 1 ? "s" : ""}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700,
                  color: filtroEstado === "ejecutado" ? B.success : "#a78bfa",
                  fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {COP(aprobFiltradas.reduce((s, c) => s + (c.monto_comision || 0), 0))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal de confirmación de aprobación ── */}
      <ConfirmModal
        data={confirmData}
        onConfirm={aprobar}
        onCancel={() => setConfirmData(null)}
        saving={saving}
      />
    </div>
  );
}
