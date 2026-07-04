// LogisticaOCModal.jsx — Logística post-factura de una OC:
// 1. Programar entrega en Bodeguita (muelle de Cartagena)
// 2. Marcar entregada (recibida en muelle)
// 3. Asignar embarcación + zarpe para transporte muelle → Atolón
// 4. Timeline de cuándo llegó a Atolón

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtFecha = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = (p) => `${p}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

export default function LogisticaOCModal({ oc, onClose, reload, currentUser }) {
  const [tab, setTab] = useState("entrega");
  const [entrega, setEntrega] = useState(null);   // fila de oc_entregas_muelle
  const [transporte, setTransporte] = useState(null); // fila de oc_transporte_atolon
  const [lanchas, setLanchas] = useState([]);
  const [bodegas, setBodegas] = useState([]);
  const [zarpesProx, setZarpesProx] = useState([]); // próximos zarpes flota disponibles
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [eR, tR, lR, bR, zR] = await Promise.all([
      supabase.from("oc_entregas_muelle").select("*").eq("oc_id", oc.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("oc_transporte_atolon").select("*").eq("oc_id", oc.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("lanchas").select("id, nombre, costo_viaje_sencillo").eq("activo", true).order("nombre"),
      supabase.from("items_locaciones").select("id, nombre, icono, es_recepcion").eq("activa", true).order("orden"),
      supabase.from("muelle_zarpes_flota").select("id, fecha, hora_zarpe, embarcacion, motivo, costo_operativo")
        .gte("fecha", todayStr()).order("fecha").order("hora_zarpe").limit(20),
    ]);
    setEntrega(eR.data);
    setTransporte(tR.data);
    setLanchas(lR.data || []);
    setBodegas(bR.data || []);
    setZarpesProx(zR.data || []);
    setLoading(false);
  }, [oc.id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Cargando…</div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🚚 Logística de OC</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            {oc.codigo} · {oc.proveedor_nombre} · {COP(oc.total)}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
      </div>

      {/* Timeline visual */}
      <Timeline oc={oc} entrega={entrega} transporte={transporte} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginTop: 18, marginBottom: 14 }}>
        {[
          { k: "entrega",    l: "🚚 Entrega en Muelle" },
          { k: "transporte", l: "⛵ Transporte a Atolón" },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${tab === t.k ? B.sky : B.navyLight}`,
              background: tab === t.k ? B.sky + "22" : B.navy,
              color: tab === t.k ? B.sky : "rgba(255,255,255,0.5)",
              fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "entrega" && (
        <EntregaSection oc={oc} entrega={entrega} reload={() => { load(); reload(); }} currentUser={currentUser} />
      )}
      {tab === "transporte" && (
        <TransporteSection oc={oc} entrega={entrega} transporte={transporte} lanchas={lanchas} bodegas={bodegas} zarpes={zarpesProx} reload={() => { load(); reload(); }} currentUser={currentUser} />
      )}
    </Overlay>
  );
}

// ─── Timeline visual (5 hitos) ──────────────────────────────────────────────
function Timeline({ oc, entrega, transporte }) {
  const hitos = [
    { k: "fact",  l: "📎 Facturada",           done: !!oc.factura_aplicada },
    { k: "prog",  l: "🚚 Entrega programada", done: !!entrega },
    { k: "ent",   l: "✅ En muelle",           done: entrega?.estado === "entregada" },
    { k: "zarp",  l: "⛵ En tránsito",         done: transporte?.estado === "zarpado" || transporte?.estado === "en_atolon" || transporte?.estado === "recibido" },
    { k: "rec",   l: "🏝️ En Atolón",          done: transporte?.estado === "recibido" || oc.estado === "recibida" },
  ];
  return (
    <div style={{ background: B.navy, borderRadius: 10, padding: 10, display: "flex", justifyContent: "space-between", gap: 4, fontSize: 10, overflowX: "auto" }}>
      {hitos.map((h, i) => (
        <div key={h.k} style={{
          flex: 1, minWidth: 90, textAlign: "center", padding: "8px 4px", borderRadius: 6,
          background: h.done ? B.success + "22" : "transparent",
          border: `1px solid ${h.done ? B.success : B.navyLight}`,
          color: h.done ? B.success : "rgba(255,255,255,0.4)",
          fontWeight: 700,
        }}>{h.l}</div>
      ))}
    </div>
  );
}

