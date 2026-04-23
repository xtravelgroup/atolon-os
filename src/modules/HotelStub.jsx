import React from "react";

// Stub component for Hotel modules — shows a "próximamente" placeholder.
// Use: <HotelStub titulo="Reservas Hotel" icono="🛏️" descripcion="..." />
export default function HotelStub({ titulo, icono, descripcion }) {
  return (
    <div style={{ padding: 40, maxWidth: 720, margin: "0 auto" }}>
      <div style={{
        background: "#0D1B3E",
        border: "1px solid #1e293b",
        borderRadius: 16,
        padding: "48px 36px",
        textAlign: "center",
        color: "#fff",
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>{icono || "🏨"}</div>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 32,
          fontWeight: 800,
          marginBottom: 8,
          letterSpacing: "0.02em",
        }}>
          {titulo}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 24 }}>
          {descripcion || "Módulo en construcción"}
        </div>
        <div style={{
          display: "inline-block",
          padding: "8px 16px",
          borderRadius: 8,
          background: "#a78bfa22",
          border: "1px solid #a78bfa",
          color: "#a78bfa",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          Próximamente
        </div>
      </div>
    </div>
  );
}

export const HotelReservas     = () => <HotelStub titulo="Reservas Hotel"   icono="🛏️" descripcion="Gestión de reservas de habitaciones, llegadas y salidas" />;
export const HotelHabitaciones = () => <HotelStub titulo="Habitaciones"     icono="🚪" descripcion="Inventario de habitaciones, estado y características" />;
export const HotelHuespedes    = () => <HotelStub titulo="Huéspedes"        icono="👥" descripcion="Base de datos de huéspedes del hotel" />;
export const HotelHousekeeping = () => <HotelStub titulo="Housekeeping"     icono="🧺" descripcion="Control de limpieza y preparación de habitaciones" />;
export const HotelRoomService  = () => <HotelStub titulo="Room Service"     icono="🛎️" descripcion="Pedidos a habitación: comida, bebidas, amenities y cargo al folio" />;
export const HotelTarifas      = () => <HotelStub titulo="Tarifas"          icono="💲" descripcion="Precios, temporadas y políticas tarifarias" />;
