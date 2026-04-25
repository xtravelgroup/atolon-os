// Lancha.jsx — Bitácora operativa por embarcación
// Tabs por lancha (Castillete, Naturalle, …) con:
//   · Resumen (KPIs: gasto mes, galones mes, próximo servicio, horas motor)
//   · Combustible (cargas)
//   · Mantenimiento / Reparaciones
//   · Incidentes
//   · Viajes (viene de muelle_zarpes_flota)
//   · Configuración de la lancha

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import CostosFlotaTab from "../components/CostosFlotaTab";

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const TIPOS = [
  { k: "combustible",    l: "⛽ Combustible",      c: B.warning },
  { k: "mantenimiento",  l: "🔧 Mantenimiento",    c: B.sky },
  { k: "reparacion",     l: "🛠️ Reparación",       c: "#ec4899" },
  { k: "inspeccion",     l: "🔍 Inspección",       c: B.sand },
  { k: "limpieza",       l: "🧼 Limpieza",         c: "#34d399" },
  { k: "marina",         l: "🅿️ Marina/Parqueo",   c: "#22d3ee" },
  { k: "capitanes",      l: "👨‍✈️ Capitanes",       c: "#fb923c" },
  { k: "incidente",      l: "⚠️ Incidente",        c: B.danger },
  { k: "viaje",          l: "⛵ Viaje",            c: "#a78bfa" },
  { k: "otro",           l: "📋 Otro",             c: "rgba(255,255,255,0.4)" },
];

const TIPOS_MANTENIMIENTO = ["mantenimiento", "reparacion", "inspeccion", "limpieza"];
const TIPOS_OPERATIVOS    = ["marina", "capitanes"];

