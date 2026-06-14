// Pagina pública /privacidad — Política de Tratamiento de Datos Personales
// Atolón Beach Club / Castillete Hotel · Interop Colombia S.A.S.
// Cumple Ley 1581 de 2012 y Decreto 1377 de 2013 (Colombia).
import { B } from "../brand";

export default function PrivacidadPage() {
  const sectionStyle = { marginBottom: 24 };
  const h2 = { fontSize: 18, fontWeight: 800, color: B.navy, marginBottom: 8, marginTop: 0 };
  const p = { fontSize: 14, lineHeight: 1.6, color: "#333", margin: "0 0 10px" };
  const li = { fontSize: 14, lineHeight: 1.6, color: "#333", marginBottom: 4 };

  return (
    <div style={{ minHeight: "100vh", background: "#FAF6EE", padding: "40px 16px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", borderRadius: 16, padding: "40px 32px", boxShadow: "0 4px 20px rgba(13,27,62,0.08)" }}>
        <div style={{ borderBottom: `2px solid ${B.sand}`, paddingBottom: 16, marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: B.navy, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
            Política de Tratamiento de Datos Personales
          </h1>
          <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
            Atolón Beach Club · Castillete Hotel
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
            Última actualización: 14 de junio de 2026
          </div>
        </div>

        <section style={sectionStyle}>
          <h2 style={h2}>1. Identificación del Responsable</h2>
          <p style={p}>
            <strong>Interop Colombia S.A.S.</strong>, sociedad domiciliada en Cartagena de Indias, Colombia,
            opera las marcas <strong>Atolón Beach Club</strong> y <strong>Castillete Hotel</strong>, y actúa
            como responsable del tratamiento de los datos personales de sus clientes, huéspedes, proveedores,
            empleados y contratistas.
          </p>
          <ul style={{ paddingLeft: 20, margin: "8px 0 0" }}>
            <li style={li}>Sitio web: <a href="https://atolon.co" style={{ color: B.navy }}>www.atolon.co</a></li>
            <li style={li}>Correo de contacto: <a href="mailto:privacidad@atolon.co" style={{ color: B.navy }}>privacidad@atolon.co</a></li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>2. Marco Legal</h2>
          <p style={p}>
            Esta política da cumplimiento a la <strong>Ley 1581 de 2012</strong>, el
            <strong> Decreto Reglamentario 1377 de 2013</strong> y demás normas que regulan en Colombia
            la protección de datos personales.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>3. Datos que recolectamos</h2>
          <p style={p}>Según la relación con el titular, podemos tratar:</p>
          <ul style={{ paddingLeft: 20, margin: "0 0 10px" }}>
            <li style={li}>Identificación: nombre completo, tipo y número de documento, nacionalidad.</li>
            <li style={li}>Contacto: correo electrónico, teléfono celular, dirección.</li>
            <li style={li}>Reserva: fecha de visita, número de pasajeros, preferencias y restricciones alimentarias.</li>
            <li style={li}>Transaccionales: forma de pago, montos, comprobantes (no almacenamos números completos de tarjeta).</li>
            <li style={li}>Operativos: registros de ingreso a muelle, certificados de seguridad, etc. (solo contratistas).</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>4. Finalidades del tratamiento</h2>
          <ul style={{ paddingLeft: 20, margin: "0 0 10px" }}>
            <li style={li}>Gestionar reservas, pagos y entrega del servicio contratado.</li>
            <li style={li}>Atender consultas, solicitudes y reclamos.</li>
            <li style={li}>Enviar comunicaciones operativas (confirmaciones, recordatorios).</li>
            <li style={li}>Enviar comunicaciones comerciales sobre nuestros productos y promociones, solo si el titular lo autoriza.</li>
            <li style={li}>Cumplir con obligaciones legales, contables, tributarias y de seguridad.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>5. Derechos del titular</h2>
          <p style={p}>El titular puede en cualquier momento:</p>
          <ul style={{ paddingLeft: 20, margin: "0 0 10px" }}>
            <li style={li}>Conocer, actualizar y rectificar sus datos.</li>
            <li style={li}>Solicitar prueba de la autorización otorgada.</li>
            <li style={li}>Ser informado del uso que se ha dado a sus datos.</li>
            <li style={li}>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
            <li style={li}>Revocar la autorización o solicitar la supresión de los datos, cuando no exista deber legal o contractual de conservarlos.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>6. Cómo ejercer los derechos</h2>
          <p style={p}>
            Cualquier solicitud puede dirigirse al correo electrónico{" "}
            <a href="mailto:privacidad@atolon.co" style={{ color: B.navy, fontWeight: 700 }}>
              privacidad@atolon.co
            </a>{" "}
            indicando el nombre completo, número de identificación y descripción clara de la solicitud.
            Atendemos consultas en 10 días hábiles y reclamos en 15 días hábiles desde la recepción, conforme a la Ley 1581.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>7. Conservación y seguridad</h2>
          <p style={p}>
            Conservamos los datos durante el tiempo necesario para cumplir las finalidades descritas y las
            obligaciones legales. Aplicamos medidas técnicas y administrativas razonables para proteger la
            información contra accesos no autorizados, pérdida o alteración.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>8. Transferencias y proveedores</h2>
          <p style={p}>
            Podemos compartir datos con proveedores tecnológicos que nos prestan servicios (procesadores de pago,
            envío de correos transaccionales, almacenamiento en la nube), bajo cláusulas contractuales que les
            obligan a tratarlos exclusivamente para las finalidades autorizadas.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>9. Cambios a esta política</h2>
          <p style={p}>
            Esta política puede actualizarse. Publicaremos en este mismo sitio la versión vigente y la fecha de
            la última modificación. Los cambios sustanciales se comunicarán por correo electrónico cuando ello
            sea aplicable.
          </p>
        </section>

        <div style={{ borderTop: `1px solid ${B.sand}`, paddingTop: 16, marginTop: 24, fontSize: 12, color: "#888", textAlign: "center" }}>
          © {new Date().getFullYear()} Interop Colombia S.A.S. · NIT 901.XXX.XXX-X
        </div>
      </div>
    </div>
  );
}
