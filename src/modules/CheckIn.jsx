import { useState, useEffect, useCallback, useRef } from "react";
import { B, todayStr, COP } from "../brand";
import { logAccion } from "../lib/logAccion";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import jsQR from "jsqr";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const NACS = [
  // Prioritarias
  "Colombiana", "Americana", "Mexicana", "Ecuatoriana", "Peruana",
  "Española", "Chilena", "Brasileña", "Argentina", "Francesa", "Alemana",
  // Resto mundo — orden alfabético
  "Afgana", "Albanesa", "Alemana", "Andorrana", "Angoleña", "Antiguense",
  "Argelina", "Armenia", "Australiana", "Austriaca", "Azerbaiyana",
  "Bahameña", "Bangladesí", "Barbadense", "Bareiní", "Belga", "Beliceña",
  "Beninesa", "Bielorrusa", "Birmana", "Boliviana", "Bosnia", "Botsuanesa",
  "Británica", "Bruneana", "Búlgara", "Burkinesa", "Burundesa",
  "Butanesa", "Caboverdiana", "Camboyana", "Camerunesa", "Canadiense",
  "Catarí", "Chadiana", "Checa", "China", "Chipriota", "Congoleña",
  "Costarricense", "Croata", "Cubana", "Danesa", "Dominicana",
  "Egipcia", "Salvadoreña", "Emiratense", "Eritrea", "Eslovaca",
  "Eslovena", "Etíope", "Fiyiana", "Filipina", "Finlandesa",
  "Gabonesa", "Gambiana", "Georgiana", "Ghanesa", "Gibraltareña",
  "Griega", "Guatemalteca", "Guineana", "Guyanesa", "Haitiana",
  "Hondureña", "Húngara", "India", "Indonesia", "Iraní", "Iraquí",
  "Irlandesa", "Islandesa", "Israelí", "Italiana", "Jamaicana",
  "Japonesa", "Jordana", "Kazaja", "Keniana", "Kirguisa", "Kuwaití",
  "Laosiana", "Letona", "Libanesa", "Liberiana", "Libia", "Liechtensteinesa",
  "Lituana", "Luxemburguesa", "Macedonia", "Malgache", "Malasia",
  "Malaui", "Maldiva", "Maliense", "Maltesa", "Mauritana", "Mauriciana",
  "Moldava", "Monegasca", "Mongola", "Montenegrina", "Mozambiqueña",
  "Namibia", "Nepalesa", "Nicaragüense", "Nigeriana", "Nigerina",
  "Noruega", "Neozelandesa", "Omaní", "Pakistaní", "Palestina",
  "Panameña", "Paraguaya", "Polaca", "Portuguesa", "Puertorriqueña",
  "Británica", "Rumana", "Rusa", "Ruandesa", "Samoana", "Saudi",
  "Senegalesa", "Serbia", "Singapurense", "Siria", "Somalí",
  "Sri Lankesa", "Suafricana", "Sudanesa", "Sueca", "Suiza",
  "Surinamesa", "Tailandesa", "Tanzana", "Tayika", "Togolesa",
  "Tongana", "Trinitense", "Tunecina", "Turca", "Turkmenistana",
  "Ucraniana", "Ugandesa", "Uruguaya", "Uzbeka", "Vaticana",
  "Venezolana", "Vietnamita", "Yemení", "Zambiana", "Zimbabuense",
  "Otra",
];

// helper: is passenger data complete for zarpe?
const paxCompleto = (res) => {
  const paxArr = res.pasajeros || [];
  const total  = (res.pax_a || 0) + (res.pax_n || 0) || res.pax || 1;
  if (paxArr.length < total) return false;
  return paxArr.every(p => p.nombre?.trim() && p.identificacion?.trim());
};

// ─── QR Scanner ──────────────────────────────────────────────────────────────
function QRScanner({ onScan, onClose }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const rafRef     = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            if (active) rafRef.current = requestAnimationFrame(tick);
          });
        }
      })
      .catch(() => setError("No se pudo acceder a la cámara. Asegúrate de dar permiso."));

    const tick = () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) { rafRef.current = requestAnimationFrame(tick); return; }
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        onScan(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: B.white, marginBottom: 16 }}>Apunta al código QR</div>
      {error ? (
        <div style={{ color: B.danger, fontSize: 14, textAlign: "center", padding: "0 24px", marginBottom: 20 }}>{error}</div>
      ) : (
        <div style={{ position: "relative", width: 300, height: 300, borderRadius: 16, overflow: "hidden", border: `3px solid ${B.sand}` }}>
          <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {/* Corner markers */}
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              position: "absolute", width: 30, height: 30,
              top: i < 2 ? 8 : "auto", bottom: i >= 2 ? 8 : "auto",
              left: i % 2 === 0 ? 8 : "auto", right: i % 2 !== 0 ? 8 : "auto",
              borderTop: i < 2 ? `3px solid ${B.sand}` : "none",
              borderBottom: i >= 2 ? `3px solid ${B.sand}` : "none",
              borderLeft: i % 2 === 0 ? `3px solid ${B.sand}` : "none",
              borderRight: i % 2 !== 0 ? `3px solid ${B.sand}` : "none",
            }} />
          ))}
        </div>
      )}
      <button onClick={onClose} style={{ marginTop: 24, padding: "12px 32px", borderRadius: 10, background: B.navyLight, color: B.white, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
    </div>
  );
}

// ─── Build slots from pasadias_org (same logic as ZarpeGrupo) ────────────────
function buildGrupoSlots(pasadiasOrg) {
  const slots = [];
  (pasadiasOrg || []).forEach(p => {
    if (p.tipo === "Impuesto Muelle") return;
    const n = Number(p.personas) || 0;
    for (let i = 0; i < n; i++) {
      slots.push({ slot_id: `${p.id}-${i}`, tipo: p.tipo, idx: i + 1 });
    }
  });
  return slots;
}

// ─── Slot Editor para grupos (edita un slot de zarpe_data) ───────────────────
const AKEY_CONST = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";

