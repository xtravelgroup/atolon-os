// HotelGrupoPublico — Página pública de reserva por grupo.
// URL: /reservar-grupo/:slug
// El cliente ve las tarifas y fechas contratadas, elige check-in/check-out,
// categoría, ingresa datos y hace la reserva. La estancia se crea via
// edge function hotel-grupo-reservar.

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { wompiCheckoutUrl } from "../../lib/wompi";

const COP = (n) => `$${(Number(n) || 0).toLocaleString("es-CO")}`;
const fmtFecha = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "long", year: "numeric" }) : "";

function diffNoches(a, b) {
  if (!a || !b) return 0;
  const t = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(t / (1000 * 60 * 60 * 24)));
}

const container = { maxWidth: 720, margin: "0 auto", padding: "24px 16px" };
const card = { background: B.navyMid, borderRadius: 14, padding: 22, marginBottom: 16, border: `1px solid ${B.navyLight}` };
const label = { fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };
const input = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, outline: "none", boxSizing: "border-box" };

export default function HotelGrupoPublico() {
  const slug = useMemo(() => {
    const p = window.location.pathname;
    const m = p.match(/\/reservar-grupo\/([^/?#]+)/);
    return m ? m[1] : "";
  }, []);

  const [grupo, setGrupo] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({
    check_in: "",
    check_out: "",
    categoria_id: "",
    nombre: "",
    email: "",
    telefono: "",
    documento: "",
    pax_adultos: 2,
    pax_ninos: 0,
    notas: "",
    nacionalidad: "colombiano",
  });
  const [enviando, setEnviando] = useState(false);
  const [confirmada, setConfirmada] = useState(null);
  const [disponibilidad, setDisponibilidad] = useState({}); // {categoria_id: {total, ocupadas, disponibles}}
  const [dispLoading, setDispLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!slug) { setErr("URL inválida"); setLoading(false); return; }
      const [gR, cR] = await Promise.all([
        supabase.from("hotel_grupos").select("*, hotel_grupos_tarifas(*)").eq("slug", slug).maybeSingle(),
        supabase.from("hotel_categorias").select("*").order("orden"),
      ]);
      if (!gR.data) { setErr("Este link no es válido o el grupo ya no está disponible."); setLoading(false); return; }
      if (gR.data.estado !== "activo") { setErr("Este grupo no está activo actualmente."); setLoading(false); return; }
      if (gR.data.link_expira_at && new Date(gR.data.link_expira_at) < new Date()) {
        setErr("El link de reserva ha vencido. Contacta a la empresa organizadora.");
        setLoading(false); return;
      }
      setGrupo(gR.data);
      setCategorias(cR.data || []);
      // preseleccionar primera categoria disponible
      const tarifas = gR.data.hotel_grupos_tarifas || [];
      const primeraDisp = tarifas.find(t => t.disponible !== false && Number(t.precio_noche) > 0);
      if (primeraDisp) setF(s => ({ ...s, categoria_id: primeraDisp.categoria_id }));
      // preseleccionar check_in = fecha_desde del grupo
      setF(s => ({ ...s, check_in: gR.data.fecha_desde, check_out: "" }));
      setLoading(false);
    })();
  }, [slug]);

  const tarifas = grupo?.hotel_grupos_tarifas || [];
  const tarifasDisp = tarifas.filter(t => t.disponible !== false && Number(t.precio_noche) > 0);
  const tarifaSel = tarifas.find(t => t.categoria_id === f.categoria_id);
  const noches = diffNoches(f.check_in, f.check_out);
  const subtotal = tarifaSel && noches > 0 ? Number(tarifaSel.precio_noche) * noches : 0;
  const IVA_PCT = 0.19;
  const iva = f.nacionalidad === "colombiano" ? Math.round(subtotal * IVA_PCT) : 0;
  const total = subtotal + iva;

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  // Recalcular disponibilidad cuando cambian fechas.
  useEffect(() => {
    if (!grupo || !f.check_in || !f.check_out || diffNoches(f.check_in, f.check_out) < 1) {
      setDisponibilidad({});
      return;
    }
    let cancel = false;
    (async () => {
      setDispLoading(true);
      const catIds = tarifasDisp.map(t => t.categoria_id);
      if (catIds.length === 0) { setDispLoading(false); return; }
      const winEnd = `${f.check_out}T23:59:59`;
      const winIni = `${f.check_in}T00:00:00`;
      const [hR, eR] = await Promise.all([
        supabase.from("hotel_habitaciones").select("id, categoria_id").in("categoria_id", catIds).eq("estado", "activa"),
        supabase.from("hotel_estancias").select("id, habitacion_id, categoria_preferida, estado")
          .in("estado", ["reservada", "in_house"])
          .lt("check_in_at", winEnd)
          .gt("check_out_at", winIni),
      ]);
      if (cancel) return;
      const habsByCat = {};
      const habCatMap = new Map();
      (hR.data || []).forEach(h => {
        habsByCat[h.categoria_id] = (habsByCat[h.categoria_id] || 0) + 1;
        habCatMap.set(h.id, h.categoria_id);
      });
      const ocupPorCat = {};
      (eR.data || []).forEach(e => {
        let cat = null;
        if (e.habitacion_id && habCatMap.has(e.habitacion_id)) cat = habCatMap.get(e.habitacion_id);
        else if (!e.habitacion_id && e.categoria_preferida) cat = e.categoria_preferida;
        if (cat) ocupPorCat[cat] = (ocupPorCat[cat] || 0) + 1;
      });
      const disp = {};
      catIds.forEach(cId => {
        const total = habsByCat[cId] || 0;
        const ocup = ocupPorCat[cId] || 0;
        disp[cId] = { total, ocupadas: ocup, disponibles: Math.max(0, total - ocup) };
      });
      setDisponibilidad(disp);
      setDispLoading(false);
    })();
    return () => { cancel = true; };
  }, [grupo, f.check_in, f.check_out, tarifasDisp.length]);

  const reservar = async () => {
    setErr(null);
    if (!f.nombre.trim()) return setErr("Nombre requerido");
    if (!f.email.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) return setErr("Email válido requerido");
    if (!f.check_in || !f.check_out) return setErr("Selecciona fechas de entrada y salida");
    if (noches < 1) return setErr("Mínimo 1 noche");
    if (!f.categoria_id) return setErr("Selecciona una categoría de habitación");
    setEnviando(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hotel-grupo-reservar`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          slug,
          check_in: f.check_in,
          check_out: f.check_out,
          categoria_id: f.categoria_id,
          huesped: {
            nombre: f.nombre,
            email: f.email,
            telefono: f.telefono,
            documento: f.documento,
            pax_adultos: f.pax_adultos,
            pax_ninos: f.pax_ninos,
            nacionalidad: f.nacionalidad,
          },
          notas: f.notas,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Error creando reserva");
      setConfirmada(data);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return <div style={{ ...container, textAlign: "center", padding: 60, color: B.sand }}>Cargando…</div>;
  }

  if (err && !grupo) {
    return (
      <div style={container}>
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: B.white, marginBottom: 6 }}>Link no disponible</div>
          <div style={{ color: B.sand, fontSize: 14 }}>{err}</div>
        </div>
      </div>
    );
  }

  if (confirmada) {
    const irAPagar = async () => {
      const url = await wompiCheckoutUrl({
        referencia: `hotel_${confirmada.estancia_id}`,
        totalCOP: confirmada.total,
        email: f.email,
        redirectUrl: `${window.location.origin}/reservar-grupo/${slug}?paid=${confirmada.codigo}`,
      });
      window.location.href = url;
    };
    return (
      <div style={container}>
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: B.success, marginBottom: 8 }}>Reserva creada</div>
          <div style={{ color: B.white, fontSize: 14, marginBottom: 16 }}>
            <b>{f.nombre}</b>, tu reserva quedó registrada. Completa el pago para confirmarla.
          </div>
          <div style={{ display: "grid", gap: 8, textAlign: "left", background: B.navy, padding: 16, borderRadius: 10, marginBottom: 16 }}>
            <div><b>Código:</b> <span style={{ fontFamily: "monospace", color: B.sky }}>{confirmada.codigo}</span></div>
            <div><b>Check-in:</b> {fmtFecha(f.check_in)}</div>
            <div><b>Check-out:</b> {fmtFecha(f.check_out)}</div>
            <div><b>Noches:</b> {confirmada.noches}</div>
            <div><b>Precio/noche:</b> {COP(confirmada.precio_noche)}</div>
            <div><b>Subtotal:</b> {COP(confirmada.subtotal ?? confirmada.total)}</div>
            {confirmada.iva > 0 && <div><b>IVA 19%:</b> {COP(confirmada.iva)}</div>}
            {confirmada.iva === 0 && confirmada.nacionalidad === "extranjero" && (
              <div style={{ color: B.success }}>✓ Exento de IVA (extranjero)</div>
            )}
            <div style={{ fontSize: 16, fontWeight: 800, color: B.success }}>
              <b>Total:</b> {COP(confirmada.total)}
            </div>
          </div>
          <button onClick={irAPagar} style={{
            width: "100%", padding: "16px 24px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #7B2CBF, #5A189A)", color: "#fff",
            fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 12,
            boxShadow: "0 4px 12px rgba(123, 44, 191, 0.4)",
          }}>
            💳 Pagar ahora con Wompi — {COP(confirmada.total)}
          </button>
          <div style={{ fontSize: 11, color: B.sand, lineHeight: 1.5 }}>
            Pago seguro con tarjeta, PSE o Nequi. Recibirás confirmación por email en <b>{f.email}</b>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div style={{ ...card, textAlign: "center", padding: "24px 20px" }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 900, color: B.white, letterSpacing: 1 }}>
          🏖️ ATOLÓN
        </div>
        <div style={{ fontSize: 12, color: B.sand, letterSpacing: 2, textTransform: "uppercase" }}>Beach Club · Cartagena</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 22, fontWeight: 800, color: B.white, marginBottom: 4 }}>{grupo.nombre}</div>
        {grupo.descripcion && <div style={{ fontSize: 13, color: B.sand, marginBottom: 10 }}>{grupo.descripcion}</div>}
        <div style={{ display: "grid", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
          <div>📅 Fechas disponibles: <b style={{ color: B.white }}>{fmtFecha(grupo.fecha_desde)}</b> — <b style={{ color: B.white }}>{fmtFecha(grupo.fecha_hasta)}</b></div>
          {grupo.cupo_habitaciones > 0 && (
            <div>🛏️ Cupo: <b style={{ color: B.white }}>{grupo.habitaciones_reservadas || 0}/{grupo.cupo_habitaciones}</b> habitaciones reservadas</div>
          )}
          {grupo.incluye && <div>🎁 Incluye: <b style={{ color: B.white }}>{grupo.incluye}</b></div>}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 800, color: B.white, marginBottom: 14 }}>Elige tus fechas</div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={label}>Check-in</label>
            <input type="date" value={f.check_in} min={grupo.fecha_desde} max={grupo.fecha_hasta}
              onChange={e => set("check_in", e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>Check-out</label>
            <input type="date" value={f.check_out} min={f.check_in || grupo.fecha_desde} max={grupo.fecha_hasta}
              onChange={e => set("check_out", e.target.value)} style={input} />
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 800, color: B.white, marginBottom: 14 }}>Categoría de habitación</div>
        {tarifasDisp.length === 0 ? (
          <div style={{ color: B.warning }}>Sin categorías disponibles.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {(!f.check_in || !f.check_out || noches < 1) && (
              <div style={{ fontSize: 12, color: B.sand, padding: "8px 12px", background: B.navy, borderRadius: 6 }}>
                Selecciona fechas de check-in y check-out para ver disponibilidad.
              </div>
            )}
            {tarifasDisp.map(t => {
              const cat = categorias.find(c => c.id === t.categoria_id);
              const sel = f.categoria_id === t.categoria_id;
              const d = disponibilidad[t.categoria_id];
              const fechasValidas = f.check_in && f.check_out && noches >= 1;
              const agotado = fechasValidas && d && d.disponibles <= 0;
              const disabled = agotado || (!fechasValidas);
              return (
                <label key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  cursor: disabled ? "not-allowed" : "pointer",
                  padding: "12px 14px", borderRadius: 8,
                  background: sel ? B.hotel + "33" : B.navy,
                  border: sel ? `2px solid ${B.hotel}` : `1px solid ${B.navyLight}`,
                  opacity: agotado ? 0.5 : 1,
                }}>
                  <input type="radio" name="categoria" checked={sel} disabled={disabled}
                    onChange={() => !disabled && set("categoria_id", t.categoria_id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: B.white, fontSize: 14 }}>{cat?.nombre || "—"}</div>
                    {cat?.descripcion && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{cat.descripcion}</div>
                    )}
                    {fechasValidas && agotado && (
                      <div style={{ fontSize: 11, marginTop: 4, color: B.danger, fontWeight: 700 }}>
                        No disponible en esas fechas
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 800, color: B.hotel, fontSize: 16 }}>
                    {COP(t.precio_noche)}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}> /noche</span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 800, color: B.white, marginBottom: 14 }}>Datos del huésped</div>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={label}>Nacionalidad *</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {[
                { k: "colombiano", l: "🇨🇴 Colombiano" },
                { k: "extranjero", l: "🌎 Extranjero" },
              ].map(o => {
                const sel = f.nacionalidad === o.k;
                return (
                  <label key={o.k} style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                    background: sel ? B.hotel + "33" : B.navy,
                    border: sel ? `2px solid ${B.hotel}` : `1px solid ${B.navyLight}`,
                    fontWeight: 700, color: B.white, fontSize: 14,
                  }}>
                    <input type="radio" name="nacionalidad" checked={sel}
                      onChange={() => set("nacionalidad", o.k)} style={{ margin: 0 }} />
                    {o.l}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: B.sand, marginTop: 4 }}>
              {f.nacionalidad === "colombiano"
                ? "Los residentes colombianos pagan 19% IVA."
                : "Extranjeros con pasaporte están exentos de IVA (Ley 300 de 1996)."}
            </div>
          </div>

          <div>
            <label style={label}>Nombre completo *</label>
            <input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={input} placeholder="Ej: Juan Pérez" />
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={label}>Email *</label>
              <input type="email" value={f.email} onChange={e => set("email", e.target.value)} style={input} placeholder="tucorreo@ejemplo.com" />
            </div>
            <div>
              <label style={label}>Teléfono</label>
              <input value={f.telefono} onChange={e => set("telefono", e.target.value)} style={input} placeholder="+57 300 000 0000" />
            </div>
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label style={label}>Documento (CC/PP)</label>
              <input value={f.documento} onChange={e => set("documento", e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Adultos</label>
              <input type="number" min={1} value={f.pax_adultos} onChange={e => set("pax_adultos", e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Niños</label>
              <input type="number" min={0} value={f.pax_ninos} onChange={e => set("pax_ninos", e.target.value)} style={input} />
            </div>
          </div>
          <div>
            <label style={label}>Solicitudes especiales</label>
            <textarea value={f.notas} onChange={e => set("notas", e.target.value)} rows={2}
              style={{ ...input, resize: "vertical" }} placeholder="Ej: cama extra, hora de llegada tardía, alergias" />
          </div>
        </div>
      </div>

      <div style={{ ...card, borderLeft: `4px solid ${B.hotel}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: B.sand }}>
              {noches} noche{noches !== 1 ? "s" : ""} × {tarifaSel ? COP(tarifaSel.precio_noche) : "—"} = <b style={{ color: B.white }}>{COP(subtotal)}</b>
            </div>
            {f.nacionalidad === "colombiano" && subtotal > 0 && (
              <div style={{ fontSize: 12, color: B.sand }}>
                IVA 19%: <b style={{ color: B.white }}>{COP(iva)}</b>
              </div>
            )}
            {f.nacionalidad === "extranjero" && subtotal > 0 && (
              <div style={{ fontSize: 11, color: B.success, marginTop: 2 }}>✓ Exento de IVA</div>
            )}
            <div style={{ fontSize: 26, fontWeight: 900, color: B.white, marginTop: 4 }}>{COP(total)}</div>
          </div>
          <button onClick={reservar} disabled={enviando || noches < 1 || !tarifaSel}
            style={{
              padding: "14px 28px", borderRadius: 10, border: "none",
              background: B.hotel, color: B.white,
              fontSize: 15, fontWeight: 800, cursor: (enviando || noches < 1 || !tarifaSel) ? "not-allowed" : "pointer",
              opacity: (enviando || noches < 1 || !tarifaSel) ? 0.5 : 1,
              minWidth: 160,
            }}>
            {enviando ? "Reservando…" : "Confirmar reserva"}
          </button>
        </div>
        {err && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: B.danger + "22", color: B.danger, borderRadius: 6, fontSize: 12 }}>
            {err}
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
        Al confirmar aceptas los términos del hotel. Powered by Atolón Beach Club · Cartagena
      </div>
    </div>
  );
}
