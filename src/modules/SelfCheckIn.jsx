import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const NACS = [
  // Prioritarias
  "Colombiana", "Americana", "Mexicana", "Ecuatoriana", "Peruana",
  "Española", "Chilena", "Brasileña", "Argentina", "Francesa", "Alemana",
  // Resto alfabético
  "Canadiense", "Inglesa", "Italiana", "Venezolana", "Otra",
];

const B = {
  navy: "#0D1B3E", navyMid: "#152650", navyLight: "#1E3566",
  sand: "#C8B99A", sky: "#8ECAE6", success: "#22c55e", danger: "#ef4444",
};
const IS = {
  width: "100%", padding: "12px 14px", borderRadius: 9,
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};
const LS = { fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

export default function SelfCheckIn() {
  const rid = new URLSearchParams(window.location.search).get("rid");
  const [reserva, setReserva] = useState(null);
  const [pax, setPax]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!rid) { setLoading(false); return; }
    supabase.from("reservas").select("id,nombre,pax,pax_a,pax_n,pasajeros,fecha,salida_id")
      .eq("id", rid).single()
      .then(({ data, error: e }) => {
        if (e || !data) { setError("not_found"); setLoading(false); return; }
        setReserva(data);
        const total = (data.pax_a || 0) + (data.pax_n || 0) || data.pax || 1;
        const init = data.pasajeros?.length > 0
          ? [...data.pasajeros]
          : Array.from({ length: total }, (_, i) => ({
              nombre: i === 0 ? (data.nombre || "") : "",
              identificacion: "",
              nacionalidad: "Colombiana",
            }));
        setPax(init);
        setLoading(false);
      });
  }, [rid]);

  const set = (i, k, v) => setPax(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));

  const save = async () => {
    const missing = pax.some(p => !p.nombre?.trim() || !p.identificacion?.trim());
    if (missing) { setError("Por favor completa el nombre e identificación de todos los pasajeros."); return; }
    setSaving(true); setError("");
    const { error: e } = await supabase.from("reservas").update({ pasajeros: pax }).eq("id", rid);
    if (e) { setError("Error al guardar. Intenta de nuevo."); setSaving(false); return; }
    setSaving(false);
    setDone(true);
  };

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 15 }}>Cargando...</div>
    </div>
  );

  /* ── Not found ── */
  if (!rid || error === "not_found") return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
      <div style={{ fontSize: 56 }}>⚓</div>
      <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Enlace no válido</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", maxWidth: 300 }}>
        Este enlace de check-in no existe o ya expiró. Pídele al personal del muelle un nuevo código.
      </div>
    </div>
  );

  /* ── Done ── */
  if (done) return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
      <div style={{ fontSize: 72 }}>✅</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center" }}>¡Listo!</div>
      <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
        Tus datos fueron registrados. El personal de muelle ya puede verte. <br />¡Que disfrutes tu día en Atolon! 🌴
      </div>
      <div style={{ marginTop: 8, background: B.navyMid, borderRadius: 12, padding: "14px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>RESERVA</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: B.sand }}>{reserva.nombre}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{pax.length} pasajero{pax.length !== 1 ? "s" : ""} registrados</div>
      </div>
    </div>
  );

  /* ── Form ── */
  return (
    <div style={{ minHeight: "100vh", background: B.navy, fontFamily: "'Inter', 'Segoe UI', sans-serif", padding: "28px 16px 40px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/atolon-logo-white.png" alt="Atolon Beach Club"
            style={{ height: 42, marginBottom: 14, objectFit: "contain" }}
            onError={e => { e.target.style.display = "none"; }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
            Check-in de Pasajeros
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            {reserva.nombre}
          </div>
          <div style={{ display: "inline-block", marginTop: 8, background: B.navyMid, borderRadius: 20, padding: "4px 16px", fontSize: 12, color: B.sand }}>
            {pax.length} pasajero{pax.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Passengers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pax.map((p, i) => (
            <div key={i} style={{ background: B.navyMid, borderRadius: 16, padding: "20px 18px" }}>
              <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Pasajero {i + 1}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={LS}>Nombre completo</label>
                  <input
                    value={p.nombre}
                    onChange={e => set(i, "nombre", e.target.value)}
                    style={IS}
                    placeholder="Nombre y apellido"
                    autoComplete="name"
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LS}>No. Identificación</label>
                    <input
                      value={p.identificacion}
                      onChange={e => set(i, "identificacion", e.target.value)}
                      style={IS}
                      placeholder="CC / Pasaporte"
                      inputMode="text"
                    />
                  </div>
                  <div>
                    <label style={LS}>Nacionalidad</label>
                    <select
                      value={p.nacionalidad}
                      onChange={e => set(i, "nacionalidad", e.target.value)}
                      style={IS}
                    >
                      {NACS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && error !== "not_found" && (
          <div style={{ marginTop: 14, background: "#ef444422", border: "1px solid #ef444444", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#f87171" }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={save}
          disabled={saving}
          style={{
            marginTop: 22, width: "100%", padding: "16px", borderRadius: 12,
            background: saving ? B.navyLight : B.sand,
            color: saving ? "rgba(255,255,255,0.3)" : B.navy,
            border: "none", fontWeight: 800, fontSize: 16,
            cursor: saving ? "default" : "pointer",
            transition: "background 0.2s",
          }}>
          {saving ? "Enviando..." : "Enviar mis datos ✓"}
        </button>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          Atolon Beach Club · Cartagena, Colombia
        </div>
      </div>
    </div>
  );
}
