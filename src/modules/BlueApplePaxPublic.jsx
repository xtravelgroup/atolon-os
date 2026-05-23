// Ruta pública: /blueapple-pax?d=<despacho_id>&t=<token>
//
// Acceso sin login: Blue Apple recibe el link/QR generado en el check-in
// de Atolón, abre la página, ve los slots vacíos pre-creados, llena los
// datos (nombre, cédula, nacionalidad) y graba.
//
// La grabación se hace vía RLS policy "blueapple_update_via_token", que
// permite UPDATE al rol anon cuando el token enviado coincide con el
// blueapple_token guardado en la fila. Sin token = sin acceso.

import { useEffect, useMemo, useState } from "react";
import { B, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

export default function BlueApplePaxPublic() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const despachoId = params.get("d") || "";
  const token = params.get("t") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [despacho, setDespacho] = useState(null);
  const [salida, setSalida] = useState(null);
  const [paxs, setPaxs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!despachoId || !token) {
        setError("Link inválido: faltan parámetros");
        setLoading(false);
        return;
      }
      if (!supabase) {
        setError("Servicio no disponible");
        setLoading(false);
        return;
      }
      const { data, error: e } = await supabase
        .from("salida_despachos")
        .select("id, fecha, salida_id, blueapple_token, blueapple_count_esperado, pasajeros_blueapple")
        .eq("id", despachoId)
        .maybeSingle();
      if (cancelled) return;
      if (e || !data) {
        setError("No encontramos este registro. Verifica el link con Atolón.");
        setLoading(false);
        return;
      }
      if (data.blueapple_token !== token) {
        setError("El link no es válido o ya expiró. Pide a Atolón un nuevo link.");
        setLoading(false);
        return;
      }
      setDespacho(data);
      const slots = Array.isArray(data.pasajeros_blueapple) ? data.pasajeros_blueapple : [];
      const n = Math.max(slots.length, data.blueapple_count_esperado || 1);
      const padded = Array.from({ length: n }, (_, i) => slots[i] || { nombre: "", cedula: "", nacionalidad: "", embarcacion: "" });
      setPaxs(padded);

      // Cargar datos de la salida para contexto (hora, ruta)
      if (data.salida_id) {
        const { data: s } = await supabase
          .from("salidas")
          .select("id, fecha, hora, embarcacion, ruta")
          .eq("id", data.salida_id)
          .maybeSingle();
        if (!cancelled && s) setSalida(s);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [despachoId, token]);

  const setPax = (i, k, v) => setPaxs(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const addPax = () => setPaxs(p => [...p, { nombre: "", cedula: "", nacionalidad: "", embarcacion: paxs[0]?.embarcacion || "" }]);
  const removePax = (i) => setPaxs(p => p.filter((_, j) => j !== i));

  const guardar = async () => {
    setSaving(true);
    setSaved(false);
    // Filtrar pero conservar los que tengan al menos nombre o cédula
    const limpios = paxs.map(p => ({
      nombre: (p.nombre || "").trim(),
      cedula: (p.cedula || "").trim(),
      nacionalidad: (p.nacionalidad || "").trim(),
      embarcacion: (p.embarcacion || "").trim(),
    }));
    const filtered = limpios.filter(p => p.nombre || p.cedula);
    const { error: e } = await supabase
      .from("salida_despachos")
      .update({ pasajeros_blueapple: filtered })
      .eq("id", despachoId)
      .eq("blueapple_token", token);
    setSaving(false);
    if (e) {
      setError("No se pudo guardar: " + (e.message || "error"));
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  // ── Estilos ──────────────────────────────────────────────────────────
  const shell = {
    minHeight: "100vh",
    background: B.navy,
    color: "#fff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: 20,
    boxSizing: "border-box",
  };
  const card = {
    maxWidth: 720,
    margin: "0 auto",
    background: B.navyMid,
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
  };
  const LS = { display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 };
  const IS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: "#fff", fontSize: 14, boxSizing: "border-box" };

  if (loading) {
    return (
      <div style={shell}>
        <div style={{ ...card, textAlign: "center", padding: 40 }}>Cargando…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={shell}>
        <div style={card}>
          <div style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>🚫</div>
          <h2 style={{ fontSize: 18, textAlign: "center", margin: 0, marginBottom: 8 }}>Link no válido</h2>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>{error}</div>
        </div>
      </div>
    );
  }

  const expected = despacho?.blueapple_count_esperado || paxs.length;
  const filled = paxs.filter(p => (p.nombre || "").trim() || (p.cedula || "").trim()).length;

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 32 }}>🍎</div>
          <h1 style={{ fontSize: 20, margin: "6px 0 4px", fontWeight: 700 }}>Pasajeros Blue Apple</h1>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            Datos para el zarpe desde Atolón Beach Club
          </div>
        </div>

        {/* Contexto de la salida */}
        <div style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Fecha</div>
            <div style={{ fontWeight: 600 }}>{despacho?.fecha ? fmtFecha(despacho.fecha) : "—"}</div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Hora</div>
            <div style={{ fontWeight: 600 }}>{salida?.hora || "—"}</div>
          </div>
          {salida?.embarcacion && (
            <div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Embarcación</div>
              <div style={{ fontWeight: 600 }}>{salida.embarcacion}</div>
            </div>
          )}
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Cupos esperados</div>
            <div style={{ fontWeight: 600 }}>{expected} pax</div>
          </div>
        </div>

        <div style={{ background: `${B.sand}22`, border: `1px solid ${B.sand}55`, borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: B.sand, lineHeight: 1.5 }}>
          Por favor llenen los datos de cada pasajero. Necesitamos <b>nombre completo</b> y <b>cédula o pasaporte</b> para el zarpe (Capitanía).
        </div>

        {paxs.map((p, i) => (
          <div key={i} style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.sand }}>Pasajero {i + 1}</div>
              {paxs.length > 1 && (
                <button onClick={() => removePax(i)} style={{ background: "none", border: `1px solid ${B.danger}55`, color: B.danger, borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>Quitar</button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LS}>Nombre completo</label>
                <input value={p.nombre} onChange={e => setPax(i, "nombre", e.target.value)} style={IS} placeholder="Nombre y apellido" autoComplete="off" />
              </div>
              <div>
                <label style={LS}>Cédula / Pasaporte</label>
                <input value={p.cedula} onChange={e => setPax(i, "cedula", e.target.value)} style={IS} placeholder="No. identificación" autoComplete="off" />
              </div>
              <div>
                <label style={LS}>Nacionalidad</label>
                <input value={p.nacionalidad} onChange={e => setPax(i, "nacionalidad", e.target.value)} style={IS} placeholder="Ej: Colombia" autoComplete="off" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addPax} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "none", border: `1px dashed ${B.navyLight}`, color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
          + Agregar otro pasajero
        </button>

        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", marginBottom: 10 }}>
          {filled} de {expected} pasajeros con datos
        </div>

        <button onClick={guardar} disabled={saving}
          style={{ width: "100%", padding: "14px", background: saved ? "#10b981" : B.sand, color: B.navy, border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Guardando…" : saved ? "✓ Guardado — gracias" : "Guardar datos"}
        </button>

        <div style={{ marginTop: 18, fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
          Atolón Beach Club · Puedes volver a esta página y editar antes del zarpe.
        </div>
      </div>
    </div>
  );
}
