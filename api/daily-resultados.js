/**
 * Vercel Cron: Email diario de resultados — 11am Colombia (16:00 UTC)
 * Envía Ayer, Semana, Mes a los destinatarios configurados en configuracion.email_resultados
 */

const COP = (v) => v ? `$${Math.round(v).toLocaleString("es-CO")}` : "$0";

// Fecha helpers (Colombia UTC-5)
function fechaColombia(offsetDias = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}
// Lunes de la semana de AYER (semana = lunes a domingo)
function semanaIniDeAyer() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  d.setDate(d.getDate() - 1); // ayer
  const dow = d.getDay(); // 0=dom, 1=lun...
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // retroceder al lunes
  return d.toISOString().slice(0, 10);
}
// Domingo de la semana de AYER
function semanaFinDeAyer() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  d.setDate(d.getDate() - 1); // ayer
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow)); // avanzar al domingo
  return d.toISOString().slice(0, 10);
}
// Primer día del mes de AYER
function mesIniDeAyer() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  d.setDate(d.getDate() - 1); // ayer
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function sbQuery(sbUrl, sbKey, table, params = "") {
  const r = await fetch(`${sbUrl}/rest/v1/${table}?${params}`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
  });
  if (!r.ok) throw new Error(`Supabase query error: ${table} → ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  const secret = req.headers["authorization"];
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!sbUrl || !sbKey) throw new Error("Missing Supabase env vars");
    if (!resendKey) throw new Error("Missing RESEND_API_KEY");

    // 1. Get email recipients
    const config = await sbQuery(sbUrl, sbKey, "configuracion", "id=eq.atolon&select=email_resultados");
    const emails = config?.[0]?.email_resultados || [];
    if (emails.length === 0) {
      console.log("[daily-resultados] No recipients configured, skipping");
      return res.status(200).json({ ok: true, skipped: true, reason: "No recipients" });
    }

    // 2. Define periods (Ayer, Semana lun-dom de ayer, Mes de ayer)
    const ayer = fechaColombia(-1);
    const semIni = semanaIniDeAyer();
    const semFin = semanaFinDeAyer();
    // Data: hasta ayer (no incluir días futuros), pero label muestra lun-dom
    const semHasta = semFin <= ayer ? semFin : ayer;
    const periodos = [
      { key: "ayer",   label: "Ayer",   desde: ayer,   hasta: ayer,     labelRango: ayer.slice(5).replace("-", "/") },
      { key: "semana", label: "Semana", desde: semIni, hasta: semHasta, labelRango: `${semIni.slice(5).replace("-", "/")} - ${semFin.slice(5).replace("-", "/")}` },
      { key: "mes",    label: "Mes",    desde: mesIniDeAyer(), hasta: ayer, labelRango: `${mesIniDeAyer().slice(5).replace("-", "/")} - ${ayer.slice(5).replace("-", "/")}` },
    ];

    // 3. Query data for each period
    const data = {};
    for (const p of periodos) {
      const rangeFilter = `fecha=gte.${p.desde}&fecha=lte.${p.hasta}`;

      const [pasDir, pasB2B, grupos, eventos, aybLoggro, llegadas] = await Promise.all([
        // Pasadías directas
        sbQuery(sbUrl, sbKey, "reservas", `select=id,total,pax,estado&${rangeFilter}&estado=neq.cancelado&aliado_id=is.null&grupo_id=is.null`),
        // Pasadías B2B
        sbQuery(sbUrl, sbKey, "reservas", `select=id,total,pax,estado&${rangeFilter}&estado=neq.cancelado&aliado_id=not.is.null&grupo_id=is.null`),
        // Grupos
        sbQuery(sbUrl, sbKey, "eventos", `select=id,valor,valor_extras,pax,pasadias_org,servicios_contratados,categoria&${rangeFilter}&stage=in.(Confirmado,Realizado)&categoria=eq.grupo`),
        // Eventos
        sbQuery(sbUrl, sbKey, "eventos", `select=id,valor,valor_extras,pax,pasadias_org,servicios_contratados,categoria&${rangeFilter}&stage=in.(Confirmado,Realizado)&categoria=eq.evento`),
        // A&B — desde Loggro Restobar (fuente oficial de facturación)
        fetch(`${sbUrl}/functions/v1/loggro-sync/cierre-caja-rango?from=${p.desde}&to=${p.hasta}`, {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
        }).then(r => r.json()).catch(() => ({ ok: false })),
        // Llegadas muelle
        sbQuery(sbUrl, sbKey, "muelle_llegadas", `select=id,total_cobrado,pax_total,tipo&${rangeFilter}&tipo=neq.lancha_atolon`),
      ]);

      // Helpers
      const totalCotizacion = (e) => {
        let base = e.valor > 0 ? e.valor : (e.pasadias_org || [])
          .filter(p => p.tipo !== "Impuesto Muelle")
          .reduce((s, p) => s + (Number(p.personas) || 0) * (Number(p.precio) || 0), 0);
        const extras = Number(e.valor_extras) || 0;
        const servicios = (e.servicios_contratados || []).reduce((s, x) => s + (Number(x.valor) || 0), 0);
        return base + extras + servicios;
      };
      const pasadiasGrupo = (rows) => rows.reduce((s, e) => s + (e.pasadias_org || [])
        .filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF")
        .reduce((ss, p) => ss + (Number(p.personas) || 0), 0), 0);

      const allPas = [...pasDir, ...pasB2B];

      data[p.key] = {
        pasadias: {
          cantidad: allPas.reduce((s, r) => s + (Number(r.pax) || 0), 0)
                  + llegadas.reduce((s, l) => s + (Number(l.pax_total) || 0), 0),
          monto: allPas.filter(r => r.estado !== "no_show").reduce((s, r) => s + (r.total || 0), 0)
               + llegadas.reduce((s, l) => s + (Number(l.total_cobrado) || 0), 0),
        },
        grupos: {
          cantidad: pasadiasGrupo(grupos),
          monto: grupos.reduce((s, e) => s + totalCotizacion(e), 0),
        },
        eventos: {
          cantidad: eventos.length,
          monto: eventos.reduce((s, e) => s + totalCotizacion(e), 0),
        },
        ayb: {
          monto: Number(aybLoggro?.resumen?.total_ventas) || 0,
        },
      };
    }

    // 4. Build email HTML
    const fechaDisplay = new Date(ayer + "T12:00:00").toLocaleDateString("es-CO", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const row = (icon, label, cantKey, montoKey) => {
      const cells = periodos.map(p => {
        const d = data[p.key];
        const cat = d[montoKey] || d[label.toLowerCase()] || {};
        const cant = cat.cantidad != null ? cat.cantidad : "";
        const monto = COP(cat.monto);
        return `<td style="padding:12px 14px;text-align:center;border-left:1px solid #1E3566;font-size:14px;">
          ${cant !== "" ? `<div style="font-size:18px;font-weight:800;color:#fff;font-family:'Barlow Condensed',sans-serif;">${cant}</div>` : ""}
          <div style="font-size:13px;color:${montoKey === "ayb" ? "#C8B99A" : "#8ECAE6"};font-weight:700;">${monto}</div>
        </td>`;
      }).join("");
      return `<tr style="border-bottom:1px solid #1E3566;">
        <td style="padding:12px 16px;font-size:13px;color:rgba(255,255,255,0.6);">${icon} ${label}</td>
        ${cells}
      </tr>`;
    };

    const totalRow = periodos.map(p => {
      const d = data[p.key];
      const total = (d.pasadias?.monto || 0) + (d.grupos?.monto || 0) + (d.eventos?.monto || 0) + (d.ayb?.monto || 0);
      return `<td style="padding:14px 14px;text-align:center;border-left:1px solid #1E3566;font-size:16px;font-weight:900;color:#fff;font-family:'Barlow Condensed',sans-serif;">
        ${COP(total)}
      </td>`;
    }).join("");

    const html = `
    <div style="background:#0D1B3E;padding:32px 20px;font-family:'Segoe UI',Arial,sans-serif;color:#fff;max-width:640px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="font-size:24px;font-weight:800;font-family:'Barlow Condensed',sans-serif;letter-spacing:0.04em;">📊 Resultados Diarios</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-top:6px;">Atolon Beach Club · ${fechaDisplay}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;background:#152650;border-radius:12px;overflow:hidden;">
        <thead>
          <tr style="background:#0D1B3E;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.06em;"></th>
            ${periodos.map(p => `
              <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:800;color:#8ECAE6;text-transform:uppercase;letter-spacing:0.06em;border-left:1px solid #1E3566;">
                ${p.label}
                <div style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400;margin-top:2px;">
                  ${p.labelRango}
                </div>
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${row("🏖️", "Pasadías", "cantidad", "pasadias")}
          ${row("👥", "Grupos", "cantidad", "grupos")}
          ${row("🎉", "Eventos", "cantidad", "eventos")}
          ${row("🍽️", "A&B", "", "ayb")}
          <tr style="background:#0D1B3E;border-top:2px solid #8ECAE6;">
            <td style="padding:14px 16px;font-size:14px;font-weight:800;color:#fff;">💰 TOTAL</td>
            ${totalRow}
          </tr>
        </tbody>
      </table>

      <div style="text-align:center;margin-top:24px;">
        <a href="https://atolon.co/resultados" style="display:inline-block;padding:12px 28px;background:#8ECAE6;color:#0D1B3E;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;">
          Ver dashboard completo →
        </a>
      </div>

      <div style="margin-top:28px;padding:16px 20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
        <div style="font-size:10px;color:rgba(255,255,255,0.25);line-height:1.7;text-align:center;">
          🔒 <strong style="color:rgba(255,255,255,0.35);">CONFIDENCIAL</strong> — Este correo ha sido enviado exclusivamente al destinatario registrado y contiene informaci\u00f3n financiera de uso confidencial. El recipiente solo debe compartir esta informaci\u00f3n con personas autorizadas por la junta directiva de Atolon Beach Club.
        </div>
      </div>

      <div style="text-align:center;margin-top:16px;font-size:11px;color:rgba(255,255,255,0.15);">
        © ${new Date().getFullYear()} Atolon Beach Club · Cartagena de Indias
      </div>
    </div>
    `;

    // 5. Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Atolon Beach Club <reservas@atolon.co>",
        to: emails,
        subject: `📊 Resultados ${fechaDisplay} — Atolon Beach Club`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Resend error: ${emailRes.status} — ${errText}`);
    }

    const result = await emailRes.json();
    console.log(`[daily-resultados] ✅ Email enviado a ${emails.length} destinatarios. ID: ${result.id}`);
    return res.status(200).json({ ok: true, recipients: emails.length, id: result.id });

  } catch (e) {
    console.error("[daily-resultados] ❌", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
