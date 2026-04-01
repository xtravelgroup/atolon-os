import { useState, useEffect, useCallback } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navyLight, border: `1px solid rgba(255,255,255,0.1)`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const COP = (n) => n ? "$" + Number(n).toLocaleString("es-CO") : "$0";
const hoyHora = () => new Date().toTimeString().slice(0, 5);
const fmtHora = (h) => h ? h.slice(0, 5) : "—";

const ESTADO_COLOR = {
  esperada: { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", label: "Esperada" },
  "llegó":  { bg: B.sky + "22", color: B.sky, label: "Llegó" },
  en_isla:  { bg: B.success + "22", color: B.success, label: "En isla" },
  salió:    { bg: B.navyLight, color: "rgba(255,255,255,0.35)", label: "Salió" },
};

// ─── Modal Registro Llegada ───────────────────────────────────────────────────
function ModalNuevaLlegada({ tipo, fecha, reserva, onClose, onSaved }) {
  const esAfter = tipo === "after_island";
  const esRest  = tipo === "restaurante";
  const esLancha = tipo === "lancha_atolon";

  const [f, setF] = useState({
    embarcacion_nombre: reserva?.embarcacion_asignada || "",
    matricula: "",
    pax_a: reserva ? (reserva.pax_a || reserva.pax || 1) : 1,
    pax_n: reserva ? (reserva.pax_n || 0) : 0,
    hora_llegada: hoyHora(),
    total_cobrado: esAfter ? "" : "",
    metodo_pago: "efectivo",
    notas: "",
  });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const paxTotal = Number(f.pax_a) + Number(f.pax_n);

  const handleSave = async () => {
    if (!supabase || saving) return;
    setSaving(true);
    await supabase.from("muelle_llegadas").insert({
      id: `ML-${Date.now()}`,
      fecha,
      tipo,
      embarcacion_nombre: f.embarcacion_nombre || null,
      matricula: f.matricula || null,
      pax_a: Number(f.pax_a) || 0,
      pax_n: Number(f.pax_n) || 0,
      pax_total: paxTotal,
      reserva_id: reserva?.id || null,
      hora_llegada: f.hora_llegada || null,
      estado: "llegó",
      total_cobrado: Number(f.total_cobrado) || 0,
      metodo_pago: f.total_cobrado ? f.metodo_pago : null,
      notas: f.notas || null,
    });
    setSaving(false);
    onSaved();
  };

  const tipoLabel = esAfter ? "After Island" : esRest ? "Restaurante" : "Lancha Atolon";
  const tipoIcon  = esAfter ? "🌙" : esRest ? "🍽️" : "⛵";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000B", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 18, padding: 28, width: 500, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{tipoIcon} Registrar Llegada</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{tipoLabel}{reserva ? ` — ${reserva.nombre}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
            <label style={LS}>Nombre / ID embarcación</label>
            <input value={f.embarcacion_nombre} onChange={e => s("embarcacion_nombre", e.target.value)}
              placeholder={esLancha ? "Ej: Atolon I" : "Ej: Patricia, Barco sin nombre..."} style={IS} />
          </div>
          {!esLancha && (
            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <label style={LS}>Matrícula (opcional)</label>
              <input value={f.matricula} onChange={e => s("matricula", e.target.value)} placeholder="Ej: CT-1234" style={IS} />
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Adultos</label>
            <input type="number" min="0" value={f.pax_a} onChange={e => s("pax_a", e.target.value)} style={IS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Niños</label>
            <input type="number" min="0" value={f.pax_n} onChange={e => s("pax_n", e.target.value)} style={IS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Hora llegada</label>
            <input type="time" value={f.hora_llegada} onChange={e => s("hora_llegada", e.target.value)} style={IS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Total cobrado (si aplica)</label>
            <input type="number" value={f.total_cobrado} onChange={e => s("total_cobrado", e.target.value)}
              placeholder={esAfter ? "170000" : "0"} style={IS} />
          </div>
          {f.total_cobrado > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Método de pago</label>
              <select value={f.metodo_pago} onChange={e => s("metodo_pago", e.target.value)} style={IS}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="datafono">Datáfono</option>
              </select>
            </div>
          )}
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
            <label style={LS}>Notas</label>
            <input value={f.notas} onChange={e => s("notas", e.target.value)} placeholder="Observaciones..." style={IS} />
          </div>
        </div>

        {paxTotal > 0 && (
          <div style={{ background: B.sky + "18", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: B.sky }}>
            Total: <strong>{paxTotal} persona{paxTotal !== 1 ? "s" : ""}</strong>
            {f.total_cobrado > 0 && <span style={{ marginLeft: 12 }}>· {COP(f.total_cobrado)} vía <strong>{f.metodo_pago}</strong></span>}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: saving ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {saving ? "Registrando..." : "⚓ Registrar Llegada"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card de Llegada ──────────────────────────────────────────────────────────
function LlegadaCard({ llegada, onEstadoChange, onDelete }) {
  const [saving, setSaving] = useState(false);
  const est = ESTADO_COLOR[llegada.estado] || ESTADO_COLOR.esperada;

  const FLUJO = { esperada: "llegó", "llegó": "en_isla", en_isla: "salió", salió: null };
  const FLUJO_LABEL = { esperada: "✓ Llegó", "llegó": "🏝 En isla", en_isla: "⛵ Salió", salió: null };

  const avanzar = async () => {
    const sig = FLUJO[llegada.estado];
    if (!sig || !supabase || saving) return;
    setSaving(true);
    const upd = { estado: sig };
    if (sig === "llegó")   upd.hora_llegada = hoyHora();
    if (sig === "salió")   upd.hora_salida  = hoyHora();
    await supabase.from("muelle_llegadas").update(upd).eq("id", llegada.id);
    setSaving(false);
    onEstadoChange();
  };

  const tipoIcon = llegada.tipo === "after_island" ? "🌙" : llegada.tipo === "restaurante" ? "🍽️" : "⛵";

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", marginBottom: 10, border: `1px solid ${est.color}33` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22, flexShrink: 0 }}>{tipoIcon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{llegada.embarcacion_nombre || "Embarcación"}</span>
            {llegada.matricula && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{llegada.matricula}</span>}
            <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 8, background: est.bg, color: est.color, fontWeight: 600 }}>{est.label}</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>👥 {llegada.pax_total} pax{llegada.pax_n > 0 ? ` (${llegada.pax_a}A + ${llegada.pax_n}N)` : ""}</span>
            {llegada.hora_llegada && <span>⚓ {fmtHora(llegada.hora_llegada)}</span>}
            {llegada.hora_salida  && <span>🏠 {fmtHora(llegada.hora_salida)}</span>}
            {llegada.total_cobrado > 0 && <span style={{ color: B.success }}>{COP(llegada.total_cobrado)} · {llegada.metodo_pago}</span>}
          </div>
          {llegada.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, fontStyle: "italic" }}>{llegada.notas}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {FLUJO[llegada.estado] && (
            <button onClick={avanzar} disabled={saving}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: est.color, color: llegada.estado === "en_isla" ? "#fff" : B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "..." : FLUJO_LABEL[llegada.estado]}
            </button>
          )}
          <button onClick={onDelete}
            style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${B.danger}33`, background: "none", color: B.danger, fontSize: 12, cursor: "pointer", opacity: 0.6 }}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Lanchas Atolon ──────────────────────────────────────────────────────
function TabLanchas({ fecha, llegadas, onRefresh, onNuevaLlegada }) {
  const [salidas, setSalidas] = useState([]);
  const [reservasPorSalida, setReservasPorSalida] = useState({});
  const [tabSalida, setTabSalida] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("salidas").select("*").eq("activo", true).order("hora")
      .then(({ data }) => {
        setSalidas(data || []);
        if (data?.length > 0 && !tabSalida) setTabSalida(data[0].id);
      });
    supabase.from("reservas").select("id, nombre, pax, pax_a, pax_n, tipo, checkin_at, estado, embarcacion_asignada, salida_id, contacto")
      .eq("fecha", fecha).neq("estado", "cancelado")
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => {
          if (!map[r.salida_id]) map[r.salida_id] = [];
          map[r.salida_id].push(r);
        });
        setReservasPorSalida(map);
      });
  }, [fecha]);

  const llegadasLancha = llegadas.filter(l => l.tipo === "lancha_atolon");

  return (
    <div>
      {/* Tabs de salidas */}
      {salidas.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
          {salidas.map(s => {
            const res = reservasPorSalida[s.id] || [];
            const paxTotal = res.reduce((t, r) => t + (r.pax || 1), 0);
            const yaLlego  = llegadasLancha.some(l => l.salida_id === s.id || l.embarcacion_nombre === s.nombre);
            return (
              <button key={s.id} onClick={() => setTabSalida(s.id)}
                style={{ padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600,
                  background: tabSalida === s.id ? B.sky : B.navyMid,
                  color: tabSalida === s.id ? B.navy : "rgba(255,255,255,0.7)" }}>
                ⛵ {s.nombre}
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>{fmtHora(s.hora)}</span>
                {paxTotal > 0 && <span style={{ marginLeft: 6, fontSize: 11 }}>· {paxTotal} pax</span>}
                {yaLlego && <span style={{ marginLeft: 6, fontSize: 11, color: B.success }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Detalle salida seleccionada */}
      {tabSalida && (() => {
        const sal = salidas.find(s => s.id === tabSalida);
        const res = reservasPorSalida[tabSalida] || [];
        const paxTotal = res.reduce((t, r) => t + (r.pax || 1), 0);
        const llegadaSal = llegadasLancha.find(l => l.salida_id === tabSalida || l.embarcacion_nombre === sal?.nombre);

        return (
          <div>
            {sal && (
              <div style={{ background: B.navyMid, borderRadius: 14, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>⛵ {sal.nombre}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                    Salida: <strong>{fmtHora(sal.hora)}</strong> · Regreso: <strong>{fmtHora(sal.hora_regreso)}</strong> · {paxTotal} pasajeros
                  </div>
                </div>
                {!llegadaSal ? (
                  <button onClick={() => onNuevaLlegada("lancha_atolon", null, sal)}
                    style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: B.sky, color: B.navy, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    ⚓ Registrar llegada a isla
                  </button>
                ) : (
                  <span style={{ fontSize: 12, padding: "6px 14px", borderRadius: 10, background: B.success + "22", color: B.success, fontWeight: 700 }}>
                    ✓ Llegó {fmtHora(llegadaSal.hora_llegada)}
                  </span>
                )}
              </div>
            )}

            {/* Lista de reservas de esta salida */}
            {res.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay reservas para esta salida</div>
            ) : (
              res.map(r => (
                <div key={r.id} style={{ background: B.navyMid, borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: r.checkin_at ? B.success : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.nombre}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {r.pax || 1} pax · {r.tipo}
                      {r.checkin_at && <span style={{ color: B.success, marginLeft: 8 }}>✓ Check-in {r.checkin_at.slice(11, 16)}</span>}
                    </div>
                  </div>
                  {r.contacto && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{r.contacto}</span>}
                </div>
              ))
            )}
          </div>
        );
      })()}

      {/* Llegadas registradas de lanchas propias */}
      {llegadasLancha.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Registro de llegadas</div>
          {llegadasLancha.map(l => (
            <LlegadaCard key={l.id} llegada={l} onEstadoChange={onRefresh} onDelete={async () => { await supabase.from("muelle_llegadas").delete().eq("id", l.id); onRefresh(); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: After Island ────────────────────────────────────────────────────────
function TabAfterIsland({ fecha, llegadas, onRefresh, onNuevaLlegada }) {
  const [reservas, setReservas] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("reservas").select("id, nombre, pax, pax_a, pax_n, contacto, estado, checkin_at, embarcacion_asignada")
      .eq("fecha", fecha).ilike("tipo", "%after%").neq("estado", "cancelado")
      .then(({ data }) => setReservas(data || []));
  }, [fecha]);

  const llegadasAfter = llegadas.filter(l => l.tipo === "after_island");
  const registradasIds = new Set(llegadasAfter.map(l => l.reserva_id).filter(Boolean));

  return (
    <div>
      {/* Botón nuevo After Island walk-in */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => onNuevaLlegada("after_island", null, null)}
          style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: B.sand, color: B.navy, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          🌙 + After Island walk-in
        </button>
      </div>

      {/* Reservas After Island del día */}
      {reservas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>After Island con reserva ({reservas.length})</div>
          {reservas.map(r => {
            const yaRegistrada = registradasIds.has(r.id);
            return (
              <div key={r.id} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", marginBottom: 10, border: `1px solid ${yaRegistrada ? B.success + "44" : "rgba(255,255,255,0.07)"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 20 }}>🌙</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.nombre}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                      {r.pax || 1} pax · {r.contacto || "Sin contacto"}
                      {r.embarcacion_asignada && <span> · {r.embarcacion_asignada}</span>}
                    </div>
                  </div>
                  {yaRegistrada
                    ? <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: B.success + "22", color: B.success, fontWeight: 700 }}>✓ Llegó</span>
                    : <button onClick={() => onNuevaLlegada("after_island", r, null)}
                        style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        ⚓ Registrar llegada
                      </button>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Llegadas After Island registradas (walk-in o con reserva) */}
      {llegadasAfter.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Llegadas registradas ({llegadasAfter.length})</div>
          {llegadasAfter.map(l => (
            <LlegadaCard key={l.id} llegada={l} onEstadoChange={onRefresh} onDelete={async () => { await supabase.from("muelle_llegadas").delete().eq("id", l.id); onRefresh(); }} />
          ))}
        </div>
      )}

      {reservas.length === 0 && llegadasAfter.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          No hay After Island programados para hoy.<br />Usa el botón para registrar llegadas walk-in.
        </div>
      )}
    </div>
  );
}

