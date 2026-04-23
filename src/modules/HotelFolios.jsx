import React, { useState, useEffect, useCallback, useMemo } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });

const fmtDateTime = (s) => s ? new Date(s).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (s) => s ? new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const ESTADOS = [
  { key: "in_house",    label: "En casa",     color: B.success },
  { key: "reservada",   label: "Reservada",   color: B.sky },
  { key: "checked_out", label: "Check-out",   color: "rgba(255,255,255,0.4)" },
  { key: "cancelada",   label: "Cancelada",   color: B.danger },
];

export default function HotelFolios() {
  const [estancias, setEstancias] = useState([]);
  const [habs, setHabs] = useState([]);
  const [huespedes, setHuespedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("in_house");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [eR, hR, huR] = await Promise.all([
      supabase.from("hotel_estancias").select("*").order("check_in_at", { ascending: false }).limit(200),
      supabase.from("hotel_habitaciones").select("id, numero, categoria"),
      supabase.from("hotel_huespedes").select("id, nombre, apellido, email, telefono, documento"),
    ]);
    setEstancias(eR.data || []);
    setHabs(hR.data || []);
    setHuespedes(huR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const habMap = useMemo(() => Object.fromEntries(habs.map(h => [h.id, h])), [habs]);
  const hueMap = useMemo(() => Object.fromEntries(huespedes.map(h => [h.id, h])), [huespedes]);

  const estanciasFiltered = useMemo(() => {
    let list = estancias;
    if (filtro !== "todas") list = list.filter(e => e.estado === filtro);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => {
        const hue = hueMap[e.huesped_id];
        const hab = habMap[e.habitacion_id];
        return (
          (hue?.nombre || "").toLowerCase().includes(s) ||
          (hue?.apellido || "").toLowerCase().includes(s) ||
          (hab?.numero || "").toLowerCase().includes(s) ||
          (e.codigo || "").toLowerCase().includes(s)
        );
      });
    }
    return list;
  }, [estancias, filtro, search, hueMap, habMap]);

  const estPorEstado = useMemo(() => {
    const map = {};
    estancias.forEach(e => { map[e.estado] = (map[e.estado] || 0) + 1; });
    return map;
  }, [estancias]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando…</div>;

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 16px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", margin: 0 }}>
          📋 Folios y Consumo
        </h1>
      </div>

      {/* KPIs por estado */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={() => setFiltro("todas")} style={{
          padding: "6px 14px", borderRadius: 20, border: `1px solid ${filtro === "todas" ? B.sky : B.navyLight}`,
          background: filtro === "todas" ? B.sky + "22" : B.navyMid, color: filtro === "todas" ? B.sky : "rgba(255,255,255,0.5)",
          cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}>Todas ({estancias.length})</button>
        {ESTADOS.map(e => (
          <button key={e.key} onClick={() => setFiltro(e.key)} style={{
            padding: "6px 14px", borderRadius: 20,
            border: `1px solid ${filtro === e.key ? e.color : B.navyLight}`,
            background: filtro === e.key ? e.color + "22" : B.navyMid,
            color: filtro === e.key ? e.color : "rgba(255,255,255,0.5)",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}>{e.label} ({estPorEstado[e.key] || 0})</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar huésped, habitación o código..." style={{ ...IS, maxWidth: 400 }} />
      </div>

      {/* Lista */}
      <div style={{ background: B.navyMid, borderRadius: 14, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.8fr 0.7fr 1.2fr 1.2fr 0.9fr 0.7fr", padding: "10px 18px", borderBottom: `2px solid ${B.navyLight}`, gap: 8, fontSize: 10, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <div>Código</div>
          <div>Huésped</div>
          <div>Hab</div>
          <div>Check-in</div>
          <div>Check-out</div>
          <div>Estado</div>
          <div>Pax</div>
        </div>
        {estanciasFiltered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
            Sin estancias {filtro !== "todas" ? `en "${ESTADOS.find(e => e.key === filtro)?.label}"` : ""}
          </div>
        ) : estanciasFiltered.map((e, idx) => {
          const hue = hueMap[e.huesped_id];
          const hab = habMap[e.habitacion_id];
          const est = ESTADOS.find(x => x.key === e.estado) || {};
          return (
            <div key={e.id} onClick={() => setSelected(e)} style={{
              display: "grid", gridTemplateColumns: "1.4fr 1.8fr 0.7fr 1.2fr 1.2fr 0.9fr 0.7fr", padding: "12px 18px", gap: 8,
              borderBottom: idx < estanciasFiltered.length - 1 ? `1px solid ${B.navyLight}` : "none",
              cursor: "pointer", alignItems: "center", fontSize: 12,
            }}
              onMouseEnter={ev => ev.currentTarget.style.background = "rgba(255,255,255,0.03)"}
              onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}
            >
              <div style={{ fontFamily: "monospace", fontSize: 11, color: B.sand }}>{e.codigo}</div>
              <div>
                <div style={{ fontWeight: 600 }}>{hue ? `${hue.nombre || ""} ${hue.apellido || ""}`.trim() : "—"}</div>
                {hue?.email && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{hue.email}</div>}
              </div>
              <div style={{ fontWeight: 700 }}>{hab?.numero || "—"}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{fmtDateTime(e.check_in_at)}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{fmtDateTime(e.check_out_at)}</div>
              <div>
                <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: `${est.color || "#888"}22`, color: est.color || "#888" }}>
                  {est.label || e.estado}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{(e.pax_adultos || 0) + (e.pax_ninos || 0)}</div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <FolioDetail
          estancia={selected}
          habitacion={habMap[selected.habitacion_id]}
          huesped={hueMap[selected.huesped_id]}
          onClose={() => setSelected(null)}
          reload={load}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLIO DETAIL
// ═══════════════════════════════════════════════════════════════════════════
function FolioDetail({ estancia, habitacion, huesped, onClose, reload }) {
  const [charges, setCharges] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [cR, pR] = await Promise.all([
      supabase.from("hotel_room_charges").select("*").eq("estancia_id", estancia.id).order("created_at", { ascending: false }),
      supabase.from("hotel_room_service_pedidos").select("*").eq("estancia_id", estancia.id).order("created_at", { ascending: false }),
    ]);
    setCharges(cR.data || []);
    setPedidos(pR.data || []);
    setLoading(false);
  }, [estancia.id]);
  useEffect(() => { load(); }, [load]);

  const totalCharges = charges.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const totalPedidos = pedidos.filter(p => p.estado !== "cancelado").reduce((s, p) => s + (Number(p.total) || 0), 0);
  // Charges incluye ya los pedidos room_service si se crearon correctamente
  const pedidosYaEnCharges = charges.filter(c => c.origen === "room_service").reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const total = totalCharges + (totalPedidos - pedidosYaEnCharges); // evitar doble conteo

  const exportarPDF = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const lineasCargos = charges.map(c => {
      const ped = c.origen === "room_service" ? pedidos.find(p => p.id === c.origen_ref) : null;
      const items = Array.isArray(ped?.items) ? ped.items : [];
      const itemsHtml = items.length > 0
        ? `<div style="margin-top:4px;color:#555;font-size:10px;">${items.map(it => `· ${it.cantidad || 1}× ${it.nombre}${it.notas ? ` — ${it.notas}` : ""}`).join("<br/>")}</div>`
        : "";
      return `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:11px;vertical-align:top;">${fmtDate(c.created_at)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:11px;vertical-align:top;">${c.origen}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:12px;vertical-align:top;">${c.descripcion || "—"}${itemsHtml}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-weight:700;vertical-align:top;">${COP(c.monto)}</td>
      </tr>`;
    }).join("");

    w.document.write(`
<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Folio ${estancia.codigo}</title>
<style>
  body { font-family: 'Inter', sans-serif; margin: 40px; color: #111; }
  .header { border-bottom: 3px solid #0D1B3E; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; }
  h1 { font-family: 'Barlow Condensed', sans-serif; margin: 0; color: #0D1B3E; font-size: 28px; letter-spacing: 1px; }
  .meta { font-size: 11px; color: #666; margin-top: 4px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; background: #f5f5f0; padding: 16px; border-radius: 8px; }
  .info-grid label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .info-grid div { font-size: 14px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #0D1B3E; color: #fff; padding: 10px 6px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  th:last-child { text-align: right; }
  .total-row { font-size: 16px; font-weight: 800; background: #C8B99A22; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 16px; }
</style></head><body>
  <div class="header">
    <div>
      <h1>ATOLÓN BEACH CLUB</h1>
      <div class="meta">Folio de Consumo — ${estancia.codigo}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:#888;">Emitido</div>
      <div style="font-size:13px;font-weight:600;">${new Date().toLocaleString("es-CO")}</div>
    </div>
  </div>

  <div class="info-grid">
    <div><label>Huésped</label><div>${huesped ? `${huesped.nombre || ""} ${huesped.apellido || ""}`.trim() : "—"}</div></div>
    <div><label>Habitación</label><div>${habitacion?.numero || "—"} (${habitacion?.categoria || ""})</div></div>
    <div><label>Check-in</label><div>${fmtDateTime(estancia.check_in_at)}</div></div>
    <div><label>Check-out</label><div>${fmtDateTime(estancia.check_out_at)}</div></div>
    <div><label>Pax</label><div>${estancia.pax_adultos || 0} adulto${(estancia.pax_adultos||0)!==1?"s":""}${estancia.pax_ninos?`, ${estancia.pax_ninos} niño${estancia.pax_ninos!==1?"s":""}`:""}</div></div>
    <div><label>Email</label><div>${huesped?.email || "—"}</div></div>
  </div>

  <h2 style="font-family:'Barlow Condensed',sans-serif;color:#0D1B3E;margin:20px 0 8px;">Cargos</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Origen</th><th>Descripción</th><th>Monto</th></tr></thead>
    <tbody>
      ${lineasCargos || `<tr><td colspan="4" style="padding:20px;text-align:center;color:#888;font-size:12px;">Sin cargos registrados</td></tr>`}
      <tr class="total-row">
        <td colspan="3" style="padding:12px 6px;text-align:right;">TOTAL</td>
        <td style="padding:12px 6px;text-align:right;">${COP(total)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    Atolón Beach Club · Cartagena de Indias · Gracias por su visita
  </div>
  <script>setTimeout(() => window.print(), 500);</script>
</body></html>`);
    w.document.close();
  };

  const hacerCheckout = async () => {
    if (!confirm(`Cerrar estancia de ${huesped?.nombre || "huésped"}?\n\nTotal a cobrar: ${COP(total)}`)) return;
    const { error } = await supabase.from("hotel_estancias").update({
      estado: "checked_out",
      check_out_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", estancia.id);
    if (error) return alert("Error: " + error.message);
    alert("✓ Check-out completado");
    onClose();
    reload();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 600, maxWidth: "95vw", height: "100vh", overflowY: "auto", background: B.navyMid, padding: 28, borderLeft: `3px solid ${B.sky}` }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Folio {estancia.codigo}</div>
            <h2 style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", margin: "6px 0 0" }}>
              {huesped ? `${huesped.nombre || ""} ${huesped.apellido || ""}`.trim() : "—"}
            </h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              🚪 Habitación {habitacion?.numero || "—"} · {habitacion?.categoria}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Fechas */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div style={{ background: B.navy, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Check-in</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{fmtDateTime(estancia.check_in_at)}</div>
          </div>
          <div style={{ background: B.navy, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Check-out</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{fmtDateTime(estancia.check_out_at)}</div>
          </div>
        </div>

        {/* Total */}
        <div style={{ background: `${B.success}11`, border: `1px solid ${B.success}44`, borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: B.success, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Total a Cobrar</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{charges.length} cargo{charges.length !== 1 ? "s" : ""} · {pedidos.filter(p => p.estado !== "cancelado").length} pedido{pedidos.filter(p => p.estado !== "cancelado").length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(total)}</div>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
        ) : (
          <>
            {/* Cargos */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Cargos ({charges.length})
              </div>
              {charges.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12, background: B.navy, borderRadius: 10 }}>
                  Sin cargos registrados
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {charges.map(c => {
                    // Si el cargo viene de room_service, buscar el pedido y listar ítems
                    const ped = c.origen === "room_service" ? pedidos.find(p => p.id === c.origen_ref) : null;
                    const items = Array.isArray(ped?.items) ? ped.items : [];
                    return (
                      <div key={c.id} style={{ background: B.navy, borderRadius: 10, padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.descripcion || c.origen}</div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                              {c.origen} · {fmtDateTime(c.created_at)}
                            </div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: B.sand, whiteSpace: "nowrap" }}>{COP(c.monto)}</div>
                        </div>
                        {items.length > 0 && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${B.navyLight}` }}>
                            {items.map((it, idx) => (
                              <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.75)", padding: "2px 0" }}>
                                <span>· {it.cantidad || 1}× {it.nombre}{it.notas ? ` · ${it.notas}` : ""}</span>
                                <span style={{ color: "rgba(255,255,255,0.5)" }}>{COP((Number(it.cantidad)||1) * (Number(it.precio)||0))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pedidos Room Service */}
            {pedidos.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                  Room Service ({pedidos.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pedidos.map(p => {
                    const items = Array.isArray(p.items) ? p.items : [];
                    return (
                      <div key={p.id} style={{ background: B.navy, borderRadius: 10, padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{p.codigo}</div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                              {fmtDateTime(p.created_at)} · {p.estado}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: p.estado === "cancelado" ? "rgba(255,255,255,0.3)" : B.sand, textDecoration: p.estado === "cancelado" ? "line-through" : "none" }}>{COP(p.total)}</div>
                        </div>
                        {items.length > 0 && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${B.navyLight}` }}>
                            {items.map((it, idx) => (
                              <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.75)", padding: "2px 0" }}>
                                <span>· {it.cantidad || 1}× {it.nombre}{it.notas ? ` · ${it.notas}` : ""}</span>
                                <span style={{ color: "rgba(255,255,255,0.5)" }}>{COP((Number(it.cantidad)||1) * (Number(it.precio)||0))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 24, position: "sticky", bottom: 0, background: B.navyMid, paddingTop: 12 }}>
          <button onClick={exportarPDF} style={{ ...BTN(B.navyLight), flex: 1, color: B.sky, border: `1px solid ${B.sky}55` }}>🖨️ Imprimir Folio</button>
          {estancia.estado === "in_house" && (
            <button onClick={hacerCheckout} style={{ ...BTN(B.success), flex: 1 }}>✓ Check-out</button>
          )}
        </div>
      </div>
    </div>
  );
}
