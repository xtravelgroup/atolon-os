import { useState, useEffect, useCallback } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { wompiCheckoutUrl } from "../lib/wompi";

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

// ─── Precios After Island ─────────────────────────────────────────────────────
const PRECIO_AFTER_A = 170000;
const PRECIO_AFTER_N = 120000;

// ─── Modal Registro Llegada ───────────────────────────────────────────────────
function ModalNuevaLlegada({ tipo, fecha, reserva, onClose, onSaved }) {
  const esAfter  = tipo === "after_island";
  const esRest   = tipo === "restaurante";
  const esLancha = tipo === "lancha_atolon";

  const [f, setF] = useState({
    embarcacion_nombre: reserva?.embarcacion_asignada || "",
    matricula: "",
    pax_a: reserva ? (reserva.pax_a || reserva.pax || 1) : 1,
    pax_n: reserva ? (reserva.pax_n || 0) : 0,
    hora_llegada: hoyHora(),
    notas: "",
  });

  const [fotoFile, setFotoFile]       = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [saving, setSaving]           = useState(false);

  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const paxTotal   = Number(f.pax_a) + Number(f.pax_n);
  const montoAfter = Number(f.pax_a) * PRECIO_AFTER_A + Number(f.pax_n) * PRECIO_AFTER_N;

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const [errorMsg, setErrorMsg] = useState(null);

  const handleGuardar = async () => {
    if (!supabase || saving) return;
    setErrorMsg(null);
    setSaving(true);
    const id = `ML-${Date.now()}`;

    // Subir foto (si falla, igual registramos sin foto)
    let foto_url = null;
    if (fotoFile) {
      setUploadingFoto(true);
      try {
        const ext = fotoFile.name.split(".").pop();
        const path = `${id}.${ext}`;
        const { data: upData, error: upErr } = await supabase.storage
          .from("muelle-fotos")
          .upload(path, fotoFile, { upsert: true });
        if (!upErr && upData) {
          const { data: urlData } = supabase.storage.from("muelle-fotos").getPublicUrl(path);
          foto_url = urlData?.publicUrl || null;
        }
      } catch (_) {}
      setUploadingFoto(false);
    }

    const payload = {
      id, fecha, tipo,
      embarcacion_nombre: f.embarcacion_nombre || null,
      matricula:          f.matricula || null,
      pax_a:     Number(f.pax_a) || 0,
      pax_n:     Number(f.pax_n) || 0,
      pax_total: paxTotal,
      reserva_id: reserva?.id || null,
      hora_llegada: f.hora_llegada || null,
      estado: "llegó",
      notas: f.notas || null,
    };
    // Solo incluir foto_url si está disponible (columna puede no existir aún)
    if (foto_url) payload.foto_url = foto_url;

    const { error } = await supabase.from("muelle_llegadas").insert(payload);
    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    onSaved();
  };

  const tipoLabel = esAfter ? "After Island" : esRest ? "Restaurante" : "Lancha Atolon";
  const tipoIcon  = esAfter ? "🌙" : esRest ? "🍽️" : "⛵";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000B", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 18, padding: 28, width: 500, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
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
              placeholder={esLancha ? "Ej: Atolon I" : "Ej: Patricia, sin nombre..."} style={IS} />
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
            <label style={LS}>Notas</label>
            <input value={f.notas} onChange={e => s("notas", e.target.value)} placeholder="Observaciones..." style={IS} />
          </div>

          <div style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
            <label style={LS}>Foto embarcación (opcional)</label>
            {fotoPreview ? (
              <div style={{ position: "relative" }}>
                <img src={fotoPreview} alt="preview" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, border: `1px solid rgba(255,255,255,0.12)` }} />
                <button onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                <label style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                  Cambiar<input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFotoChange} />
                </label>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "20px", borderRadius: 10, border: `2px dashed rgba(255,255,255,0.15)`, background: B.navyLight, cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 13, boxSizing: "border-box" }}>
                <span style={{ fontSize: 24 }}>📷</span>
                <span>Toca para agregar foto</span>
                <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFotoChange} />
              </label>
            )}
          </div>
        </div>

        {/* Resumen precio After (solo informativo) */}
        {esAfter && paxTotal > 0 && (
          <div style={{ background: B.sand + "18", border: `1px solid ${B.sand}33`, borderRadius: 10, padding: "12px 16px", margin: "16px 0" }}>
            <div style={{ fontSize: 11, color: B.sand, marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>💰 Cobro pendiente al registrar</div>
            <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
              {Number(f.pax_a) > 0 && <span>{f.pax_a}A × {COP(PRECIO_AFTER_A)} = <strong>{COP(Number(f.pax_a) * PRECIO_AFTER_A)}</strong></span>}
              {Number(f.pax_n) > 0 && <span>{f.pax_n}N × {COP(PRECIO_AFTER_N)} = <strong>{COP(Number(f.pax_n) * PRECIO_AFTER_N)}</strong></span>}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, marginTop: 4 }}>Total: {COP(montoAfter)}</div>
          </div>
        )}

        {errorMsg && (
          <div style={{ background: "#ff000022", border: "1px solid #ff000055", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 12, color: "#ff6b6b" }}>
            ⚠️ {errorMsg}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={saving || uploadingFoto}
            style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: (saving || uploadingFoto) ? B.navyLight : B.sky, color: (saving || uploadingFoto) ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {uploadingFoto ? "Subiendo foto..." : saving ? "Registrando..." : "⚓ Registrar Llegada"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Cobro After Island (paso 1: editar datos · paso 2: cobrar) ────────
function ModalCobro({ llegada, onClose, onSaved }) {
  const [paso, setPaso] = useState(1);
  const [f, setF] = useState({
    embarcacion_nombre: llegada.embarcacion_nombre || "",
    matricula: llegada.matricula || "",
    pax_a: llegada.pax_a ?? 0,
    pax_n: llegada.pax_n ?? 0,
    notas: llegada.notas || "",
  });
  const sf = (k, v) => setF(p => ({ ...p, [k]: v }));

  const monto = Number(f.pax_a) * PRECIO_AFTER_A + Number(f.pax_n) * PRECIO_AFTER_N;
  const [cobro, setCobro] = useState({ email: "", linkUrl: "", linkGenerado: false });
  const [saving, setSaving] = useState(false);
  const sc = (k, v) => setCobro(p => ({ ...p, [k]: v }));

  const handleConfirmarDatos = async () => {
    if (!supabase || saving) return;
    setSaving(true);
    await supabase.from("muelle_llegadas").update({
      embarcacion_nombre: f.embarcacion_nombre || null,
      matricula: f.matricula || null,
      pax_a: Number(f.pax_a) || 0,
      pax_n: Number(f.pax_n) || 0,
      pax_total: Number(f.pax_a) + Number(f.pax_n),
      notas: f.notas || null,
    }).eq("id", llegada.id);
    setSaving(false);
    setPaso(2);
  };

  const handleCobro = async (metodo) => {
    if (!supabase || saving) return;
    if (metodo === "link") {
      setSaving(true);
      const url = await wompiCheckoutUrl({ referencia: llegada.id, totalCOP: monto, email: cobro.email || "" });
      await supabase.from("muelle_llegadas").update({ metodo_pago: "link", total_cobrado: monto }).eq("id", llegada.id);
      sc("linkUrl", url);
      sc("linkGenerado", true);
      setSaving(false);
      return;
    }
    setSaving(true);
    await supabase.from("muelle_llegadas").update({ total_cobrado: monto, metodo_pago: metodo }).eq("id", llegada.id);
    setSaving(false);
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000B", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 18, padding: 28, width: 480, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🌙 After Island — {paso === 1 ? "Verificar datos" : "Cobro"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{f.embarcacion_nombre || "Embarcación"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Barra de pasos */}
        <div style={{ display: "flex", gap: 6, marginBottom: 22, marginTop: 10 }}>
          {["Verificar datos", "Cobro"].map((lbl, i) => (
            <div key={lbl} style={{ flex: 1, height: 4, borderRadius: 2, background: paso > i ? B.sand : "rgba(255,255,255,0.12)" }} />
          ))}
        </div>

        {/* ── PASO 1: Editar datos ── */}
        {paso === 1 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                <label style={LS}>Nombre / ID embarcación</label>
                <input value={f.embarcacion_nombre} onChange={e => sf("embarcacion_nombre", e.target.value)} placeholder="Ej: Patricia..." style={IS} />
              </div>
              <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                <label style={LS}>Matrícula (opcional)</label>
                <input value={f.matricula} onChange={e => sf("matricula", e.target.value)} placeholder="Ej: CT-1234" style={IS} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Adultos</label>
                <input type="number" min="0" value={f.pax_a} onChange={e => sf("pax_a", e.target.value)} style={IS} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Niños</label>
                <input type="number" min="0" value={f.pax_n} onChange={e => sf("pax_n", e.target.value)} style={IS} />
              </div>
              <div style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
                <label style={LS}>Notas</label>
                <input value={f.notas} onChange={e => sf("notas", e.target.value)} placeholder="Observaciones..." style={IS} />
              </div>
            </div>

            {/* Preview monto */}
            {(Number(f.pax_a) + Number(f.pax_n)) > 0 && (
              <div style={{ background: B.sand + "18", border: `1px solid ${B.sand}33`, borderRadius: 10, padding: "12px 16px", margin: "16px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {Number(f.pax_a) > 0 && <span>{f.pax_a}A × {COP(PRECIO_AFTER_A)}</span>}
                    {Number(f.pax_n) > 0 && <span>{f.pax_n}N × {COP(PRECIO_AFTER_N)}</span>}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>{COP(monto)}</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={handleConfirmarDatos} disabled={saving}
                style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: saving ? B.navyLight : B.sand, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {saving ? "Guardando..." : "Confirmar → Cobrar"}
              </button>
            </div>
          </>
        )}

        {/* ── PASO 2: Cobro ── */}
        {paso === 2 && (
          <>
            {/* Resumen */}
            <div style={{ background: B.sand + "18", border: `1px solid ${B.sand}33`, borderRadius: 12, padding: "14px 18px", marginBottom: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                    {f.pax_a} adulto{f.pax_a !== 1 ? "s" : ""}{f.pax_n > 0 ? ` + ${f.pax_n} niño${f.pax_n !== 1 ? "s" : ""}` : ""} · ⚓ {fmtHora(llegada.hora_llegada)}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {Number(f.pax_a) > 0 && <span>{f.pax_a} × {COP(PRECIO_AFTER_A)}</span>}
                    {Number(f.pax_n) > 0 && <span>{f.pax_n} × {COP(PRECIO_AFTER_N)}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: B.sand }}>{COP(monto)}</div>
              </div>
            </div>

        {!cobro.linkGenerado ? (
          <>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>¿Cómo se realiza el cobro?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => handleCobro("datafono")} disabled={saving}
                style={{ padding: "16px 20px", borderRadius: 12, border: `2px solid ${B.sky}44`, background: B.navy, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
                <span style={{ fontSize: 28 }}>💳</span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>Datáfono</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Cobrar con datáfono físico</div></div>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: B.sky }}>{COP(monto)}</span>
              </button>
              <button onClick={() => handleCobro("efectivo")} disabled={saving}
                style={{ padding: "16px 20px", borderRadius: 12, border: `2px solid ${B.success}44`, background: B.navy, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
                <span style={{ fontSize: 28 }}>💵</span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>Efectivo</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Cobrar en efectivo</div></div>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: B.success }}>{COP(monto)}</span>
              </button>
              <div style={{ padding: "16px 20px", borderRadius: 12, border: `2px solid ${B.sand}44`, background: B.navy }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>🔗</span>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>Enviar Link de Pago</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Wompi · El cliente paga desde su celular</div></div>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: B.sand }}>{COP(monto)}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={cobro.email} onChange={e => sc("email", e.target.value)}
                    placeholder="Email del cliente (opcional)" style={{ ...IS, flex: 1, fontSize: 12 }} />
                  <button onClick={() => handleCobro("link")} disabled={saving}
                    style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {saving ? "..." : "Generar →"}
                  </button>
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: `1px solid rgba(255,255,255,0.1)`, background: "none", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer" }}>
              Cobrar después
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Link de pago generado</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>Envíalo por WhatsApp o cópialo</div>
            <div style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 11, wordBreak: "break-all", color: B.sky, textAlign: "left" }}>
              {cobro.linkUrl}
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button onClick={() => navigator.clipboard.writeText(cobro.linkUrl)}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.sky}44`, background: "none", color: B.sky, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                📋 Copiar link
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Hola 👋 Aquí está tu link de pago para el After Island en Atolon Beach Club 🌙\n\n${cobro.linkUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16"><path fill="#fff" d="M16 2C8.28 2 2 8.28 2 16c0 2.46.66 4.77 1.8 6.77L2 30l7.43-1.76A13.93 13.93 0 0 0 16 30c7.72 0 14-6.28 14-14S23.72 2 16 2Z"/></svg>
                WhatsApp
              </a>
            </div>
            <button onClick={onSaved}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: B.sky, color: B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ✓ Listo
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Card de Llegada ──────────────────────────────────────────────────────────
function LlegadaCard({ llegada, onEstadoChange, onDelete }) {
  const [saving, setSaving]       = useState(false);
  const [showCobro, setShowCobro] = useState(false);
  const est = ESTADO_COLOR[llegada.estado] || ESTADO_COLOR.esperada;

  const FLUJO       = { esperada: "llegó", "llegó": "en_isla", en_isla: "salió", salió: null };
  const FLUJO_LABEL = { esperada: "✓ Llegó", "llegó": "🏝 En isla", en_isla: "⛵ Salió", salió: null };

  const avanzar = async () => {
    const sig = FLUJO[llegada.estado];
    if (!sig || !supabase || saving) return;
    setSaving(true);
    const upd = { estado: sig };
    if (sig === "llegó") upd.hora_llegada = hoyHora();
    if (sig === "salió") upd.hora_salida  = hoyHora();
    await supabase.from("muelle_llegadas").update(upd).eq("id", llegada.id);
    setSaving(false);
    onEstadoChange();
  };

  const esAfterSinCobro = llegada.tipo === "after_island" && !(llegada.total_cobrado > 0);
  const tipoIcon = llegada.tipo === "after_island" ? "🌙" : llegada.tipo === "restaurante" ? "🍽️" : "⛵";

  return (
    <>
      {showCobro && (
        <ModalCobro
          llegada={llegada}
          onClose={() => setShowCobro(false)}
          onSaved={() => { setShowCobro(false); onEstadoChange(); }}
        />
      )}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", marginBottom: 10, border: `1px solid ${esAfterSinCobro ? B.sand + "55" : est.color + "33"}` }}>
        {llegada.foto_url && (
          <a href={llegada.foto_url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 10 }}>
            <img src={llegada.foto_url} alt="embarcación" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, border: `1px solid rgba(255,255,255,0.08)` }} />
          </a>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>{tipoIcon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{llegada.embarcacion_nombre || "Embarcación"}</span>
              {llegada.matricula && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{llegada.matricula}</span>}
              <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 8, background: est.bg, color: est.color, fontWeight: 600 }}>{est.label}</span>
              {esAfterSinCobro && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 8, background: B.sand + "22", color: B.sand, fontWeight: 600 }}>💰 Sin cobro</span>}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>👥 {llegada.pax_total} pax{llegada.pax_n > 0 ? ` (${llegada.pax_a}A + ${llegada.pax_n}N)` : ""}</span>
              {llegada.hora_llegada && <span>⚓ {fmtHora(llegada.hora_llegada)}</span>}
              {llegada.hora_salida  && <span>🏠 {fmtHora(llegada.hora_salida)}</span>}
              {llegada.total_cobrado > 0 && <span style={{ color: B.success }}>✓ {COP(llegada.total_cobrado)} · {llegada.metodo_pago}</span>}
            </div>
            {llegada.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, fontStyle: "italic" }}>{llegada.notas}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {esAfterSinCobro && (
              <button onClick={() => setShowCobro(true)}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                💰 Cobrar
              </button>
            )}
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
    </>
  );
}

// ─── MAIN MODULE ──────────────────────────────────────────────────────────────
export default function MuelleCheckin() {
  const { isMobile } = useMobile();
  const [fecha, setFecha]   = useState(todayStr());
  const [llegadas, setLlegadas] = useState([]);
  const [modal, setModal]   = useState(null);

  const fetchLlegadas = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("muelle_llegadas").select("*").eq("fecha", fecha).order("created_at");
    setLlegadas(data || []);
  }, [fecha]);

  useEffect(() => { fetchLlegadas(); }, [fetchLlegadas]);

  const totalPax     = llegadas.reduce((t, l) => t + (l.pax_total || 0), 0);
  const enIsla       = llegadas.filter(l => l.estado === "en_isla" || l.estado === "llegó").reduce((t, l) => t + (l.pax_total || 0), 0);
  const salieron     = llegadas.filter(l => l.estado === "salió").reduce((t, l) => t + (l.pax_total || 0), 0);
  const totalCobrado = llegadas.reduce((t, l) => t + (l.total_cobrado || 0), 0);

  const porTipo = (tipo) => llegadas.filter(l => l.tipo === tipo);

  const SECCIONES = [
    { tipo: "lancha_atolon", icon: "⛵", label: "Lanchas Atolon",  color: B.sky,     btnBg: B.sky,     btnColor: B.navy },
    { tipo: "after_island",  icon: "🌙", label: "After Island",    color: B.sand,    btnBg: B.sand,    btnColor: B.navy },
    { tipo: "restaurante",   icon: "🍽️", label: "Restaurante",    color: B.success, btnBg: B.success, btnColor: "#fff"  },
  ];

  const delLlegada = async (id) => {
    await supabase.from("muelle_llegadas").delete().eq("id", id);
    fetchLlegadas();
  };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : "24px", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#e2e8f0", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#fff" }}>⚓ Llegadas a Isla</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Control de embarcaciones · Isla Tierra Bomba</div>
        </div>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          style={{ ...IS, width: "auto", fontSize: 14, padding: "8px 14px" }} />
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total llegados", value: totalPax,        color: B.sky },
          { label: "En isla ahora",  value: enIsla,          color: B.success },
          { label: "Ya se fueron",   value: salieron,        color: "rgba(255,255,255,0.4)" },
          { label: "Cobrado",        value: COP(totalCobrado), color: B.sand },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Botones de registro */}
      <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        {SECCIONES.map(({ tipo, icon, label, btnBg, btnColor }) => (
          <button key={tipo} onClick={() => setModal({ tipo, reserva: null })}
            style={{ flex: 1, minWidth: 120, padding: "12px 16px", borderRadius: 12, border: "none", background: btnBg, color: btnColor, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{icon}</span> + {label}
          </button>
        ))}
      </div>

      {/* Lista unificada por sección */}
      {SECCIONES.map(({ tipo, icon, label, color }) => {
        const lista = porTipo(tipo);
        return (
          <div key={tipo} style={{ marginBottom: 28 }}>
            {/* Cabecera de sección */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color }}>{label}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                {lista.length > 0
                  ? `${lista.length} embarcación${lista.length !== 1 ? "es" : ""} · ${lista.reduce((t, l) => t + (l.pax_total || 0), 0)} pax`
                  : "Sin llegadas"}
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            </div>

            {/* Cards */}
            {lista.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "10px 0 0 4px", fontStyle: "italic" }}>
                Ninguna registrada todavía
              </div>
            ) : (
              lista.map(l => (
                <LlegadaCard key={l.id} llegada={l} onEstadoChange={fetchLlegadas} onDelete={() => delLlegada(l.id)} />
              ))
            )}
          </div>
        );
      })}

      {/* Estado vacío global */}
      {llegadas.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
          No hay llegadas registradas para este día
        </div>
      )}

      {/* Modal registro */}
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