// ─── Entrega en muelle ──────────────────────────────────────────────────────
function EntregaSection({ oc, entrega, reload, currentUser }) {
  const [f, setF] = useState({
    fecha_programada: entrega?.fecha_programada || todayStr(),
    hora_programada: entrega?.hora_programada?.slice(0, 5) || "10:00",
    ubicacion: entrega?.ubicacion || "Bodeguita",
    contacto_proveedor: entrega?.contacto_proveedor || "",
    notas: entrega?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function programar() {
    setSaving(true); setErr("");
    try {
      const payload = {
        oc_id: oc.id,
        oc_codigo: oc.codigo,
        fecha_programada: f.fecha_programada,
        hora_programada: f.hora_programada || null,
        ubicacion: f.ubicacion,
        contacto_proveedor: f.contacto_proveedor || null,
        notas: f.notas || null,
        estado: entrega?.estado || "programada",
        created_by: currentUser?.email || currentUser?.nombre || "sistema",
        updated_at: new Date().toISOString(),
      };
      if (entrega?.id) {
        await supabase.from("oc_entregas_muelle").update(payload).eq("id", entrega.id);
      } else {
        await supabase.from("oc_entregas_muelle").insert({ id: uid("ENTR"), ...payload });
      }
      reload();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  }

  async function marcarEntregada() {
    if (!entrega?.id) { setErr("Programa la entrega primero"); return; }
    setSaving(true); setErr("");
    await supabase.from("oc_entregas_muelle").update({
      estado: "entregada",
      entregado_at: new Date().toISOString(),
      recibido_por: currentUser?.nombre || currentUser?.email || "—",
      updated_at: new Date().toISOString(),
    }).eq("id", entrega.id);
    setSaving(false);
    reload();
  }

  const yaEntregada = entrega?.estado === "entregada";

  return (
    <div>
      {!oc.factura_aplicada && (
        <div style={{ background: B.warning + "22", border: `1px solid ${B.warning}55`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: B.warning }}>
          ⚠️ Esta OC aún no tiene factura aplicada. Recomendado: adjunta la factura primero para tener precios reales antes de programar la entrega.
        </div>
      )}

      <div style={{ background: B.navy, borderRadius: 10, padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <Field label="Fecha entrega"><input type="date" value={f.fecha_programada} onChange={e => set("fecha_programada", e.target.value)} style={IS} /></Field>
        <Field label="Hora estimada"><input type="time" value={f.hora_programada} onChange={e => set("hora_programada", e.target.value)} style={IS} /></Field>
        <Field label="Ubicación">
          <select value={f.ubicacion} onChange={e => set("ubicacion", e.target.value)} style={IS}>
            <option value="Bodeguita">Bodeguita</option>
            <option value="Marina Santa Cruz">Marina Santa Cruz</option>
            <option value="Muelle Punta Madero">Muelle Punta Madero</option>
            <option value="Otro">Otro</option>
          </select>
        </Field>
        <Field label="Contacto proveedor (nombre o teléfono)" full>
          <input value={f.contacto_proveedor} onChange={e => set("contacto_proveedor", e.target.value)} placeholder="Ej: Carlos · 311 5550000" style={IS} />
        </Field>
        <Field label="Notas / instrucciones especiales" full>
          <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} />
        </Field>
      </div>

      {entrega && (
        <div style={{ background: yaEntregada ? B.success + "11" : B.sky + "11", border: `1px solid ${yaEntregada ? B.success : B.sky}33`, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
          <strong>Estado:</strong> {yaEntregada ? "✅ Entregada" : "⏳ Programada"}
          {entrega.entregado_at && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              Recibida {new Date(entrega.entregado_at).toLocaleString("es-CO")}
              {entrega.recibido_por && ` por ${entrega.recibido_por}`}
            </div>
          )}
        </div>
      )}

      {err && <div style={{ marginBottom: 10, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={programar} disabled={saving}
          style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          {saving ? "Guardando…" : entrega?.id ? "💾 Actualizar programación" : "📅 Programar entrega"}
        </button>
        {entrega?.id && !yaEntregada && (
          <button onClick={marcarEntregada} disabled={saving}
            style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: B.success, color: B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✅ Marcar como entregada
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Transporte a Atolón ────────────────────────────────────────────────────
function TransporteSection({ oc, entrega, transporte, lanchas, bodegas, zarpes, reload, currentUser }) {
  const [tipoLancha, setTipoLancha] = useState(transporte?.embarcacion_propia_id ? "propia" : (transporte?.embarcacion_nombre ? "tercera" : "propia"));
  const [f, setF] = useState({
    embarcacion_propia_id: transporte?.embarcacion_propia_id || "",
    embarcacion_nombre: transporte?.embarcacion_nombre || "",
    zarpe_flota_id: transporte?.zarpe_flota_id || "",
    fecha_zarpe: transporte?.fecha_zarpe || todayStr(),
    hora_zarpe: transporte?.hora_zarpe?.slice(0, 5) || "06:30",
    bodega_destino: transporte?.bodega_destino || (bodegas.find(b => b.es_recepcion)?.id || ""),
    costo_transporte: transporte?.costo_transporte || 0,
    notas: transporte?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  // Auto-llenar costo si elige una lancha propia
  useEffect(() => {
    if (tipoLancha === "propia" && f.embarcacion_propia_id) {
      const l = lanchas.find(x => x.id === f.embarcacion_propia_id);
      if (l && !f.costo_transporte) {
        set("costo_transporte", Number(l.costo_viaje_sencillo) || 0);
      }
    }
  }, [tipoLancha, f.embarcacion_propia_id, lanchas]);

  async function programar() {
    setSaving(true); setErr("");
    try {
      const lancha = tipoLancha === "propia" ? lanchas.find(l => l.id === f.embarcacion_propia_id) : null;
      const payload = {
        oc_id: oc.id,
        oc_codigo: oc.codigo,
        entrega_muelle_id: entrega?.id || null,
        embarcacion_propia_id: tipoLancha === "propia" ? f.embarcacion_propia_id || null : null,
        embarcacion_nombre: tipoLancha === "tercera" ? f.embarcacion_nombre || null : (lancha?.nombre || null),
        zarpe_flota_id: f.zarpe_flota_id || null,
        fecha_zarpe: f.fecha_zarpe,
        hora_zarpe: f.hora_zarpe || null,
        bodega_destino: f.bodega_destino || null,
        costo_transporte: Number(f.costo_transporte) || 0,
        notas: f.notas || null,
        estado: transporte?.estado || "programado",
        created_by: currentUser?.email || currentUser?.nombre || "sistema",
        updated_at: new Date().toISOString(),
      };
      if (transporte?.id) {
        await supabase.from("oc_transporte_atolon").update(payload).eq("id", transporte.id);
      } else {
        await supabase.from("oc_transporte_atolon").insert({ id: uid("TRAN"), ...payload });
      }
      reload();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  }

  async function avanzarEstado(nuevoEstado) {
    if (!transporte?.id) { setErr("Programa el transporte primero"); return; }
    setSaving(true); setErr("");
    const update = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    if (nuevoEstado === "zarpado") update.zarpado_at = new Date().toISOString();
    if (nuevoEstado === "recibido") {
      update.recibido_atolon_at = new Date().toISOString();
      update.recibido_por = currentUser?.nombre || currentUser?.email || "—";
    }
    await supabase.from("oc_transporte_atolon").update(update).eq("id", transporte.id);
    setSaving(false);
    reload();
  }

  const estadoActual = transporte?.estado || "programado";

  return (
    <div>
      {!entrega && (
        <div style={{ background: B.warning + "22", border: `1px solid ${B.warning}55`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: B.warning }}>
          ⚠️ No hay entrega programada en muelle. Recomendado: programa la entrega primero en el tab anterior.
        </div>
      )}

      <div style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        {/* Tipo de embarcación */}
        <div style={{ marginBottom: 12 }}>
          <label style={LS}>Tipo de embarcación</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setTipoLancha("propia")}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${tipoLancha === "propia" ? B.sky : B.navyLight}`,
                background: tipoLancha === "propia" ? B.sky + "22" : B.navyLight,
                color: tipoLancha === "propia" ? B.sky : "rgba(255,255,255,0.5)",
                fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              ⛵ Lancha propia (Castillete/Naturalle)
            </button>
            <button onClick={() => setTipoLancha("tercera")}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${tipoLancha === "tercera" ? B.sky : B.navyLight}`,
                background: tipoLancha === "tercera" ? B.sky + "22" : B.navyLight,
                color: tipoLancha === "tercera" ? B.sky : "rgba(255,255,255,0.5)",
                fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              🚤 Lancha tercera / contratada
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {tipoLancha === "propia" ? (
            <Field label="Lancha" full>
              <select value={f.embarcacion_propia_id} onChange={e => set("embarcacion_propia_id", e.target.value)} style={IS}>
                <option value="">— elegir —</option>
                {lanchas.map(l => <option key={l.id} value={l.id}>⛵ {l.nombre}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Nombre embarcación tercera" full>
              <input value={f.embarcacion_nombre} onChange={e => set("embarcacion_nombre", e.target.value)} placeholder="Ej: Sparky" style={IS} />
            </Field>
          )}
          <Field label="Fecha zarpe"><input type="date" value={f.fecha_zarpe} onChange={e => set("fecha_zarpe", e.target.value)} style={IS} /></Field>
          <Field label="Hora zarpe"><input type="time" value={f.hora_zarpe} onChange={e => set("hora_zarpe", e.target.value)} style={IS} /></Field>
          <Field label="Bodega destino en Atolón" full>
            <select value={f.bodega_destino} onChange={e => set("bodega_destino", e.target.value)} style={IS}>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.icono || "📦"} {b.nombre}{b.es_recepcion ? " ⭐" : ""}</option>)}
            </select>
          </Field>
          <Field label="Costo transporte (COP)"><input type="number" value={f.costo_transporte} onChange={e => set("costo_transporte", e.target.value)} style={IS} /></Field>
          {tipoLancha === "propia" && zarpes.length > 0 && (
            <Field label="Vincular a zarpe ya programado (opcional)" full>
              <select value={f.zarpe_flota_id} onChange={e => set("zarpe_flota_id", e.target.value)} style={IS}>
                <option value="">— sin vincular (zarpe nuevo) —</option>
                {zarpes.map(z => (
                  <option key={z.id} value={z.id}>
                    {z.fecha} {z.hora_zarpe?.slice(0, 5) || ""} · {z.embarcacion} · {z.motivo}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Notas / instrucciones" full>
            <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 50, resize: "vertical" }} />
          </Field>
        </div>
      </div>

      {transporte && (
        <div style={{ background: B.navy, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
          <strong>Estado actual: </strong>
          <span style={{ padding: "2px 8px", borderRadius: 4, background: B.sky + "33", color: B.sky, fontWeight: 700, fontSize: 11 }}>
            {estadoActual.toUpperCase()}
          </span>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {estadoActual === "programado" && (
              <button onClick={() => avanzarEstado("zarpado")} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: B.warning, color: B.navy, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                ⛵ Marcar como zarpado
              </button>
            )}
            {estadoActual === "zarpado" && (
              <button onClick={() => avanzarEstado("en_atolon")} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: B.sky, color: B.navy, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                🏝️ Llegó a Atolón
              </button>
            )}
            {(estadoActual === "en_atolon" || estadoActual === "zarpado") && (
              <button onClick={() => avanzarEstado("recibido")} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: B.success, color: B.navy, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                ✅ Recibido y descargado
              </button>
            )}
          </div>
          {transporte.zarpado_at && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Zarpó {new Date(transporte.zarpado_at).toLocaleString("es-CO")}</div>}
          {transporte.recibido_atolon_at && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Recibido en Atolón {new Date(transporte.recibido_atolon_at).toLocaleString("es-CO")} por {transporte.recibido_por}</div>}
        </div>
      )}

      {err && <div style={{ marginBottom: 10, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={programar} disabled={saving}
          style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          {saving ? "Guardando…" : transporte?.id ? "💾 Actualizar transporte" : "📅 Programar transporte"}
        </button>
      </div>
    </div>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────────
const IS = { width: "100%", padding: "8px 11px", borderRadius: 7, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 3 };

const Field = ({ label, full, children }) => (
  <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
    <label style={LS}>{label}</label>
    {children}
  </div>
);

function Overlay({ children, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 1300, background: "#000B", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 720, padding: 22, marginTop: 30, border: `1px solid ${B.navyLight}` }}>
        {children}
      </div>
    </div>
  );
}
