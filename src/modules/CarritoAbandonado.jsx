// CarritoAbandonado.jsx — Módulo Admin: Carrito Abandonado por Email
// Atolón Beach Club — Integrado en atolon-os
// Tabs: Dashboard · Carritos · Detalle · Templates · Configuración

import { useState, useEffect, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

// ─── Palette ─────────────────────────────────────────────────────────────────
const P = {
  ...B,
  card:       "#152650",
  cardDark:   "#0D1B3E",
  border:     "rgba(255,255,255,0.08)",
  text:       "#fff",
  textMid:    "rgba(255,255,255,0.65)",
  textLight:  "rgba(255,255,255,0.35)",
  success:    "#4CAF7D",
  warning:    "#E8A020",
  danger:     "#D64545",
  info:       "#38bdf8",
  sand:       "#C8B99A",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateOnly(d) {
  if (!d) return "—";
  try { return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}
function fmtVal(n, moneda = "COP") {
  if (!n) return "—";
  return moneda === "COP" ? COP(n) : `$${Number(n).toFixed(2)} ${moneda}`;
}
function pct(a, b) {
  if (!b) return "0%";
  return Math.round((a / b) * 100) + "%";
}

const ESTADO_LABELS = {
  initiated:        { label: "Iniciado",    color: P.textMid  },
  checkout_started: { label: "En checkout", color: P.info     },
  abandoned:        { label: "Abandonado",  color: P.warning  },
  email_1_sent:     { label: "Email 1 ✉",   color: "#a78bfa"  },
  email_2_sent:     { label: "Email 2 ✉",   color: "#818cf8"  },
  email_3_sent:     { label: "Email 3 ✉",   color: "#6366f1"  },
  email_4_sent:     { label: "Email 4 ✉",   color: "#4f46e5"  },
  recovered:        { label: "Recuperado ✓",color: P.success  },
  expired:          { label: "Expirado",    color: P.textLight},
  unsubscribed:     { label: "Desuscrito",  color: P.danger   },
  stopped:          { label: "Detenido",    color: P.danger   },
  bounced:          { label: "Rebotado",    color: P.danger   },
};

function EstadoBadge({ estado }) {
  const cfg = ESTADO_LABELS[estado] ?? { label: estado, color: P.textMid };
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      background: cfg.color + "22", color: cfg.color, border: `1px solid ${cfg.color}44`,
      whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: P.card, borderRadius: 12, padding: "18px 22px",
      borderLeft: `4px solid ${color}`, flex: "1 1 180px", minWidth: 160,
    }}>
      <div style={{ fontSize: 11, color: P.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: P.textLight, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ─── Tab: DASHBOARD ───────────────────────────────────────────────────────────
function TabDashboard() {
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [byProducto, setByProducto] = useState([]);
  const [bySource, setBySource]     = useState([]);
  const [timeline, setTimeline]     = useState([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [cartsR, eventsR] = await Promise.all([
        supabase.from("ac_carts").select("estado, valor_total, producto, utm_source, created_at, emails_enviados, email_abierto, email_clicked"),
        supabase.from("ac_email_events").select("tipo, created_at"),
      ]);
      const carts  = cartsR.data ?? [];
      const events = eventsR.data ?? [];

      const initiated   = carts.length;
      const checkout    = carts.filter(c => c.estado !== "initiated").length;
      const abandoned   = carts.filter(c => !["initiated","checkout_started","recovered"].includes(c.estado)).length;
      const recovered   = carts.filter(c => c.estado === "recovered").length;
      const sent        = events.filter(e => e.tipo === "sent").length;
      const opened      = events.filter(e => e.tipo === "opened").length;
      const clicked     = events.filter(e => e.tipo === "clicked").length;
      const revRecov    = carts.filter(c => c.estado === "recovered").reduce((s, c) => s + (c.valor_total || 0), 0);
      const revAban     = carts.filter(c => !["initiated","checkout_started","recovered"].includes(c.estado)).reduce((s, c) => s + (c.valor_total || 0), 0);

      setStats({ initiated, checkout, abandoned, recovered, sent, opened, clicked, revRecov, revAban });

      // By producto
      const prodMap = {};
      carts.filter(c => c.producto).forEach(c => {
        if (!prodMap[c.producto]) prodMap[c.producto] = { aban: 0, recov: 0 };
        if (!["initiated","checkout_started"].includes(c.estado)) prodMap[c.producto].aban++;
        if (c.estado === "recovered") prodMap[c.producto].recov++;
      });
      setByProducto(Object.entries(prodMap).map(([k, v]) => ({ key: k, ...v })));

      // By source
      const srcMap = {};
      carts.filter(c => c.utm_source).forEach(c => {
        if (!srcMap[c.utm_source]) srcMap[c.utm_source] = { aban: 0, recov: 0 };
        if (!["initiated","checkout_started"].includes(c.estado)) srcMap[c.utm_source].aban++;
        if (c.estado === "recovered") srcMap[c.utm_source].recov++;
      });
      setBySource(Object.entries(srcMap).map(([k, v]) => ({ key: k, ...v })));

      // Timeline últimos 14 días
      const today = new Date();
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(today); d.setDate(d.getDate() - (13 - i));
        return d.toLocaleDateString("en-CA");
      });
      setTimeline(days.map(d => ({
        date: d,
        aban:  carts.filter(c => c.created_at?.startsWith(d) && !["initiated","checkout_started"].includes(c.estado)).length,
        recov: carts.filter(c => c.created_at?.startsWith(d) && c.estado === "recovered").length,
      })));

    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 40, color: P.textMid, textAlign: "center" }}>Cargando dashboard...</div>;
  if (!stats)  return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* KPIs principales */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <KpiCard label="Carritos iniciados"  value={stats.initiated}  color={P.info}    />
        <KpiCard label="Abandonados"         value={stats.abandoned}  color={P.warning} />
        <KpiCard label="Recuperados"         value={stats.recovered}  color={P.success} sub={`Recovery rate: ${pct(stats.recovered, stats.abandoned)}`} />
        <KpiCard label="Revenue recuperado"  value={COP(stats.revRecov)} color={P.sand} sub={`Potencial perdido: ${COP(stats.revAban)}`} />
      </div>

      {/* KPIs email */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <KpiCard label="Emails enviados"  value={stats.sent}   color="#a78bfa" />
        <KpiCard label="Emails abiertos"  value={stats.opened} color="#818cf8" sub={`Open rate: ${pct(stats.opened, stats.sent)}`} />
        <KpiCard label="Clicks"           value={stats.clicked} color="#6366f1" sub={`Click rate: ${pct(stats.clicked, stats.sent)}`} />
      </div>

      {/* Tabla por producto */}
      {byProducto.length > 0 && (
        <div style={{ background: P.card, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: P.sand }}>📦 Por producto</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${P.border}` }}>
                {["Producto", "Abandonados", "Recuperados", "Recovery Rate"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: P.textMid, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byProducto.map(r => (
                <tr key={r.key} style={{ borderBottom: `1px solid ${P.border}` }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.key}</td>
                  <td style={{ padding: "10px 12px", color: P.warning }}>{r.aban}</td>
                  <td style={{ padding: "10px 12px", color: P.success }}>{r.recov}</td>
                  <td style={{ padding: "10px 12px" }}>{pct(r.recov, r.aban)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla por fuente */}
      {bySource.length > 0 && (
        <div style={{ background: P.card, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: P.sand }}>📡 Por fuente de tráfico</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${P.border}` }}>
                {["Fuente", "Abandonados", "Recuperados", "Recovery Rate"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: P.textMid, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bySource.map(r => (
                <tr key={r.key} style={{ borderBottom: `1px solid ${P.border}` }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.key}</td>
                  <td style={{ padding: "10px 12px", color: P.warning }}>{r.aban}</td>
                  <td style={{ padding: "10px 12px", color: P.success }}>{r.recov}</td>
                  <td style={{ padding: "10px 12px" }}>{pct(r.recov, r.aban)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div style={{ background: P.card, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: P.sand }}>📈 Últimos 14 días</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
            {timeline.map(d => {
              const maxVal = Math.max(...timeline.map(x => x.aban), 1);
              const hA = Math.round((d.aban  / maxVal) * 90);
              const hR = Math.round((d.recov / maxVal) * 90);
              return (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
                    <div title={`Aband: ${d.aban}`}
                      style={{ width: 8, height: hA || 2, background: P.warning + "aa", borderRadius: 3 }} />
                    <div title={`Recup: ${d.recov}`}
                      style={{ width: 8, height: hR || 2, background: P.success + "aa", borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 9, color: P.textLight, transform: "rotate(-45deg)", transformOrigin: "top left", marginTop: 4 }}>
                    {d.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 20, fontSize: 12, color: P.textMid }}>
            <span><span style={{ background: P.warning + "aa", display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 4 }} />Abandonados</span>
            <span><span style={{ background: P.success + "aa", display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 4 }} />Recuperados</span>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Tab: CARRITOS ────────────────────────────────────────────────────────────
function TabCarritos({ onSelect }) {
  const [carts, setCarts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState("all");
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(0);
  const PAGE = 50;

  const FILTROS = [
    { key: "all",       label: "Todos"        },
    { key: "abandoned", label: "Abandonados"  },
    { key: "recovered", label: "Recuperados"  },
    { key: "email_1_sent", label: "Email 1"   },
    { key: "email_2_sent", label: "Email 2"   },
    { key: "email_3_sent", label: "Email 3"   },
    { key: "email_4_sent", label: "Email 4"   },
    { key: "expired",   label: "Expirados"    },
    { key: "unsubscribed", label: "Desuscritos" },
  ];

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    let q = supabase.from("ac_carts").select("*").order("created_at", { ascending: false }).range(page * PAGE, (page + 1) * PAGE - 1);
    if (filtro !== "all") q = q.eq("estado", filtro);
    if (search) q = q.or(`email.ilike.%${search}%,nombre.ilike.%${search}%`);
    const { data } = await q;
    setCarts(data ?? []);
    setLoading(false);
  }, [filtro, search, page]);

  useEffect(() => { load(); }, [load]);

  const IS = {
    background: P.card, border: `1px solid ${P.border}`, color: P.text,
    borderRadius: 8, padding: "8px 14px", fontSize: 13, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Controles */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Buscar por email o nombre..." style={{ ...IS, flex: "1 1 200px", minWidth: 180 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => { setFiltro(f.key); setPage(0); }}
              style={{
                padding: "6px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: filtro === f.key ? P.sand : P.card,
                color: filtro === f.key ? P.navy : P.textMid,
              }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: P.textMid }}>Cargando...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${P.border}` }}>
                {["Nombre / Email", "Producto", "Fecha visita", "Valor", "Estado", "Emails", "Abrió", "Click", "Origen", "Abandono"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: P.textMid, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carts.map(c => (
                <tr key={c.id}
                  onClick={() => onSelect(c)}
                  style={{ borderBottom: `1px solid ${P.border}`, cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = P.navyMid}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{c.nombre ?? "—"} {c.apellido ?? ""}</div>
                    <div style={{ fontSize: 11, color: P.textMid }}>{c.email}</div>
                  </td>
                  <td style={{ padding: "10px 12px", color: P.sand }}>{c.producto ?? "—"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmtDateOnly(c.fecha_visita)}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmtVal(c.valor_total, c.moneda)}</td>
                  <td style={{ padding: "10px 12px" }}><EstadoBadge estado={c.estado} /></td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>{c.emails_enviados ?? 0}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>{c.email_abierto ? "✓" : "·"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>{c.email_clicked ? "✓" : "·"}</td>
                  <td style={{ padding: "10px 12px", color: P.textMid, fontSize: 12 }}>{c.utm_source ?? "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(c.abandoned_at)}</td>
                </tr>
              ))}
              {carts.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: P.textLight }}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${P.border}`, background: P.card, color: page === 0 ? P.textLight : P.text, cursor: page === 0 ? "not-allowed" : "pointer" }}>←</button>
        <span style={{ fontSize: 13, color: P.textMid }}>Página {page + 1}</span>
        <button disabled={carts.length < PAGE} onClick={() => setPage(p => p + 1)}
          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${P.border}`, background: P.card, color: carts.length < PAGE ? P.textLight : P.text, cursor: carts.length < PAGE ? "not-allowed" : "pointer" }}>→</button>
      </div>
    </div>
  );
}

// ─── Tab: DETALLE CARRITO ─────────────────────────────────────────────────────
function TabDetalle({ cart, onBack }) {
  const [events, setEvents]     = useState([]);
  const [queue, setQueue]       = useState([]);
  const [notas, setNotas]       = useState(cart.notas_internas ?? "");
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState("");

  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("ac_email_events").select("*").eq("cart_id", cart.id).order("created_at"),
      supabase.from("ac_email_queue").select("*").eq("cart_id", cart.id).order("scheduled_for"),
    ]).then(([evR, qR]) => {
      setEvents(evR.data ?? []);
      setQueue(qR.data ?? []);
    });
  }, [cart.id]);

  async function guardarNotas() {
    if (!supabase) return;
    setSaving(true);
    await supabase.from("ac_carts").update({ notas_internas: notas, updated_at: new Date().toISOString() }).eq("id", cart.id);
    setMsg("Notas guardadas ✓");
    setTimeout(() => setMsg(""), 2000);
    setSaving(false);
  }

  async function pausarFlujo() {
    if (!supabase) return;
    const nuevoPause = !cart.flow_pausado;
    await supabase.from("ac_carts").update({ flow_pausado: nuevoPause, updated_at: new Date().toISOString() }).eq("id", cart.id);
    if (nuevoPause) {
      await supabase.from("ac_email_queue").update({ estado: "cancelled" }).eq("cart_id", cart.id).eq("estado", "pending");
    }
    setMsg(nuevoPause ? "Flujo pausado" : "Flujo reactivado");
    setTimeout(() => setMsg(""), 2000);
  }

  async function marcarRecuperado() {
    if (!supabase) return;
    await supabase.from("ac_carts").update({ estado: "recovered", recovered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", cart.id);
    setMsg("Marcado como recuperado ✓");
    setTimeout(() => setMsg(""), 2000);
  }

  const TIPO_ICONS = { sent: "📤", opened: "👁", clicked: "🖱", bounced: "↩️", unsubscribed: "🚫", cart_recovered: "✅" };

  const IS_NOTE = {
    width: "100%", background: P.card, border: `1px solid ${P.border}`, color: P.text,
    borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: "inherit",
    resize: "vertical", minHeight: 80, outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Breadcrumb */}
      <button onClick={onBack}
        style={{ background: "none", border: "none", color: P.sand, cursor: "pointer", fontSize: 14, textAlign: "left", padding: 0 }}>
        ← Volver a carritos
      </button>

      {msg && <div style={{ background: P.success + "22", border: `1px solid ${P.success}44`, borderRadius: 8, padding: "10px 16px", fontSize: 13, color: P.success }}>{msg}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>

        {/* Datos del contacto */}
        <div style={{ background: P.card, borderRadius: 14, padding: 24, flex: "1 1 300px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.sand, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.07em" }}>Contacto</div>
          {[
            ["Nombre",    `${cart.nombre ?? ""} ${cart.apellido ?? ""}`.trim() || "—"],
            ["Email",     cart.email],
            ["Teléfono",  cart.telefono ?? "—"],
            ["Idioma",    cart.idioma ?? "—"],
            ["País",      cart.pais ?? "—"],
            ["Ciudad",    cart.ciudad ?? "—"],
            ["Device",    cart.device_type ?? "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${P.border}`, fontSize: 13 }}>
              <span style={{ color: P.textMid }}>{k}</span>
              <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Datos del producto */}
        <div style={{ background: P.card, borderRadius: 14, padding: 24, flex: "1 1 300px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.sand, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.07em" }}>Reserva</div>
          {[
            ["Producto",  cart.producto ?? "—"],
            ["Fecha",     fmtDateOnly(cart.fecha_visita)],
            ["Pax",       cart.pax_total ?? "—"],
            ["Adultos",   cart.pax_adultos ?? 0],
            ["Niños",     cart.pax_ninos ?? 0],
            ["Valor",     fmtVal(cart.valor_total, cart.moneda)],
            ["Moneda",    cart.moneda ?? "COP"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${P.border}`, fontSize: 13 }}>
              <span style={{ color: P.textMid }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Estado + atribución */}
        <div style={{ background: P.card, borderRadius: 14, padding: 24, flex: "1 1 300px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.sand, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.07em" }}>Estado y atribución</div>
          {[
            ["Estado",          <EstadoBadge key="e" estado={cart.estado} />],
            ["Emails enviados", cart.emails_enviados ?? 0],
            ["Abrió",          cart.email_abierto ? "✓ Sí" : "No"],
            ["Hizo click",     cart.email_clicked ? "✓ Sí" : "No"],
            ["UTM Source",     cart.utm_source ?? "—"],
            ["UTM Medium",     cart.utm_medium ?? "—"],
            ["UTM Campaign",   cart.utm_campaign ?? "—"],
            ["Landing Page",   cart.landing_page ? <a href={cart.landing_page} target="_blank" rel="noopener noreferrer" style={{ color: P.info, fontSize: 11 }}>ver ↗</a> : "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${P.border}`, fontSize: 13 }}>
              <span style={{ color: P.textMid }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

      </div>

      {/* Timeline de eventos */}
      <div style={{ background: P.card, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: P.sand, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.07em" }}>Timeline de eventos</div>
        {events.length === 0 && <div style={{ color: P.textLight, fontSize: 13 }}>Sin eventos registrados</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {events.map((e, i) => (
            <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: 14, position: "relative" }}>
              {i < events.length - 1 && (
                <div style={{ position: "absolute", left: 12, top: 24, bottom: 0, width: 1, background: P.border }} />
              )}
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: P.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, zIndex: 1 }}>
                {TIPO_ICONS[e.tipo] ?? "·"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{e.tipo} {e.template_id ? `(${e.template_id})` : ""}</div>
                {e.url_clicked && e.url_clicked !== "recovery_link" && (
                  <div style={{ fontSize: 11, color: P.info, marginTop: 2 }}>{e.url_clicked.slice(0, 80)}</div>
                )}
                <div style={{ fontSize: 11, color: P.textLight, marginTop: 2 }}>{fmtDate(e.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cola de emails */}
      <div style={{ background: P.card, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: P.sand, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.07em" }}>Cola de emails programados</div>
        {queue.length === 0 && <div style={{ color: P.textLight, fontSize: 13 }}>Sin emails en cola</div>}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${P.border}` }}>
              {["Email", "Programado para", "Estado", "Enviado"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: P.textMid }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queue.map(q => (
              <tr key={q.id} style={{ borderBottom: `1px solid ${P.border}` }}>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{q.template_id}</td>
                <td style={{ padding: "8px 10px" }}>{fmtDate(q.scheduled_for)}</td>
                <td style={{ padding: "8px 10px" }}>
                  <span style={{ color: q.estado === "sent" ? P.success : q.estado === "failed" ? P.danger : q.estado === "cancelled" ? P.textLight : P.warning }}>
                    {q.estado}
                  </span>
                </td>
                <td style={{ padding: "8px 10px" }}>{fmtDate(q.sent_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notas internas */}
      <div style={{ background: P.card, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: P.sand, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.07em" }}>Notas internas</div>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} style={IS_NOTE} placeholder="Notas del equipo sobre este carrito..." />
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={guardarNotas} disabled={saving}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: P.sand, color: P.navy, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            {saving ? "Guardando..." : "Guardar notas"}
          </button>
          <button onClick={pausarFlujo}
            style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${P.warning}`, background: "none", color: P.warning, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            {cart.flow_pausado ? "▶ Reactivar flujo" : "⏸ Pausar flujo"}
          </button>
          {cart.estado !== "recovered" && (
            <button onClick={marcarRecuperado}
              style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${P.success}`, background: "none", color: P.success, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              ✓ Marcar recuperado
            </button>
          )}
        </div>
      </div>

      {/* Timestamps clave */}
      <div style={{ background: P.card, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: P.sand, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.07em" }}>Timestamps</div>
        {[
          ["Creado",             fmtDate(cart.created_at)],
          ["Checkout iniciado",  fmtDate(cart.checkout_started_at)],
          ["Abandonado",         fmtDate(cart.abandoned_at)],
          ["Recuperado",         fmtDate(cart.recovered_at)],
          ["Último email",       fmtDate(cart.ultimo_email_at)],
          ["Token expira",       fmtDate(cart.recovery_expires_at)],
          ["Cart ID",            cart.id],
          ["Reserva ID",         cart.reserva_id ?? "—"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${P.border}`, fontSize: 12 }}>
            <span style={{ color: P.textMid }}>{k}</span>
            <span style={{ fontFamily: "monospace", fontSize: 11 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: TEMPLATES ───────────────────────────────────────────────────────────
function TabTemplates() {
  const [templates, setTemplates]   = useState([]);
  const [selected, setSelected]     = useState(null);
  const [editing, setEditing]       = useState(null);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");
  const [preview, setPreview]       = useState("desktop");

  useEffect(() => {
    if (!supabase) return;
    supabase.from("ac_email_templates").select("*").order("delay_horas").then(({ data }) => {
      setTemplates(data ?? []);
      if (data?.[0]) { setSelected(data[0]); setEditing({ ...data[0] }); }
    });
  }, []);

  function selectTemplate(t) {
    setSelected(t);
    setEditing({ ...t });
    setMsg("");
  }

  async function saveTemplate() {
    if (!supabase || !editing) return;
    setSaving(true);
    const { error } = await supabase.from("ac_email_templates").update({
      nombre:     editing.nombre,
      delay_horas: editing.delay_horas,
      activo:     editing.activo,
      asunto:     editing.asunto,
      preheader:  editing.preheader,
      body_html:  editing.body_html,
      body_texto: editing.body_texto,
      cta_texto:  editing.cta_texto,
      updated_at: new Date().toISOString(),
    }).eq("id", editing.id);
    if (!error) {
      setTemplates(ts => ts.map(t => t.id === editing.id ? { ...editing } : t));
      setMsg("Template guardado ✓");
    } else {
      setMsg("Error: " + error.message);
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  }

  const IS = {
    width: "100%", background: P.card, border: `1px solid ${P.border}`, color: P.text,
    borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  };

  const VARS = ["{{nombre}}","{{fecha}}","{{producto}}","{{tipo_pase}}","{{pax_total}}","{{valor_total}}","{{moneda}}","{{idioma}}","{{recovery_link}}","{{homepage_link}}","{{unsubscribe_link}}","{{open_pixel_url}}"];

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>

      {/* Sidebar de templates */}
      <div style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.map(t => (
          <button key={t.id} onClick={() => selectTemplate(t)}
            style={{
              padding: "10px 14px", borderRadius: 10, border: `1px solid ${selected?.id === t.id ? P.sand : P.border}`,
              background: selected?.id === t.id ? P.sand + "22" : P.card, color: P.text, cursor: "pointer",
              textAlign: "left", fontSize: 13,
            }}>
            <div style={{ fontWeight: 700 }}>{t.id}</div>
            <div style={{ fontSize: 11, color: t.activo ? P.success : P.danger }}>{t.activo ? "✓ Activo" : "✗ Inactivo"}</div>
            <div style={{ fontSize: 11, color: P.textMid }}>{t.delay_horas}h después</div>
          </button>
        ))}
      </div>

      {/* Editor */}
      {editing && (
        <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 14 }}>

          {msg && <div style={{ background: msg.startsWith("Error") ? P.danger + "22" : P.success + "22", border: `1px solid ${msg.startsWith("Error") ? P.danger : P.success}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: msg.startsWith("Error") ? P.danger : P.success }}>{msg}</div>}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={{ fontSize: 11, color: P.textMid, display: "block", marginBottom: 4 }}>NOMBRE INTERNO</label>
              <input value={editing.nombre ?? ""} onChange={e => setEditing(ed => ({ ...ed, nombre: e.target.value }))} style={IS} />
            </div>
            <div style={{ flex: "0 0 120px" }}>
              <label style={{ fontSize: 11, color: P.textMid, display: "block", marginBottom: 4 }}>DELAY (HORAS)</label>
              <input type="number" value={editing.delay_horas ?? ""} onChange={e => setEditing(ed => ({ ...ed, delay_horas: Number(e.target.value) }))} style={IS} />
            </div>
            <div style={{ flex: "0 0 100px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <label style={{ fontSize: 11, color: P.textMid, display: "block", marginBottom: 4 }}>ESTADO</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={editing.activo ?? true} onChange={e => setEditing(ed => ({ ...ed, activo: e.target.checked }))} />
                {editing.activo ? "Activo" : "Inactivo"}
              </label>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: P.textMid, display: "block", marginBottom: 4 }}>ASUNTO</label>
            <input value={editing.asunto ?? ""} onChange={e => setEditing(ed => ({ ...ed, asunto: e.target.value }))} style={IS} />
          </div>

          <div>
            <label style={{ fontSize: 11, color: P.textMid, display: "block", marginBottom: 4 }}>PREHEADER</label>
            <input value={editing.preheader ?? ""} onChange={e => setEditing(ed => ({ ...ed, preheader: e.target.value }))} style={IS} />
          </div>

          <div>
            <label style={{ fontSize: 11, color: P.textMid, display: "block", marginBottom: 4 }}>CTA TEXTO</label>
            <input value={editing.cta_texto ?? ""} onChange={e => setEditing(ed => ({ ...ed, cta_texto: e.target.value }))} style={IS} />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: P.textMid }}>BODY HTML</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPreview("desktop")}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, background: preview === "desktop" ? P.sand : P.card, color: preview === "desktop" ? P.navy : P.textMid, fontWeight: 600 }}>Desktop</button>
                <button onClick={() => setPreview("mobile")}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, background: preview === "mobile" ? P.sand : P.card, color: preview === "mobile" ? P.navy : P.textMid, fontWeight: 600 }}>Mobile</button>
              </div>
            </div>
            <textarea value={editing.body_html ?? ""} onChange={e => setEditing(ed => ({ ...ed, body_html: e.target.value }))}
              style={{ ...IS, minHeight: 280, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
          </div>

          <div>
            <label style={{ fontSize: 11, color: P.textMid, display: "block", marginBottom: 4 }}>BODY TEXTO PLANO</label>
            <textarea value={editing.body_texto ?? ""} onChange={e => setEditing(ed => ({ ...ed, body_texto: e.target.value }))}
              style={{ ...IS, minHeight: 120, resize: "vertical" }} />
          </div>

          {/* Variables disponibles */}
          <div style={{ background: P.card, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: P.textMid, marginBottom: 10 }}>VARIABLES DISPONIBLES (clic para copiar)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {VARS.map(v => (
                <button key={v} onClick={() => { navigator.clipboard.writeText(v); setMsg("Copiado: " + v); setTimeout(() => setMsg(""), 1500); }}
                  style={{ padding: "3px 10px", borderRadius: 20, border: `1px solid ${P.border}`, background: "none", color: P.sand, cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div>
            <div style={{ fontSize: 11, color: P.textMid, marginBottom: 8 }}>PREVISUALIZACIÓN</div>
            <div style={{
              background: "#f5f2ed", borderRadius: 12, overflow: "hidden",
              width: preview === "mobile" ? 380 : "100%", margin: preview === "mobile" ? "0 auto" : 0,
              maxHeight: 500, overflowY: "auto", border: `1px solid ${P.border}`,
            }}>
              <iframe
                srcDoc={editing.body_html ?? "<p>Sin contenido</p>"}
                style={{ width: "100%", height: 480, border: "none" }}
                title="preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={saveTemplate} disabled={saving}
              style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: P.sand, color: P.navy, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              {saving ? "Guardando..." : "Guardar template"}
            </button>
            <button onClick={() => setEditing({ ...selected })}
              style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${P.border}`, background: "none", color: P.textMid, cursor: "pointer", fontSize: 13 }}>
              Descartar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: CONFIGURACIÓN ───────────────────────────────────────────────────────
function TabConfiguracion() {
  const [cfg, setCfg]       = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.from("ac_flow_settings").select("*").eq("id", "default").single().then(({ data }) => {
      if (data) setCfg(data);
    });
  }, []);

  async function saveCfg() {
    if (!supabase || !cfg) return;
    setSaving(true);
    const { error } = await supabase.from("ac_flow_settings").update({
      ...cfg, updated_at: new Date().toISOString(),
    }).eq("id", "default");
    setMsg(error ? "Error: " + error.message : "Configuración guardada ✓");
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  }

  const IS = {
    width: "100%", background: "#0D1B3E", border: "1px solid rgba(255,255,255,0.1)", color: P.text,
    borderRadius: 8, padding: "10px 14px", fontSize: 13, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  };

  const Field = ({ label, field, type = "text", note }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, color: P.textMid, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {type === "checkbox" ? (
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={cfg?.[field] ?? true}
            onChange={e => setCfg(c => ({ ...c, [field]: e.target.checked }))}
            style={{ width: 16, height: 16 }} />
          {cfg?.[field] ? "Activado" : "Desactivado"}
        </label>
      ) : (
        <input type={type} value={cfg?.[field] ?? ""}
          onChange={e => setCfg(c => ({ ...c, [field]: type === "number" ? Number(e.target.value) : e.target.value }))}
          style={IS} />
      )}
      {note && <div style={{ fontSize: 11, color: P.textLight }}>{note}</div>}
    </div>
  );

  if (!cfg) return <div style={{ padding: 32, color: P.textMid }}>Cargando...</div>;

  return (
    <div style={{ maxWidth: 700, display: "flex", flexDirection: "column", gap: 20 }}>

      {msg && <div style={{ background: msg.startsWith("Error") ? P.danger + "22" : P.success + "22", border: `1px solid ${msg.startsWith("Error") ? P.danger : P.success}44`, borderRadius: 8, padding: "10px 16px", fontSize: 13, color: msg.startsWith("Error") ? P.danger : P.success }}>{msg}</div>}

      <div style={{ background: P.card, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: P.sand, marginBottom: 4 }}>⚙️ General</div>
        <Field label="Módulo activo" field="activo" type="checkbox" />
        <Field label="Delay de abandono (minutos)" field="abandono_delay_minutos" type="number" note="Tiempo sin pagar después de checkout_started para marcar como abandonado" />
        <Field label="Recovery link expira (horas)" field="recovery_link_expires_horas" type="number" />
        <Field label="Máx emails por contacto cada N días" field="max_emails_por_contacto_dias" type="number" />
      </div>

      <div style={{ background: P.card, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: P.sand, marginBottom: 4 }}>📨 Remitente</div>
        <Field label="Email del remitente" field="from_email" />
        <Field label="Nombre del remitente" field="from_nombre" />
        <Field label="Reply-To" field="reply_to" />
      </div>

      <div style={{ background: P.card, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: P.sand, marginBottom: 4 }}>🔗 URLs</div>
        <Field label="URL de la web principal" field="homepage_url" />
        <Field label="URL de booking" field="booking_url" />
      </div>

      <div style={{ background: P.card, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: P.sand, marginBottom: 12 }}>⏰ Crons (pg_cron)</div>
        <div style={{ fontSize: 13, color: P.textMid, lineHeight: 1.7 }}>
          Los siguientes crons deben estar configurados en Supabase para que el módulo funcione automáticamente:
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { name: "ac-detector", cron: "*/15 * * * *", fn: "abandoned-cart-detector", desc: "Detecta abandonos y crea colas" },
            { name: "ac-sender",   cron: "*/5 * * * *",  fn: "abandoned-cart-sender",   desc: "Envía emails de la cola" },
          ].map(j => (
            <div key={j.name} style={{ background: P.navyMid, borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{j.name}</div>
                  <div style={{ fontSize: 11, color: P.textMid }}>{j.desc}</div>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: P.sand, background: P.navyLight, padding: "4px 10px", borderRadius: 6 }}>{j.cron}</div>
              </div>
              <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 11, color: P.textLight, wordBreak: "break-all", background: P.navy, borderRadius: 6, padding: "8px 12px" }}>
                {`SELECT cron.schedule('${j.name}', '${j.cron}', 'SELECT net.http_post(url:=''${SUPABASE_URL}/functions/v1/${j.fn}'', headers:=''{"Content-Type":"application/json","Authorization":"Bearer SERVICE_ROLE_KEY"}'', body:=''{}''::jsonb)')`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={saveCfg} disabled={saving}
        style={{ padding: "12px 32px", borderRadius: 10, border: "none", background: P.sand, color: P.navy, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
        {saving ? "Guardando..." : "Guardar configuración"}
      </button>
    </div>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
export default function CarritoAbandonado() {
  const [tab, setTab]           = useState("dashboard");
  const [selectedCart, setSelectedCart] = useState(null);

  const TABS = [
    { key: "dashboard",  label: "Dashboard",    icon: "📊" },
    { key: "carritos",   label: "Carritos",     icon: "🛒" },
    { key: "templates",  label: "Templates",    icon: "✉️"  },
    { key: "config",     label: "Config",       icon: "⚙️"  },
  ];

  function handleSelectCart(c) {
    setSelectedCart(c);
    setTab("detalle");
  }

  function handleBackFromDetalle() {
    setSelectedCart(null);
    setTab("carritos");
  }

  return (
    <div style={{ padding: "24px 28px", fontFamily: "'Inter','Segoe UI',sans-serif", color: P.text, minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "-0.5px" }}>
          🛒 Carrito Abandonado
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: P.textMid }}>
          Recuperación de reservas iniciadas no pagadas — Atolón Beach Club
        </p>
      </div>

      {/* Nav tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${P.border}`, paddingBottom: 0, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key !== "detalle") setSelectedCart(null); }}
            style={{
              padding: "10px 18px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: "none", color: tab === t.key ? P.sand : P.textMid,
              borderBottom: `2px solid ${tab === t.key ? P.sand : "transparent"}`,
              marginBottom: "-1px", transition: "color 0.15s",
            }}>
            {t.icon} {t.label}
          </button>
        ))}
        {selectedCart && tab === "detalle" && (
          <button style={{
            padding: "10px 18px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: "none", color: P.sand, borderBottom: `2px solid ${P.sand}`, marginBottom: "-1px",
          }}>
            📋 Detalle
          </button>
        )}
      </div>

      {/* Content */}
      {tab === "dashboard" && <TabDashboard />}
      {tab === "carritos"  && <TabCarritos onSelect={handleSelectCart} />}
      {tab === "detalle"   && selectedCart && <TabDetalle cart={selectedCart} onBack={handleBackFromDetalle} />}
      {tab === "templates" && <TabTemplates />}
      {tab === "config"    && <TabConfiguracion />}
    </div>
  );
}
