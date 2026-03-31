// Atolon Beach Club — Brand Constants
export const B = {
  navy:      "#0D1B3E",
  navyMid:   "#152650",
  navyLight: "#1E3566",
  sand:      "#C8B99A",
  sky:       "#8ECAE6",
  pink:      "#F4C6D0",
  white:     "#FFFFFF",
  success:   "#4CAF7D",
  warning:   "#E8A020",
  danger:    "#D64545",
};

export const COP = n => n ? `$${Math.round(n).toLocaleString("es-CO")}` : "\u2014";
export const COPfull = n => n ? `$${Math.round(n).toLocaleString("es-CO")} COP` : "\u2014";
export const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
export const todayDisplay = () => new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" });
// Format YYYY-MM-DD → DD-MM-AAAA for display
export const fmtFecha = (d) => { if (!d) return "\u2014"; const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };

export const PASADIAS = [
  { tipo: "VIP Pass", precio: 320000, web: true, minPax: 1 },
  { tipo: "Exclusive Pass", precio: 590000, web: true, minPax: 2 },
  { tipo: "Atolon Experience", precio: 1100000, web: true, minPax: 4 },
  { tipo: "After Island", precio: 170000, web: false, minPax: 1 },
];

export const SALIDAS = [
  { id: "S1", hora: "08:30", botes: ["Coral II", "Caribe I"], cap: 30, regreso: "15:00" },
  { id: "S2", hora: "10:00", botes: ["Atolon III"], cap: 30, regreso: "17:00" },
  { id: "S3", hora: "11:30", botes: ["Palmera"], cap: 25, regreso: "17:30", auto: true },
  { id: "S4", hora: "13:00", botes: ["Caribe I"], cap: 12, regreso: "18:00", auto: true },
];

export const FLOTA = [
  { id: "B01", nombre: "Caribe I", tipo: "Lancha 24'", cap: 12, estado: "activo" },
  { id: "B02", nombre: "Coral II", tipo: "Lancha 28'", cap: 18, estado: "activo" },
  { id: "B03", nombre: "Atolon III", tipo: "Yate 42'", cap: 30, estado: "activo" },
  { id: "B04", nombre: "Sunrise", tipo: "Lancha 20'", cap: 8, estado: "mantenimiento" },
  { id: "B05", nombre: "Palmera", tipo: "Catamaran 38'", cap: 25, estado: "activo" },
];
