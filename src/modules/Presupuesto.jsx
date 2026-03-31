import React, { useState } from "react";
import { B, COP } from "../brand";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CATS = [
  { cat: "Pasadias", budget: [150, 130, 145, 120, 100, 85, 70, 75, 90, 110, 130, 155], actual: [165, 128, 143, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cat: "Eventos", budget: [45, 35, 42, 38, 30, 25, 20, 22, 30, 35, 40, 50], actual: [52, 38, 45, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cat: "B2B", budget: [18, 15, 17, 14, 12, 10, 8, 9, 12, 15, 17, 20], actual: [22, 16, 18, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cat: "F&B", budget: [30, 26, 30, 25, 22, 18, 15, 16, 20, 25, 28, 35], actual: [38, 29, 33, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cat: "Nomina", budget: [48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 52], actual: [52, 48, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cat: "Combustible", budget: [12, 11, 12, 10, 9, 8, 7, 7, 9, 10, 11, 13], actual: [14, 12, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cat: "Mantenimiento", budget: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8], actual: [7, 15, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cat: "Marketing", budget: [6, 5, 6, 5, 4, 4, 3, 4, 5, 6, 7, 8], actual: [9, 5, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
];

export default function Presupuesto() {
  const [year] = useState(2026);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>Presupuesto {year}</h2>
        <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: B.sky + "33", color: B.sky }}>Presupuesto</span>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: B.sand + "33", color: B.sand }}>Real</span>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: B.success + "33", color: B.success }}>Favorable</span>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: B.danger + "33", color: B.danger }}>Desfavorable</span>
        </div>
      </div>

      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${B.navyLight}` }}>
              <th style={{ padding: "14px 16px", textAlign: "left", fontSize: 12, color: B.sand, textTransform: "uppercase", position: "sticky", left: 0, background: B.navyMid, zIndex: 1, minWidth: 120 }}>Categoria</th>
              {MESES.map(m => (
                <th key={m} colSpan={2} style={{ padding: "14px 8px", textAlign: "center", fontSize: 12, color: B.sand, textTransform: "uppercase", borderLeft: `1px solid ${B.navyLight}` }}>{m}</th>
              ))}
              <th colSpan={2} style={{ padding: "14px 8px", textAlign: "center", fontSize: 12, color: B.sand, textTransform: "uppercase", borderLeft: `2px solid ${B.sand}`, fontWeight: 700 }}>YTD</th>
            </tr>
            <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
              <th style={{ position: "sticky", left: 0, background: B.navyMid, zIndex: 1 }} />
              {MESES.map(m => (
                <React.Fragment key={m + "_sub"}>
                  <th style={{ padding: "6px 6px", fontSize: 10, color: B.sky, textAlign: "right", borderLeft: `1px solid ${B.navyLight}` }}>Pres</th>
                  <th style={{ padding: "6px 6px", fontSize: 10, color: B.sand, textAlign: "right" }}>Real</th>
                </React.Fragment>
              ))}
              <th style={{ padding: "6px 6px", fontSize: 10, color: B.sky, textAlign: "right", borderLeft: `2px solid ${B.sand}` }}>Pres</th>
              <th style={{ padding: "6px 6px", fontSize: 10, color: B.sand, textAlign: "right" }}>Real</th>
            </tr>
          </thead>
          <tbody>
            {CATS.map((row, ri) => {
              const ytdBudget = row.budget.slice(0, 3).reduce((s, v) => s + v, 0);
              const ytdActual = row.actual.slice(0, 3).reduce((s, v) => s + v, 0);
              return (
                <tr key={row.cat} style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, position: "sticky", left: 0, background: B.navyMid, zIndex: 1 }}>{row.cat}</td>
                  {MESES.map((m, mi) => {
                    const bv = row.budget[mi];
                    const av = row.actual[mi];
                    const isIncome = ri < 4;
                    const favorable = isIncome ? av >= bv : av <= bv;
                    return (
                      <React.Fragment key={m}>
                        <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: B.sky, borderLeft: `1px solid ${B.navyLight}` }}>{bv}M</td>
                        <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: av === 0 ? "rgba(255,255,255,0.2)" : favorable ? B.success : B.danger, fontWeight: av > 0 ? 600 : 400 }}>
                          {av > 0 ? `${av}M` : "\u2014"}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: B.sky, fontWeight: 700, borderLeft: `2px solid ${B.sand}` }}>{ytdBudget}M</td>
                  <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: B.sand, fontWeight: 700 }}>{ytdActual}M</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
