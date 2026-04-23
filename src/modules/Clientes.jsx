import { useState, useCallback } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

const fmtHora = (ts) => {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
};

const ESTADO_STYLE = {
  confirmado:            { bg: "#00c07822", color: "#00c078", label: "Confirmado" },
  pendiente:             { bg: "#f59e0b22", color: "#f59e0b", label: "Pendiente"  },
  cancelado:             { bg: "#ef444422", color: "#ef4444", label: "Cancelado"  },
  pendiente_pago:        { bg: "#f59e0b22", color: "#f59e0b", label: "Pend. Pago" },
  pendiente_comprobante: { bg: "#38bdf822", color: "#38bdf8", label: "Pend. Comp" },
};

export default function Clientes() {
  const isMobile = useMobile();
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [searched, setSearched]     = useState(false);
  const [selected, setSelected]     = useState(null); // cliente object
  const [reservas, setReservas]     = useState([]);
  const [creditos, setCreditos]     = useState([]);
  const [loadingPerfil, setLoadingPerfil] = useState(false);

  const buscar = useCallback(async () => {
    if (!supabase || !query.trim()) return;
    setLoading(true);
    setSelected(null);
    const q = query.trim();
    // Search reservas directly — clientes table is not fully populated
    const { data } = await supabase.from("reservas")
      .select("nombre, email, contacto, telefono, total, estado, fecha, canal, aliado_id")
      .or(`nombre.ilike.%${q}%,email.ilike.%${q}%,contacto.ilike.%${q}%,telefono.ilike.%${q}%`)
      .neq("estado", "cancelado")
      .order("fecha", { ascending: false })
      .limit(200);

    // Group by email (or nombre if no email) to build client profiles
    const map = {};
    (data || []).forEach(r => {
      const key = (r.email || r.contacto || r.nombre || "").toLowerCase().trim();
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          id: key,
          nombre: r.nombre,
          email: r.email || r.contacto || "",
          telefono: r.telefono || r.contacto || "",
          total_gastado: 0,
          total_reservas: 0,
          canal_origen: r.canal,
        };
      }
      if (r.estado === "confirmado") map[key].total_gastado += r.total || 0;
      map[key].total_reservas += 1;
    });

    const clientes = Object.values(map).sort((a, b) => b.total_gastado - a.total_gastado).slice(0, 30);
    setResults(clientes);
    setSearched(true);
    setLoading(false);
  }, [query]);

  const verPerfil = useCallback(async (cliente) => {
    if (!supabase) return;
    setSelected(cliente);
    setLoadingPerfil(true);
    const email = cliente.email || "";
    const nombre = cliente.nombre || "";
    // Build OR filter: email fields + nombre fallback
    let orFilter = `nombre.ilike.${nombre}`;
    if (email) orFilter += `,email.ilike.${email},contacto.ilike.${email}`;
    const [resR, crdR] = await Promise.all([
      supabase.from("reservas").select("*")
        .or(orFilter)
        .order("fecha", { ascending: false }),
      email ? supabase.from("creditos").select("*")
        .eq("cliente_email", email)
        .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    setReservas(resR.data || []);
    setCreditos(crdR.data || []);
    setLoadingPerfil(false);
  }, []);

  const hoy = new Date().toISOString().slice(0, 10);
  const creditosVigentes = creditos.filter(c => !c.redimido && c.vigencia_hasta >= hoy);
  const creditoTotal = creditosVigentes.reduce((s, c) => s + (c.saldo || 0), 0);
  const totalGastado = reservas.filter(r => r.estado === "confirmado").reduce((s, r) => s + (r.total || 0), 0);
  const totalConfirmadas = reservas.filter(r => r.estado === "confirmado").length;

  return (
    <div style={{ padding: isMobile ? "16px 12px" : "24px 32px", maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 24 }}>
        👤 Clientes
      </h2>

      {/* Buscador */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && buscar()}
          placeholder="Buscar por email, nombre o teléfono..."
          style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, outline: "none" }}
        />
        <button onClick={buscar} disabled={loading || !query.trim()}
          style={{ padding: "12px 24px", borderRadius: 10, background: B.sky, border: "none", color: B.navy, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: !query.trim() ? 0.5 : 1 }}>
          {loading ? "..." : "Buscar"}
        </button>
      </div>

      {/* Resultados de búsqueda */}
      {!selected && searched && (
        results.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
            No se encontraron clientes con ese criterio.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map(c => (
              <div key={c.id} onClick={() => verPerfil(c)}
                style={{ background: B.navyMid, borderRadius: 10, padding: "14px 18px", cursor: "pointer", border: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, transition: "border 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = B.sky}
                onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: B.white }}>{c.nombre || "Sin nombre"}</div>
                  <div style={{ fontSize: 12, color: B.sky, marginTop: 3 }}>✉️ {c.email}</div>
                  <div style={{ fontSize: 12, color: c.telefono ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)", marginTop: 2 }}>
                    📱 {c.telefono || "Sin teléfono"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: B.white }}>{COP(c.total_gastado || 0)}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{c.total_reservas || 0} reservas</div>
                  </div>
                  {(c.credito_disponible || 0) > 0 && (
                    <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 10, background: B.sky + "22", color: B.sky, fontWeight: 700 }}>
                      💳 {COP(c.credito_disponible)}
                    </span>
                  )}
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 18 }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Perfil del cliente */}
      {selected && (
        <div>
          <button onClick={() => setSelected(null)}
            style={{ background: "none", border: "none", color: B.sky, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 20, padding: 0 }}>
            ← Volver a resultados
          </button>

          {loadingPerfil ? (
            <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>Cargando perfil...</div>
          ) : (
            <>
              {/* Header cliente */}
              <div style={{ background: B.navyMid, borderRadius: 14, padding: "20px 24px", marginBottom: 20, border: `1px solid ${B.navyLight}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: B.white }}>{selected.nombre || "Sin nombre"}</div>
                    {/* Email — siempre visible y copiable */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, background: B.navy, borderRadius: 8, padding: "7px 12px", width: "fit-content" }}>
                      <span style={{ fontSize: 14 }}>✉️</span>
                      <span style={{ fontSize: 13, color: B.sky, fontWeight: 600, letterSpacing: "0.01em" }}>{selected.email}</span>
                    </div>
                    {/* Teléfono — siempre visible */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, background: B.navy, borderRadius: 8, padding: "7px 12px", width: "fit-content" }}>
                      <span style={{ fontSize: 14 }}>📱</span>
                      <span style={{ fontSize: 13, color: selected.telefono ? B.white : "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                        {selected.telefono || "Sin teléfono registrado"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                      {selected.canal_origen && <span>Canal: {selected.canal_origen}</span>}
                      <span>Cliente desde: {fmtFecha(selected.created_at?.slice(0,10))}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {[
                      { label: "Total gastado",   value: COP(totalGastado),    color: B.success },
                      { label: "Reservas",         value: totalConfirmadas,     color: B.white   },
                      { label: "Crédito vigente",  value: COP(creditoTotal),    color: creditoTotal > 0 ? B.sky : "rgba(255,255,255,0.3)" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: B.navy, borderRadius: 10, padding: "12px 18px", textAlign: "center", minWidth: 110 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Créditos vigentes */}
              {creditosVigentes.length > 0 && (
                <div style={{ background: B.sky + "10", borderRadius: 12, padding: "16px 20px", marginBottom: 20, border: `1px solid ${B.sky}33` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: B.sky, marginBottom: 12 }}>💳 Créditos Disponibles</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {creditosVigentes.map(c => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: B.navyMid, borderRadius: 8, padding: "10px 14px" }}>
                        <div>
                          <div style={{ fontSize: 13, color: B.white, fontWeight: 600 }}>{c.motivo || "Crédito"}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Vence: {fmtFecha(c.vigencia_hasta)} · {c.transferible ? "Transferible" : "No transferible"}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: B.sky }}>{COP(c.saldo)}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>de {COP(c.monto)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Historial de reservas */}
              <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", border: `1px solid ${B.navyLight}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, marginBottom: 14 }}>
                  Historial de Reservas ({reservas.length})
                </div>
                {reservas.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Sin reservas registradas</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {reservas.map(r => {
                      const est = ESTADO_STYLE[r.estado] || { bg: B.navyLight, color: B.white, label: r.estado };
                      const openReserva = () => window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "reservas", reservaId: r.id } }));
                      return (
                        <div key={r.id} onClick={openReserva}
                          style={{ background: B.navy, borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", transition: "background 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                          onMouseLeave={e => e.currentTarget.style.background = B.navy}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: B.white }}>{fmtFecha(r.fecha)} · {r.tipo || "—"}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                              {r.pax} pax · {r.forma_pago || "—"} · ⏱ {fmtHora(r.created_at)}
                              {r.canal ? ` · ${r.canal}` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: B.white }}>{COP(r.total || 0)}</span>
                            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: est.bg, color: est.color, fontWeight: 600 }}>{est.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Créditos vencidos o redimidos */}
              {creditos.filter(c => c.redimido || c.vigencia_hasta < hoy).length > 0 && (
                <div style={{ marginTop: 16, background: B.navyMid, borderRadius: 12, padding: "14px 18px", border: `1px solid ${B.navyLight}`, opacity: 0.6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Créditos Vencidos / Redimidos</div>
                  {creditos.filter(c => c.redimido || c.vigencia_hasta < hoy).map(c => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "6px 0", borderBottom: `1px solid ${B.navyLight}22` }}>
                      <span>{c.motivo} · {fmtFecha(c.vigencia_hasta)}</span>
                      <span>{COP(c.monto)} {c.redimido ? "(redimido)" : "(vencido)"}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