const SEVERIDADES = [
  { k: "leve",     l: "Leve",     c: B.success },
  { k: "moderada", l: "Moderada", c: B.warning },
  { k: "grave",    l: "Grave",    c: "#f97316" },
  { k: "critica",  l: "Crítica",  c: B.danger },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayStr().slice(0, 7);
const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtFecha = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtFechaCorta = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—";
const fmtHora = (h) => h ? h.slice(0, 5) : "";
const uid = () => "BIT-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

export default function Lancha() {
  const [lanchas, setLanchas] = useState([]);
  const [bitacora, setBitacora] = useState([]);
  const [zarpes, setZarpes] = useState([]);
  const [capitanes, setCapitanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLancha, setActiveLancha] = useState(null);
  const [tab, setTab] = useState("resumen");
  const [modal, setModal] = useState(null); // { tipo, edit? }
  const [configModal, setConfigModal] = useState(false);
  const [capitanModal, setCapitanModal] = useState(null); // { edit? }

  const load = useCallback(async () => {
    setLoading(true);
    // Idempotente: asegura cargos recurrentes del mes actual (marina + capitanes terceros)
    supabase.rpc("generar_marina_mes").then(() => {});
    supabase.rpc("generar_capitanes_mes").then(() => {});
    const [lR, bR, zR, cR] = await Promise.all([
      supabase.from("lanchas").select("*").eq("activo", true).order("nombre"),
      supabase.from("lancha_bitacora").select("*").order("fecha", { ascending: false }).order("hora", { ascending: false }).limit(500),
      supabase.from("muelle_zarpes_flota").select("*").order("fecha", { ascending: false }).limit(200),
      supabase.from("capitanes_flota").select("*").eq("activo", true).order("nombre"),
    ]);
    const lanchasArr = lR.data || [];
    setLanchas(lanchasArr);
    setBitacora(bR.data || []);
    setZarpes(zR.data || []);
    setCapitanes(cR.data || []);
    if (!activeLancha && lanchasArr.length) setActiveLancha(lanchasArr[0].id);
    setLoading(false);
  }, [activeLancha]);
  useEffect(() => { load(); }, []); // eslint-disable-line

  const lancha = lanchas.find(l => l.id === activeLancha);
  const bitacoraLancha = useMemo(() => bitacora.filter(b => b.lancha_id === activeLancha), [bitacora, activeLancha]);
  const zarpesLancha = useMemo(() => zarpes.filter(z => lancha && z.embarcacion === lancha.nombre), [zarpes, lancha]);
  const capitanesLancha = useMemo(() => capitanes.filter(c => c.lancha_id === activeLancha), [capitanes, activeLancha]);

  // KPIs del mes
  const kpis = useMemo(() => {
    const mes = thisMonth();
    const delMes = bitacoraLancha.filter(b => (b.fecha || "").startsWith(mes));
    const combustibleMes = delMes.filter(b => b.tipo === "combustible");
    const galonesMes = combustibleMes.reduce((s, b) => s + Number(b.galones || 0), 0);
    const gastoCombustibleMes = combustibleMes.reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const gastoMantMes = delMes.filter(b => TIPOS_MANTENIMIENTO.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const gastoOperativosMes = delMes.filter(b => TIPOS_OPERATIVOS.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const gastoMarinaMes    = delMes.filter(b => b.tipo === "marina").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const gastoCapitanesMes = delMes.filter(b => b.tipo === "capitanes").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const ultimoHoras = bitacoraLancha.find(b => b.kilometraje_h != null)?.kilometraje_h || 0;
    const proxServ = bitacoraLancha.find(b => b.proximo_servicio_h || b.proximo_servicio_fecha);
    const zarpesMes = zarpesLancha.filter(z => (z.fecha || "").startsWith(mes));
    const viajesMes = zarpesMes.length;
    const gastoViajesMes = zarpesMes.reduce((s, z) => s + Number(z.costo_operativo || 0), 0);
    const incidentesAbiertos = bitacoraLancha.filter(b => b.tipo === "incidente" && !b.resuelto).length;
    return { galonesMes, gastoCombustibleMes, gastoMantMes, gastoOperativosMes, gastoMarinaMes, gastoCapitanesMes, ultimoHoras, proxServ, viajesMes, gastoViajesMes, incidentesAbiertos };
  }, [bitacoraLancha, zarpesLancha]);

  async function saveEvento(data) {
    const payload = {
      lancha_id: activeLancha,
      lancha_nombre: lancha?.nombre,
      fecha: data.fecha || todayStr(),
      hora: data.hora || null,
      tipo: data.tipo,
      subtipo: data.subtipo || null,
      descripcion: data.descripcion || null,
      galones: data.galones ? Number(data.galones) : null,
      precio_galon: data.precio_galon ? Number(data.precio_galon) : null,
      costo_total: data.costo_total ? Number(data.costo_total) : null,
      kilometraje_h: data.kilometraje_h ? Number(data.kilometraje_h) : null,
      proveedor: data.proveedor || null,
      taller: data.taller || null,
      proximo_servicio_h: data.proximo_servicio_h ? Number(data.proximo_servicio_h) : null,
      proximo_servicio_fecha: data.proximo_servicio_fecha || null,
      severidad: data.severidad || null,
      resuelto: !!data.resuelto,
      foto_url: data.foto_url || null,
      factura_url: data.factura_url || null,
      capitan: data.capitan || null,
      notas: data.notas || null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const r = await supabase.from("lancha_bitacora").update(payload).eq("id", data.id);
      if (r.error) return r.error;
    } else {
      const r = await supabase.from("lancha_bitacora").insert({ id: uid(), ...payload });
      if (r.error) return r.error;
    }
    setModal(null);
    load();
  }

  async function borrarEvento(id) {
    if (!confirm("¿Eliminar este registro?")) return;
    await supabase.from("lancha_bitacora").delete().eq("id", id);
    load();
  }

  async function toggleResuelto(item) {
    await supabase.from("lancha_bitacora").update({ resuelto: !item.resuelto, updated_at: new Date().toISOString() }).eq("id", item.id);
    load();
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;
  }

  if (!lancha) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>🚤</div>
        <div style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>Sin lanchas activas</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
          Crea una lancha para llevar su bitácora.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#fff", minHeight: "100vh", background: B.navy }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🚤 Bitácora de Lanchas</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Combustible, mantenimiento, viajes e incidentes por embarcación.</div>
        </div>
      </div>

      {/* Tabs por lancha */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {lanchas.map(l => (
          <button key={l.id} onClick={() => setActiveLancha(l.id)}
            style={{
              padding: "12px 20px", borderRadius: 12, border: "none", cursor: "pointer",
              background: activeLancha === l.id ? B.sky : B.navyMid,
              color: activeLancha === l.id ? B.navy : "#fff",
              fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8,
            }}>
            <span style={{ fontSize: 18 }}>⛵</span>
            {l.nombre}
          </button>
        ))}
        <button onClick={() => setConfigModal(true)}
          style={{ padding: "12px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: B.navyLight, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
          ⚙ Config
        </button>
      </div>

      {/* Info header de la lancha */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {lancha.foto_url ? (
          <img src={lancha.foto_url} alt={lancha.nombre} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} />
        ) : (
          <div style={{ width: 80, height: 80, borderRadius: 10, background: B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>⛵</div>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{lancha.nombre}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {lancha.matricula && <span>📋 {lancha.matricula}</span>}
            {lancha.capacidad_pax && <span>👥 {lancha.capacidad_pax} pax</span>}
            {lancha.capacidad_tanque_gal && <span>⛽ {lancha.capacidad_tanque_gal} gal</span>}
            {lancha.motor && <span>⚙ {lancha.motor}</span>}
            {lancha.capitan_default && <span>👨‍✈️ {lancha.capitan_default}</span>}
          </div>
        </div>
      </div>

      {/* KPIs del mes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Galones (mes)",       v: `${kpis.galonesMes.toFixed(1)} gal`, c: B.warning },
          { l: "Combustible (mes)",   v: fmtCOP(kpis.gastoCombustibleMes),    c: B.warning },
          { l: "Mant./Rep. (mes)",    v: fmtCOP(kpis.gastoMantMes),           c: B.sky },
          { l: "Marina (mes)",        v: fmtCOP(kpis.gastoMarinaMes),         c: "#22d3ee" },
          { l: "Capitanes (mes)",     v: fmtCOP(kpis.gastoCapitanesMes),      c: "#fb923c" },
          { l: "Viajes (mes)",        v: `${kpis.viajesMes} · ${fmtCOP(kpis.gastoViajesMes)}`, c: "#a78bfa" },
          { l: "Horas motor",         v: kpis.ultimoHoras.toFixed(0) + " h",  c: B.sand },
          { l: "Incidentes abiertos", v: kpis.incidentesAbiertos,             c: kpis.incidentesAbiertos > 0 ? B.danger : B.success },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navyMid, padding: 12, borderRadius: 10, borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.c, marginTop: 2 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs internos */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { k: "resumen",       l: "📊 Resumen" },
          { k: "costos",        l: "💸 Costos" },
          { k: "combustible",   l: "⛽ Combustible" },
          { k: "mantenimiento", l: "🔧 Mantenimiento" },
          { k: "operativos",    l: "🅿️ Operativos" },
          { k: "capitanes",     l: `👨‍✈️ Capitanes (${capitanesLancha.length})` },
          { k: "incidentes",    l: "⚠️ Incidentes" },
          { k: "viajes",        l: `⛵ Viajes (${zarpesLancha.length})` },
          { k: "todos",         l: "📋 Todo" },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={BTN(tab === t.k ? B.sky : B.navyMid, tab === t.k ? B.navy : "#fff")}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Botón agregar */}
      {tab !== "viajes" && tab !== "resumen" && tab !== "capitanes" && tab !== "costos" && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setModal({ tipo: defaultTipoForTab(tab) })}
            style={BTN(B.success)}>
            + Nuevo registro
          </button>
        </div>
      )}

      {tab === "resumen" && (
        <ResumenTab bitacora={bitacoraLancha} zarpes={zarpesLancha} lancha={lancha} />
      )}
      {tab === "costos" && (
        <CostosFlotaTab />
      )}
      {tab === "combustible" && (
        <ListaEventos
          items={bitacoraLancha.filter(b => b.tipo === "combustible")}
          onEdit={(e) => setModal({ tipo: "combustible", edit: e })}
          onDelete={borrarEvento}
        />
      )}
      {tab === "mantenimiento" && (
        <ListaEventos
          items={bitacoraLancha.filter(b => TIPOS_MANTENIMIENTO.includes(b.tipo))}
          onEdit={(e) => setModal({ tipo: e.tipo, edit: e })}
          onDelete={borrarEvento}
        />
      )}
      {tab === "operativos" && (
        <ListaEventos
          items={bitacoraLancha.filter(b => TIPOS_OPERATIVOS.includes(b.tipo))}
          onEdit={(e) => setModal({ tipo: e.tipo, edit: e })}
          onDelete={borrarEvento}
        />
      )}
      {tab === "capitanes" && (
        <ListaCapitanes
          capitanes={capitanesLancha}
          onAdd={() => setCapitanModal({})}
          onEdit={(c) => setCapitanModal({ edit: c })}
          onDelete={async (id) => {
            if (!confirm("¿Eliminar capitán? (Los pagos ya registrados quedan en bitácora)")) return;
            await supabase.from("capitanes_flota").update({ activo: false }).eq("id", id);
            load();
          }}
        />
      )}
      {tab === "incidentes" && (
        <ListaEventos
          items={bitacoraLancha.filter(b => b.tipo === "incidente")}
          onEdit={(e) => setModal({ tipo: "incidente", edit: e })}
          onDelete={borrarEvento}
          onToggleResuelto={toggleResuelto}
        />
      )}
      {tab === "viajes" && (
        <ListaViajes viajes={zarpesLancha} />
      )}
      {tab === "todos" && (
        <ListaEventos
          items={bitacoraLancha}
          onEdit={(e) => setModal({ tipo: e.tipo, edit: e })}
          onDelete={borrarEvento}
          onToggleResuelto={toggleResuelto}
        />
      )}

      {modal && (
        <EventoModal
          tipo={modal.tipo}
          edit={modal.edit}
          onClose={() => setModal(null)}
          onSave={saveEvento}
          capitanDefault={lancha.capitan_default}
        />
      )}
      {configModal && (
        <ConfigLanchaModal
          lancha={lancha}
          onClose={() => setConfigModal(false)}
          onSaved={() => { setConfigModal(false); load(); }}
        />
      )}
      {capitanModal && (
        <CapitanModal
          edit={capitanModal.edit}
          lancha={lancha}
          onClose={() => setCapitanModal(null)}
          onSaved={() => { setCapitanModal(null); load(); }}
        />
      )}
    </div>
  );
}

function defaultTipoForTab(tab) {
  if (tab === "combustible") return "combustible";
  if (tab === "mantenimiento") return "mantenimiento";
  if (tab === "operativos") return "marina";
  if (tab === "incidentes") return "incidente";
  return "combustible";
}

// ─── Resumen tab ───────────────────────────────────────────────────────────
function ResumenTab({ bitacora, zarpes, lancha }) {
  // 6 meses de gasto
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    meses.push(d.toISOString().slice(0, 7));
  }
  const gastosMes = meses.map(m => {
    const items = bitacora.filter(b => (b.fecha || "").startsWith(m));
    const zarpesM = zarpes.filter(z => (z.fecha || "").startsWith(m));
    return {
      mes: m,
      comb: items.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0),
      mant: items.filter(b => TIPOS_MANTENIMIENTO.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0),
      oper: items.filter(b => TIPOS_OPERATIVOS.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0),
      viajes: zarpesM.reduce((s, z) => s + Number(z.costo_operativo || 0), 0),
    };
  });
  const maxGasto = Math.max(1, ...gastosMes.map(g => g.comb + g.mant + g.oper + g.viajes));

  const recientes = bitacora.slice(0, 5);
  const proximoServicio = bitacora.find(b => b.proximo_servicio_fecha || b.proximo_servicio_h);

  return (
    <div>
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>Gasto últimos 6 meses</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160 }}>
          {gastosMes.map(g => {
            const altoComb   = maxGasto ? (g.comb   / maxGasto) * 120 : 0;
            const altoMant   = maxGasto ? (g.mant   / maxGasto) * 120 : 0;
            const altoOper   = maxGasto ? (g.oper   / maxGasto) * 120 : 0;
            const altoViajes = maxGasto ? (g.viajes / maxGasto) * 120 : 0;
            return (
              <div key={g.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column-reverse", width: "100%", maxWidth: 40, height: 130, alignItems: "stretch" }}>
                  <div style={{ background: B.warning,  height: altoComb,   minHeight: g.comb   > 0 ? 3 : 0 }} title={"Combustible: " + fmtCOP(g.comb)} />
                  <div style={{ background: B.sky,      height: altoMant,   minHeight: g.mant   > 0 ? 3 : 0 }} title={"Mant.: " + fmtCOP(g.mant)} />
                  <div style={{ background: "#22d3ee",  height: altoOper,   minHeight: g.oper   > 0 ? 3 : 0 }} title={"Operativos: " + fmtCOP(g.oper)} />
                  <div style={{ background: "#a78bfa",  height: altoViajes, minHeight: g.viajes > 0 ? 3 : 0 }} title={"Viajes: " + fmtCOP(g.viajes)} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{g.mes.slice(5)}</div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{fmtCOP(g.comb + g.mant + g.oper + g.viajes)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.6)", flexWrap: "wrap" }}>
          <span>▪ <span style={{ color: B.warning }}>Combustible</span></span>
          <span>▪ <span style={{ color: B.sky }}>Mantenimiento</span></span>
          <span>▪ <span style={{ color: "#22d3ee" }}>Operativos</span></span>
          <span>▪ <span style={{ color: "#a78bfa" }}>Viajes</span></span>
        </div>
      </div>

      {proximoServicio && (
        <div style={{ background: B.sky + "15", border: `1px solid ${B.sky}40`, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
          <div style={{ fontSize: 11, color: B.sky, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>🔔 Próximo servicio</div>
          <div>
            {proximoServicio.proximo_servicio_fecha && `Fecha: ${fmtFecha(proximoServicio.proximo_servicio_fecha)}`}
            {proximoServicio.proximo_servicio_fecha && proximoServicio.proximo_servicio_h && " · "}
            {proximoServicio.proximo_servicio_h && `${proximoServicio.proximo_servicio_h} h motor`}
          </div>
        </div>
      )}

      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Últimos registros</div>
      {recientes.length === 0 ? (
        <div style={{ padding: 20, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          Sin registros todavía.
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
          {recientes.map(r => <EventoRow key={r.id} item={r} compact />)}
        </div>
      )}
    </div>
  );
}

// ─── Lista de eventos ──────────────────────────────────────────────────────
function ListaEventos({ items, onEdit, onDelete, onToggleResuelto }) {
  if (!items.length) {
    return (
      <div style={{ padding: 30, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
        Sin registros.
      </div>
    );
  }
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
      {items.map(r => <EventoRow key={r.id} item={r} onEdit={onEdit} onDelete={onDelete} onToggleResuelto={onToggleResuelto} />)}
    </div>
  );
}

function EventoRow({ item, onEdit, onDelete, onToggleResuelto, compact }) {
  const tipo = TIPOS.find(t => t.k === item.tipo) || TIPOS[TIPOS.length - 1];
  const sev = item.severidad ? SEVERIDADES.find(s => s.k === item.severidad) : null;
  return (
    <div style={{ padding: compact ? "9px 14px" : "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "flex-start", gap: 12, fontSize: 13 }}>
      <div style={{ minWidth: 80, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
        <div style={{ fontWeight: 700 }}>{fmtFechaCorta(item.fecha)}</div>
        {item.hora && <div>{fmtHora(item.hora)}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: tipo.c + "33", color: tipo.c, fontWeight: 700 }}>
            {tipo.l}
          </span>
          {sev && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: sev.c + "33", color: sev.c, fontWeight: 700 }}>
              {sev.l}
            </span>
          )}
          {item.subtipo && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{item.subtipo}</span>}
          {item.tipo === "incidente" && (
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: item.resuelto ? B.success + "33" : B.danger + "33", color: item.resuelto ? B.success : B.danger, fontWeight: 700, cursor: onToggleResuelto ? "pointer" : "default" }}
              onClick={() => onToggleResuelto && onToggleResuelto(item)}>
              {item.resuelto ? "✓ Resuelto" : "⏳ Abierto"}
            </span>
          )}
        </div>
        {item.descripcion && <div style={{ marginTop: 4, fontSize: 12 }}>{item.descripcion}</div>}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {item.galones && <span>⛽ {Number(item.galones).toFixed(1)} gal</span>}
          {item.precio_galon && <span>· ${Math.round(item.precio_galon).toLocaleString("es-CO")}/gal</span>}
          {item.costo_total && <span>· <strong style={{ color: B.success }}>{fmtCOP(item.costo_total)}</strong></span>}
          {item.kilometraje_h && <span>· ⏱ {item.kilometraje_h}h</span>}
          {item.proveedor && <span>· {item.proveedor}</span>}
          {item.capitan && <span>· 👨‍✈️ {item.capitan}</span>}
        </div>
        {item.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4, fontStyle: "italic" }}>{item.notas}</div>}
        {(item.foto_url || item.factura_url) && (
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {item.foto_url && <a href={item.foto_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: B.sky, textDecoration: "none" }}>📷 Foto</a>}
            {item.factura_url && <a href={item.factura_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: B.sky, textDecoration: "none" }}>🧾 Factura</a>}
          </div>
        )}
      </div>
      {!compact && onEdit && (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onEdit(item)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer" }}>✏️</button>
          <button onClick={() => onDelete(item.id)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Lista de viajes (desde muelle_zarpes_flota) ───────────────────────────
function ListaViajes({ viajes }) {
  if (!viajes.length) {
    return (
      <div style={{ padding: 30, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
        Sin viajes registrados.
        <div style={{ fontSize: 11, marginTop: 6 }}>Los viajes se registran desde el módulo Salidas.</div>
      </div>
    );
  }
  const totalCosto = viajes.reduce((s, v) => s + Number(v.costo_operativo || 0), 0);
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
      {viajes.map(v => (
        <div key={v.id} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <div style={{ minWidth: 80, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            <div style={{ fontWeight: 700 }}>{fmtFechaCorta(v.fecha)}</div>
            <div>{fmtHora(v.hora_zarpe)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>→ {v.destino || "Cartagena"}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              {v.motivo}{(v.pax_a + v.pax_n) > 0 ? ` · 👥 ${v.pax_a}A${v.pax_n ? ` + ${v.pax_n}N` : ""}` : ""}
              {v.notas ? ` · ${v.notas}` : ""}
            </div>
          </div>
          {Number(v.costo_operativo) > 0 && (
            <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700, whiteSpace: "nowrap" }}>
              {fmtCOP(v.costo_operativo)}
            </div>
          )}
        </div>
      ))}
      {totalCosto > 0 && (
        <div style={{ padding: "10px 14px", background: B.navy, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
          <span style={{ color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10 }}>
            Total costo viajes · {viajes.length} zarpes
          </span>
          <strong style={{ color: "#a78bfa", fontSize: 14 }}>{fmtCOP(totalCosto)}</strong>
        </div>
      )}
    </div>
  );
}

// ─── Modal nuevo/editar evento ─────────────────────────────────────────────
function EventoModal({ tipo: tipoInicial, edit, onClose, onSave, capitanDefault }) {
  const [f, setF] = useState({
    id: edit?.id || null,
    tipo: edit?.tipo || tipoInicial,
    subtipo: edit?.subtipo || "",
    fecha: edit?.fecha || todayStr(),
    hora: edit?.hora?.slice(0, 5) || new Date().toTimeString().slice(0, 5),
    descripcion: edit?.descripcion || "",
    galones: edit?.galones || "",
    precio_galon: edit?.precio_galon || "",
    costo_total: edit?.costo_total || "",
    kilometraje_h: edit?.kilometraje_h || "",
    proveedor: edit?.proveedor || "",
    taller: edit?.taller || "",
    proximo_servicio_h: edit?.proximo_servicio_h || "",
    proximo_servicio_fecha: edit?.proximo_servicio_fecha || "",
    severidad: edit?.severidad || "leve",
    resuelto: !!edit?.resuelto,
    capitan: edit?.capitan || capitanDefault || "",
    notas: edit?.notas || "",
    foto_url: edit?.foto_url || "",
    factura_url: edit?.factura_url || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  // Auto-calcular costo_total si hay galones + precio_galon y costo está vacío
  useEffect(() => {
    if (f.tipo === "combustible" && f.galones && f.precio_galon && !edit) {
      const calc = Number(f.galones) * Number(f.precio_galon);
      if (calc && !f.costo_total) set("costo_total", Math.round(calc));
    }
  }, [f.galones, f.precio_galon]); // eslint-disable-line

  async function handleFile(e, campo) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(campo); setErr("");
    try {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from("lanchas").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("lanchas").getPublicUrl(path);
      set(campo, pub.publicUrl);
    } catch (e) { setErr(e.message); }
    finally { setUploading(""); }
  }

  async function handleSave() {
    setSaving(true); setErr("");
    const error = await onSave(f);
    setSaving(false);
    if (error) setErr(error.message || "Error al guardar");
  }

  const esCombustible = f.tipo === "combustible";
  const esMantenimiento = ["mantenimiento", "reparacion", "inspeccion", "limpieza"].includes(f.tipo);
  const esOperativo = ["marina", "capitanes"].includes(f.tipo);
  const esIncidente = f.tipo === "incidente";

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
        {edit ? "Editar registro" : "Nuevo registro"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Tipo</label>
          <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>
            {TIPOS.filter(t => t.k !== "viaje").map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
          </select>
        </div>
        <div><label style={LS}>Fecha</label><input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Hora</label><input type="time" value={f.hora} onChange={e => set("hora", e.target.value)} style={IS} /></div>

        {/* Combustible */}
        {esCombustible && (
          <>
            <div><label style={LS}>Galones</label><input type="number" step="0.1" value={f.galones} onChange={e => set("galones", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Precio / galón</label><input type="number" value={f.precio_galon} onChange={e => set("precio_galon", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Costo total</label><input type="number" value={f.costo_total} onChange={e => set("costo_total", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Horas motor (opcional)</label><input type="number" step="0.1" value={f.kilometraje_h} onChange={e => set("kilometraje_h", e.target.value)} style={IS} /></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Estación / proveedor</label>
              <input value={f.proveedor} onChange={e => set("proveedor", e.target.value)} placeholder="Ej: Terpel, Mobil, particular…" style={IS} />
            </div>
          </>
        )}

        {/* Mantenimiento */}
        {esMantenimiento && (
          <>
            <div><label style={LS}>Subtipo</label>
              <select value={f.subtipo} onChange={e => set("subtipo", e.target.value)} style={IS}>
                <option value="">—</option>
                <option value="cambio_aceite">Cambio de aceite</option>
                <option value="filtros">Filtros</option>
                <option value="motor">Motor</option>
                <option value="helice">Hélice</option>
                <option value="bateria">Batería</option>
                <option value="electronico">Sistema eléctrico</option>
                <option value="casco">Casco / pintura</option>
                <option value="tanque">Tanque</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div><label style={LS}>Costo total</label><input type="number" value={f.costo_total} onChange={e => set("costo_total", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Taller / proveedor</label><input value={f.taller || f.proveedor} onChange={e => { set("taller", e.target.value); set("proveedor", e.target.value); }} style={IS} /></div>
            <div><label style={LS}>Horas motor</label><input type="number" value={f.kilometraje_h} onChange={e => set("kilometraje_h", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Próximo servicio (horas)</label><input type="number" value={f.proximo_servicio_h} onChange={e => set("proximo_servicio_h", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Próximo servicio (fecha)</label><input type="date" value={f.proximo_servicio_fecha} onChange={e => set("proximo_servicio_fecha", e.target.value)} style={IS} /></div>
          </>
        )}

        {/* Operativo (marina/parqueo · capitanes) */}
        {esOperativo && (
          <>
            <div>
              <label style={LS}>{f.tipo === "marina" ? "Periodo / concepto" : "Concepto / nómina"}</label>
              <input value={f.subtipo} onChange={e => set("subtipo", e.target.value)} placeholder={f.tipo === "marina" ? "Ej: Mes abril 2026" : "Ej: Quincena · capitán"} style={IS} />
            </div>
            <div><label style={LS}>Costo total</label><input type="number" value={f.costo_total} onChange={e => set("costo_total", e.target.value)} style={IS} /></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>{f.tipo === "marina" ? "Marina / proveedor" : "Capitán beneficiario"}</label>
              <input value={f.proveedor} onChange={e => set("proveedor", e.target.value)} placeholder={f.tipo === "marina" ? "Ej: Marina Santa Cruz" : "Ej: Cap. Pérez"} style={IS} />
            </div>
          </>
        )}

        {/* Incidente */}
        {esIncidente && (
          <>
            <div><label style={LS}>Severidad</label>
              <select value={f.severidad} onChange={e => set("severidad", e.target.value)} style={IS}>
                {SEVERIDADES.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 20 }}>
                <input type="checkbox" checked={f.resuelto} onChange={e => set("resuelto", e.target.checked)} />
                Marcar como resuelto
              </label>
            </div>
          </>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Descripción</label>
          <textarea value={f.descripcion} onChange={e => set("descripcion", e.target.value)} style={{ ...IS, minHeight: 70, resize: "vertical" }} />
        </div>
        <div><label style={LS}>Capitán</label><input value={f.capitan} onChange={e => set("capitan", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Notas</label><input value={f.notas} onChange={e => set("notas", e.target.value)} style={IS} /></div>

        {/* Archivos */}
        <div>
          <label style={LS}>Foto</label>
          {f.foto_url ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <a href={f.foto_url} target="_blank" rel="noreferrer" style={{ color: B.sky, fontSize: 11 }}>Ver foto</a>
              <button onClick={() => set("foto_url", "")} style={{ ...BTN(B.danger), padding: "3px 8px", fontSize: 10 }}>Quitar</button>
            </div>
          ) : (
            <input type="file" accept="image/*" onChange={e => handleFile(e, "foto_url")} disabled={uploading === "foto_url"} style={{ color: "#fff", fontSize: 11 }} />
          )}
        </div>
        <div>
          <label style={LS}>Factura</label>
          {f.factura_url ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <a href={f.factura_url} target="_blank" rel="noreferrer" style={{ color: B.sky, fontSize: 11 }}>Ver factura</a>
              <button onClick={() => set("factura_url", "")} style={{ ...BTN(B.danger), padding: "3px 8px", fontSize: 10 }}>Quitar</button>
            </div>
          ) : (
            <input type="file" accept="image/*,application/pdf" onChange={e => handleFile(e, "factura_url")} disabled={uploading === "factura_url"} style={{ color: "#fff", fontSize: 11 }} />
          )}
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <button onClick={handleSave} disabled={saving || uploading} style={BTN(B.success)}>
          {saving ? "Guardando…" : (edit ? "Guardar cambios" : "Registrar")}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Modal configuración de lancha ─────────────────────────────────────────
function ConfigLanchaModal({ lancha, onClose, onSaved }) {
  const [f, setF] = useState({
    matricula: lancha.matricula || "",
    capacidad_pax: lancha.capacidad_pax || "",
    capacidad_tanque_gal: lancha.capacidad_tanque_gal || "",
    motor: lancha.motor || "",
    modelo: lancha.modelo || "",
    ano: lancha.ano || "",
    capitan_default: lancha.capitan_default || "",
    costo_viaje_sencillo: lancha.costo_viaje_sencillo || "",
    tarifa_alquiler_ida_vuelta: lancha.tarifa_alquiler_ida_vuelta || "",
    marina_costo_mensual: lancha.marina_costo_mensual || "",
    marina_proveedor: lancha.marina_proveedor || "",
    marina_activa: !!lancha.marina_activa,
    foto_url: lancha.foto_url || "",
    notas: lancha.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function handleFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `lancha_${lancha.id}_${Date.now()}_${file.name.replace(/[^\w.]/g, "_")}`;
    const { error } = await supabase.storage.from("lanchas").upload(path, file, { upsert: true });
    if (error) { setErr(error.message); return; }
    const { data: pub } = supabase.storage.from("lanchas").getPublicUrl(path);
    set("foto_url", pub.publicUrl);
  }

  async function save() {
    setSaving(true); setErr("");
    const payload = {
      ...f,
      capacidad_pax: f.capacidad_pax ? Number(f.capacidad_pax) : null,
      capacidad_tanque_gal: f.capacidad_tanque_gal ? Number(f.capacidad_tanque_gal) : null,
      ano: f.ano ? Number(f.ano) : null,
      costo_viaje_sencillo: f.costo_viaje_sencillo ? Number(f.costo_viaje_sencillo) : 0,
      tarifa_alquiler_ida_vuelta: f.tarifa_alquiler_ida_vuelta ? Number(f.tarifa_alquiler_ida_vuelta) : 0,
      marina_costo_mensual: f.marina_costo_mensual ? Number(f.marina_costo_mensual) : 0,
      marina_proveedor: f.marina_proveedor || null,
      marina_activa: !!f.marina_activa,
      updated_at: new Date().toISOString(),
    };
    const r = await supabase.from("lanchas").update(payload).eq("id", lancha.id);
    if (r.error) { setSaving(false); setErr(r.error.message); return; }
    // Si activó marina, asegurar que el mes actual quede registrado
    if (payload.marina_activa && payload.marina_costo_mensual > 0) {
      await supabase.rpc("generar_marina_mes");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>⚙ Configuración — {lancha.nombre}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={LS}>Matrícula</label><input value={f.matricula} onChange={e => set("matricula", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Capacidad (pax)</label><input type="number" value={f.capacidad_pax} onChange={e => set("capacidad_pax", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Tanque (gal)</label><input type="number" value={f.capacidad_tanque_gal} onChange={e => set("capacidad_tanque_gal", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Año</label><input type="number" value={f.ano} onChange={e => set("ano", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Motor</label><input value={f.motor} onChange={e => set("motor", e.target.value)} placeholder="Ej: Yamaha 200HP" style={IS} /></div>
        <div><label style={LS}>Modelo</label><input value={f.modelo} onChange={e => set("modelo", e.target.value)} style={IS} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={LS}>Capitán principal</label><input value={f.capitan_default} onChange={e => set("capitan_default", e.target.value)} style={IS} /></div>

        <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Costos operativos</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Un ida+vuelta = 2 viajes sencillos. Castillete: $400k ida+vuelta = $200k sencillo · Naturalle: $1.1M ida+vuelta x 2 = $275k sencillo.
          </div>
        </div>
        <div>
          <label style={LS}>Costo 1 viaje sencillo (COP)</label>
          <input type="number" value={f.costo_viaje_sencillo} onChange={e => set("costo_viaje_sencillo", e.target.value)} placeholder="200000" style={IS} />
        </div>
        <div>
          <label style={LS}>Tarifa alquiler ida+vuelta (COP)</label>
          <input type="number" value={f.tarifa_alquiler_ida_vuelta} onChange={e => set("tarifa_alquiler_ida_vuelta", e.target.value)} placeholder="400000" style={IS} />
        </div>

        <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 11, color: "#22d3ee", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>🅿️ Marina / parqueo recurrente</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Si está activa, se inserta automáticamente un cargo el día 1 de cada mes en la bitácora.
          </div>
        </div>
        <div>
          <label style={LS}>Costo mensual (COP)</label>
          <input type="number" value={f.marina_costo_mensual} onChange={e => set("marina_costo_mensual", e.target.value)} placeholder="0" style={IS} />
        </div>
        <div>
          <label style={LS}>Marina / proveedor</label>
          <input value={f.marina_proveedor} onChange={e => set("marina_proveedor", e.target.value)} placeholder="Ej: Marina Santa Cruz" style={IS} />
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
          <input id="marina_activa" type="checkbox" checked={f.marina_activa} onChange={e => set("marina_activa", e.target.checked)} />
          <label htmlFor="marina_activa" style={{ fontSize: 13, cursor: "pointer" }}>
            Activar cargo recurrente {f.marina_costo_mensual > 0 && <span style={{ color: "rgba(255,255,255,0.5)" }}>(${Math.round(f.marina_costo_mensual).toLocaleString("es-CO")}/mes)</span>}
          </label>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Foto</label>
          {f.foto_url && <img src={f.foto_url} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, marginBottom: 6, display: "block" }} />}
          <input type="file" accept="image/*" onChange={handleFoto} style={{ color: "#fff", fontSize: 11 }} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Notas</label>
          <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} />
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <button onClick={save} disabled={saving} style={BTN(B.sky, B.navy)}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Lista capitanes (por lancha) ───────────────────────────────────────────
function ListaCapitanes({ capitanes, onAdd, onEdit, onDelete }) {
  const totalNomina  = capitanes.filter(c => c.tipo === "nomina").reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
  const totalTercero = capitanes.filter(c => c.tipo === "tercero" && c.recurrente).reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "rgba(255,255,255,0.6)", flexWrap: "wrap" }}>
          {totalNomina  > 0 && <span>Nómina/mes: <strong style={{ color: "#fb923c" }}>{fmtCOP(totalNomina)}</strong></span>}
          {totalTercero > 0 && <span>Terceros recurrentes/mes: <strong style={{ color: "#fb923c" }}>{fmtCOP(totalTercero)}</strong></span>}
        </div>
        <button onClick={onAdd} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: B.success, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          + Nuevo capitán
        </button>
      </div>
      {!capitanes.length ? (
        <div style={{ padding: 30, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
          Sin capitanes asignados a esta embarcación.
          <div style={{ fontSize: 11, marginTop: 6 }}>Agregá nómina propia o terceros freelance.</div>
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
          {capitanes.map(c => (
            <div key={c.id} style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18 }}>👨‍✈️</div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.nombre}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ padding: "1px 6px", borderRadius: 4, background: c.tipo === "nomina" ? "#fb923c33" : "#a78bfa33", color: c.tipo === "nomina" ? "#fb923c" : "#a78bfa", fontWeight: 700, textTransform: "uppercase", fontSize: 9 }}>
                    {c.tipo === "nomina" ? "NÓMINA" : "TERCERO"}
                  </span>
                  {c.tipo === "tercero" && c.recurrente && (
                    <span style={{ padding: "1px 6px", borderRadius: 4, background: B.success + "33", color: B.success, fontWeight: 700, fontSize: 9, textTransform: "uppercase" }}>
                      RECURRENTE
                    </span>
                  )}
                  {c.documento && <span>· CC {c.documento}</span>}
                  {c.telefono  && <span>· 📞 {c.telefono}</span>}
                </div>
              </div>
              {Number(c.salario_mensual) > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", whiteSpace: "nowrap" }}>
                  {fmtCOP(c.salario_mensual)}<span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>/mes</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => onEdit(c)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 14, cursor: "pointer" }}>✏️</button>
                <button onClick={() => onDelete(c.id)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, padding: 12, background: B.navy, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
        ℹ️ <strong>Nómina</strong> = empleado de Atolón (su sueldo se paga vía RRHH/Nómina; aquí solo es referencia, no se duplica en bitácora).
        <strong style={{ marginLeft: 6 }}>Tercero recurrente</strong> = freelance con tarifa fija mensual (se inserta automático en bitácora cada inicio de mes).
        Pagos puntuales → registrá manualmente en tab Operativos.
      </div>
    </div>
  );
}

// ─── Modal capitán (nómina/tercero) ─────────────────────────────────────────
function CapitanModal({ edit, lancha, onClose, onSaved }) {
  const [f, setF] = useState({
    id: edit?.id || null,
    nombre: edit?.nombre || "",
    documento: edit?.documento || "",
    telefono: edit?.telefono || "",
    email: edit?.email || "",
    tipo: edit?.tipo || "tercero",
    salario_mensual: edit?.salario_mensual || "",
    recurrente: edit?.recurrente !== false,
    fecha_inicio: edit?.fecha_inicio || todayStr(),
    fecha_fin: edit?.fecha_fin || "",
    notas: edit?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true); setErr("");
    const payload = {
      nombre: f.nombre,
      documento: f.documento || null,
      telefono: f.telefono || null,
      email: f.email || null,
      tipo: f.tipo,
      lancha_id: lancha.id,
      salario_mensual: f.salario_mensual ? Number(f.salario_mensual) : 0,
      recurrente: f.tipo === "tercero" ? !!f.recurrente : false,
      fecha_inicio: f.fecha_inicio || null,
      fecha_fin: f.fecha_fin || null,
      notas: f.notas || null,
      activo: true,
      updated_at: new Date().toISOString(),
    };
    let r;
    if (f.id) {
      r = await supabase.from("capitanes_flota").update(payload).eq("id", f.id);
    } else {
      r = await supabase.from("capitanes_flota").insert({ id: "CAP-" + Date.now().toString(36).toUpperCase(), ...payload });
    }
    if (r.error) { setSaving(false); setErr(r.error.message); return; }
    // Si quedó tercero recurrente, generar el cargo del mes actual ya
    if (payload.tipo === "tercero" && payload.recurrente && payload.salario_mensual > 0) {
      await supabase.rpc("generar_capitanes_mes");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{edit ? "Editar capitán" : "Nuevo capitán"} — {lancha.nombre}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>Mixto: nómina propia o tercero (con/sin recurrencia).</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Tipo</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => set("tipo", "nomina")}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", cursor: "pointer", background: f.tipo === "nomina" ? "#fb923c" : B.navyLight, color: f.tipo === "nomina" ? B.navy : "#fff", fontWeight: 700, fontSize: 12 }}>
              Nómina propia
            </button>
            <button onClick={() => set("tipo", "tercero")}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", cursor: "pointer", background: f.tipo === "tercero" ? "#a78bfa" : B.navyLight, color: f.tipo === "tercero" ? B.navy : "#fff", fontWeight: 700, fontSize: 12 }}>
              Tercero / freelance
            </button>
          </div>
        </div>

        <div><label style={LS}>Nombre completo</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Documento</label><input value={f.documento} onChange={e => set("documento", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Teléfono</label><input value={f.telefono} onChange={e => set("telefono", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Email</label><input value={f.email} onChange={e => set("email", e.target.value)} style={IS} /></div>
        <div>
          <label style={LS}>{f.tipo === "nomina" ? "Salario mensual (referencia)" : "Tarifa mensual (COP)"}</label>
          <input type="number" value={f.salario_mensual} onChange={e => set("salario_mensual", e.target.value)} style={IS} />
        </div>
        <div><label style={LS}>Fecha inicio</label><input type="date" value={f.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Fecha fin (opcional)</label><input type="date" value={f.fecha_fin} onChange={e => set("fecha_fin", e.target.value)} style={IS} /></div>

        {f.tipo === "tercero" && (
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, padding: 10, background: B.navy, borderRadius: 8 }}>
            <input id="cap_rec" type="checkbox" checked={f.recurrente} onChange={e => set("recurrente", e.target.checked)} />
            <label htmlFor="cap_rec" style={{ fontSize: 13, cursor: "pointer" }}>
              Cargo recurrente — insertar automáticamente cada inicio de mes en bitácora
            </label>
          </div>
        )}
        {f.tipo === "nomina" && (
          <div style={{ gridColumn: "1 / -1", padding: 10, background: B.navy, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            ℹ️ Empleados de nómina NO se insertan en bitácora (su sueldo se paga vía RRHH).
            El salario aquí es referencia para dashboard de Rentabilidad Flota.
          </div>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Notas</label>
          <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} />
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <button disabled={!f.nombre || saving} onClick={save} style={BTN(B.success)}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: B.navyMid, borderRadius: 14, padding: 22, width: "100%", maxWidth: 720,
        marginTop: 40, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {children}
      </div>
    </div>
  );
}
