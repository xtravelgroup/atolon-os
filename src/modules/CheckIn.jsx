import { useState, useEffect, useCallback, useRef } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const NACS = ["Colombiana", "Americana", "Venezolana", "Brasileña", "Argentina", "Chilena", "Peruana", "Mexicana", "Española", "Francesa", "Alemana", "Italiana", "Canadiense", "Inglesa", "Otra"];

// ─── Zarpe print styles ───────────────────────────────────────────────────────
const ZARPE_STYLE = `
  @media print {
    body > * { display: none !important; }
    #zarpe-print { display: block !important; position: fixed; inset: 0; background: white; z-index: 99999; padding: 24px 32px; color: #000; font-family: Arial, sans-serif; }
  }
  #zarpe-print { display: none; }
`;

// ─── QR Scanner ──────────────────────────────────────────────────────────────
function QRScanner({ onScan, onClose }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setScanning(true);
          scanLoop();
        }
      })
      .catch(() => setError("No se pudo acceder a la cámara. Asegúrate de dar permiso."));

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const scanLoop = () => {
    if (!("BarcodeDetector" in window)) return;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const detect = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          onScan(codes[0].rawValue);
          return;
        }
      } catch (_) {}
      rafRef.current = requestAnimationFrame(detect);
    };
    rafRef.current = requestAnimationFrame(detect);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: B.white, marginBottom: 16 }}>Apunta al código QR</div>
      {error ? (
        <div style={{ color: B.danger, fontSize: 14, textAlign: "center", padding: "0 24px", marginBottom: 20 }}>{error}</div>
      ) : (
        <div style={{ position: "relative", width: 300, height: 300, borderRadius: 16, overflow: "hidden", border: `3px solid ${B.sand}` }}>
          <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
          {/* Corner markers */}
          {["0 0", "0 auto", "auto 0", "auto"].map((m, i) => (
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
          {scanning && !("BarcodeDetector" in window) && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
              <div style={{ color: B.warning, fontSize: 12, textAlign: "center", padding: 16 }}>BarcodeDetector no soportado en este navegador. Usa Chrome en Android.</div>
            </div>
          )}
        </div>
      )}
      <button onClick={onClose} style={{ marginTop: 24, padding: "12px 32px", borderRadius: 10, background: B.navyLight, color: B.white, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
    </div>
  );
}

// ─── Pasajeros Editor (for zarpe) ────────────────────────────────────────────
function PasajerosModal({ reserva, onClose, onSaved }) {
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
    await supabase.from("reservas").update({ pasajeros: pax }).eq("id", reserva.id);
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
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
            {saving ? "Guardando..." : "Guardar pasajeros"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Zarpe Print ─────────────────────────────────────────────────────────────
function imprimirZarpe(salida, reservas, fecha, despacho) {
  const todos = reservas.flatMap(r =>
    r.pasajeros?.length > 0
      ? r.pasajeros
      : [{ nombre: r.nombre, identificacion: "—", nacionalidad: "—" }]
  );
  const el = document.getElementById("zarpe-print");
  el.innerHTML = `
    <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #1E3566;padding-bottom:16px">
      <div style="font-size:22px;font-weight:900;color:#1E3566">ZARPE DE PASAJEROS</div>
      <div style="font-size:13px;color:#666;margin-top:4px">Atolon Beach Club — Muelle Cartagena</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 24px;margin-bottom:20px;font-size:12px">
      <div><b>Fecha:</b> ${new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</div>
      <div><b>Salida:</b> ${salida.nombre} — ${salida.hora}</div>
      <div><b>Regreso:</b> ${salida.hora_regreso}</div>
      <div><b>Total pasajeros:</b> ${todos.length}</div>
      <div><b>Generado:</b> ${new Date().toLocaleTimeString("es-CO")}</div>
      ${despacho?.zarpe_codigo ? `<div><b style="color:#1E3566">Código Zarpe:</b> <span style="font-size:15px;font-weight:900;letter-spacing:2px">${despacho.zarpe_codigo}</span></div>` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#1E3566;color:white">
          <th style="padding:8px;text-align:left;width:5%">#</th>
          <th style="padding:8px;text-align:left;width:40%">Nombre Completo</th>
          <th style="padding:8px;text-align:left;width:25%">No. Identificación</th>
          <th style="padding:8px;text-align:left;width:20%">Nacionalidad</th>
          <th style="padding:8px;text-align:center;width:10%">Check-in</th>
        </tr>
      </thead>
      <tbody>
        ${todos.map((p, i) => `
          <tr style="background:${i % 2 === 0 ? "#f9f9f9" : "white"}">
            <td style="padding:7px 8px;border-bottom:1px solid #eee">${i + 1}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #eee;font-weight:600">${p.nombre || "—"}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #eee">${p.identificacion || "—"}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #eee">${p.nacionalidad || "—"}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:center">☐</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:11px;color:#666">
      <div style="border-top:1px solid #999;padding-top:8px;text-align:center">Capitán / Responsable embarcación</div>
      <div style="border-top:1px solid #999;padding-top:8px;text-align:center">Firma Capitanía de Puerto</div>
    </div>
    <div style="margin-top:20px;font-size:10px;color:#aaa;text-align:center">
      Documento generado por Atolon OS — ${new Date().toLocaleString("es-CO")}
    </div>
  `;
  window.print();
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function CheckIn() {
  const [fecha,      setFecha]      = useState(todayStr());
  const [salidas,    setSalidas]    = useState([]);
  const [reservas,   setReservas]   = useState([]);
  const [despachos,  setDespachos]  = useState([]);
  const [tabSalida,  setTabSalida]  = useState(null);
  const [scanning,   setScanning]   = useState(false);
  const [scanMsg,    setScanMsg]    = useState(null); // { ok, text }
  const [editPax,    setEditPax]    = useState(null); // reserva to edit pasajeros
  const [search,     setSearch]     = useState("");
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [salR, resR, desR] = await Promise.all([
      supabase.from("salidas").select("*").eq("activo", true).order("orden"),
      supabase.from("reservas").select("*").eq("fecha", fecha).neq("estado", "cancelado").order("nombre"),
      supabase.from("salida_despachos").select("*").eq("fecha", fecha),
    ]);
    const sals = salR.data || [];
    setSalidas(sals);
    setReservas(resR.data || []);
    setDespachos(desR.data || []);
    if (sals.length > 0 && !tabSalida) setTabSalida(sals[0].id);
    setLoading(false);
  }, [fecha]);

  useEffect(() => { load(); }, [load]);

  // ── Check-in toggle
  const toggleCheckin = async (res) => {
    const val = res.checkin_at ? null : new Date().toISOString();
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
      <style>{ZARPE_STYLE}</style>
      <div id="zarpe-print" />

      {scanning && <QRScanner onScan={handleScan} onClose={() => setScanning(false)} />}
      {editPax  && <PasajerosModal reserva={editPax} onClose={() => setEditPax(null)} onSaved={load} />}

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600 }}>Check-in · Muelle</h2>
            <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setTabSalida(null); }}
              style={{ ...IS, width: "auto", fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setScanning(true)}
              style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              📷 Escanear QR
            </button>
          </div>
        </div>

        {/* Salida tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {salidas.map(s => {
            const resS   = reservas.filter(r => r.salida_id === s.id);
            const chkS   = resS.filter(r => r.checkin_at).reduce((a, r) => a + (r.pax || 0), 0);
            const totS   = resS.reduce((a, r) => a + (r.pax || 0), 0);
            const despS  = despachos.find(d => d.salida_id === s.id);
            const isActive = tabSalida === s.id;
            return (
              <button key={s.id} onClick={() => setTabSalida(s.id)}
                style={{
                  padding: "10px 18px", borderRadius: 10, border: `2px solid ${isActive ? B.sky : B.navyLight}`,
                  background: isActive ? B.sky + "22" : B.navyMid, color: isActive ? B.sky : "rgba(255,255,255,0.6)",
                  cursor: "pointer", textAlign: "left",
                }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.hora}</div>
                <div style={{ fontSize: 11, color: chkS === totS && totS > 0 ? B.success : "rgba(255,255,255,0.4)" }}>
                  {chkS}/{totS} pax {despS ? "· ✈ DESPACHADO" : ""}
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
            <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {salida.nombre} — {salida.hora}
                  <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.4)", marginLeft: 12 }}>Regreso {salida.hora_regreso}</span>
                </div>
                <div style={{ display: "flex", gap: 20, marginTop: 6 }}>
                  <span style={{ fontSize: 13 }}>
                    <span style={{ color: B.success, fontWeight: 700 }}>{checkedIn}</span>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>/{totalPax} pax en muelle</span>
                  </span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                    {resDesal.filter(r => r.checkin_at).length}/{resDesal.length} reservas
                  </span>
                  {despacho && (
                    <span style={{ fontSize: 13, color: B.success, fontWeight: 700 }}>
                      ✈ Despachado {new Date(despacho.despachado_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => imprimirZarpe(salida, resDesal, fecha, despacho)}
                  style={{ padding: "10px 16px", borderRadius: 8, background: B.navyLight, color: B.white, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  📄 Zarpe
                </button>
                <button onClick={() => despachar(salida)}
                  style={{ padding: "10px 20px", borderRadius: 8, background: despacho ? B.success + "33" : B.sand, color: despacho ? B.success : B.navy, border: despacho ? `1px solid ${B.success}` : "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {despacho ? "✈ Embarcación despachada" : "✈ Despachar embarcación"}
                </button>
              </div>
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
                      borderRadius: 12, padding: "14px 16px",
                      border: `2px solid ${checked ? B.success + "55" : B.navyLight}`,
                      display: "flex", alignItems: "center", gap: 16,
                      transition: "all 0.15s",
                    }}>
                      {/* Check-in button */}
                      <button onClick={() => toggleCheckin(res)}
                        style={{
                          width: 52, height: 52, borderRadius: 26, border: "none", flexShrink: 0,
                          background: checked ? B.success : B.navyLight,
                          color: checked ? B.navy : "rgba(255,255,255,0.3)",
                          fontSize: checked ? 26 : 22, cursor: "pointer",
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
                      </div>

                      {/* Pasajeros / Zarpe button */}
                      <button onClick={() => setEditPax(res)}
                        title="Datos para zarpe"
                        style={{
                          padding: "8px 12px", borderRadius: 8, border: `1px solid ${tienePax ? B.success + "44" : B.navyLight}`,
                          background: tienePax ? B.success + "15" : "transparent",
                          color: tienePax ? B.success : "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
                        }}>
                        {tienePax ? "✓ Zarpe" : "📋 Zarpe"}
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
