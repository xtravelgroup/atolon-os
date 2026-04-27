// Portal externo /blueapple — Permite que el equipo de Blue Apple tome
// cupos en zarpes programados de Atolón (intercambio de transporte).
// Sus pax NO cuentan como ingreso ni clientes Atolón — solo comparten lancha.
import { useEffect, useMemo, useState, useCallback } from "react";
import { B, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";

const SLUG = "blueapple";
const PARTNER_NAME = "Blue Apple";
const PARTNER_COLOR = "#0EA5E9";

const TIPOS_DOC = ["CC", "CE", "Pasaporte", "TI"];
const SEXOS = ["M", "F", "Otro"];

export default function BlueApplePortal() {
  const [session, setSession] = useState(null);     // {user, partnerUser, partner}
  const [loadingSess, setLoadingSess] = useState(true);
  const [view, setView] = useState("zarpes");       // zarpes | reservar | historial

  // Boot session
  useEffect(() => {
    let cancelled = false;
    const initSession = async (authUser) => {
      if (!authUser) { if (!cancelled) { setSession(null); setLoadingSess(false); } return; }
      const { data: pu } = await supabase.from("partner_users")
        .select("*, partner:partner_id(*)")
        .eq("email", authUser.email).eq("activo", true).maybeSingle();
      if (cancelled) return;
      if (!pu || pu.partner?.slug !== SLUG) {
        // No es usuario autorizado de Blue Apple
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession({ user: authUser, partnerUser: pu, partner: pu.partner });
      }
      setLoadingSess(false);
    };

    supabase.auth.getUser().then(({ data }) => initSession(data?.user));
    const { data: subs } = supabase.auth.onAuthStateChange((_e, s) => initSession(s?.user));
    return () => { cancelled = true; subs?.subscription?.unsubscribe?.(); };
  }, []);

  if (loadingSess) {
    return <div style={shellStyle}><div style={loadingStyle}>Cargando…</div></div>;
  }

  if (!session) return <LoginScreen />;

  return (
    <div style={shellStyle}>
      <Header session={session} view={view} setView={setView} />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 20px 60px" }}>
        {view === "zarpes"     && <ZarpesView session={session} onReservar={() => setView("reservar")} />}
        {view === "reservar"   && <ReservarView session={session} onDone={() => setView("historial")} onCancel={() => setView("zarpes")} />}
        {view === "historial"  && <HistorialView session={session} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════════
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass]   = useState("");
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setLoading(false);
    if (error) return setErr(error.message);

    // Verificar que pertenece a Blue Apple
    const { data: pu } = await supabase.from("partner_users")
      .select("partner:partner_id(slug)")
      .eq("email", data.user.email).eq("activo", true).maybeSingle();
    if (!pu || pu.partner?.slug !== SLUG) {
      await supabase.auth.signOut();
      setErr("Esta cuenta no tiene acceso a Blue Apple.");
    }
  };

  return (
    <div style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400, background: B.navyMid, borderRadius: 16, padding: 32, border: `1px solid ${B.navyLight}` }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🍎</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: PARTNER_COLOR }}>{PARTNER_NAME}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Portal de zarpes · Atolón Cartagena</div>
        </div>
        <form onSubmit={onLogin}>
          <label style={LBL}>Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={INP} placeholder="reservas@blueapple.co" autoFocus autoComplete="email" />
          <label style={{ ...LBL, marginTop: 12 }}>Contraseña</label>
          <input type="password" required value={pass} onChange={e => setPass(e.target.value)} style={INP} autoComplete="current-password" />
          {err && <div style={{ marginTop: 12, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{err}</div>}
          <button type="submit" disabled={loading}
            style={{ width: "100%", marginTop: 20, padding: "12px", borderRadius: 8, border: "none", background: PARTNER_COLOR, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Ingresando…" : "Entrar"}
          </button>
        </form>
        <div style={{ marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
          ¿Olvidaste tu acceso? Contacta a Atolón Cartagena.
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// HEADER
// ════════════════════════════════════════════════════════════════
function Header({ session, view, setView }) {
  const tabs = [
    { k: "zarpes",    l: "📅 Salidas" },
    { k: "historial", l: "📋 Historial" },
  ];
  return (
    <div style={{ background: B.navy, borderBottom: `1px solid ${B.navyLight}`, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🍎</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: PARTNER_COLOR }}>{PARTNER_NAME}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>Atolón Cartagena · Portal de zarpes</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setView(t.k)}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: view === t.k ? PARTNER_COLOR : "transparent",
              color: view === t.k ? "#fff" : "rgba(255,255,255,0.65)",
            }}>{t.l}</button>
        ))}
        <div style={{ width: 1, height: 20, background: B.navyLight, margin: "0 6px" }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{session.partnerUser.nombre || session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}
          style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer" }}>
          Salir
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// VISTA: ZARPES — Lista de zarpes programados con cupos
// ════════════════════════════════════════════════════════════════
function ZarpesView({ session, onReservar }) {
  const [fecha, setFecha] = useState(todayStr());
  const [salidas, setSalidas] = useState([]);
  const [reservasPorSalida, setReservasPorSalida] = useState({});  // { salida_id: pax_total }
  const [bookingsPorSalida, setBookingsPorSalida] = useState({});  // { salida_id: pax_total partner }
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    const [sR, rR, pbR] = await Promise.all([
      supabase.from("salidas").select("id, hora, hora_regreso, nombre, capacidad_total, embarcaciones").eq("activo", true).order("orden"),
      supabase.from("reservas").select("salida_id, pax, pax_a, pax_n, estado").eq("fecha", fecha),
      supabase.from("partner_bookings").select("salida_id, pax_total, estado").eq("fecha", fecha).neq("estado", "cancelada"),
    ]);
    setSalidas(sR.data || []);

    const reservasMap = {};
    (rR.data || []).forEach(r => {
      if (!r.salida_id) return;
      const cancelada = (r.estado || "").toLowerCase().includes("cancel");
      if (cancelada) return;
      const pax = Number(r.pax) || (Number(r.pax_a) || 0) + (Number(r.pax_n) || 0);
      reservasMap[r.salida_id] = (reservasMap[r.salida_id] || 0) + pax;
    });
    setReservasPorSalida(reservasMap);

    const bookingsMap = {};
    (pbR.data || []).forEach(b => {
      if (!b.salida_id) return;
      bookingsMap[b.salida_id] = (bookingsMap[b.salida_id] || 0) + (Number(b.pax_total) || 0);
    });
    setBookingsPorSalida(bookingsMap);

    setLoading(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Salidas del día</h2>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13 }} />
      </div>

      {loading ? <div style={loadingStyle}>Cargando…</div>
        : salidas.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>⛵</div>
            <div>Sin salidas activas configuradas</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {salidas.map(s => {
              const cap = Number(s.capacidad_total) || 0;
              const ocupAtolon  = reservasPorSalida[s.id] || 0;
              const ocupPartner = bookingsPorSalida[s.id] || 0;
              const ocupTotal   = ocupAtolon + ocupPartner;
              const disponibles = Math.max(0, cap - ocupTotal);
              const lleno = disponibles === 0;

              return (
                <div key={s.id} style={{ background: B.navyMid, borderRadius: 12, padding: 16, border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${lleno ? B.danger : PARTNER_COLOR}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>
                        ⛵ {s.nombre} · {s.hora}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                        Salida {s.hora} → Regreso {s.hora_regreso || "—"} · {fmtFecha(fecha)}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                        Atolón: {ocupAtolon} pax · Partners: {ocupPartner} pax
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 140 }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: lleno ? B.danger : B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {disponibles} / {cap}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>cupos disponibles</div>
                      <button
                        onClick={() => { localStorage.setItem("ba_salida_id", s.id); localStorage.setItem("ba_fecha", fecha); onReservar(); }}
                        disabled={lleno}
                        style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "none", background: lleno ? B.navyLight : PARTNER_COLOR, color: "#fff", fontSize: 12, fontWeight: 700, cursor: lleno ? "not-allowed" : "pointer", opacity: lleno ? 0.5 : 1 }}>
                        {lleno ? "Sin cupos" : "+ Tomar cupo"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// VISTA: RESERVAR — Form para registrar pax
// ════════════════════════════════════════════════════════════════
function ReservarView({ session, onDone, onCancel }) {
  const salidaId = (typeof window !== "undefined") ? localStorage.getItem("ba_salida_id") : null;
  const fechaSel = (typeof window !== "undefined") ? localStorage.getItem("ba_fecha") || todayStr() : todayStr();
  const [salida, setSalida] = useState(null);
  const [pasajeros, setPasajeros] = useState([emptyPax()]);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!salidaId) return;
    supabase.from("salidas").select("*").eq("id", salidaId).maybeSingle()
      .then(({ data }) => setSalida(data));
  }, [salidaId]);

  const updatePax = (i, k, v) => setPasajeros(arr => arr.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const addPax    = () => setPasajeros(arr => [...arr, emptyPax()]);
  const removePax = (i) => setPasajeros(arr => arr.filter((_, j) => j !== i));

  const validar = () => {
    for (const p of pasajeros) {
      if (!p.nombre.trim() || !p.num_doc.trim() || !p.fecha_nac || !p.nacionalidad.trim()) {
        return "Completa nombre, documento, fecha de nacimiento y nacionalidad de cada pasajero.";
      }
    }
    return null;
  };

  const guardar = async () => {
    const err = validar();
    if (err) return setError(err);
    setError(""); setSaving(true);
    try {
      const id = `BA_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const { error: e } = await supabase.from("partner_bookings").insert({
        id,
        partner_id:        session.partner.id,
        partner_nombre:    session.partner.nombre,
        salida_id:         salidaId,
        fecha:             fechaSel,
        hora:              salida?.hora || null,
        embarcacion:       (salida?.embarcaciones || [])[0] || null,
        destino:           PARTNER_NAME,
        pax_total:         pasajeros.length,
        pasajeros:         pasajeros,
        notas:             notas || null,
        created_by_email:  session.user.email,
        estado:            "confirmada",
      });
      if (e) throw e;
      localStorage.removeItem("ba_salida_id");
      localStorage.removeItem("ba_fecha");
      onDone();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!salidaId || !salida) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>No has seleccionado una salida.</div>
        <button onClick={onCancel} style={btnSecondary}>← Ver salidas</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={onCancel} style={{ background: "transparent", border: "none", color: PARTNER_COLOR, fontSize: 13, cursor: "pointer", padding: 0 }}>← Volver a salidas</button>
      </div>

      <div style={{ background: B.navyMid, padding: 14, borderRadius: 10, marginBottom: 16, border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${PARTNER_COLOR}` }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>⛵ {salida.nombre} · {salida.hora}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{fmtFecha(fechaSel)} · Salida {salida.hora} → Regreso {salida.hora_regreso || "—"}</div>
      </div>

      <h3 style={{ margin: "20px 0 12px", fontSize: 15 }}>Pasajeros ({pasajeros.length})</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {pasajeros.map((p, i) => (
          <div key={i} style={{ background: B.navyMid, borderRadius: 10, padding: 14, border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: PARTNER_COLOR }}>Pasajero #{i + 1}</span>
              {pasajeros.length > 1 && (
                <button onClick={() => removePax(i)} style={{ background: "transparent", border: `1px solid ${B.danger}`, color: B.danger, padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>× Quitar</button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LBL}>Nombre completo *</label>
                <input value={p.nombre} onChange={e => updatePax(i, "nombre", e.target.value)} style={INP} placeholder="Juan Pérez García" />
              </div>
              <div>
                <label style={LBL}>Tipo doc</label>
                <select value={p.tipo_doc} onChange={e => updatePax(i, "tipo_doc", e.target.value)} style={INP}>
                  {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Número doc *</label>
                <input value={p.num_doc} onChange={e => updatePax(i, "num_doc", e.target.value)} style={INP} />
              </div>
              <div>
                <label style={LBL}>Nacionalidad *</label>
                <input value={p.nacionalidad} onChange={e => updatePax(i, "nacionalidad", e.target.value)} style={INP} placeholder="Colombiana" />
              </div>
              <div>
                <label style={LBL}>Fecha nacimiento *</label>
                <input type="date" value={p.fecha_nac} onChange={e => updatePax(i, "fecha_nac", e.target.value)} style={INP} />
              </div>
              <div>
                <label style={LBL}>Sexo</label>
                <select value={p.sexo} onChange={e => updatePax(i, "sexo", e.target.value)} style={INP}>
                  {SEXOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Teléfono</label>
                <input value={p.telefono} onChange={e => updatePax(i, "telefono", e.target.value)} style={INP} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addPax} style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8, border: `1px dashed ${PARTNER_COLOR}`, background: "transparent", color: PARTNER_COLOR, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        + Agregar otro pasajero
      </button>

      <div style={{ marginTop: 20 }}>
        <label style={LBL}>Notas (opcional)</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} style={{ ...INP, resize: "vertical", fontFamily: "inherit" }} placeholder="Algo que el equipo de muelle deba saber" />
      </div>

      {error && <div style={{ marginTop: 12, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onCancel} style={btnSecondary}>Cancelar</button>
        <button onClick={guardar} disabled={saving}
          style={{ padding: "11px 24px", borderRadius: 8, border: "none", background: PARTNER_COLOR, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Guardando…" : `✓ Confirmar ${pasajeros.length} pasajero${pasajeros.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// VISTA: HISTORIAL
// ════════════════════════════════════════════════════════════════
function HistorialView({ session }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("partner_bookings")
      .select("*").eq("partner_id", session.partner.id)
      .order("fecha", { ascending: false }).order("hora", { ascending: false });
    setBookings(data || []);
    setLoading(false);
  }, [session.partner.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const cancelar = async (b) => {
    if (!confirm(`¿Cancelar la reserva de ${b.pax_total} pax para el zarpe ${b.embarcacion} ${b.hora}?`)) return;
    await supabase.from("partner_bookings").update({ estado: "cancelada", updated_at: new Date().toISOString() }).eq("id", b.id);
    cargar();
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>Mis reservas ({bookings.length})</h2>
      {loading ? <div style={loadingStyle}>Cargando…</div>
        : bookings.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>📋</div>
            <div>Aún no has tomado cupos.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bookings.map(b => {
              const cancelable = b.estado === "confirmada" && b.fecha >= todayStr();
              return (
                <div key={b.id} style={{ background: B.navyMid, borderRadius: 10, padding: 14, border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${b.estado === "cancelada" ? B.danger : PARTNER_COLOR}`, opacity: b.estado === "cancelada" ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {b.embarcacion} · {b.hora || "—"}
                        {b.estado === "cancelada" && <span style={{ marginLeft: 8, fontSize: 9, padding: "1px 6px", background: B.danger + "33", color: B.danger, borderRadius: 8, fontWeight: 700 }}>CANCELADA</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
                        {fmtFecha(b.fecha)} · {b.pax_total} pasajero{b.pax_total !== 1 ? "s" : ""}
                      </div>
                      {(b.pasajeros || []).length > 0 && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                          {(b.pasajeros || []).map(p => p.nombre).filter(Boolean).slice(0, 3).join(", ")}
                          {(b.pasajeros || []).length > 3 ? `, +${(b.pasajeros || []).length - 3} más` : ""}
                        </div>
                      )}
                      {b.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4, fontStyle: "italic" }}>{b.notas}</div>}
                    </div>
                    {cancelable && (
                      <button onClick={() => cancelar(b)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${B.danger}`, background: B.danger + "22", color: B.danger, fontSize: 11, fontWeight: 700, cursor: "pointer", height: "fit-content" }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════
const emptyPax = () => ({
  nombre: "", tipo_doc: "CC", num_doc: "", nacionalidad: "Colombiana",
  fecha_nac: "", sexo: "M", telefono: "", email: "",
});

const shellStyle = {
  minHeight: "100vh",
  background: B.navy,
  color: B.white,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const loadingStyle = {
  textAlign: "center",
  padding: 60,
  color: "rgba(255,255,255,0.4)",
  fontSize: 14,
};

const INP = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LBL = { fontSize: 11, color: "rgba(255,255,255,0.55)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };
const btnSecondary = { padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" };
