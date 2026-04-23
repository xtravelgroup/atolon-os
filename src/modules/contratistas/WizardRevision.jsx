// Paso Resumen — muestra toda la información capturada antes de enviar.

import { C, UPLOAD_EMPRESA, UPLOAD_NATURAL, DECS_EMPRESA, DECS_NATURAL } from "./constants";

function Row({ label, value }) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.sand, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ color: empty ? C.navyLight : C.navy, fontWeight: empty ? 400 : 700, lineHeight: 1.4, fontStyle: empty ? "italic" : "normal" }}>
        {empty ? "No indicado" : String(value)}
      </div>
    </div>
  );
}

function Section({ title, children, onEdit }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: C.sand, fontWeight: 800, marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${C.sand}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{title}</span>
        {onEdit && (
          <span onClick={onEdit} style={{ fontSize: 10, letterSpacing: 1, color: C.sand, cursor: "pointer", textDecoration: "underline", fontWeight: 700 }}>
            Editar
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px 24px" }}>
        {children}
      </div>
    </div>
  );
}

export default function WizardRevision({ tipo, data, workers, uploads, decs, jumpTo }) {
  const isEmp = tipo === "empresa";
  const uploadList = isEmp ? UPLOAD_EMPRESA : UPLOAD_NATURAL;
  const decList = isEmp ? DECS_EMPRESA : DECS_NATURAL;

  return (
    <div>
      {isEmp ? (
        <>
          <Section title="Empresa" onEdit={() => jumpTo(0)}>
            <Row label="Razón social" value={data.emp_razon_social} />
            <Row label="NIT" value={data.emp_nit} />
            <Row label="CIIU" value={data.emp_ciiu} />
            <Row label="Dirección" value={data.emp_direccion} />
            <Row label="Ciudad" value={data.emp_ciudad} />
            <Row label="Tamaño" value={data.emp_tamano} />
            <Row label="Teléfono" value={data.emp_telefono} />
            <Row label="Correo" value={data.contacto_principal_email} />
          </Section>

          <Section title="Representante legal" onEdit={() => jumpTo(0)}>
            <Row label="Nombre" value={data.emp_rl_nombre} />
            <Row label="Cédula" value={data.emp_rl_cedula} />
            <Row label="Celular" value={data.emp_rl_cel} />
            <Row label="Correo" value={data.emp_rl_correo} />
          </Section>

          <Section title="Contacto operativo" onEdit={() => jumpTo(1)}>
            <Row label="Nombre" value={data.emp_op_nombre} />
            <Row label="Cargo" value={data.emp_op_cargo} />
            <Row label="Celular" value={data.emp_op_cel} />
            <Row label="Correo" value={data.emp_op_correo} />
          </Section>

          <Section title="Servicio" onEdit={() => jumpTo(1)}>
            <Row label="Tipo" value={data.servicio_tipo} />
            <Row label="Fecha inicio" value={data.fecha_inicio} />
            <Row label="Fecha fin" value={data.fecha_fin} />
            <Row label="Horario" value={data.horario} />
            <Row label="N° trabajadores" value={data.num_trabajadores} />
            <Row label="Descripción" value={data.servicio_desc} />
          </Section>

          <Section title="ARL y SG-SST" onEdit={() => jumpTo(2)}>
            <Row label="ARL" value={data.emp_arl} />
            <Row label="Clase riesgo" value={data.emp_clase_riesgo} />
            <Row label="Fecha PILA" value={data.emp_fecha_pila} />
            <Row label="N° PILA" value={data.emp_num_pila} />
            <Row label="Responsable SST" value={data.emp_sst_nombre} />
            <Row label="Licencia SST" value={data.emp_sst_licencia} />
            <Row label="Puntaje" value={data.emp_sst_puntaje} />
          </Section>

          <Section title={`Trabajadores (${workers.length})`} onEdit={() => jumpTo(3)}>
            {workers.length === 0 ? (
              <Row label="" value="— sin trabajadores —" />
            ) : workers.map((w, i) => (
              <Row key={i} label={`${i + 1}. ${w.nombre}`} value={`${w.cedula} · ${w.cargo} · ARL ${w.arl}`} />
            ))}
          </Section>
        </>
      ) : (
        <>
          <Section title="Datos personales" onEdit={() => jumpTo(0)}>
            <Row label="Nombre" value={data.nat_nombre} />
            <Row label="Cédula" value={data.nat_cedula} />
            <Row label="Fecha nac." value={data.nat_fecha_nac} />
            <Row label="RH" value={data.nat_rh} />
            <Row label="Ciudad" value={data.nat_ciudad} />
            <Row label="Dirección" value={data.nat_direccion} />
            <Row label="Celular" value={data.nat_celular} />
            <Row label="Correo" value={data.nat_correo} />
          </Section>

          <Section title="Emergencia" onEdit={() => jumpTo(0)}>
            <Row label="Nombre" value={data.nat_emerg_nombre} />
            <Row label="Parentesco" value={data.nat_emerg_parentesco} />
            <Row label="Teléfono" value={data.nat_emerg_tel} />
          </Section>

          <Section title="Oficio y servicio" onEdit={() => jumpTo(1)}>
            <Row label="Oficio" value={data.nat_oficio} />
            <Row label="Experiencia (años)" value={data.nat_experiencia} />
            <Row label="Fecha" value={data.fecha_inicio} />
            <Row label="Duración" value={data.duracion} />
            <Row label="Descripción" value={data.servicio_desc} />
          </Section>

          <Section title="Seguridad social" onEdit={() => jumpTo(2)}>
            <Row label="EPS" value={data.nat_eps} />
            <Row label="Régimen" value={data.nat_regimen} />
            <Row label="AFP" value={data.nat_afp} />
            <Row label="Caja" value={data.nat_caja} />
            <Row label="ARL" value={data.nat_arl} />
            <Row label="Estado ARL" value={data.nat_arl_estado} />
          </Section>
        </>
      )}

      <Section title="Documentos" onEdit={() => jumpTo(isEmp ? 4 : 3)}>
        {uploadList.map(d => (
          <Row key={d.id} label={d.name} value={uploads[d.id]?.name || (d.required ? "PENDIENTE" : "—")} />
        ))}
      </Section>

      <Section title="Declaraciones" onEdit={() => jumpTo(isEmp ? 5 : 4)}>
        <Row
          label="Estado"
          value={decList.every((_, i) => decs[i]) ? "Todas aceptadas ✓" : "Faltan declaraciones"}
        />
        <Row label="Firmante" value={data.firma_nombre || data.nat_nombre} />
        <Row label="Cédula firmante" value={data.firma_cedula || data.nat_cedula} />
      </Section>
    </div>
  );
}