// ─── Tab: Restaurante ─────────────────────────────────────────────────────────
function TabRestaurante({ fecha, llegadas, onRefresh, onNuevaLlegada }) {
  const llegadasRest = llegadas.filter(l => l.tipo === "restaurante");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          {llegadasRest.length > 0 ? `${llegadasRest.length} embarcación${llegadasRest.length !== 1 ? "es" : ""} · ${llegadasRest.reduce((t, l) => t + (l.pax_total || 0), 0)} personas` : "Sin llegadas registradas"}
        </div>
        <button onClick={() => onNuevaLlegada("restaurante", null, null)}
          style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: B.success, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          🍽️ + Registrar llegada
        </button>
      </div>

      {llegadasRest.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          No hay llegadas al restaurante registradas.<br />Usa el botón para registrar embarcaciones que llegan solo a consumo.
        </div>
      ) : (
        llegadasRest.map(l => (
          <LlegadaCard key={l.id} llegada={l} onEstadoChange={onRefresh} onDelete={async () => { await supabase.from("muelle_llegadas").delete().eq("id", l.id); onRefresh(); }} />
        ))
      )}
    </div>
  );
}

// ─── MAIN MODULE ──────────────────────────────────────────────────────────────
export default function MuelleCheckin() {
  const { isMobile } = useMobile();
  const [fecha, setFecha] = useState(todayStr());
  const [tab, setTab]     = useState("lanchas");
  const [llegadas, setLlegadas] = useState([]);
  const [modal, setModal] = useState(null); // { tipo, reserva, salida }

  const fetchLlegadas = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("muelle_llegadas").select("*").eq("fecha", fecha).order("created_at");
    setLlegadas(data || []);
  }, [fecha]);

  useEffect(() => { fetchLlegadas(); }, [fetchLlegadas]);

  // KPIs
  const totalPax    = llegadas.reduce((t, l) => t + (l.pax_total || 0), 0);
  const enIsla      = llegadas.filter(l => l.estado === "en_isla" || l.estado === "llegó").reduce((t, l) => t + (l.pax_total || 0), 0);
  const salieron    = llegadas.filter(l => l.estado === "salió").reduce((t, l) => t + (l.pax_total || 0), 0);
  const totalCobrado = llegadas.reduce((t, l) => t + (l.total_cobrado || 0), 0);

  const TABS = [
    { key: "lanchas",     label: "⛵ Lanchas Atolon",  color: B.sky },
    { key: "after",       label: "🌙 After Island",     color: B.sand },
    { key: "restaurante", label: "🍽️ Restaurante",     color: B.success },
  ];

  const handleNuevaLlegada = (tipo, reserva, salida) => {
    setModal({ tipo, reserva, salida });
  };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : "24px", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#e2e8f0", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#fff" }}>⚓ Muelle — Llegadas a Isla</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Control de embarcaciones que llegan a Isla Tierra Bomba</div>
        </div>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          style={{ ...IS, width: "auto", fontSize: 14, padding: "8px 14px" }} />
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total pax llegados", value: totalPax, color: B.sky },
          { label: "Actualmente en isla", value: enIsla, color: B.success },
          { label: "Ya se fueron", value: salieron, color: "rgba(255,255,255,0.4)" },
          { label: "Cobrado en muelle", value: COP(totalCobrado), color: B.sand },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 18px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: tab === t.key ? t.color : B.navyMid,
              color: tab === t.key ? (t.key === "after" ? B.navy : t.key === "lanchas" ? B.navy : "#fff") : "rgba(255,255,255,0.6)" }}>
            {t.label}
            {(() => {
              const count = llegadas.filter(l => l.tipo === (t.key === "lanchas" ? "lancha_atolon" : t.key === "after" ? "after_island" : "restaurante")).length;
              return count > 0 ? <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>({count})</span> : null;
            })()}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "lanchas" && (
        <TabLanchas fecha={fecha} llegadas={llegadas} onRefresh={fetchLlegadas} onNuevaLlegada={handleNuevaLlegada} />
      )}
      {tab === "after" && (
        <TabAfterIsland fecha={fecha} llegadas={llegadas} onRefresh={fetchLlegadas} onNuevaLlegada={handleNuevaLlegada} />
      )}
      {tab === "restaurante" && (
        <TabRestaurante fecha={fecha} llegadas={llegadas} onRefresh={fetchLlegadas} onNuevaLlegada={handleNuevaLlegada} />
      )}

      {/* Modal */}
      {modal && (
        <ModalNuevaLlegada
          tipo={modal.tipo}
          fecha={fecha}
          reserva={modal.reserva}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchLlegadas(); }}
        />
      )}
    </div>
  );
}
