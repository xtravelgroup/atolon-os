// CosteoProductos.jsx — COGS por producto (pasadía/hotel/evento/upsell)
// Cada producto tiene componentes con costo adulto/niño. El componente de
// transporte se calcula automáticamente desde Flota (último mes con datos).

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useMobile } from "../lib/useMobile";

const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtPct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : "—");
const uid = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const CATEGORIAS = [
  { k: "pasadia", l: "Pasadía",  c: B.sky },
  { k: "hotel",   l: "Hotel",    c: "#a78bfa" },
  { k: "evento",  l: "Evento",   c: "#ec4899" },
  { k: "upsell",  l: "Upsell",   c: B.warning },
  { k: "otro",    l: "Otro",     c: "rgba(255,255,255,0.4)" },
];

export default function CosteoProductos() {
  const { isMobile } = useMobile();
  const [productos, setProductos] = useState([]);
  const [componentes, setComponentes] = useState([]);
  const [transportePax, setTransportePax] = useState(0); // costo $/pax último mes
  const [activo, setActivo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { tipo: "producto"|"componente", edit? }

  const load = useCallback(async () => {
    setLoading(true);
    // Costo transporte por pax: tomar último mes con zarpes y calcular
    const seisAtras = new Date(); seisAtras.setMonth(seisAtras.getMonth() - 1);
    const desde = seisAtras.toISOString().slice(0, 10);
    const [{ data: prods }, { data: comps }, { data: zarpes }] = await Promise.all([
      supabase.from("productos_catalogo").select("*").eq("activo", true).order("nombre"),
      supabase.from("producto_componentes").select("*").order("orden"),
      supabase.from("muelle_zarpes_flota").select("pax_a, pax_n, costo_operativo").gte("fecha", desde),
    ]);
    setProductos(prods || []);
    setComponentes(comps || []);
    const totalPax   = (zarpes || []).reduce((s, z) => s + Number(z.pax_a || 0) + Number(z.pax_n || 0), 0);
    const totalCosto = (zarpes || []).reduce((s, z) => s + Number(z.costo_operativo || 0), 0);
    setTransportePax(totalPax > 0 ? totalCosto / totalPax : 0);
    if (!activo && prods?.length) setActivo(prods[0].id);
    setLoading(false);
  }, [activo]);
  useEffect(() => { load(); }, []); // eslint-disable-line

  const producto = productos.find(p => p.id === activo);
  const compsActivo = useMemo(() => componentes.filter(c => c.producto_id === activo), [componentes, activo]);

  // ── Cálculos del producto activo ─────────────────────────────────────────
  const calc = useMemo(() => {
    if (!producto) return null;
    const transporte = producto.transporte_auto ? transportePax : 0;
    const compsAdulto = compsActivo.reduce((s, c) => s + Number(c.costo_adulto || 0), 0);
    const compsNino   = compsActivo.reduce((s, c) => s + (c.incluye_nino ? Number(c.costo_nino || 0) : 0), 0);
    const totalAdulto = transporte + compsAdulto;
    const totalNino   = transporte + compsNino;
    const margenAdulto = Number(producto.precio_venta_adulto || 0) - totalAdulto;
    const margenNino   = Number(producto.precio_venta_nino || 0) - totalNino;
    const pctAdulto = producto.precio_venta_adulto > 0 ? (margenAdulto / producto.precio_venta_adulto) * 100 : NaN;
    const pctNino   = producto.precio_venta_nino > 0 ? (margenNino   / producto.precio_venta_nino) * 100 : NaN;
    return { transporte, compsAdulto, compsNino, totalAdulto, totalNino, margenAdulto, margenNino, pctAdulto, pctNino };
  }, [producto, compsActivo, transportePax]);

  async function saveProducto(data) {
    const payload = {
      codigo: data.codigo || null,
      nombre: data.nombre,
      categoria: data.categoria || "pasadia",
      descripcion: data.descripcion || null,
      precio_venta_adulto: Number(data.precio_venta_adulto) || 0,
      precio_venta_nino:   Number(data.precio_venta_nino)   || 0,
      transporte_auto: !!data.transporte_auto,
      activo: data.activo !== false,
      notas: data.notas || null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      await supabase.from("productos_catalogo").update(payload).eq("id", data.id);
    } else {
      const id = uid("PROD");
      await supabase.from("productos_catalogo").insert({ id, ...payload });
      setActivo(id);
    }
    setModal(null);
    load();
  }

  async function saveComponente(data) {
    const payload = {
      producto_id: activo,
      nombre: data.nombre,
      costo_adulto: Number(data.costo_adulto) || 0,
      costo_nino:   Number(data.costo_nino)   || 0,
      incluye_nino: !!data.incluye_nino,
      orden: Number(data.orden) || 0,
      notas: data.notas || null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      await supabase.from("producto_componentes").update(payload).eq("id", data.id);
    } else {
      await supabase.from("producto_componentes").insert({ id: uid("COMP"), ...payload });
    }
    setModal(null);
    load();
  }

  async function delComponente(id) {
    if (!confirm("¿Eliminar este componente?")) return;
    await supabase.from("producto_componentes").delete().eq("id", id);
    load();
  }

  async function delProducto(p) {
    if (!confirm(`¿Eliminar "${p.nombre}" y todos sus componentes?`)) return;
    await supabase.from("productos_catalogo").delete().eq("id", p.id);
    setActivo(productos.find(x => x.id !== p.id)?.id || null);
    load();
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;

  return (
    <div style={{ padding: isMobile ? 14 : 22, color: "#fff", minHeight: "100vh", background: B.navy, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800 }}>📊 Costeo de Productos</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            Costo unitario por pasadía/producto (COGS) · margen vs precio de venta.
          </div>
        </div>
        <button onClick={() => setModal({ tipo: "producto" })}
          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: B.success, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nuevo producto
        </button>
      </div>

      {/* Banner transporte */}
      <div style={{ background: B.navyMid, border: `1px solid ${B.sky}33`, borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ color: "rgba(255,255,255,0.6)" }}>
          🚤 Costo transporte automático (último mes): <strong style={{ color: B.sky }}>{fmtCOP(transportePax)}</strong> por pasajero
          {transportePax === 0 && <span style={{ color: B.warning, marginLeft: 8 }}>· sin zarpes registrados</span>}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>= total costo viajes ÷ pax transportados</span>
      </div>

      {/* Tabs de productos */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {productos.map(p => {
          const cat = CATEGORIAS.find(c => c.k === p.categoria) || CATEGORIAS[0];
          return (
            <button key={p.id} onClick={() => setActivo(p.id)}
              style={{
                padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                background: activo === p.id ? cat.c : B.navyMid,
                color: activo === p.id ? B.navy : "#fff",
                fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6,
              }}>
              {p.nombre}
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: activo === p.id ? "rgba(0,0,0,0.15)" : cat.c + "44", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {cat.l}
              </span>
            </button>
          );
        })}
        {productos.length === 0 && (
          <div style={{ padding: 18, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            No hay productos registrados. Crea el primero.
          </div>
        )}
      </div>

      {producto && calc && (
        <>
          {/* Header del producto activo */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{producto.nombre}</div>
              {producto.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{producto.descripcion}</div>}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {producto.codigo && <span>Código: <code style={{ color: "rgba(255,255,255,0.6)" }}>{producto.codigo}</code></span>}
                <span>Transporte: {producto.transporte_auto ? "✓ automático" : "✗ no incluye"}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setModal({ tipo: "producto", edit: producto })}
                style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "#fff", fontSize: 12, cursor: "pointer" }}>
                ✏️ Editar
              </button>
              <button onClick={() => delProducto(producto)}
                style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${B.danger}`, background: "transparent", color: B.danger, fontSize: 12, cursor: "pointer" }}>
                ✕ Eliminar
              </button>
            </div>
          </div>

          {/* KPIs Adulto vs Niño */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 18 }}>
            <ResumenCard
              titulo="👤 Adulto"
              precio={producto.precio_venta_adulto}
              transporte={calc.transporte}
              componentes={calc.compsAdulto}
              total={calc.totalAdulto}
              margen={calc.margenAdulto}
              pct={calc.pctAdulto}
              autoTransporte={producto.transporte_auto}
            />
            <ResumenCard
              titulo="🧒 Niño"
              precio={producto.precio_venta_nino}
              transporte={calc.transporte}
              componentes={calc.compsNino}
              total={calc.totalNino}
              margen={calc.margenNino}
              pct={calc.pctNino}
              autoTransporte={producto.transporte_auto}
            />
          </div>

          {/* Tabla de componentes */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Componentes del costo</div>
              <button onClick={() => setModal({ tipo: "componente" })}
                style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                + Componente
              </button>
            </div>

            {/* Fila de transporte (auto) */}
            {producto.transporte_auto && (
              <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px dashed ${B.sky}44` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>🚤 Transporte (automático)</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                    Calculado del costo operativo de flota / pax transportados último mes
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13, fontWeight: 700 }}>
                  <div><span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", display: "block" }}>Adulto</span> <span style={{ color: B.sky }}>{fmtCOP(calc.transporte)}</span></div>
                  <div><span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", display: "block" }}>Niño</span> <span style={{ color: B.sky }}>{fmtCOP(calc.transporte)}</span></div>
                </div>
              </div>
            )}

            {compsActivo.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                Sin componentes. Agrega el primero.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {compsActivo.map(c => (
                  <div key={c.id} style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{c.nombre}</div>
                      {c.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{c.notas}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
                      <div><span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", display: "block" }}>Adulto</span> {fmtCOP(c.costo_adulto)}</div>
                      <div><span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", display: "block" }}>Niño</span> {c.incluye_nino ? fmtCOP(c.costo_nino) : <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => setModal({ tipo: "componente", edit: c })} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 14, cursor: "pointer" }}>✏️</button>
                        <button onClick={() => delComponente(c.id)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {modal?.tipo === "producto" && (
        <ProductoModal edit={modal.edit} onClose={() => setModal(null)} onSave={saveProducto} />
      )}
      {modal?.tipo === "componente" && (
        <ComponenteModal edit={modal.edit} onClose={() => setModal(null)} onSave={saveComponente} />
      )}
    </div>
  );
}

// ─── Card resumen Adulto/Niño ───────────────────────────────────────────────
function ResumenCard({ titulo, precio, transporte, componentes, total, margen, pct, autoTransporte }) {
  const positivo = margen >= 0;
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>{titulo}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        <Row k="Precio venta"   v={fmtCOP(precio)}      c={B.success} />
        {autoTransporte && <Row k="− Transporte"  v={fmtCOP(transporte)}  c={B.sky} />}
        <Row k="− Componentes"  v={fmtCOP(componentes)} c={B.warning} />
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />
        <Row k="= Costo total"  v={fmtCOP(total)}       c={B.danger} bold />
        <Row k="= Margen"       v={fmtCOP(margen)}      c={positivo ? B.success : B.danger} bold />
        <Row k="Margen %"       v={fmtPct(pct)}         c={positivo ? B.success : B.danger} bold />
      </div>
    </div>
  );
}

function Row({ k, v, c, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{k}</span>
      <strong style={{ color: c, fontWeight: bold ? 800 : 600 }}>{v}</strong>
    </div>
  );
}

// ─── Modal producto ─────────────────────────────────────────────────────────
function ProductoModal({ edit, onClose, onSave }) {
  const [f, setF] = useState({
    id: edit?.id || null,
    codigo: edit?.codigo || "",
    nombre: edit?.nombre || "",
    categoria: edit?.categoria || "pasadia",
    descripcion: edit?.descripcion || "",
    precio_venta_adulto: edit?.precio_venta_adulto || "",
    precio_venta_nino: edit?.precio_venta_nino || "",
    transporte_auto: edit?.transporte_auto !== false,
    notas: edit?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{edit ? "Editar producto" : "Nuevo producto"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><Lbl>Código</Lbl><Inp value={f.codigo} onChange={v => set("codigo", v)} placeholder="VIP_PASS" /></div>
        <div><Lbl>Categoría</Lbl>
          <select value={f.categoria} onChange={e => set("categoria", e.target.value)} style={IS}>
            {CATEGORIAS.map(c => <option key={c.k} value={c.k}>{c.l}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}><Lbl>Nombre</Lbl><Inp value={f.nombre} onChange={v => set("nombre", v)} /></div>
        <div style={{ gridColumn: "1 / -1" }}><Lbl>Descripción</Lbl><Inp value={f.descripcion} onChange={v => set("descripcion", v)} /></div>
        <div><Lbl>Precio venta adulto (COP)</Lbl><Inp type="number" value={f.precio_venta_adulto} onChange={v => set("precio_venta_adulto", v)} /></div>
        <div><Lbl>Precio venta niño (COP)</Lbl><Inp type="number" value={f.precio_venta_nino} onChange={v => set("precio_venta_nino", v)} /></div>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" id="trans_auto" checked={f.transporte_auto} onChange={e => set("transporte_auto", e.target.checked)} />
          <label htmlFor="trans_auto" style={{ fontSize: 13, cursor: "pointer" }}>Incluye transporte (calcular automático desde flota)</label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btn(B.navyLight)}>Cancelar</button>
        <button disabled={!f.nombre || saving} onClick={async () => { setSaving(true); await onSave(f); setSaving(false); }} style={btn(B.success)}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Modal componente ───────────────────────────────────────────────────────
function ComponenteModal({ edit, onClose, onSave }) {
  const [f, setF] = useState({
    id: edit?.id || null,
    nombre: edit?.nombre || "",
    costo_adulto: edit?.costo_adulto || "",
    costo_nino:   edit?.costo_nino   || "",
    incluye_nino: edit?.incluye_nino !== false,
    orden: edit?.orden || 0,
    notas: edit?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{edit ? "Editar componente" : "Nuevo componente"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}><Lbl>Nombre</Lbl><Inp value={f.nombre} onChange={v => set("nombre", v)} placeholder="Ej: Cocktail de bienvenida" /></div>
        <div><Lbl>Costo adulto (COP)</Lbl><Inp type="number" value={f.costo_adulto} onChange={v => set("costo_adulto", v)} /></div>
        <div><Lbl>Costo niño (COP)</Lbl><Inp type="number" value={f.costo_nino} onChange={v => set("costo_nino", v)} disabled={!f.incluye_nino} /></div>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" id="inc_nino" checked={f.incluye_nino} onChange={e => set("incluye_nino", e.target.checked)} />
          <label htmlFor="inc_nino" style={{ fontSize: 13, cursor: "pointer" }}>Niños también lo reciben</label>
        </div>
        <div><Lbl>Orden</Lbl><Inp type="number" value={f.orden} onChange={v => set("orden", v)} /></div>
        <div style={{ gridColumn: "1 / -1" }}><Lbl>Notas</Lbl><Inp value={f.notas} onChange={v => set("notas", v)} placeholder="Ej: prorrateado por uso" /></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btn(B.navyLight)}>Cancelar</button>
        <button disabled={!f.nombre || saving} onClick={async () => { setSaving(true); await onSave(f); setSaving(false); }} style={btn(B.success)}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Overlay>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────────
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const Lbl = ({ children }) => <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>{children}</label>;
const Inp = ({ value, onChange, type = "text", placeholder, disabled }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
    style={{ ...IS, opacity: disabled ? 0.4 : 1 }} />
);
const btn = (bg, color = "#fff") => ({ padding: "10px 16px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 13 });

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 14, padding: 22, width: "100%", maxWidth: 620, marginTop: 40, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        {children}
      </div>
    </div>
  );
}
