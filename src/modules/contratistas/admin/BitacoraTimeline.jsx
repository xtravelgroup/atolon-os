// Timeline de eventos + agregar nota interna.
import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { B } from "../../../brand";

const EVENTO_META = {
  registro_enviado:   { icon: "📝", color: B.sky,     label: "Registro enviado" },
  estado_en_revision: { icon: "🔍", color: B.warning, label: "En revisión" },
  estado_aprobado:    { icon: "✅", color: B.success, label: "Aprobado" },
  estado_rechazado:   { icon: "⛔", color: B.danger,  label: "Rechazado" },
  estado_devuelto:    { icon: "↩",  color: "#F97316", label: "Devuelto con observaciones" },
  estado_vencido:     { icon: "⏰", color: B.pink,    label: "Vencido" },
  estado_activo:      { icon: "▶",  color: B.sand,    label: "Activo" },
  estado_cerrado:     { icon: "⏹",  color: "rgba(255,255,255,0.4)", label: "Cerrado" },
  nota_interna:       { icon: "🗒", color: B.sand,    label: "Nota interna" },
  curso_completado:   { icon: "🎓", color: B.success, label: "Curso completado" },
  email_enviado:      { icon: "✉",  color: B.sky,     label: "Email enviado" },
};

function fmt(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

export default function BitacoraTimeline({ contratistaId, adminUser, onAdded }) {
  const [events, setEvents] = useState(null);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("contratistas_bitacora")
      .select("*")
      .eq("contratista_id", contratistaId)
      .order("created_at", { ascending: false });
    setEvents(data || []);
  };

  if (events === null && contratistaId) load();

  const addNota = async () => {
    const text = nota.trim();
    if (!text) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("contratistas_bitacora").insert({
        contratista_id: contratistaId,
        evento: "nota_interna",
        descripcion: text,
        usuario_id: adminUser?.id || null,
        usuario_nombre: adminUser?.email || "admin",
      });
      if (error) throw error;
      setNota("");
      await load();
      onAdded?.();
    } catch (err) {
      alert("Error al guardar nota: " + (err.message || err));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, background: B.navyLight, borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 10, color: B.sand, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
          Agregar nota interna
        </div>
        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          placeholder="Ej: llamé al contratista, falta actualizar PILA…"
          rows={3}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 6,
            background: B.navyMid, border: `1px solid ${B.navyLight}`,
            color: B.white, fontSize: 13, outline: "none",
            fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={addNota}
            disabled={busy || !nota.trim()}
            style={{
              padding: "8px 16px", background: B.sky, color: B.navy,
              border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: busy || !nota.trim() ? "not-allowed" : "pointer",
              opacity: busy || !nota.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Guardando…" : "Agregar nota"}
          </button>
        </div>
      </div>

      {events === null ? (
        <div style={{ color: B.sand, padding: 20, textAlign: "center", fontSize: 13 }}>Cargando…</div>
      ) : events.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.4)", padding: 20, textAlign: "center", fontSize: 13 }}>
          Sin eventos registrados.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {events.map(ev => {
            const meta = EVENTO_META[ev.evento] || { icon: "•", color: B.sand, label: ev.evento };
            return (
              <div key={ev.id} style={{
                display: "flex", gap: 12, padding: 12,
                background: B.navyLight, borderRadius: 8,
                borderLeft: `3px solid ${meta.color}`,
              }}>
                <div style={{ fontSize: 18, lineHeight: 1 }}>{meta.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ color: meta.color, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {meta.label}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {fmt(ev.created_at)}
                    </div>
                  </div>
                  {(ev.descripcion || ev.detalle) && (
                    <div style={{ fontSize: 13, color: B.white, marginTop: 4, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                      {ev.descripcion || ev.detalle}
                    </div>
                  )}
                  {ev.usuario_nombre && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                      por {ev.usuario_nombre}
                    </div>
                  )}
                  {ev.estado_anterior && ev.estado_nuevo && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                      {ev.estado_anterior} → {ev.estado_nuevo}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
