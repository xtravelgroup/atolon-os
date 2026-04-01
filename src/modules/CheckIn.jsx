import { useState, useEffect, useCallback, useRef } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import jsQR from "jsqr";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const NACS = ["Colombiana", "Americana", "Venezolana", "Brasileña", "Argentina", "Chilena", "Peruana", "Mexicana", "Española", "Francesa", "Alemana", "Italiana", "Canadiense", "Inglesa", "Otra"];

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

// ─── Zarpe PDF (new window) ───────────────────────────────────────────────────
function generarZarpe(salida, reservas, fecha, despacho, embarcacionesFlota = []) {
  // Group reservas by embarcacion_asignada
  const groups = {};
  reservas.forEach(r => {
    const key = r.embarcacion_asignada || "Sin embarcación asignada";
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  // Attach fleet data to first item of each group for the header block
  Object.entries(groups).forEach(([bote, resGroup]) => {
    const embObj = embarcacionesFlota.find(e => e.nombre === bote) || {};
    resGroup[0]._embarcacionObj = embObj;
  });
  const groupEntries = Object.entries(groups);
  const multipleBoats = groupEntries.length > 1 || (groupEntries.length === 1 && groupEntries[0][0] !== "Sin embarcación asignada");

  let totalPax = 0;
  let rowNum = 1;
  const bodyRows = groupEntries.map(([bote, resGroup]) => {
    const paxList = resGroup.flatMap(r =>
      r.pasajeros?.length > 0
        ? r.pasajeros
        : [{ nombre: r.nombre, identificacion: "—", nacionalidad: "—" }]
    );
    totalPax += paxList.length;
    const groupHeader = multipleBoats
      ? `<tr style="background:#1E3566;color:white;"><td colspan="5" style="padding:7px 8px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;">🚢 ${bote} — ${paxList.length} pasajero${paxList.length !== 1 ? "s" : ""}</td></tr>`
      : "";
    const rows = paxList.map(p => `<tr>
          <td>${rowNum++}</td>
          <td style="font-weight:600">${p.nombre || "—"}</td>
          <td>${p.identificacion || "—"}</td>
          <td>${p.nacionalidad || "—"}</td>
        </tr>`).join("");
    return groupHeader + rows;
  }).join("");

  // Build per-boat embarcacion info block for header
  const boteInfoBlocks = groupEntries.map(([bote, resGroup]) => {
    const emb = resGroup[0]?._embarcacionObj || {};
    return `
      <div style="background:#f4f6fb;border:1px solid #d0d8ee;border-radius:8px;padding:12px 16px;margin-bottom:10px;">
        <div style="font-weight:700;font-size:13px;color:#1E3566;margin-bottom:8px;">🚢 ${bote}</div>
        <table style="width:100%;font-size:11px;border-collapse:collapse;">
          <tr>
            <td style="padding:3px 8px 3px 0;color:#555;width:110px;">Matrícula:</td>
            <td style="padding:3px 0;font-weight:600;">${emb.matricula || "_______________"}</td>
            <td style="padding:3px 8px 3px 16px;color:#555;width:90px;">Piloto:</td>
            <td style="padding:3px 0;font-weight:600;">${emb.capitan || "_______________"}</td>
          </tr>
          <tr>
            <td style="padding:3px 8px 3px 0;color:#555;">Cédula piloto:</td>
            <td style="padding:3px 0;font-weight:600;">${emb.piloto_cedula || "_______________"}</td>
            <td style="padding:3px 8px 3px 16px;color:#555;">Celular piloto:</td>
            <td style="padding:3px 0;font-weight:600;">${emb.piloto_celular || "_______________"}</td>
          </tr>
        </table>
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Zarpe — ${salida.nombre} ${salida.hora} — ${fecha}</title>
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
      <div><b>Destino:</b> Tierra Bomba</div>
      <div><b>Generado:</b> ${new Date().toLocaleString("es-CO")}</div>
    </div>
    ${boteInfoBlocks}
    <table>
      <thead><tr>
        <th style="width:5%">#</th>
        <th style="width:42%">Nombre Completo</th>
        <th style="width:30%">No. Identificación</th>
        <th style="width:23%">Nacionalidad</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="footer">Atolon Beach Club — ${new Date().toLocaleString("es-CO")}</div>
  </body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function CheckIn() {
  const isMobile = useMobile();
  const [fecha,          setFecha]          = useState(todayStr());
  const [salidas,        setSalidas]        = useState([]);
  const [reservas,       setReservas]       = useState([]);
  const [despachos,      setDespachos]      = useState([]);
  const [embarcaciones,  setEmbarcaciones]  = useState([]);
  const [tabSalida,      setTabSalida]      = useState(null);
  const [scanning,       setScanning]       = useState(false);
  const [scanMsg,        setScanMsg]        = useState(null); // { ok, text }
  const [editPax,        setEditPax]        = useState(null); // reserva to edit pasajeros
  const [search,         setSearch]         = useState("");
  const [loading,        setLoading]        = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [salR, resR, desR, embR] = await Promise.all([
      supabase.from("salidas").select("*").eq("activo", true).order("orden"),
      supabase.from("reservas").select("*").eq("fecha", fecha).neq("estado", "cancelado").order("nombre"),
      supabase.from("salida_despachos").select("*").eq("fecha", fecha),
      supabase.from("embarcaciones").select("id, nombre").order("nombre"),
    ]);
    const sals = salR.data || [];
    setSalidas(sals);
    setReservas(resR.data || []);
    setDespachos(desR.data || []);
    setEmbarcaciones(embR.data || []);
    if (sals.length > 0 && !tabSalida) setTabSalida(sals[0].id);
    setLoading(false);
  }, [fecha]);

  useEffect(() => { load(); }, [load]);

  // ── Check-in toggle (prompts zarpe data if missing)
  const toggleCheckin = async (res) => {
    if (res.checkin_at) {
      // Un-check: direct
      await supabase.from("reservas").update({ checkin_at: null }).eq("id", res.id);
      setReservas(prev => prev.map(r => r.id === res.id ? { ...r, checkin_at: null } : r));
      return;
    }
    if (!paxCompleto(res)) {
      // Missing zarpe info — open modal with autoCheckin flag
      setEditPax({ ...res, _autoCheckin: true });
      return;
    }
    const val = new Date().toISOString();
    await supabase.from("reservas").update({ checkin_at: val }).eq("id", res.id);
    setReservas(prev => prev.map(r => r.id === res.id ? { ...r, checkin_at: val } : r));
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

  // ── Despachar
  const despachar = async (salida) => {
    const existing = despachos.find(d => d.salida_id === salida.id);
    if (existing) {
      if (!window.confirm("Esta salida ya fue despachada. ¿Registrar de nuevo?")) return;
      await supabase.from("salida_despachos").delete().eq("id", existing.id);
    }
    const id = `DESP-${Date.now()}`;
    const rec = { id, fecha, salida_id: salida.id, despachado_at: new Date().toISOString() };
    await supabase.from("salida_despachos").insert(rec);
    setDespachos(prev => [...prev.filter(d => d.salida_id !== salida.id), rec]);
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
  const despacho = despachos.find(d => d.salida_id === tabSalida);
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
                <button onClick={() => generarZarpe(salida, resDesal, fecha, despacho, embarcaciones)}
                  style={{ padding: "8px 12px", borderRadius: 8, background: B.navyLight, color: B.white, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                  📄 Zarpe
                </button>
              </div>
              <button onClick={() => despachar(salida)}
                style={{ width: "100%", padding: "11px", borderRadius: 8, background: despacho ? B.success + "33" : B.sand, color: despacho ? B.success : B.navy, border: despacho ? `1px solid ${B.success}` : "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                {despacho ? "✈ Embarcación despachada" : "✈ Despachar embarcación"}
              </button>
            </div>

            {/* Código de zarpe */}
            {despacho && (
              <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Código Zarpe</div>
                {despacho.zarpe_codigo ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: B.success, fontFamily: "monospace", letterSpacing: 2 }}>{despacho.zarpe_codigo}</span>
                    <button onClick={() => setDespachos(prev => prev.map(d => d.id === despacho.id ? { ...d, zarpe_codigo: "" } : d))}
                      style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.3)", cursor: "pointer" }}>Cambiar</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flex: 1 }}>
                    <input value={zarpeInput} onChange={e => setZarpeInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && guardarZarpeCodigo()}
                      placeholder="Ingresa el código asignado por Capitanía..."
                      style={{ ...IS, flex: 1, minWidth: 200 }} />
                    <button onClick={guardarZarpeCodigo} disabled={!zarpeInput.trim() || zarpeSaving}
                      style={{ padding: "9px 16px", borderRadius: 8, background: B.sand, color: B.navy, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                      {zarpeSaving ? "..." : "Registrar"}
                    </button>
                  </div>
                )}
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
                  const checked = !!res.checkin_at;
                  const tienePax = res.pasajeros?.length > 0;
                  return (
                    <div key={res.id} style={{
                      background: checked ? B.success + "15" : B.navyMid,
                      borderRadius: 12, padding: isMobile ? "12px 12px" : "14px 16px",
                      border: `2px solid ${checked ? B.success + "55" : B.navyLight}`,
                      display: "flex", alignItems: "center", gap: isMobile ? 12 : 16,
                      transition: "all 0.15s",
                    }}>
                      {/* Check-in button */}
                      <button onClick={() => toggleCheckin(res)}
                        style={{
                          width: isMobile ? 60 : 52, height: isMobile ? 60 : 52,
                          borderRadius: isMobile ? 30 : 26, border: "none", flexShrink: 0,
                          background: checked ? B.success : B.navyLight,
                          color: checked ? B.navy : "rgba(255,255,255,0.3)",
                          fontSize: checked ? (isMobile ? 30 : 26) : (isMobile ? 24 : 22),
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, transition: "all 0.15s",
                        }}>
                        {checked ? "✓" : "○"}
                      </button>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: checked ? B.success : B.white, marginBottom: 2 }}>
                          {res.nombre}
                        </div>
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
                        {/* Embarcación selector */}
                        {embarcaciones.length > 0 && (
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
                              {embarcaciones.map(e => (
                                <option key={e.id} value={e.nombre}>{e.nombre}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Pasajeros / Zarpe button */}
                      <button onClick={() => setEditPax(res)}
                        title="Datos para zarpe"
                        style={{
                          padding: isMobile ? "10px 12px" : "8px 12px",
                          borderRadius: 8, border: `1px solid ${tienePax ? B.success + "44" : B.navyLight}`,
                          background: tienePax ? B.success + "15" : "transparent",
                          color: tienePax ? B.success : "rgba(255,255,255,0.3)",
                          fontSize: isMobile ? 18 : 11, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
                        }}>
                        {isMobile ? (tienePax ? "✓" : "📋") : (tienePax ? "✓ Zarpe" : "📋 Zarpe")}
                      </button>
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