function SlotEditorModal({ grupo, slot, onClose, onSaved, embarcaciones = [] }) {
  const [f, setF] = useState({
    nombre:         slot.nombre         || "",
    identificacion: slot.identificacion || "",
    nacionalidad:   slot.nacionalidad   || "Colombiana",
    embarcacion:    slot.embarcacion    || "",
  });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const save = async (hacerCheckin = false) => {
    setSaving(true);
    const now = new Date().toISOString();
    const newZarpe = (grupo.zarpe_data || []).map(z =>
      z.slot_id === slot.slot_id
        ? { ...z, ...f, checkin_at: hacerCheckin ? now : z.checkin_at }
        : z
    );
    await fetch(`https://ncdyttgxuicyruathkxd.supabase.co/rest/v1/eventos?id=eq.${grupo.id}`,
      { method: "PATCH", headers: { apikey: AKEY_CONST, Authorization: `Bearer ${AKEY_CONST}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ zarpe_data: newZarpe }) });
    setSaving(false);
    onSaved(newZarpe);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 18, padding: "26px 24px", width: "100%", maxWidth: 400, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Datos del pasajero</h3>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{slot.tipo}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={LS}>Nombre completo</label>
            <input value={f.nombre} onChange={e => s("nombre", e.target.value)} style={IS} placeholder="Nombre y apellido" autoFocus />
          </div>
          <div>
            <label style={LS}>No. Identificación</label>
            <input value={f.identificacion} onChange={e => s("identificacion", e.target.value)} style={IS} placeholder="CC / Pasaporte" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LS}>Nacionalidad</label>
              <select value={f.nacionalidad} onChange={e => s("nacionalidad", e.target.value)} style={IS}>
                {NACS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {embarcaciones.length > 0 && (
              <div>
                <label style={LS}>Embarcación</label>
                <select value={f.embarcacion} onChange={e => s("embarcacion", e.target.value)} style={IS}>
                  <option value="">Sin asignar</option>
                  {embarcaciones.filter(e => e.estado === "activo").map(e => (
                    <option key={e.id} value={e.nombre}>{e.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => save(false)} disabled={saving || !f.nombre}
            style={{ flex: 1, padding: "11px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            {saving ? "..." : "Guardar"}
          </button>
          <button onClick={() => save(true)} disabled={saving || !f.nombre}
            style={{ flex: 1.5, padding: "11px", background: B.success, color: B.white, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {saving ? "..." : "Guardar y ✓ CI"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Fill Modal — llenar todos los slots sin datos de un grupo ───────────
function BulkFillModal({ grupo, slotsSinDatos, embarcaciones, onClose, onSaved }) {
  const AKEY_BF = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";
  const [rows, setRows]     = useState(slotsSinDatos.map(s => ({ ...s, nombre: "", identificacion: "", nacionalidad: "Colombiana", embarcacion: "" })));
  const [saving, setSaving] = useState(false);

  const upd = (i, k, v) => setRows(prev => prev.map((r, ri) => ri === i ? { ...r, [k]: v } : r));
  const filledCount = rows.filter(r => r.nombre.trim()).length;

  const save = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const zarpeBySlot = Object.fromEntries((grupo.zarpe_data || []).map(z => [z.slot_id, z]));
    rows.filter(r => r.nombre.trim()).forEach(r => {
      zarpeBySlot[r.slot_id] = { slot_id: r.slot_id, tipo: r.tipo, idx: r.idx, nombre: r.nombre.trim(), identificacion: r.identificacion.trim(), nacionalidad: r.nacionalidad, embarcacion: r.embarcacion, checkin_at: now };
    });
    const newZarpe = Object.values(zarpeBySlot);
    await fetch(`https://ncdyttgxuicyruathkxd.supabase.co/rest/v1/eventos?id=eq.${grupo.id}`,
      { method: "PATCH", headers: { apikey: AKEY_BF, Authorization: `Bearer ${AKEY_BF}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ zarpe_data: newZarpe }) });
    setSaving(false);
    onSaved(newZarpe);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 18, padding: "24px", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>📋 Lista de pasajeros</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{slotsSinDatos.length} sin datos · {grupo.nombre}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {rows.map((row, i) => (
            <div key={row.slot_id} style={{ background: B.navy, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>{row.tipo} #{row.idx}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <input value={row.nombre} onChange={e => upd(i, "nombre", e.target.value)}
                    placeholder="Nombre completo" style={IS} />
                </div>
                <input value={row.identificacion} onChange={e => upd(i, "identificacion", e.target.value)}
                  placeholder="CC / Pasaporte" style={IS} />
                <select value={row.nacionalidad} onChange={e => upd(i, "nacionalidad", e.target.value)} style={IS}>
                  {NACS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                {embarcaciones.filter(e => e.estado === "activo").length > 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <select value={row.embarcacion} onChange={e => upd(i, "embarcacion", e.target.value)} style={IS}>
                      <option value="">Sin embarcación</option>
                      {embarcaciones.filter(e => e.estado === "activo").map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 10, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving || filledCount === 0}
            style={{ flex: 2, padding: "12px", background: (saving || filledCount === 0) ? B.navyLight : B.success, color: (saving || filledCount === 0) ? "rgba(255,255,255,0.4)" : B.white, border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: filledCount === 0 ? "default" : "pointer" }}>
            {saving ? "Guardando..." : `✓ Guardar ${filledCount > 0 ? filledCount + " pasajeros" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pasajeros Editor (for zarpe) ────────────────────────────────────────────
function PasajerosModal({ reserva, onClose, onSaved, autoCheckin = false }) {
  const total = (reserva.pax_a || 0) + (reserva.pax_n || 0) || reserva.pax || 1;
  const init  = reserva.pasajeros?.length > 0
    ? reserva.pasajeros
    : Array.from({ length: total }, (_, i) => ({
        nombre: i === 0 ? (reserva.nombre || "") : "",
        identificacion: "",
        nacionalidad: "Colombiana",
      }));
  const [pax, setPax] = useState(init);
  const [saving, setSaving] = useState(false);
  const set = (i, k, v) => setPax(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));

  const save = async () => {
    setSaving(true);
    const updates = { pasajeros: pax };
    if (autoCheckin) updates.checkin_at = new Date().toISOString();
    await supabase.from("reservas").update(updates).eq("id", reserva.id);
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        {autoCheckin && (
          <div style={{ background: B.warning + "22", border: `1px solid ${B.warning}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: B.warning }}>
            ⚠️ Faltan datos para el zarpe. Completa la información para hacer check-in.
          </div>
        )}
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Pasajeros — {reserva.nombre}</h3>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{total} persona{total !== 1 ? "s" : ""}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pax.map((p, i) => (
            <div key={i} style={{ background: B.navy, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, color: B.sand, marginBottom: 10, fontWeight: 700 }}>Pasajero {i + 1}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={LS}>Nombre completo</label>
                  <input value={p.nombre} onChange={e => set(i, "nombre", e.target.value)} style={IS} placeholder="Nombre y apellido" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LS}>No. Identificación</label>
                    <input value={p.identificacion} onChange={e => set(i, "identificacion", e.target.value)} style={IS} placeholder="CC / Pasaporte" />
                  </div>
                  <div>
                    <label style={LS}>Nacionalidad</label>
                    <select value={p.nacionalidad} onChange={e => set(i, "nacionalidad", e.target.value)} style={IS}>
                      {NACS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: "11px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {saving ? "Guardando..." : autoCheckin ? "Guardar y hacer Check-in ✓" : "Guardar pasajeros"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Embarcación Rentada (contratada en muelle) Modal ───────────────────────
// Permite al operador del muelle agregar UNA embarcación que se contrató
// in-situ — el bote queda en `embarcaciones` con propiedad='rentada' y
// estado='activo' inmediatamente, así aparece en todos los selectores
// (asignar pasajeros, despachar grupo, etc.) sin recargar la página.
function EmbarcacionRentadaModal({ onClose, onSaved }) {
  const [f, setF] = useState({
    nombre: "",
    capacidad: "",
    tipo: "",
    capitan: "",
    matricula: "",
    piloto_celular: "",
    costo_renta: "",
    notas: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    setErr("");
    if (!f.nombre.trim()) { setErr("El nombre de la embarcación es obligatorio."); return; }
    if (!f.capacidad || Number(f.capacidad) <= 0) { setErr("La capacidad debe ser mayor a 0 (necesaria para asignar pax)."); return; }
    setSaving(true);
    try {
      // ID corto y legible: EMB-RENT-<timestamp36>
      const id = `EMB-RENT-${Date.now().toString(36).toUpperCase()}`;
      const payload = {
        id,
        nombre: f.nombre.trim(),
        tipo: f.tipo.trim() || "Rentada",
        capacidad: Number(f.capacidad),
        propiedad: "rentada",
        estado: "activo",
        capitan: f.capitan.trim() || null,
        matricula: f.matricula.trim() || null,
        piloto_celular: f.piloto_celular.trim() || null,
        costo_renta: f.costo_renta ? Number(f.costo_renta) : null,
        notas: f.notas.trim() || null,
      };
      const { data, error } = await supabase.from("embarcaciones").insert(payload).select().single();
      if (error) throw error;
      // Audit log
      try { logAccion({ modulo: "checkin", accion: "embarcacion_rentada_creada", tabla: "embarcaciones", registroId: id, datos: payload }); } catch { /* no-op */ }
      onSaved?.(data);
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 26, width: 520, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🛥 Agregar embarcación rentada</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              Bote contratado en muelle — disponible al instante para asignar pasajeros
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LS}>Nombre de la embarcación *</label>
            <input value={f.nombre} onChange={e => set("nombre", e.target.value)}
              placeholder="Ej: Patricia, Don Pedro..." style={IS} autoFocus />
          </div>
          <div>
            <label style={LS}>Capacidad (pax) *</label>
            <input type="number" min="1" value={f.capacidad}
              onChange={e => set("capacidad", e.target.value)} placeholder="Ej: 25" style={IS} />
          </div>
          <div>
            <label style={LS}>Tipo</label>
            <input value={f.tipo} onChange={e => set("tipo", e.target.value)}
              placeholder="Lancha rápida, Yate..." style={IS} />
          </div>
          <div>
            <label style={LS}>Capitán / Piloto</label>
            <input value={f.capitan} onChange={e => set("capitan", e.target.value)}
              placeholder="Nombre del capitán" style={IS} />
          </div>
          <div>
            <label style={LS}>Celular del capitán</label>
            <input value={f.piloto_celular} onChange={e => set("piloto_celular", e.target.value)}
              placeholder="300 1234567" style={IS} />
          </div>
          <div>
            <label style={LS}>Matrícula</label>
            <input value={f.matricula} onChange={e => set("matricula", e.target.value)}
              placeholder="CP-XXXXXX-X" style={IS} />
          </div>
          <div>
            <label style={LS}>Costo de renta (COP)</label>
            <input type="number" min="0" value={f.costo_renta}
              onChange={e => set("costo_renta", e.target.value)} placeholder="Ej: 800000" style={IS} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LS}>Notas</label>
            <input value={f.notas} onChange={e => set("notas", e.target.value)}
              placeholder="Observaciones (cliente, hora estimada, etc.)" style={IS} />
          </div>
        </div>

        {err && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: B.danger + "22", border: `1px solid ${B.danger}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12 }}>
            ⚠ {err}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 600 }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving}
            style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: saving ? B.navyLight : B.success, color: B.navy, cursor: saving ? "wait" : "pointer", fontWeight: 800 }}>
            {saving ? "Guardando…" : "✓ Agregar y dejar disponible"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pasajeros Blue Apple Modal ──────────────────────────────────────────────
// Misma idea que ColaboradoresModal pero para pasajeros que van a Blue Apple
// (no a Atolón). NO cuentan como pasadía pero SÍ ocupan cupo en la lancha
// y aparecen en el zarpe junto a nuestros pasajeros.
function BlueAppleModal({ salidaId, fecha, despacho, embarcaciones = [], onClose, onSaved }) {
  const defaultEmb = embarcaciones.find(e => e.id === "EMB-BLUEAPPLE")?.nombre
    || embarcaciones[0]?.nombre || "";
  const init = despacho?.pasajeros_blueapple?.length > 0
    ? despacho.pasajeros_blueapple
    : [{ nombre: "", cedula: "", nacionalidad: "", embarcacion: defaultEmb }];
  const [paxs, setPaxs] = useState(init);
  const [saving, setSaving] = useState(false);

  const set = (i, k, v) => setPaxs(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const add = () => setPaxs(p => [...p, { nombre: "", cedula: "", nacionalidad: "", embarcacion: defaultEmb }]);
  const remove = (i) => setPaxs(p => p.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    const filtered = paxs.filter(p => p.nombre.trim());
    if (despacho) {
      await supabase.from("salida_despachos").update({ pasajeros_blueapple: filtered }).eq("id", despacho.id);
    } else {
      const id = `DESP-${Date.now()}`;
      await supabase.from("salida_despachos").insert({ id, fecha, salida_id: salidaId, pasajeros_blueapple: filtered });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>🍎 Pasajeros Blue Apple</h3>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
          Van a Blue Apple — no cuentan como pasadía pero SÍ ocupan cupo en la lancha y aparecen en el zarpe.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {paxs.map((p, i) => (
            <div key={i} style={{ background: B.navy, borderRadius: 10, padding: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={LS}>Nombre completo</label>
                    <input value={p.nombre} onChange={e => set(i, "nombre", e.target.value)} style={IS} placeholder="Nombre y apellido" />
                  </div>
                  <div>
                    <label style={LS}>Cédula / Pasaporte</label>
                    <input value={p.cedula} onChange={e => set(i, "cedula", e.target.value)} style={IS} placeholder="No. identificación" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={LS}>Nacionalidad</label>
                    <input value={p.nacionalidad} onChange={e => set(i, "nacionalidad", e.target.value)} style={IS} placeholder="Ej: Colombia, USA" />
                  </div>
                  <div>
                    <label style={LS}>Embarcación</label>
                    <select value={p.embarcacion || ""} onChange={e => set(i, "embarcacion", e.target.value)}
                      style={{ ...IS, cursor: "pointer" }}>
                      <option value="">— Sin asignar —</option>
                      {embarcaciones.map(emb => (
                        <option key={emb.id} value={emb.nombre}>{emb.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <button onClick={() => remove(i)}
                style={{ marginTop: 22, padding: "6px 10px", borderRadius: 8, background: "none", border: `1px solid ${B.danger}44`, color: B.danger, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={add} style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 8, background: "none", border: `1px dashed ${B.navyLight}`, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
          + Agregar pasajero Blue Apple
        </button>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: "11px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {saving ? "Guardando..." : "Guardar pasajeros"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Colaboradores Modal ─────────────────────────────────────────────────────
function ColaboradoresModal({ salidaId, fecha, despacho, embarcaciones = [], onClose, onSaved }) {
  const init = despacho?.colaboradores?.length > 0
    ? despacho.colaboradores
    : [{ nombre: "", cedula: "", rol: "", embarcacion: "" }];
  const [colabs, setColabs] = useState(init);
  const [saving, setSaving] = useState(false);

  const set = (i, k, v) => setColabs(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const add = () => setColabs(p => [...p, { nombre: "", cedula: "", rol: "", embarcacion: "" }]);
  const remove = (i) => setColabs(p => p.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    const filtered = colabs.filter(c => c.nombre.trim());
    if (despacho) {
      await supabase.from("salida_despachos").update({ colaboradores: filtered }).eq("id", despacho.id);
    } else {
      const id = `DESP-${Date.now()}`;
      await supabase.from("salida_despachos").insert({ id, fecha, salida_id: salidaId, colaboradores: filtered });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Colaboradores en embarcación</h3>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>Tripulación y staff que salen con el zarpe</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {colabs.map((c, i) => (
            <div key={i} style={{ background: B.navy, borderRadius: 10, padding: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={LS}>Nombre completo</label>
                    <input value={c.nombre} onChange={e => set(i, "nombre", e.target.value)} style={IS} placeholder="Nombre y apellido" />
                  </div>
                  <div>
                    <label style={LS}>Cédula</label>
                    <input value={c.cedula} onChange={e => set(i, "cedula", e.target.value)} style={IS} placeholder="No. identificación" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={LS}>Rol / Cargo</label>
                    <input value={c.rol} onChange={e => set(i, "rol", e.target.value)} style={IS} placeholder="Ej: Capitán, Salvavidas..." />
                  </div>
                  <div>
                    <label style={LS}>Embarcación</label>
                    <select value={c.embarcacion || ""} onChange={e => set(i, "embarcacion", e.target.value)}
                      style={{ ...IS, cursor: "pointer" }}>
                      <option value="">— Sin asignar —</option>
                      {embarcaciones.map(emb => (
                        <option key={emb.id} value={emb.nombre}>{emb.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <button onClick={() => remove(i)}
                style={{ marginTop: 22, padding: "6px 10px", borderRadius: 8, background: "none", border: `1px solid ${B.danger}44`, color: B.danger, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={add} style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 8, background: "none", border: `1px dashed ${B.navyLight}`, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
          + Agregar colaborador
        </button>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: "11px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {saving ? "Guardando..." : "Guardar colaboradores"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Zarpe PDF (new window) ───────────────────────────────────────────────────
// Guard anti-carrera: evita que dos clicks casi simultáneos de "Generar
// zarpe" para el MISMO (fecha|salida|embarcación) escriban en zarpes_log
// a la vez (causa de los duplicados 09:32 / 09:32).
const _zarpeLogInFlight = new Set();

// Generate zarpe for a SINGLE embarcación
async function generarZarpe(salida, reservas, fecha, despacho, emb) {
  // emb: full embarcacion object — only show passengers assigned to this boat
  const resDeEmb = emb
    ? reservas.filter(r => r.embarcacion_asignada === emb.nombre)
    : reservas; // fallback: all (should not normally happen)

  let rowNum = 1;
  const paxList = resDeEmb.flatMap(r =>
    r.pasajeros?.length > 0
      ? r.pasajeros
      : [{ nombre: r.nombre, identificacion: "—", nacionalidad: "—" }]
  );
  const totalPax = paxList.length;
  // Lista unificada para el zarpe: pasajeros + colaboradores + Blue Apple en
  // una sola tabla. Colaboradores: tag STAFF · rol. Blue Apple: tag BLUE APPLE
  // (no son pasadía pero ocupan cupo en la lancha).
  const colabRows = (despacho?.colaboradores || []).map(c => ({
    nombre:         c.nombre || "—",
    identificacion: c.cedula || "—",
    nacionalidad:   c.rol ? `STAFF · ${c.rol}` : "STAFF",
    _isStaff:       true,
  }));
  // Filtrar Blue Apple pax que van en ESTA embarcación
  const blueAppleRows = (despacho?.pasajeros_blueapple || [])
    .filter(p => !emb || !p.embarcacion || p.embarcacion === emb.nombre)
    .map(p => ({
      nombre:         p.nombre || "—",
      identificacion: p.cedula || "—",
      nacionalidad:   p.nacionalidad ? `🍎 BLUE APPLE · ${p.nacionalidad}` : "🍎 BLUE APPLE",
      _isBlueApple:   true,
    }));
  const fullList = [...paxList, ...colabRows, ...blueAppleRows];

  // ─── Bitácora: registrar el zarpe generado ─────────────────────────────
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email || null;
    let nombre = null;
    if (email) {
      const { data: u } = await supabase.from("usuarios").select("nombre").eq("email", email.toLowerCase()).maybeSingle();
      nombre = u?.nombre || email;
    }
    // Buscar el código de zarpe del despacho de la salida (no del per-emb)
    // — el código se guarda en salida_despachos por fecha+salida_id, y debe
    // aparecer en TODOS los zarpes generados para esa salida.
    let codigoFinal = despacho?.zarpe_codigo || null;
    let despachoIdFinal = despacho?.id || null;
    if (!codigoFinal && salida?.id) {
      const { data: deRow } = await supabase
        .from("salida_despachos")
        .select("id, zarpe_codigo")
        .eq("fecha", fecha)
        .eq("salida_id", salida.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (deRow?.zarpe_codigo) codigoFinal = deRow.zarpe_codigo;
      if (deRow?.id) despachoIdFinal = deRow.id;
    }

    const payload = {
      fecha,
      salida_id:           salida.id,
      salida_hora:         salida.hora,
      salida_nombre:       salida.nombre,
      embarcacion_id:      emb?.id || null,
      embarcacion_nombre:  emb?.nombre || null,
      zarpe_codigo:        codigoFinal,
      pax_total:           totalPax,
      colaboradores_count: despacho?.colaboradores?.length || 0,
      pasajeros_blueapple_count: (blueAppleRows || []).length,
      pasajeros_blueapple:       blueAppleRows || [],
      pasajeros:           paxList,
      colaboradores:       despacho?.colaboradores || [],
      despacho_id:         despachoIdFinal,
      generado_por_email:  email,
      generado_por_nombre: nombre,
    };

    // PREVENIR DUPLICADOS. Clave: (fecha, salida_id, embarcacion_nombre).
    // Antes usaba .maybeSingle(): ante 2+ filas YA duplicadas devolvía
    // null/error → caía en INSERT y duplicaba sin límite (cascada — el
    // patrón 09:32/09:32/09:33/10:57). Ahora: guard anti-carrera en
    // memoria + trae TODAS, UPDATE sobre la más reciente y borra las
    // sobrantes (auto-sana los duplicados ya existentes).
    const dkey = `${fecha}|${salida.id}|${emb?.nombre || ""}`;
    if (!_zarpeLogInFlight.has(dkey)) {
      _zarpeLogInFlight.add(dkey);
      try {
        const { data: prev } = await supabase
          .from("zarpes_log")
          .select("id")
          .eq("fecha", fecha)
          .eq("salida_id", salida.id)
          .eq("embarcacion_nombre", emb?.nombre || "")
          .order("created_at", { ascending: false });
        if (prev && prev.length) {
          await supabase.from("zarpes_log").update(payload).eq("id", prev[0].id);
          const sobrantes = prev.slice(1).map(r => r.id);
          if (sobrantes.length) {
            await supabase.from("zarpes_log").delete().in("id", sobrantes);
          }
        } else {
          await supabase.from("zarpes_log").insert(payload);
        }
      } finally {
        _zarpeLogInFlight.delete(dkey);
      }
    }
  } catch (e) {
    console.warn("No se pudo registrar zarpe en bitácora:", e);
  }

  const bodyRows = fullList.map(p => `<tr${p._isStaff ? ' style="background:#FAF6EE;"' : ''}>
      <td>${rowNum++}</td>
      <td style="font-weight:600${p._isStaff ? ';color:#0D1B3E' : ''}">${p.nombre || "—"}</td>
      <td>${p.identificacion || "—"}</td>
      <td${p._isStaff ? ' style="font-weight:700;color:#7B5E2E;font-size:11px;letter-spacing:0.5px"' : ''}>${p.nacionalidad || "—"}</td>
    </tr>`).join("");

  const boteBlock = emb ? `
    <div style="background:#f4f6fb;border:1px solid #d0d8ee;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
      <div style="font-weight:700;font-size:14px;color:#1E3566;margin-bottom:8px;">🚢 ${emb.nombre}</div>
      <table style="width:100%;font-size:11px;border-collapse:collapse;">
        <tr>
          <td style="padding:3px 8px 3px 0;color:#555;width:90px;">Matrícula:</td>
          <td colspan="3" style="padding:3px 0;font-weight:600;">${emb.matricula || "_______________"}</td>
        </tr>
        <tr style="background:#eef1f8;">
          <td style="padding:4px 8px 4px 0;color:#333;font-weight:700;">Capitán 1</td>
          <td style="padding:4px 8px;color:#555;width:80px;">Nombre:</td>
          <td style="padding:4px 8px;font-weight:600;">${emb.capitan || "_______________"}</td>
          <td></td>
        </tr>
        <tr>
          <td style="padding:3px 8px 3px 0;color:#555;"></td>
          <td style="padding:3px 8px;color:#555;">Cédula:</td>
          <td style="padding:3px 8px;font-weight:600;">${emb.piloto_cedula || "_______________"}</td>
          <td style="padding:3px 0;font-weight:600;color:#555;">Cel: ${emb.piloto_celular || "_______________"}</td>
        </tr>
        <tr style="background:#eef1f8;">
          <td style="padding:4px 8px 4px 0;color:#333;font-weight:700;">Capitán 2</td>
          <td style="padding:4px 8px;color:#555;">Nombre:</td>
          <td style="padding:4px 8px;font-weight:600;">${emb.piloto2_nombre || "_______________"}</td>
          <td></td>
        </tr>
        <tr>
          <td style="padding:3px 8px 3px 0;color:#555;"></td>
          <td style="padding:3px 8px;color:#555;">Cédula:</td>
          <td style="padding:3px 8px;font-weight:600;">${emb.piloto2_cedula || "_______________"}</td>
          <td style="padding:3px 0;font-weight:600;color:#555;">Cel: ${emb.piloto2_celular || "_______________"}</td>
        </tr>
      </table>
    </div>` : "";

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Zarpe — ${emb?.nombre || "General"} — ${salida.nombre} ${salida.hora} — ${fecha}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; padding: 28px 36px; color: #111; font-size: 12px; }
      h1 { font-size: 20px; color: #1E3566; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1E3566; padding-bottom: 14px; margin-bottom: 14px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 24px; margin-bottom: 14px; }
      .meta div { padding: 3px 0; border-bottom: 1px solid #eee; }
      .codigo { font-size: 16px; font-weight: 900; color: #1E3566; letter-spacing: 2px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #1E3566; color: white; padding: 8px; text-align: left; font-size: 11px; }
      td { padding: 7px 8px; border-bottom: 1px solid #eee; }
      tr:nth-child(even):not([style]) { background: #f9f9f9; }
      .footer { margin-top: 16px; font-size: 10px; color: #aaa; text-align: center; }
      @media print { @page { margin: 1cm; } }
    </style>
  </head><body>
    <div class="header">
      <div>
        <h1>ZARPE DE PASAJEROS</h1>
        <div style="color:#666;margin-top:4px">Atolon Beach Club</div>
      </div>
      <div style="text-align:right">
        ${despacho?.zarpe_codigo ? `<div style="margin-bottom:4px;font-size:11px;color:#666">CÓDIGO ZARPE</div><div class="codigo">${despacho.zarpe_codigo}</div>` : `<div style="color:#aaa;font-size:11px">Pendiente código zarpe</div>`}
      </div>
    </div>
    <div class="meta">
      <div><b>Fecha:</b> ${new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</div>
      <div><b>Hora salida:</b> ${salida.hora} &nbsp;·&nbsp; Regreso ${salida.hora_regreso}</div>
      <div><b>Total pasajeros:</b> ${fullList.length}${(despacho?.colaboradores?.length > 0 || blueAppleRows.length > 0) ? ` <span style="color:#666;font-size:11px;">(${totalPax} pasadía${despacho?.colaboradores?.length > 0 ? ` + ${despacho.colaboradores.length} staff` : ""}${blueAppleRows.length > 0 ? ` + ${blueAppleRows.length} Blue Apple` : ""})</span>` : ""}</div>
      <div><b>Salida:</b> Muelle de La Bodeguita</div>
      <div><b>Destino:</b> Boca Chica, Tierra Bomba</div>
      <div><b>Generado:</b> ${new Date().toLocaleString("es-CO")}</div>
    </div>
    ${boteBlock}
    <table>
      <thead><tr>
        <th style="width:5%">#</th>
        <th style="width:42%">Nombre Completo</th>
        <th style="width:30%">No. Identificación</th>
        <th style="width:23%">Nacionalidad</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${(despacho?.colaboradores?.length > 0 || totalPax > 0 || blueAppleRows.length > 0) ? `
    <div style="margin-top:14px;font-size:11px;color:#444;">
      Total a bordo: <b>${fullList.length}</b> persona${fullList.length !== 1 ? "s" : ""} —
      ${totalPax} pasajero${totalPax !== 1 ? "s" : ""}${despacho?.colaboradores?.length > 0 ? ` + ${despacho.colaboradores.length} staff` : ""}${blueAppleRows.length > 0 ? ` + ${blueAppleRows.length} Blue Apple` : ""}
    </div>` : ""}
    <div class="footer">Atolon Beach Club — ${new Date().toLocaleString("es-CO")}</div>
  </body></html>`;

  const fileName = `Zarpe-${emb?.nombre || "General"}-${salida.nombre}-${fecha}.html`;

  // Inject toolbar with View (print) and Download buttons
  const toolbar = `
    <div style="position:fixed;top:0;left:0;right:0;background:#1E3566;padding:10px 20px;display:flex;gap:12px;align-items:center;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.3);no-print">
      <span style="color:#fff;font-weight:700;font-size:14px;flex:1;">📄 Zarpe — ${emb?.nombre || ""} · ${salida.nombre} ${salida.hora} · ${fecha}</span>
      <button onclick="window.print()" style="padding:8px 20px;background:#C8B596;color:#0D1B3E;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">🖨 Imprimir / Ver PDF</button>
      <button onclick="(function(){var a=document.createElement('a');a.href='data:text/html;charset=utf-8,'+encodeURIComponent(document.documentElement.outerHTML);a.download='${fileName}';a.click();})()" style="padding:8px 20px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">⬇ Descargar</button>
      <button onclick="window.close()" style="padding:8px 14px;background:none;color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:13px;cursor:pointer;">✕ Cerrar</button>
    </div>
    <div style="height:52px"></div>`;

  const htmlWithToolbar = html.replace("<body>", `<body>${toolbar}`).replace(
    "@media print { @page { margin: 1cm; } }",
    "@media print { @page { margin: 1cm; } .no-print,[onclick*='close'],[onclick*='download'],[onclick*='print'] { display:none!important; } div[style*='position:fixed'] { display:none!important; } div[style*='height:52px'] { display:none!important; } }"
  );

  const win = window.open("", "_blank");
  win.document.write(htmlWithToolbar);
  win.document.close();
}

// ─── Zarpe Codigo Row — una fila por embarcación despachada ──────────────────
function ZarpeCodigoRow({ desp, setDespachos }) {
  const [editing, setEditing] = useState(false);
  const [input,   setInput]   = useState(desp.zarpe_codigo || "");
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    if (!input.trim()) return;
    setSaving(true);
    const code = input.trim();
    await supabase.from("salida_despachos")
      .update({ zarpe_codigo: code, zarpe_generado: true })
      .eq("id", desp.id);
    // El código también debe reflejarse en zarpes_log (módulo Zarpes), que
    // se creó al hacer el check-in ANTES de tener el código. Aplica a TODOS
    // los zarpes de esa salida+fecha (el código es por salida, no por emb).
    if (desp.fecha && desp.salida_id) {
      await supabase.from("zarpes_log")
        .update({ zarpe_codigo: code })
        .eq("fecha", desp.fecha)
        .eq("salida_id", desp.salida_id);
    }
    setDespachos(prev => prev.map(d =>
      d.id === desp.id ? { ...d, zarpe_codigo: code, zarpe_generado: true } : d
    ));
    setSaving(false);
    setEditing(false);
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: B.sand, marginBottom: 6 }}>
        🚢 {desp.embarcacion_nombre || "Embarcación"} &nbsp;·&nbsp;
        ✈ {new Date(desp.despachado_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
      </div>
      {desp.zarpe_codigo && !editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 4, color: B.sky }}>{desp.zarpe_codigo}</span>
          <button onClick={() => { setInput(desp.zarpe_codigo); setEditing(true); }}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
            Cambiar
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder="Código zarpe..."
            onKeyDown={e => e.key === "Enter" && save()}
            style={{ ...IS, flex: 1, fontSize: 14, fontWeight: 700, letterSpacing: 3 }}
          />
          <button onClick={save} disabled={saving || !input.trim()}
            style={{ padding: "8px 14px", borderRadius: 8, background: B.sand, color: B.navy, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {saving ? "..." : "Guardar"}
          </button>
          {editing && (
            <button onClick={() => setEditing(false)}
              style={{ padding: "8px 12px", borderRadius: 8, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function CheckIn() {
  const isMobile = useMobile();
  const [fecha,          setFecha]          = useState(todayStr());
  const [salidas,        setSalidas]        = useState([]);
  const [reservas,       setReservas]       = useState([]);
  const [despachos,      setDespachos]      = useState([]);
  const [embarcaciones,  setEmbarcaciones]  = useState([]);
  const [overrides,      setOverrides]      = useState([]);
  const [tabSalida,      setTabSalida]      = useState(null);
  const [scanning,       setScanning]       = useState(false);
  const [scanMsg,        setScanMsg]        = useState(null); // { ok, text }
  const [editPax,        setEditPax]        = useState(null); // reserva to edit pasajeros
  const [editColabs,     setEditColabs]     = useState(false);
  const [editBlueApple,  setEditBlueApple]  = useState(false);
  const [qrReserva,      setQrReserva]      = useState(null);
  const [confirmCheckin, setConfirmCheckin] = useState(null);
  const [ciPax,          setCiPax]          = useState(null); // pax override for check-in
  const [ciSaving,       setCiSaving]       = useState(false);
  const [despacharModal, setDespacharModal] = useState(null); // { salida, allEmbs }
  const [search,         setSearch]         = useState("");
  const [loading,        setLoading]        = useState(true);
  const [grupos,         setGrupos]         = useState([]);
  const [tabGrupo,       setTabGrupo]       = useState(null);
  const [editSlot,       setEditSlot]       = useState(null); // { grupo, slot }
  const [qrGrupo,        setQrGrupo]        = useState(null); // { grupo, slot? }
  const [bulkFill,       setBulkFill]       = useState(null); // grupo
  const [grupoEmbModal,  setGrupoEmbModal]  = useState(null); // grupo
  const [showAddEmb,     setShowAddEmb]     = useState(false);  // modal "agregar embarcación rentada"

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const SURL = "https://ncdyttgxuicyruathkxd.supabase.co";
    const AKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";
    const [salR, resR, desR, embR, ovrR, grpR] = await Promise.all([
      supabase.from("salidas").select("*").eq("activo", true).order("orden"),
      supabase.from("reservas").select("*").eq("fecha", fecha).neq("estado", "cancelado").order("nombre"),
      supabase.from("salida_despachos").select("*").eq("fecha", fecha),
      supabase.from("embarcaciones").select("*").order("nombre"),
      supabase.from("salidas_override").select("*").eq("fecha", fecha),
      fetch(`${SURL}/rest/v1/eventos?fecha=eq.${fecha}&categoria=eq.grupo&select=id,nombre,pasadias_org,salidas_grupo,zarpe_data`,
        { headers: { apikey: AKEY, Authorization: `Bearer ${AKEY}` } }).then(r => r.json()).catch(() => []),
    ]);
    const res = resR.data || [];
    const salsConPax = (salR.data || []).filter(s => res.some(r => r.salida_id === s.id));
    setSalidas(salsConPax);
    setReservas(res);
    setDespachos(desR.data || []);
    setEmbarcaciones(embR.data || []);
    setOverrides(ovrR.data || []);
    setGrupos(Array.isArray(grpR) ? grpR : []);
    if (salsConPax.length > 0 && !tabSalida) setTabSalida(salsConPax[0].id);
    setLoading(false);
  }, [fecha]);

  useEffect(() => { load(); }, [load]);

  // Helper: embarcaciones disponibles para una salida específica.
  // Combina: base (whitelist de salida.embarcaciones) + extras del día
  // (salidas_override.extra_embarcaciones) + Blue Apple (siempre) + TODAS las
  // RENTADAS ACTIVAS (las que el operador agregó en muelle "+ Embarcación
  // rentada"). Las rentadas no están en el whitelist de ninguna salida pero
  // por su naturaleza ad-hoc deben aparecer en cualquier salida del día.
  const embsParaSalida = useCallback((salida) => {
    if (!salida) return [];
    const override = overrides.find(o => o.salida_id === salida.id);
    const baseEmbs = (salida.embarcaciones || [])
      .map(eid => embarcaciones.find(e => e.id === eid))
      .filter(Boolean);
    const extraEmbs = (override?.extra_embarcaciones || [])
      .map(e => embarcaciones.find(eb => eb.id === e.id) || e)
      .filter(e => !baseEmbs.some(b => b.id === e.id));
    const blueApple = embarcaciones.find(e => e.id === "EMB-BLUEAPPLE");
    const conBA = blueApple && !baseEmbs.some(b => b.id === "EMB-BLUEAPPLE") && !extraEmbs.some(b => b.id === "EMB-BLUEAPPLE")
      ? [...baseEmbs, ...extraEmbs, blueApple]
      : [...baseEmbs, ...extraEmbs];
    const yaIncluidos = new Set(conBA.map(e => e.id));
    // Rentadas: SOLO las que se contrataron HOY (la `fecha` seleccionada en
    // Check-in). Si quedan activas en DB pero fueron de un día anterior, no
    // aparecen — evitamos que el operador las vea día tras día. La identidad
    // del día se mide en zona Bogotá para no fallar después de las 7pm UTC-5.
    const rentadasDelDia = embarcaciones.filter(e => {
      if (e.propiedad !== "rentada" || e.estado !== "activo") return false;
      if (yaIncluidos.has(e.id)) return false; // ej: Blue Apple ya incluido
      if (!e.created_at) return false;
      const diaCreacion = new Date(e.created_at).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      return diaCreacion === fecha;
    });
    return [...conBA, ...rentadasDelDia];
  }, [embarcaciones, overrides, fecha]);

  const AKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";

  const checkinPaxGrupo = async (grupo, slotId) => {
    const now = new Date().toISOString();
    const newZarpe = (grupo.zarpe_data || []).map(z =>
      z.slot_id === slotId ? { ...z, checkin_at: z.checkin_at ? null : now } : z
    );
    await fetch(`https://ncdyttgxuicyruathkxd.supabase.co/rest/v1/eventos?id=eq.${grupo.id}`,
      { method: "PATCH", headers: { apikey: AKEY, Authorization: `Bearer ${AKEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ zarpe_data: newZarpe }) });
    setGrupos(prev => prev.map(g => g.id === grupo.id ? { ...g, zarpe_data: newZarpe } : g));
  };

  const checkinTodosGrupo = async (grupo) => {
    const now = new Date().toISOString();
    const newZarpe = (grupo.zarpe_data || []).map(z =>
      z.nombre && !z.checkin_at && !z.no_show ? { ...z, checkin_at: now } : z
    );
    await fetch(`https://ncdyttgxuicyruathkxd.supabase.co/rest/v1/eventos?id=eq.${grupo.id}`,
      { method: "PATCH", headers: { apikey: AKEY, Authorization: `Bearer ${AKEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ zarpe_data: newZarpe }) });
    setGrupos(prev => prev.map(g => g.id === grupo.id ? { ...g, zarpe_data: newZarpe } : g));
  };

  const despacharGrupo = async (grupo, embNombre) => {
    const existing = despachos.find(d => d.salida_id === grupo.id);
    if (existing) {
      if (!window.confirm(`Este grupo ya fue despachado${existing.embarcacion_nombre ? ` en ${existing.embarcacion_nombre}` : ""}. ¿Registrar de nuevo?`)) return;
      await supabase.from("salida_despachos").delete().eq("id", existing.id);
    }
    const id = `DESP-${Date.now()}`;
    const rec = { id, fecha, salida_id: grupo.id, embarcacion_nombre: embNombre || null, despachado_at: new Date().toISOString() };
    await supabase.from("salida_despachos").insert(rec);
    setDespachos(prev => [...prev.filter(d => d.salida_id !== grupo.id), rec]);
    setGrupoEmbModal(null);
  };

  const saveSlotEmbarcacion = async (grupo, slotId, embNombre) => {
    const allSlots  = buildGrupoSlots(grupo.pasadias_org);
    const zarpeBySlot = Object.fromEntries((grupo.zarpe_data || []).map(z => [z.slot_id, z]));
    const newZarpe = allSlots.map(s => {
      const existing = zarpeBySlot[s.slot_id] || s;
      return s.slot_id === slotId ? { ...existing, embarcacion: embNombre || null } : existing;
    });
    await fetch(`https://ncdyttgxuicyruathkxd.supabase.co/rest/v1/eventos?id=eq.${grupo.id}`,
      { method: "PATCH", headers: { apikey: AKEY, Authorization: `Bearer ${AKEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ zarpe_data: newZarpe }) });
    setGrupos(prev => prev.map(g => g.id === grupo.id ? { ...g, zarpe_data: newZarpe } : g));
  };

  const noShowPaxGrupo = async (grupo, slotId) => {
    // Build full slot list, merge with zarpe_data, toggle no_show on the target slot
    const allSlots = buildGrupoSlots(grupo.pasadias_org);
    const zarpeBySlot = Object.fromEntries((grupo.zarpe_data || []).map(z => [z.slot_id, z]));
    const newZarpe = allSlots.map(s => {
      const existing = zarpeBySlot[s.slot_id] || s;
      if (s.slot_id === slotId) {
        return { ...existing, no_show: !existing.no_show, checkin_at: null };
      }
      return existing;
    });
    await fetch(`https://ncdyttgxuicyruathkxd.supabase.co/rest/v1/eventos?id=eq.${grupo.id}`,
      { method: "PATCH", headers: { apikey: AKEY, Authorization: `Bearer ${AKEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ zarpe_data: newZarpe }) });
    setGrupos(prev => prev.map(g => g.id === grupo.id ? { ...g, zarpe_data: newZarpe } : g));
  };

  // ── Check-in: muestra confirmación, nunca bloquea por falta de zarpe
  const doCheckin = async (res, paxOverride) => {
    setCiSaving(true);
    const val = new Date().toISOString();
    const paxFinal = paxOverride ?? res.pax;
    const updates = { checkin_at: val, estado: "check_in" };
    if (paxFinal !== res.pax) updates.pax_checkin = paxFinal; // save actual pax that showed up
    const { error } = await supabase.from("reservas").update(updates).eq("id", res.id);
    if (error) { alert(`Error al guardar check-in: ${error.message}`); setCiSaving(false); return; }
    logAccion({ modulo: "checkin", accion: "check_in", tabla: "reservas", registroId: res.id,
      datosAntes: { checkin_at: null, estado: res.estado },
      datosDespues: { checkin_at: val, estado: "check_in", pax_checkin: paxFinal },
      notas: `${res.nombre} · ${paxFinal}/${res.pax} pax` });
    setReservas(prev => prev.map(r => r.id === res.id ? { ...r, checkin_at: val, estado: "check_in", pax_checkin: paxFinal } : r));
    setCiSaving(false);
    setConfirmCheckin(null);
  };

  const doNoShow = async (res) => {
    setCiSaving(true);
    const { error } = await supabase.from("reservas").update({ estado: "no_show", checkin_at: null }).eq("id", res.id);
    if (error) { alert(`Error al guardar no-show: ${error.message}`); setCiSaving(false); return; }
    logAccion({ modulo: "checkin", accion: "no_show", tabla: "reservas", registroId: res.id,
      datosAntes: { estado: res.estado },
      datosDespues: { estado: "no_show" },
      notas: `${res.nombre} · ${res.pax} pax`,
    });
    setReservas(prev => prev.map(r => r.id === res.id ? { ...r, estado: "no_show", checkin_at: null } : r));
    setCiSaving(false);
  };

  const doUnNoShow = async (res) => {
    await supabase.from("reservas").update({ estado: "confirmado" }).eq("id", res.id);
    logAccion({ modulo: "checkin", accion: "revertir_no_show", tabla: "reservas", registroId: res.id,
      datosAntes: { estado: "no_show" },
      datosDespues: { estado: "confirmado" },
      notas: `${res.nombre} · ${res.pax} pax`,
    });
    setReservas(prev => prev.map(r => r.id === res.id ? { ...r, estado: "confirmado" } : r));
  };

  const doUnCheckin = async (res) => {
    await supabase.from("reservas").update({ checkin_at: null, estado: "confirmado" }).eq("id", res.id);
    logAccion({ modulo: "checkin", accion: "revertir_checkin", tabla: "reservas", registroId: res.id,
      datosAntes: { checkin_at: res.checkin_at, estado: "check_in" },
      datosDespues: { checkin_at: null, estado: "confirmado" } });
    setReservas(prev => prev.map(r => r.id === res.id ? { ...r, checkin_at: null, estado: "confirmado" } : r));
  };

  // Mantener toggleCheckin para el escáner QR (que ya confirmó por escaneo)
  const toggleCheckin = async (res) => {
    if (res.checkin_at) { await doUnCheckin(res); return; }
    await doCheckin(res);
  };

  // ── QR scan result
  const handleScan = async (raw) => {
    setScanning(false);
    const res = reservas.find(r => r.id === raw || r.qr_code === raw);
    if (!res) {
      setScanMsg({ ok: false, text: `QR no encontrado: ${raw}` });
    } else if (res.checkin_at) {
      setScanMsg({ ok: false, text: `${res.nombre} ya hizo check-in` });
    } else {
      await toggleCheckin(res);
      setScanMsg({ ok: true, text: `✓ Check-in: ${res.nombre} (${res.pax} pax)` });
      setTabSalida(res.salida_id);
    }
    setTimeout(() => setScanMsg(null), 3500);
  };

  // ── Despachar una embarcación específica
  // Bloqueo: si ya está despachada en este (fecha + salida + embarcación)
  // NO se permite re-despachar. Se debe corregir en DB si fue error.
  const despachar = async (salida, embNombre) => {
    const existing = despachos.find(d => d.salida_id === salida.id && d.embarcacion_nombre === embNombre);
    if (existing) {
      alert(`${embNombre} ya fue despachada en ${salida.nombre} ${salida.hora}. No se puede volver a despachar en este horario.`);
      return;
    }
    const embObj = embarcaciones.find(e => e.nombre === embNombre);
    const id = `DESP-${Date.now()}`;
    const rec = {
      id, fecha,
      salida_id: salida.id,
      embarcacion_nombre: embNombre,
      embarcacion_id: embObj?.id || null,
      despachado_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("salida_despachos").insert(rec);
    if (error) {
      // 23505 = índice único (fecha, salida_id, embarcacion): ya hay un
      // despacho para esa embarcación programada en ese horario. Es la
      // regla de negocio, no un error técnico — refrescamos y avisamos.
      if (error.code === "23505") {
        alert(`${embNombre} ya fue despachada en ${salida.nombre} ${salida.hora}. Solo se permite 1 despacho por embarcación en ese horario.`);
        const { data: fresh } = await supabase.from("salida_despachos").select("*").eq("fecha", fecha);
        if (fresh) setDespachos(fresh);
        setDespacharModal(null);
        return;
      }
      alert(`Error al despachar ${embNombre}:\n${error.message}`);
      return;
    }
    logAccion({ modulo: "checkin", accion: "despachar_embarcacion", tabla: "salida_despachos", registroId: id,
      datosDespues: rec, notas: `${embNombre} · ${salida.nombre} ${salida.hora}` });
    setDespachos(prev => [...prev, rec]);
    setDespacharModal(null);
  };

  // ── Click en botón Despachar: si hay 1 bote → directo; si hay varios → modal
  const handleDespachar = (salida, allEmbs) => {
    if (allEmbs.length <= 1) {
      despachar(salida, allEmbs[0]?.nombre || salida.nombre);
    } else {
      setDespacharModal({ salida, allEmbs });
    }
  };

  const assignEmbarcacion = async (resId, nombre) => {
    const val = nombre || null;
    // Validar capacidad: pasajeros ya asignados + nuevos pax + staff <= capacidad
    if (val) {
      const emb = embarcaciones.find(e => e.nombre === val);
      const cap = Number(emb?.capacidad) || 0;
      if (cap > 0) {
        // Reservas YA asignadas a este bote (excluyendo la que se está reasignando)
        const reservaActual = reservas.find(r => r.id === resId);
        const paxActual = Number(reservaActual?.pax || 0);
        const paxYaAsignados = reservas
          .filter(r => r.id !== resId && r.embarcacion_asignada === val && r.salida_id === reservaActual?.salida_id)
          .reduce((s, r) => s + Number(r.pax || 0), 0);
        // Staff en despacho de esta salida con embarcacion=val (o sin embarcacion = van a cualquiera)
        const desp = despachos.filter(d => d.salida_id === reservaActual?.salida_id);
        const staffMap = new Map();
        desp.forEach(d => (d.colaboradores || []).forEach(c => {
          const k = (c.cedula || "") + "|" + (c.nombre || "").toLowerCase().trim();
          if (!staffMap.has(k) && (!c.embarcacion || c.embarcacion === val)) staffMap.set(k, c);
        }));
        const staffCount = staffMap.size;
        const totalSiAsigno = paxYaAsignados + paxActual + staffCount;
        if (totalSiAsigno > cap) {
          alert(
            `⚠️ Capacidad excedida\n\n` +
            `${val} tiene capacidad ${cap} personas.\n\n` +
            `· Pasajeros ya asignados: ${paxYaAsignados}\n` +
            `· Esta reserva: ${paxActual}\n` +
            `· Staff/colaboradores: ${staffCount}\n` +
            `· TOTAL si se asigna: ${totalSiAsigno}\n\n` +
            `Excede la capacidad por ${totalSiAsigno - cap} persona${totalSiAsigno - cap !== 1 ? "s" : ""}. ` +
            `Asigna a otra embarcación o reduce la cantidad de pax/staff.`
          );
          return;
        }
      }
    }
    await supabase.from("reservas").update({ embarcacion_asignada: val }).eq("id", resId);
    setReservas(prev => prev.map(r => r.id === resId ? { ...r, embarcacion_asignada: val } : r));
  };

  const salida = salidas.find(s => s.id === tabSalida);
  const resDesal = reservas.filter(r => r.salida_id === tabSalida);
  const resFiltradas = search
    ? resDesal.filter(r => r.nombre?.toLowerCase().includes(search.toLowerCase()))
    : resDesal;
  const despachosDesal = despachos.filter(d => d.salida_id === tabSalida); // uno por embarcación
  const despacho = despachosDesal[0] || null; // compat: colaboradores usan el primero
  const checkedIn = resDesal.filter(r => r.checkin_at).reduce((s, r) => s + (r.pax || 0), 0);
  const totalPax  = resDesal.reduce((s, r) => s + (r.pax || 0), 0);

  const tieneZarpe = resDesal.some(r => r.pasajeros?.length > 0);
  const [zarpeInput, setZarpeInput] = useState("");
  const [zarpeSaving, setZarpeSaving] = useState(false);

  const guardarZarpeCodigo = async () => {
    if (!despacho || !zarpeInput.trim()) return;
    setZarpeSaving(true);
    await supabase.from("salida_despachos").update({ zarpe_codigo: zarpeInput.trim(), zarpe_generado: true }).eq("id", despacho.id);
    setDespachos(prev => prev.map(d => d.id === despacho.id ? { ...d, zarpe_codigo: zarpeInput.trim(), zarpe_generado: true } : d));
    setZarpeInput("");
    setZarpeSaving(false);
  };

  return (
    <>
      {scanning && <QRScanner onScan={handleScan} onClose={() => setScanning(false)} />}
      {editPax  && <PasajerosModal reserva={editPax} autoCheckin={!!editPax._autoCheckin} onClose={() => setEditPax(null)} onSaved={load} />}

      {/* ── Editor de slot de grupo ── */}
      {editSlot && (
        <SlotEditorModal
          grupo={editSlot.grupo}
          slot={editSlot.slot}
          embarcaciones={embarcaciones}
          onClose={() => setEditSlot(null)}
          onSaved={(newZarpe) => {
            setGrupos(prev => prev.map(g => g.id === editSlot.grupo.id ? { ...g, zarpe_data: newZarpe } : g));
          }}
        />
      )}

      {/* ── Bulk Fill Modal ── */}
      {bulkFill && (() => {
        const g = bulkFill;
        const allGrupoSlots = buildGrupoSlots(g.pasadias_org);
        const zarpeBySlot   = Object.fromEntries((g.zarpe_data || []).map(z => [z.slot_id, z]));
        const sinDatos      = allGrupoSlots.filter(s => !(zarpeBySlot[s.slot_id]?.nombre) && !(zarpeBySlot[s.slot_id]?.no_show));
        return (
          <BulkFillModal
            grupo={g}
            slotsSinDatos={sinDatos}
            embarcaciones={embarcaciones}
            onClose={() => setBulkFill(null)}
            onSaved={newZarpe => setGrupos(prev => prev.map(gr => gr.id === g.id ? { ...gr, zarpe_data: newZarpe } : gr))}
          />
        );
      })()}

      {/* Modal: agregar embarcación rentada en muelle.
          Al guardar la insertamos en el state local para que aparezca
          inmediatamente en todos los selectores sin recargar la página. */}
      {showAddEmb && (
        <EmbarcacionRentadaModal
          onClose={() => setShowAddEmb(false)}
          onSaved={(emb) => {
            if (emb) setEmbarcaciones(prev => [...prev, emb].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")));
            setShowAddEmb(false);
            // Refresh completo en background para sincronizar con DB
            load();
          }}
        />
      )}

      {/* ── QR zarpe grupo ── */}
      {qrGrupo && (() => {
        const { grupo, slot } = qrGrupo;
        const baseUrl = `${window.location.origin}/zarpe-grupo?ev=${grupo.id}`;
        // Sin slot → modo kiosk (un pasajero a la vez)
        const invitado = slot ? (grupo.invitados_zarpe || []).find(inv => (inv.slot_ids || []).includes(slot.slot_id)) : null;
        const url = !slot ? `${baseUrl}&mode=kiosk` : invitado ? `${baseUrl}&tok=${invitado.tok}` : baseUrl;
        const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&color=0D1B3E&bgcolor=FFFFFF&data=${encodeURIComponent(url)}`;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998, padding: 16 }}
            onClick={e => e.target === e.currentTarget && setQrGrupo(null)}>
            <div style={{ background: B.navyMid, borderRadius: 22, padding: "28px 24px", width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: B.white, marginBottom: 4 }}>
                {slot ? "Check-in del pasajero" : "📲 QR Kiosk"}
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>
                {slot ? `${slot.tipo} · Pasajero ${slot.idx}` : grupo.nombre}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20 }}>
                {slot ? "Muéstrale este QR para que llene sus datos" : "Cada pasajero escanea, llena sus datos y pasa al siguiente"}
              </div>
              <div style={{ background: "#fff", borderRadius: 18, padding: 16, display: "inline-block", marginBottom: 14 }}>
                <img src={qrImg} alt="QR zarpe grupo" width={220} height={220} style={{ display: "block", borderRadius: 6 }} />
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 20, wordBreak: "break-all" }}>{url}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setQrGrupo(null)}
                  style={{ flex: 1, padding: "12px", borderRadius: 10, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
                  Cerrar
                </button>
                {slot && (
                  <button onClick={() => { setEditSlot({ grupo, slot }); setQrGrupo(null); }}
                    style={{ flex: 1.5, padding: "12px", borderRadius: 10, background: B.sand, color: B.navy, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    📋 Llenar aquí
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Confirmación de Check-in ── */}
      {confirmCheckin && (() => {
        const faltaZarpe = !paxCompleto(confirmCheckin);
        const saldo = confirmCheckin.saldo || 0;
        return (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9997, padding: 16 }}
            onClick={e => e.target === e.currentTarget && setConfirmCheckin(null)}>
            <div style={{ background: B.navyMid, borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 360, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>

              {/* Header */}
              <div style={{ fontSize: 20, fontWeight: 800, color: B.white, marginBottom: 4 }}>¿Está en el muelle?</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>{confirmCheckin.nombre}</div>

              {/* Pax editor */}
              <div style={{ background: B.navy, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>PERSONAS QUE LLEGAN</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Reserva: {confirmCheckin.pax} pax</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => setCiPax(p => Math.max(1, (p ?? confirmCheckin.pax) - 1))}
                    style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>−</button>
                  <span style={{ fontSize: 26, fontWeight: 800, color: (ciPax ?? confirmCheckin.pax) < confirmCheckin.pax ? B.warning : B.sand, minWidth: 32, textAlign: "center" }}>
                    {ciPax ?? confirmCheckin.pax}
                  </span>
                  <button onClick={() => setCiPax(p => Math.min(confirmCheckin.pax, (p ?? confirmCheckin.pax) + 1))}
                    style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
                </div>
              </div>

              {/* Alerta saldo pendiente — no aplica para CXC */}
              {saldo > 0 && confirmCheckin.forma_pago !== "CXC" && (
                <div style={{ background: "#E8402018", border: "1px solid #E8402066", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, color: "#FF6B6B", fontWeight: 700, marginBottom: 2 }}>
                    💳 Saldo pendiente de cobro
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#FF6B6B", letterSpacing: "-0.5px" }}>
                    {COP(saldo)}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,100,100,0.6)", marginTop: 3 }}>
                    Total: {COP(confirmCheckin.total)} · Abono: {COP(confirmCheckin.abono || 0)}
                  </div>
                </div>
              )}

              {/* Alerta zarpe si faltan datos */}
              {faltaZarpe && (
                <div style={{ background: "#E8A02018", border: "1px solid #E8A02044", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
                  <div style={{ fontSize: 13, color: "#E8A020", marginBottom: 10 }}>
                    ⚠️ Faltan datos de zarpe (nombre e ID de pasajeros).
                  </div>
                  <button
                    onClick={() => { setQrReserva(confirmCheckin); setConfirmCheckin(null); }}
                    style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, background: "#E8A02022", border: "1px solid #E8A02055", color: "#E8A020", cursor: "pointer", fontWeight: 600 }}>
                    📋 Completar datos ahora
                  </button>
                </div>
              )}

              {/* Acciones */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setConfirmCheckin(null)}
                  style={{ flex: 1, padding: "13px", borderRadius: 10, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button
                  onClick={() => doCheckin(confirmCheckin, ciPax)}
                  disabled={ciSaving}
                  style={{ flex: 2, padding: "13px", borderRadius: 10, background: B.success, color: B.navy, border: "none", fontWeight: 800, fontSize: 14, cursor: ciSaving ? "default" : "pointer" }}>
                  {ciSaving ? "..." : `✓ Check-in · ${ciPax ?? confirmCheckin.pax} pax`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* QR Check-in propio */}
      {qrReserva && (() => {
        const selfUrl = `${window.location.origin}/checkin-pax?rid=${qrReserva.id}`;
        const qrImg   = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&color=0D1B3E&bgcolor=FFFFFF&data=${encodeURIComponent(selfUrl)}`;
        return (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998, padding: 16 }}
            onClick={e => e.target === e.currentTarget && setQrReserva(null)}>
            <div style={{ background: B.navyMid, borderRadius: 22, padding: "30px 28px", width: "100%", maxWidth: 360, textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
              {/* Title */}
              <div style={{ fontSize: 18, fontWeight: 800, color: B.white, marginBottom: 4 }}>Check-in del pasajero</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 22, lineHeight: 1.5 }}>
                {qrReserva.nombre} · {qrReserva.pax} pax<br />
                <span style={{ fontSize: 11 }}>Muéstrale este QR para que llene sus datos</span>
              </div>

              {/* QR code */}
              <div style={{ background: "#fff", borderRadius: 18, padding: 14, display: "inline-block", marginBottom: 18 }}>
                <img src={qrImg} alt="QR check-in" width={220} height={220} style={{ display: "block", borderRadius: 6 }} />
              </div>

              {/* URL hint */}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 22, wordBreak: "break-all" }}>
                {selfUrl}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setQrReserva(null)}
                  style={{ flex: 1, padding: "12px", borderRadius: 10, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
                  Cerrar
                </button>
                <button
                  onClick={() => { setEditPax(qrReserva); setQrReserva(null); }}
                  style={{ flex: 1.5, padding: "12px", borderRadius: 10, background: B.sand, color: B.navy, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  📋 Llenar aquí
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {editColabs && salida && (() => {
        // Lista de embarcaciones para esta salida: base + extras + Blue Apple + rentadas activas
        const allEmbs = embsParaSalida(salida);
        return (
          <ColaboradoresModal
            salidaId={salida.id}
            fecha={fecha}
            despacho={despacho}
            embarcaciones={allEmbs}
            onClose={() => setEditColabs(false)}
            onSaved={load}
          />
        );
      })()}
      {editBlueApple && salida && (() => {
        const allEmbs = embsParaSalida(salida);
        return (
          <BlueAppleModal
            salidaId={salida.id}
            fecha={fecha}
            despacho={despacho}
            embarcaciones={allEmbs}
            onClose={() => setEditBlueApple(false)}
            onSaved={load}
          />
        );
      })()}

      {/* ── Modal: seleccionar embarcación para despachar ── */}
      {despacharModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9997, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setDespacharModal(null)}>
          <div style={{ background: B.navyMid, borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 380, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: B.white, marginBottom: 4 }}>¿Qué embarcación sale?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
              {despacharModal.salida.nombre} &nbsp;·&nbsp; {despacharModal.salida.hora}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {despacharModal.allEmbs.map(emb => {
                const yaDespachada = despachosDesal.some(d => d.embarcacion_nombre === emb.nombre);
                return (
                  <button key={emb.id} onClick={() => despachar(despacharModal.salida, emb.nombre)}
                    style={{
                      padding: "14px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer", border: "none",
                      background: yaDespachada ? B.success + "22" : B.navy,
                      outline: `2px solid ${yaDespachada ? B.success + "66" : B.navyLight}`,
                      color: yaDespachada ? B.success : B.white,
                    }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>🚢 {emb.nombre}</div>
                    {yaDespachada && <div style={{ fontSize: 12, marginTop: 3, color: B.success }}>✈ Ya despachada — registrar de nuevo</div>}
                    {emb.capitan && !yaDespachada && <div style={{ fontSize: 12, marginTop: 3, color: "rgba(255,255,255,0.4)" }}>Capitán: {emb.capitan}</div>}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setDespacharModal(null)}
              style={{ marginTop: 16, width: "100%", padding: "11px", borderRadius: 10, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Scan feedback toast */}
      {scanMsg && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: scanMsg.ok ? B.success : B.danger, color: B.white,
          padding: "14px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 9998,
        }}>{scanMsg.text}</div>
      )}

      <div>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 600, margin: 0 }}>Check-in · Muelle</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setShowAddEmb(true)}
                title="Agregar embarcación rentada en muelle (queda disponible al instante)"
                style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 10, padding: isMobile ? "10px 14px" : "12px 18px", fontWeight: 700, fontSize: isMobile ? 13 : 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                🛥 {isMobile ? "+ Embarcación" : "+ Embarcación rentada"}
              </button>
              <button onClick={() => setScanning(true)}
                style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 10, padding: isMobile ? "10px 14px" : "12px 20px", fontWeight: 700, fontSize: isMobile ? 13 : 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                📷 {isMobile ? "QR" : "Escanear QR"}
              </button>
            </div>
          </div>
          <div style={{ ...IS, width: isMobile ? "100%" : "auto", fontSize: 14, display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.6)", userSelect: "none" }}>
            📅 {new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>

        {/* Salida tabs + Grupo tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
          {salidas.map(s => {
            const resS   = reservas.filter(r => r.salida_id === s.id);
            const chkS   = resS.filter(r => r.checkin_at).reduce((a, r) => a + (r.pax || 0), 0);
            const totS   = resS.reduce((a, r) => a + (r.pax || 0), 0);
            const despS  = despachos.find(d => d.salida_id === s.id);
            const isActive = tabSalida === s.id && !tabGrupo;
            return (
              <button key={s.id} onClick={() => { setTabSalida(s.id); setTabGrupo(null); }}
                style={{ padding: isMobile ? "10px 16px" : "10px 18px", borderRadius: 10, border: `2px solid ${isActive ? B.sky : B.navyLight}`, background: isActive ? B.sky + "22" : B.navyMid, color: isActive ? B.sky : "rgba(255,255,255,0.6)", cursor: "pointer", textAlign: "left", flexShrink: 0 }}>
                <div style={{ fontSize: isMobile ? 18 : 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.hora}</div>
                <div style={{ fontSize: 11, color: chkS === totS && totS > 0 ? B.success : "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                  {chkS}/{totS} {despS ? "✈" : "pax"}
                </div>
              </button>
            );
          })}
          {grupos.map(g => {
            const zarpe = g.zarpe_data || [];
            const totalPaxG = Number(g.pax) > 0
              ? Number(g.pax)
              : (g.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle").reduce((s, p) => s + (Number(p.personas) || 0), 0);
            const chkG = zarpe.filter(z => z.checkin_at).length;
            const horas = (g.salidas_grupo || []).map(sg => sg.hora).filter(Boolean).sort();
            const isActive = tabGrupo === g.id;
            return (
              <button key={g.id} onClick={() => { setTabGrupo(isActive ? null : g.id); setTabSalida(null); }}
                style={{ padding: isMobile ? "10px 16px" : "10px 18px", borderRadius: 10, border: `2px solid ${isActive ? B.sand : B.sand + "44"}`, background: isActive ? B.sand + "22" : B.navyMid, color: isActive ? B.sand : B.sand + "99", cursor: "pointer", textAlign: "left", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>👥 {horas[0] || "—"}</div>
                <div style={{ fontSize: 10, color: chkG === totalPaxG && totalPaxG > 0 ? B.success : B.sand + "88", whiteSpace: "nowrap", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {chkG}/{totalPaxG} · {g.nombre}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Vista grupo seleccionado ── */}
        {tabGrupo && (() => {
          const g = grupos.find(x => x.id === tabGrupo);
          if (!g) return null;
          const allGrupoSlots = buildGrupoSlots(g.pasadias_org);
          const zarpeBySlot   = Object.fromEntries((g.zarpe_data || []).map(z => [z.slot_id, z]));
          const mergedSlots   = allGrupoSlots.map(s => ({ ...s, ...(zarpeBySlot[s.slot_id] || {}) }));
          const totalPaxG     = mergedSlots.length;
          const conNombre     = mergedSlots.filter(z => z.nombre);
          const checkedInG    = mergedSlots.filter(z => z.checkin_at);
          const noShowsG      = mergedSlots.filter(z => z.no_show);
          const horas         = (g.salidas_grupo || []).map(sg => sg.hora).filter(Boolean).sort();
          // Split: slots con datos vs completamente vacíos
          const slotsConDatos  = mergedSlots.filter(z => z.nombre || z.no_show);
          const slotsSinDatos  = mergedSlots.filter(z => !z.nombre && !z.no_show);
          const despachoDatos  = despachos.find(d => d.salida_id === g.id);
          const embsActivas    = embarcaciones.filter(e => e.estado === "activo");
          return (
            <div>
              {/* Header grupo */}
              <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 20px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{g.nombre}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      👥 {checkedInG.length}/{totalPaxG} abordaron
                      {horas.length > 0 && ` · ${horas.map(h => `⛵ ${h}`).join(" ")}`}
                      {despachoDatos && <span style={{ color: B.success, marginLeft: 8 }}>✈ Despachado {new Date(despachoDatos.despachado_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}{despachoDatos.embarcacion_nombre ? ` · ${despachoDatos.embarcacion_nombre}` : ""}</span>}
                    </div>
                  </div>
                  {conNombre.length > checkedInG.length && (
                    <button onClick={() => checkinTodosGrupo(g)}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                      ✓ Todos CI
                    </button>
                  )}
                </div>
                {/* Despachar — botón independiente */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {/* Chips de embarcaciones usadas (derivadas de zarpe_data) */}
                  {(() => {
                    const usadas = [...new Set((g.zarpe_data || []).map(z => z.embarcacion).filter(Boolean))];
                    return usadas.map(emb => (
                      <span key={emb} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: B.sky + "22", border: `1px solid ${B.sky}44`, color: B.sky, fontWeight: 600 }}>
                        ⛵ {emb}
                      </span>
                    ));
                  })()}
                  {!despachoDatos ? (
                    <button onClick={() => despacharGrupo(g, null)}
                      style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      ✈ Despachar
                    </button>
                  ) : (
                    <button onClick={() => { if (window.confirm("¿Deshacer despacho del grupo?")) supabase.from("salida_despachos").delete().eq("id", despachoDatos.id).then(() => setDespachos(prev => prev.filter(d => d.id !== despachoDatos.id))); }}
                      style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.success}55`, background: B.success + "22", color: B.success, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      ✈ Despachado — deshacer
                    </button>
                  )}
                </div>
              </div>

              {/* Slots CON datos */}
              {slotsConDatos.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: slotsSinDatos.length > 0 ? 10 : 0 }}>
                  {slotsConDatos.map(z => {
                    const hecho      = !!z.checkin_at;
                    const isNS       = !!z.no_show;
                    const horaCI     = z.checkin_at ? new Date(z.checkin_at).toTimeString().slice(0, 5) : null;
                    const bgColor    = hecho ? B.success + "18" : isNS ? B.danger + "18" : B.navyMid;
                    const border     = hecho ? B.success + "55" : isNS ? B.danger + "55" : B.navyLight;
                    return (
                      <div key={z.slot_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: bgColor, border: `1px solid ${border}` }}>
                        <div onClick={() => !isNS && z.nombre && checkinPaxGrupo(g, z.slot_id)}
                          style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, border: `2px solid ${hecho ? B.success : isNS ? B.danger : "rgba(255,255,255,0.2)"}`, background: hecho ? B.success : isNS ? B.danger + "44" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: hecho ? B.navy : B.danger, fontWeight: 900, cursor: (!isNS && z.nombre) ? "pointer" : "default" }}>
                          {hecho ? "✓" : isNS ? "✕" : ""}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {z.nombre ? (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 14, color: hecho ? B.success : isNS ? B.danger : B.white, textDecoration: isNS ? "line-through" : "none" }}>{z.nombre}</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                                {z.tipo}{z.identificacion ? ` · ${z.identificacion}` : ""}{isNS ? " · NO SHOW" : ""}
                              </div>
                              {/* Embarcación inline — igual que pasadías normales */}
                              {!isNS && embsActivas.length > 0 && (
                                <select
                                  value={z.embarcacion || ""}
                                  onChange={e => saveSlotEmbarcacion(g, z.slot_id, e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  style={{ marginTop: 5, fontSize: 11, padding: "3px 8px", borderRadius: 6,
                                    background: z.embarcacion ? B.sky + "22" : B.navy,
                                    border: `1px solid ${z.embarcacion ? B.sky + "66" : B.navyLight}`,
                                    color: z.embarcacion ? B.sky : "rgba(255,255,255,0.4)",
                                    cursor: "pointer", outline: "none" }}>
                                  <option value="">⛵ Sin embarcación</option>
                                  {embsActivas.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                                </select>
                              )}
                            </>
                          ) : (
                            <div style={{ fontSize: 12, color: B.danger + "88", fontStyle: "italic" }}>{z.tipo} #{z.idx} — No show</div>
                          )}
                        </div>
                        {horaCI && <span style={{ fontSize: 11, color: B.success, fontWeight: 600, flexShrink: 0 }}>{horaCI}</span>}
                        {!hecho && (
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            {!isNS && (
                              <>
                                <button onClick={() => setQrGrupo({ grupo: g, slot: z })}
                                  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${B.sand}44`, background: "transparent", color: B.sand, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>QR</button>
                                <button onClick={() => setEditSlot({ grupo: g, slot: z })}
                                  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid rgba(255,255,255,0.15)`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✏️</button>
                              </>
                            )}
                            <button onClick={() => noShowPaxGrupo(g, z.slot_id)}
                              style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${isNS ? B.sand + "55" : B.danger + "55"}`, background: isNS ? "transparent" : B.danger + "22", color: isNS ? "rgba(255,255,255,0.4)" : B.danger, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              {isNS ? "↩" : "NS"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Slots SIN datos — bloque colapsado con QR general + lista */}
              {slotsSinDatos.length > 0 && (
                <div style={{ background: B.navy, borderRadius: 12, padding: "14px 16px", border: `1px solid ${B.navyLight}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15, color: B.warning }}>{slotsSinDatos.length}</span>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginLeft: 6 }}>pasajeros sin datos de zarpe</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setQrGrupo({ grupo: g, slot: null })}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${B.sand}55`, background: B.sand + "15", color: B.sand, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      📲 QR Kiosk
                    </button>
                    <button onClick={() => setBulkFill(g)}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${B.sky}55`, background: B.sky + "15", color: B.sky, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      📋 Llenar lista
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {slotsSinDatos.slice(0, 8).map(z => <span key={z.slot_id}>{z.tipo} #{z.idx}</span>).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} style={{ opacity: 0.4 }}>·</span>, el], [])}
                    {slotsSinDatos.length > 8 && <span style={{ opacity: 0.4 }}>+{slotsSinDatos.length - 8} más</span>}
                  </div>
                </div>
              )}

              {/* Footer stats */}
              <div style={{ marginTop: 12, background: B.navyMid, borderRadius: 10, padding: "14px 20px", display: "flex", gap: 20, flexWrap: "wrap" }}>
                <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>CHECK-IN</span><span style={{ fontSize: 20, fontWeight: 700, color: B.success }}>{checkedInG.length}</span><span style={{ color: "rgba(255,255,255,0.3)" }}>/{totalPaxG}</span></div>
                <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>PENDIENTES</span><span style={{ fontSize: 20, fontWeight: 700, color: totalPaxG - checkedInG.length - noShowsG.length > 0 ? B.warning : B.success }}>{totalPaxG - checkedInG.length - noShowsG.length}</span></div>
                {noShowsG.length > 0 && <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>NO SHOW</span><span style={{ fontSize: 20, fontWeight: 700, color: B.danger }}>{noShowsG.length}</span></div>}
                <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>ZARPE</span><span style={{ fontSize: 20, fontWeight: 700, color: conNombre.length === totalPaxG ? B.success : B.warning }}>{conNombre.length}/{totalPaxG}</span></div>
                {despachoDatos && <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>DESPACHO</span><span style={{ fontSize: 14, fontWeight: 700, color: B.success }}>✈ {new Date(despachoDatos.despachado_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span></div>}
              </div>
            </div>
          );
        })()}

        {!tabGrupo && (!salida ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>{grupos.length > 0 ? "Selecciona una salida o grupo" : "Sin salidas activas"}</div>
        ) : (
          <>
            {/* Salida header */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: isMobile ? "12px 14px" : "16px 20px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {salida.nombre} — {salida.hora}
                    <span style={{ fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>↩ {salida.hora_regreso}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13 }}>
                      <span style={{ color: B.success, fontWeight: 700 }}>{checkedIn}</span>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>/{totalPax} pax</span>
                    </span>
                    {despacho && (
                      <span style={{ fontSize: 12, color: B.success, fontWeight: 700 }}>✈ {new Date(despacho.despachado_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button onClick={() => setEditColabs(true)}
                    style={{ padding: "8px 12px", borderRadius: 8, background: despacho?.colaboradores?.length > 0 ? B.sky + "22" : B.navyLight, color: despacho?.colaboradores?.length > 0 ? B.sky : "rgba(255,255,255,0.6)", border: `1px solid ${despacho?.colaboradores?.length > 0 ? B.sky + "55" : "transparent"}`, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    👥 {despacho?.colaboradores?.length > 0 ? `${despacho.colaboradores.length}` : "Colabs"}
                  </button>
                  <button onClick={() => setEditBlueApple(true)}
                    style={{ padding: "8px 12px", borderRadius: 8, background: despacho?.pasajeros_blueapple?.length > 0 ? "#dc2626" + "22" : B.navyLight, color: despacho?.pasajeros_blueapple?.length > 0 ? "#fca5a5" : "rgba(255,255,255,0.6)", border: `1px solid ${despacho?.pasajeros_blueapple?.length > 0 ? "#dc2626" + "55" : "transparent"}`, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    🍎 {despacho?.pasajeros_blueapple?.length > 0 ? `${despacho.pasajeros_blueapple.length}` : "Blue Apple"}
                  </button>
                  {/* Zarpe button per embarcación (base + extras + Blue Apple + rentadas activas) */}
                  {(() => {
                    const allEmbs = embsParaSalida(salida);
                    return allEmbs.map(emb => (
                      <button key={emb.id} onClick={() => {
                        const embDesp = despachosDesal.find(d => d.embarcacion_nombre === emb.nombre);
                        // Unir colaboradores de todos los despachos del día/salida
                        const allColabsMap = new Map();
                        despachosDesal.forEach(d => (d.colaboradores || []).forEach(c => {
                          const key = (c.cedula || "") + "|" + (c.nombre || "").toLowerCase().trim();
                          if (!allColabsMap.has(key)) allColabsMap.set(key, c);
                        }));
                        const todosColabs = Array.from(allColabsMap.values());

                        // Filtrar por embarcación asignada:
                        // - colabs con embarcacion === emb.nombre → van en este zarpe
                        // - colabs sin embarcacion asignada (vacío) → también (fallback, van en cualquiera)
                        let allColabs = todosColabs.filter(c => !c.embarcacion || c.embarcacion === emb.nombre);

                        // Capacidad: pasajeros ocupan primero, colaboradores ocupan lo que sobra.
                        const capacidad = Number(emb.capacidad) || 0;
                        const pasajerosDeEmb = resDesal.filter(r => r.embarcacion_asignada === emb.nombre);
                        const paxCount = pasajerosDeEmb.reduce((s, r) => s + (r.pasajeros?.length || r.pax || 1), 0);
                        const cuposLibres = Math.max(0, capacidad - paxCount);

                        if (capacidad > 0 && allColabs.length > cuposLibres) {
                          const excedentes = allColabs.length - cuposLibres;
                          const ok = confirm(
                            `⚠️ ${emb.nombre} tiene capacidad ${capacidad}, ya hay ${paxCount} pasajeros.\n\n` +
                            `Solo caben ${cuposLibres} colaboradores más, pero hay ${allColabs.length} registrados para este bote.\n\n` +
                            `Se incluirán solo los primeros ${cuposLibres} colaboradores en el zarpe (${excedentes} quedan fuera).\n\n` +
                            `¿Continuar?`
                          );
                          if (!ok) return;
                          allColabs = allColabs.slice(0, cuposLibres);
                        }

                        const despFinal = embDesp
                          ? { ...embDesp, colaboradores: allColabs }
                          : { colaboradores: allColabs, zarpe_codigo: null };
                        generarZarpe(salida, resDesal, fecha, despFinal, emb);
                      }}
                        style={{ padding: "8px 12px", borderRadius: 8, background: emb._extra ? B.sky + "22" : B.navyLight, color: emb._extra ? B.sky : B.white, border: emb._extra ? `1px solid ${B.sky}44` : "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        📄 {emb.nombre}
                      </button>
                    ));
                  })()}
                </div>
              </div>
              {/* Botones de despachar — uno por embarcación que tenga pasajeros asignados */}
              {(() => {
                const allEmbs2 = embsParaSalida(salida);

                // Pax asignados por embarcación (solo cuentan reservas con embarcacion_asignada)
                const paxPorEmb = {};
                resDesal.forEach(r => {
                  if (!r.embarcacion_asignada) return;
                  paxPorEmb[r.embarcacion_asignada] = (paxPorEmb[r.embarcacion_asignada] || 0) + (Number(r.pax) || 0);
                });

                // Solo mostrar botón para embarcaciones CON pasajeros asignados
                const embsConPax = allEmbs2.filter(e => (paxPorEmb[e.nombre] || 0) > 0);

                if (embsConPax.length === 0) {
                  return (
                    <div style={{ padding: "11px", borderRadius: 8, background: B.navy, color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center", border: `1px dashed ${B.navyLight}` }}>
                      Asigna pasajeros a una embarcación para poder despachar
                    </div>
                  );
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {embsConPax.map(emb => {
                      const yaDespachada = despachosDesal.some(d => d.embarcacion_nombre === emb.nombre);
                      const pax = paxPorEmb[emb.nombre] || 0;
                      return (
                        <button key={emb.id}
                          onClick={() => !yaDespachada && despachar(salida, emb.nombre)}
                          disabled={yaDespachada}
                          title={yaDespachada ? `${emb.nombre} ya fue despachada en este horario — no se puede volver a despachar` : `Despachar ${emb.nombre} con ${pax} pasajero${pax !== 1 ? "s" : ""}`}
                          style={{
                            width: "100%", padding: "10px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                            cursor: yaDespachada ? "not-allowed" : "pointer",
                            background: yaDespachada ? B.success + "22" : B.sand,
                            color: yaDespachada ? B.success : B.navy,
                            border: yaDespachada ? `1px solid ${B.success}55` : "none",
                            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                            opacity: yaDespachada ? 0.85 : 1,
                          }}>
                          <span>{yaDespachada ? "🔒" : "✈"} {yaDespachada ? "Despachada · " : "Despachar "}{emb.nombre}</span>
                          <span style={{ fontSize: 11, opacity: 0.75 }}>{pax} pax</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Código de zarpe — uno por embarcación despachada */}
            {despachosDesal.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {despachosDesal.map(desp => (
                  <ZarpeCodigoRow key={desp.id} desp={desp} setDespachos={setDespachos} />
                ))}
              </div>
            )}

            {/* Search */}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre..."
              style={{ ...IS, marginBottom: 12, width: "100%", maxWidth: 360 }} />

            {/* Reservas list */}
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
            ) : resFiltradas.length === 0 ? (
              <div style={{ background: B.navyMid, borderRadius: 12, padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⛵</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Sin reservas para esta salida</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {resFiltradas.map(res => {
                  const checked  = !!res.checkin_at;
                  const isNS     = res.estado === "no_show";
                  const tienePax = paxCompleto(res);
                  // Estado visual: verde completo = check-in + zarpe OK; ámbar = check-in sin zarpe; rojo = no-show; gris = sin check-in
                  const listo    = checked && tienePax;
                  const parcial  = checked && !tienePax;
                  const cardBg     = isNS ? B.danger + "18"  : listo ? B.success + "22" : parcial ? "#E8A02012" : B.navyMid;
                  const cardBorder = isNS ? B.danger + "66"  : listo ? B.success + "77" : parcial ? "#E8A02044" : B.navyLight;
                  const nameColor  = isNS ? B.danger         : listo ? B.success        : parcial ? "#E8A020"   : B.white;
                  const circBg     = isNS ? B.danger + "33"  : listo ? B.success        : parcial ? "#E8A02033" : B.navyLight;
                  const circColor  = isNS ? B.danger         : listo ? B.navy           : parcial ? "#E8A020"   : "rgba(255,255,255,0.3)";
                  return (
                    <div key={res.id} style={{
                      background: cardBg,
                      borderRadius: 12, padding: isMobile ? "12px 12px" : "14px 16px",
                      border: `2px solid ${cardBorder}`,
                      display: "flex", alignItems: "center", gap: isMobile ? 12 : 16,
                      transition: "all 0.2s",
                    }}>
                      {/* Círculo de estado (solo visual, click en botón CI derecho) */}
                      <div style={{
                          width: isMobile ? 52 : 46, height: isMobile ? 52 : 46,
                          borderRadius: "50%", flexShrink: 0,
                          background: circBg,
                          color: circColor,
                          fontSize: checked ? (isMobile ? 26 : 22) : (isMobile ? 22 : 18),
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 800, transition: "all 0.2s",
                          border: isNS ? `2px solid ${B.danger}55` : parcial ? "2px solid #E8A02055" : "none",
                        }}>
                        {isNS ? "✗" : listo ? "✓" : parcial ? "✓" : "○"}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: nameColor, marginBottom: 2 }}>
                          {res.nombre}
                        </div>
                        {(res.saldo || 0) > 0 && res.forma_pago !== "CXC" && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#FF4D4D18", border: "1px solid #FF4D4D55", borderRadius: 6, padding: "2px 8px", marginBottom: 5, fontSize: 11, color: "#FF6B6B", fontWeight: 700 }}>
                            💳 Saldo: {COP(res.saldo)}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                          <span style={{ fontWeight: 700, color: B.sand, fontSize: 13 }}>
                            {res.pax} pax
                            {res.pax_n > 0 && <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}> ({res.pax_a}A+{res.pax_n}N)</span>}
                          </span>
                          <span style={{ padding: "1px 8px", borderRadius: 8, background: B.navyLight, fontSize: 11 }}>{res.tipo}</span>
                          <span style={{ padding: "1px 8px", borderRadius: 8, background: B.navyLight, fontSize: 11 }}>{res.canal}</span>
                          {res.estado !== "confirmado" && (
                            <span style={{ padding: "1px 8px", borderRadius: 8, background: B.warning + "33", color: B.warning, fontSize: 11 }}>{res.estado}</span>
                          )}
                          {res.checkin_at && (
                            <span style={{ color: B.success, fontSize: 11 }}>
                              ✓ {new Date(res.checkin_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {res.contacto && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{res.contacto}</div>}
                        {/* Embarcación selector — base + extras + Blue Apple + rentadas activas */}
                        {(() => {
                          const todasEmbs = embsParaSalida(salida);
                          if (todasEmbs.length === 0) return null;
                          return (
                            <div style={{ marginTop: 6 }}>
                              <select
                                value={res.embarcacion_asignada || ""}
                                onChange={e => assignEmbarcacion(res.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  fontSize: 11, padding: "3px 8px", borderRadius: 6,
                                  background: res.embarcacion_asignada ? B.sky + "22" : B.navy,
                                  border: `1px solid ${res.embarcacion_asignada ? B.sky + "66" : B.navyLight}`,
                                  color: res.embarcacion_asignada ? B.sky : "rgba(255,255,255,0.4)",
                                  cursor: "pointer", outline: "none",
                                }}>
                                <option value="">🚢 Sin embarcación</option>
                                {todasEmbs.map(e => (
                                  <option key={e.id} value={e.nombre}>{e.nombre}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Right-side actions: check-in + NS + zarpe QR */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                        {/* Check-in con confirmación */}
                        <button
                          onClick={() => checked ? doUnCheckin(res) : (setConfirmCheckin(res), setCiPax(res.pax || 1))}
                          disabled={isNS}
                          title={checked ? "Deshacer check-in" : "Confirmar llegada"}
                          style={{
                            padding: isMobile ? "9px 12px" : "7px 12px",
                            borderRadius: 8,
                            border: `1px solid ${checked ? B.success + "55" : B.navyLight}`,
                            background: checked ? B.success + "22" : B.navyLight,
                            color: checked ? B.success : isNS ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.5)",
                            fontSize: isMobile ? 15 : 11, fontWeight: 700,
                            cursor: isNS ? "default" : "pointer", whiteSpace: "nowrap",
                            opacity: isNS ? 0.4 : 1,
                          }}>
                          {checked
                            ? (isMobile ? "✓" : "✓ CI")
                            : (isMobile ? "○" : "○ CI")}
                        </button>

                        {/* No-Show */}
                        <button
                          onClick={() => isNS ? doUnNoShow(res) : doNoShow(res)}
                          disabled={checked}
                          title={isNS ? "Revertir No-Show" : "Marcar como No-Show"}
                          style={{
                            padding: isMobile ? "9px 12px" : "7px 12px",
                            borderRadius: 8,
                            border: `1px solid ${isNS ? B.danger + "77" : B.danger + "33"}`,
                            background: isNS ? B.danger + "33" : "transparent",
                            color: isNS ? B.danger : checked ? "rgba(255,255,255,0.15)" : B.danger + "99",
                            fontSize: isMobile ? 13 : 11, fontWeight: 700,
                            cursor: checked ? "default" : "pointer", whiteSpace: "nowrap",
                            opacity: checked ? 0.3 : 1,
                          }}>
                          {isNS
                            ? (isMobile ? "↩ NS" : "↩ NS")
                            : (isMobile ? "NS" : "NS")}
                        </button>

                        {/* Zarpe QR */}
                        <button
                          onClick={() => setQrReserva(res)}
                          title="Datos para zarpe / QR cliente"
                          style={{
                            padding: isMobile ? "9px 12px" : "7px 12px",
                            borderRadius: 8,
                            border: `1px solid ${tienePax ? B.success + "44" : B.navyLight}`,
                            background: tienePax ? B.success + "15" : "transparent",
                            color: tienePax ? B.success : "rgba(255,255,255,0.3)",
                            fontSize: isMobile ? 15 : 11,
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}>
                          {isMobile ? (tienePax ? "📋✓" : "📋") : (tienePax ? "✓ Zarpe" : "📋 Zarpe")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary footer */}
            {resDesal.length > 0 && (() => {
              const noShows = resDesal.filter(r => r.estado === "no_show").reduce((s, r) => s + (r.pax || 0), 0);
              return (
                <div style={{ marginTop: 20, background: B.navyMid, borderRadius: 10, padding: "14px 20px", display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>CHECK-IN</span><span style={{ fontSize: 20, fontWeight: 700, color: B.success }}>{checkedIn}</span><span style={{ color: "rgba(255,255,255,0.3)" }}>/{totalPax}</span></div>
                  <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>PENDIENTES</span><span style={{ fontSize: 20, fontWeight: 700, color: totalPax - checkedIn - noShows > 0 ? B.warning : B.success }}>{totalPax - checkedIn - noShows}</span></div>
                  {noShows > 0 && (
                    <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>NO-SHOW</span><span style={{ fontSize: 20, fontWeight: 700, color: B.danger }}>{noShows}</span></div>
                  )}
                  <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>ZARPE COMPLETO</span><span style={{ fontSize: 20, fontWeight: 700, color: tieneZarpe ? B.success : B.warning }}>{tieneZarpe ? "Sí" : "Pendiente"}</span></div>
                </div>
              );
            })()}
          </>
        ))}
      </div>
    </>
  );
}
