import { useState, useEffect, useCallback, useRef } from "react";
import { B, todayStr, COP } from "../brand";
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

// ─── Colaboradores Modal ─────────────────────────────────────────────────────
function ColaboradoresModal({ salidaId, fecha, despacho, onClose, onSaved }) {
  const init = despacho?.colaboradores?.length > 0
    ? despacho.colaboradores
    : [{ nombre: "", cedula: "", rol: "" }];
  const [colabs, setColabs] = useState(init);
  const [saving, setSaving] = useState(false);

  const set = (i, k, v) => setColabs(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const add = () => setColabs(p => [...p, { nombre: "", cedula: "", rol: "" }]);
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
                <div>
                  <label style={LS}>Rol / Cargo</label>
                  <input value={c.rol} onChange={e => set(i, "rol", e.target.value)} style={IS} placeholder="Ej: Capitán, Salvavidas, Guía..." />
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
// Generate zarpe for a SINGLE embarcación
function generarZarpe(salida, reservas, fecha, despacho, emb) {
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

  const bodyRows = paxList.map(p => `<tr>
      <td>${rowNum++}</td>
      <td style="font-weight:600">${p.nombre || "—"}</td>
      <td>${p.identificacion || "—"}</td>
      <td>${p.nacionalidad || "—"}</td>
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
      <div><b>Total pasajeros:</b> ${totalPax}</div>
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
    ${despacho?.colaboradores?.length > 0 ? `
    <div style="margin-top:20px;">
      <div style="background:#1E3566;color:white;padding:8px 10px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-radius:4px 4px 0 0;">
        👥 Tripulación / Colaboradores — ${despacho.colaboradores.length} persona${despacho.colaboradores.length !== 1 ? "s" : ""}
      </div>
      <table style="border-radius:0 0 4px 4px;overflow:hidden;">
        <thead><tr>
          <th style="width:5%">#</th>
          <th style="width:40%">Nombre Completo</th>
          <th style="width:30%">Cédula</th>
          <th style="width:25%">Rol / Cargo</th>
        </tr></thead>
        <tbody>
          ${despacho.colaboradores.map((c, i) => `<tr>
            <td>${i + 1}</td>
            <td style="font-weight:600">${c.nombre || "—"}</td>
            <td>${c.cedula || "—"}</td>
            <td>${c.rol || "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}
    <div class="footer">Atolon Beach Club — ${new Date().toLocaleString("es-CO")}</div>
  </body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
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
    await supabase.from("salida_despachos")
      .update({ zarpe_codigo: input.trim(), zarpe_generado: true })
      .eq("id", desp.id);
    setDespachos(prev => prev.map(d =>
      d.id === desp.id ? { ...d, zarpe_codigo: input.trim(), zarpe_generado: true } : d
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
  const [qrReserva,      setQrReserva]      = useState(null);
  const [confirmCheckin, setConfirmCheckin] = useState(null);
  const [ciSaving,       setCiSaving]       = useState(false);
  const [despacharModal, setDespacharModal] = useState(null); // { salida, allEmbs }
  const [search,         setSearch]         = useState("");
  const [loading,        setLoading]        = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [salR, resR, desR, embR, ovrR] = await Promise.all([
      supabase.from("salidas").select("*").eq("activo", true).order("orden"),
      supabase.from("reservas").select("*").eq("fecha", fecha).neq("estado", "cancelado").order("nombre"),
      supabase.from("salida_despachos").select("*").eq("fecha", fecha),
      supabase.from("embarcaciones").select("*").order("nombre"),
      supabase.from("salidas_override").select("*").eq("fecha", fecha),
    ]);
    const res = resR.data || [];
    // Solo salidas con pasajeros ese día
    const salsConPax = (salR.data || []).filter(s => res.some(r => r.salida_id === s.id));
    setSalidas(salsConPax);
    setReservas(res);
    setDespachos(desR.data || []);
    setEmbarcaciones(embR.data || []);
    setOverrides(ovrR.data || []);
    if (salsConPax.length > 0 && !tabSalida) setTabSalida(salsConPax[0].id);
    setLoading(false);
  }, [fecha]);

  useEffect(() => { load(); }, [load]);

  // ── Check-in: muestra confirmación, nunca bloquea por falta de zarpe
  const doCheckin = async (res) => {
    setCiSaving(true);
    const val = new Date().toISOString();
    await supabase.from("reservas").update({ checkin_at: val }).eq("id", res.id);
    setReservas(prev => prev.map(r => r.id === res.id ? { ...r, checkin_at: val } : r));
    setCiSaving(false);
    setConfirmCheckin(null);
  };

  const doUnCheckin = async (res) => {
    await supabase.from("reservas").update({ checkin_at: null }).eq("id", res.id);
    setReservas(prev => prev.map(r => r.id === res.id ? { ...r, checkin_at: null } : r));
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
  const despachar = async (salida, embNombre) => {
    // Si ya existe despacho para esa embarcación, confirmar re-despacho
    const existing = despachos.find(d => d.salida_id === salida.id && d.embarcacion_nombre === embNombre);
    if (existing) {
      if (!window.confirm(`${embNombre} ya fue despachada. ¿Registrar de nuevo?`)) return;
      await supabase.from("salida_despachos").delete().eq("id", existing.id);
    }
    const id = `DESP-${Date.now()}`;
    const rec = { id, fecha, salida_id: salida.id, embarcacion_nombre: embNombre, despachado_at: new Date().toISOString() };
    await supabase.from("salida_despachos").insert(rec);
    setDespachos(prev => [...prev.filter(d => !(d.salida_id === salida.id && d.embarcacion_nombre === embNombre)), rec]);
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
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>
                {confirmCheckin.nombre}
                <span style={{ marginLeft: 8, color: B.sand, fontWeight: 700 }}>{confirmCheckin.pax} pax</span>
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
                  onClick={() => doCheckin(confirmCheckin)}
                  disabled={ciSaving}
                  style={{ flex: 2, padding: "13px", borderRadius: 10, background: B.success, color: B.navy, border: "none", fontWeight: 800, fontSize: 14, cursor: ciSaving ? "default" : "pointer" }}>
                  {ciSaving ? "..." : "✓ Sí, hacer check-in"}
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
      {editColabs && salida && (
        <ColaboradoresModal
          salidaId={salida.id}
          fecha={fecha}
          despacho={despacho}
          onClose={() => setEditColabs(false)}
          onSaved={load}
        />
      )}

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 600, margin: 0 }}>Check-in · Muelle</h2>
            <button onClick={() => setScanning(true)}
              style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 10, padding: isMobile ? "10px 14px" : "12px 20px", fontWeight: 700, fontSize: isMobile ? 13 : 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              📷 {isMobile ? "QR" : "Escanear QR"}
            </button>
          </div>
          <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setTabSalida(null); }}
            style={{ ...IS, width: isMobile ? "100%" : "auto", fontSize: 14 }} />
        </div>

        {/* Salida tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 4 : 0 }}>
          {salidas.map(s => {
            const resS   = reservas.filter(r => r.salida_id === s.id);
            const chkS   = resS.filter(r => r.checkin_at).reduce((a, r) => a + (r.pax || 0), 0);
            const totS   = resS.reduce((a, r) => a + (r.pax || 0), 0);
            const despS  = despachos.find(d => d.salida_id === s.id);
            const isActive = tabSalida === s.id;
            return (
              <button key={s.id} onClick={() => setTabSalida(s.id)}
                style={{
                  padding: isMobile ? "10px 16px" : "10px 18px",
                  borderRadius: 10, border: `2px solid ${isActive ? B.sky : B.navyLight}`,
                  background: isActive ? B.sky + "22" : B.navyMid, color: isActive ? B.sky : "rgba(255,255,255,0.6)",
                  cursor: "pointer", textAlign: "left", flexShrink: 0,
                }}>
                <div style={{ fontSize: isMobile ? 18 : 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.hora}</div>
                <div style={{ fontSize: 11, color: chkS === totS && totS > 0 ? B.success : "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                  {chkS}/{totS} {despS ? "✈" : "pax"}
                </div>
              </button>
            );
          })}
        </div>

        {!salida ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>Sin salidas activas</div>
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
                  {/* Zarpe button per assigned embarcación (base + extra del calendario) */}
                  {(() => {
                    const override = overrides.find(o => o.salida_id === salida.id);
                    // Extra: buscar ficha completa en embarcaciones para traer datos de capitán
                    const extraEmbs = (override?.extra_embarcaciones || []).map(e => {
                      const full = embarcaciones.find(eb => eb.id === e.id);
                      return full ? { ...full, _extra: true } : { id: e.id, nombre: e.nombre, _extra: true };
                    });
                    // Base: pasar objeto completo con capitán y cédulas
                    const baseEmbs = (salida.embarcaciones || []).map(embId => {
                      const emb = embarcaciones.find(e => e.id === embId);
                      return emb ? { ...emb } : null;
                    }).filter(Boolean);
                    // Combinar sin duplicados
                    const allEmbs = [...baseEmbs, ...extraEmbs.filter(e => !baseEmbs.some(b => b.id === e.id))];
                    return allEmbs.map(emb => (
                      <button key={emb.id} onClick={() => generarZarpe(salida, resDesal, fecha, despachosDesal.find(d => d.embarcacion_nombre === emb.nombre) || null, emb)}
                        style={{ padding: "8px 12px", borderRadius: 8, background: emb._extra ? B.sky + "22" : B.navyLight, color: emb._extra ? B.sky : B.white, border: emb._extra ? `1px solid ${B.sky}44` : "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        📄 {emb.nombre}
                      </button>
                    ));
                  })()}
                </div>
              </div>
              {/* Botón despachar — usa allEmbs ya calculadas arriba */}
              {(() => {
                const override2 = overrides.find(o => o.salida_id === salida.id);
                const extraE2 = (override2?.extra_embarcaciones || []).map(e => {
                  const full = embarcaciones.find(eb => eb.id === e.id);
                  return full ? { ...full, _extra: true } : { id: e.id, nombre: e.nombre, _extra: true };
                });
                const baseE2 = (salida.embarcaciones || []).map(eid => {
                  const emb = embarcaciones.find(e => e.id === eid);
                  return emb ? { ...emb } : null;
                }).filter(Boolean);
                const allEmbs2 = [...baseE2, ...extraE2.filter(e => !baseE2.some(b => b.id === e.id))];
                const todasDespachadas = allEmbs2.length > 0 && allEmbs2.every(e => despachosDesal.some(d => d.embarcacion_nombre === e.nombre));
                return (
                  <button
                    onClick={() => handleDespachar(salida, allEmbs2)}
                    style={{ width: "100%", padding: "11px", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer",
                      background: todasDespachadas ? B.success + "33" : B.sand,
                      color: todasDespachadas ? B.success : B.navy,
                      border: todasDespachadas ? `1px solid ${B.success}` : "none" }}>
                    {todasDespachadas ? "✈ Todas despachadas" : despachosDesal.length > 0 ? `✈ Despachar otra (${despachosDesal.length} ya)` : "✈ Despachar embarcación"}
                  </button>
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
                  const tienePax = paxCompleto(res);
                  // Estado visual: verde completo = check-in + zarpe OK; ámbar = check-in sin zarpe; gris = sin check-in
                  const listo    = checked && tienePax;
                  const parcial  = checked && !tienePax;
                  const cardBg     = listo ? B.success + "22" : parcial ? "#E8A02012" : B.navyMid;
                  const cardBorder = listo ? B.success + "77" : parcial ? "#E8A02044" : B.navyLight;
                  const nameColor  = listo ? B.success    : parcial ? "#E8A020" : B.white;
                  const circBg     = listo ? B.success    : parcial ? "#E8A02033" : B.navyLight;
                  const circColor  = listo ? B.navy       : parcial ? "#E8A020"  : "rgba(255,255,255,0.3)";
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
                          border: parcial ? "2px solid #E8A02055" : "none",
                        }}>
                        {listo ? "✓" : parcial ? "✓" : "○"}
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
                        {/* Embarcación selector — base + extras del calendario */}
                        {(() => {
                          const override = overrides.find(o => o.salida_id === salida.id);
                          const baseEmbs = (salida.embarcaciones || [])
                            .map(eid => embarcaciones.find(e => e.id === eid))
                            .filter(Boolean);
                          const extraEmbs = (override?.extra_embarcaciones || [])
                            .filter(e => !baseEmbs.some(b => b.id === e.id));
                          const todasEmbs = [...baseEmbs, ...extraEmbs];
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

                      {/* Right-side actions: check-in + zarpe QR */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                        {/* Check-in con confirmación */}
                        <button
                          onClick={() => checked ? doUnCheckin(res) : setConfirmCheckin(res)}
                          title={checked ? "Deshacer check-in" : "Confirmar llegada"}
                          style={{
                            padding: isMobile ? "9px 12px" : "7px 12px",
                            borderRadius: 8,
                            border: `1px solid ${checked ? B.success + "55" : B.navyLight}`,
                            background: checked ? B.success + "22" : B.navyLight,
                            color: checked ? B.success : "rgba(255,255,255,0.5)",
                            fontSize: isMobile ? 15 : 11, fontWeight: 700,
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}>
                          {checked
                            ? (isMobile ? "✓" : "✓ CI")
                            : (isMobile ? "○" : "○ CI")}
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
            {resDesal.length > 0 && (
              <div style={{ marginTop: 20, background: B.navyMid, borderRadius: 10, padding: "14px 20px", display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>CHECK-IN</span><span style={{ fontSize: 20, fontWeight: 700, color: B.success }}>{checkedIn}</span><span style={{ color: "rgba(255,255,255,0.3)" }}>/{totalPax}</span></div>
                <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>PENDIENTES</span><span style={{ fontSize: 20, fontWeight: 700, color: totalPax - checkedIn > 0 ? B.warning : B.success }}>{totalPax - checkedIn}</span></div>
                <div><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block" }}>ZARPE COMPLETO</span><span style={{ fontSize: 20, fontWeight: 700, color: tieneZarpe ? B.success : B.warning }}>{tieneZarpe ? "Sí" : "Pendiente"}</span></div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
