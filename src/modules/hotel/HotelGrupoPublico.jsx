// HotelGrupoPublico — Página pública de reserva por grupo.
// URL: /reservar-grupo/:slug
// El cliente ve las tarifas y fechas contratadas, elige check-in/check-out,
// categoría, ingresa datos y hace la reserva. La estancia se crea via
// edge function hotel-grupo-reservar.

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";

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
  });
  const [enviando, setEnviando] = useState(false);
  const [confirmada, setConfirmada] = useState(null);

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
  const total = tarifaSel && noches > 0 ? Number(tarifaSel.precio_noche) * noches : 0;

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

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
    return (
      <div style={container}>
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: B.success, marginBottom: 8 }}>Reserva confirmada</div>
          <div style={{ color: B.white, fontSize: 14, marginBottom: 16 }}>
            Gracias, <b>{f.nombre}</b>. Recibirás la confirmación en <b>{f.email}</b>.
          </div>
          <div style={{ display: "grid", gap: 8, textAlign: "left", background: B.navy, padding: 16, borderRadius: 10, marginBottom: 16 }}>
            <div><b>Código:</b> <span style={{ fontFamily: "monospace", color: B.sky }}>{confirmada.codigo}</span></div>
            <div><b>Check-in:</b> {fmtFecha(f.check_in)}</div>
            <div><b>Check-out:</b> {fmtFecha(f.check_out)}</div>
            <div><b>Noches:</b> {confirmada.noches}</div>
            <div><b>Precio/noche:</b> {COP(confirmada.precio_noche)}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.success }}>
              <b>Total:</b> {COP(confirmada.total)}
            </div>
          </div>
          <div style={{ fontSize: 12, color: B.sand, lineHeight: 1.5 }}>
            La empresa organizadora ({confirmada.grupo_nombre}) coordinará el pago contigo directamente. Guarda el código para tu check-in.
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
            {tarifasDisp.map(t => {
              const cat = categorias.find(c => c.id === t.categoria_id);
              const sel = f.categoria_id === t.categoria_id;
              return (
                <label key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  padding: "12px 14px", borderRadius: 8,
                  background: sel ? B.hotel + "33" : B.navy,
                  border: sel ? `2px solid ${B.hotel}` : `1px solid ${B.navyLight}`,
                }}>
                  <input type="radio" name="categoria" checked={sel}
                    onChange={() => set("categoria_id", t.categoria_id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: B.white, fontSize: 14 }}>{cat?.nombre || "—"}</div>
                    {cat?.descripcion && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{cat.descripcion}</div>
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
            <div style={{ fontSize: 13, color: B.sand }}>{noches} noche{noches !== 1 ? "s" : ""} × {tarifaSel ? COP(tarifaSel.precio_noche) : "—"}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: B.white }}>{COP(total)}</div>
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
