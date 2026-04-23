// Pasos 1, 2, 3 y 6 (Declaración) del flujo Empresa.
// El paso 4 (trabajadores) y 5 (documentos) viven en sus propios componentes.

import { Field, Select, Textarea, FormRow, Card, Callout, SectionTitle, CheckItem } from "./FormField";
import {
  ARL_LIST, CLASES_RIESGO, TAMANOS_EMPRESA, SERVICIOS_EMPRESA, SST_PUNTAJES, DECS_EMPRESA,
} from "./constants";

export function EmpresaStep1({ data, setField, errors }) {
  return (
    <>
      <Card>
        <FormRow full>
          <Field label="Razón social" required value={data.emp_razon_social} onChange={v => setField("emp_razon_social", v)} placeholder="Ej: Servicios Técnicos del Caribe S.A.S." maxLength={100} error={errors.emp_razon_social} />
        </FormRow>
        <FormRow>
          <Field label="NIT" required value={data.emp_nit} onChange={v => setField("emp_nit", v)} placeholder="900123456-7" maxLength={15} error={errors.emp_nit} />
          <Field label="Actividad económica (CIIU)" hint="Si no lo conoce, déjelo en blanco" value={data.emp_ciiu} onChange={v => setField("emp_ciiu", v)} placeholder="Ej: 4329" maxLength={10} />
        </FormRow>
        <FormRow full>
          <Field label="Dirección" required value={data.emp_direccion} onChange={v => setField("emp_direccion", v)} placeholder="Calle, carrera, número, complemento" maxLength={120} error={errors.emp_direccion} />
        </FormRow>
        <FormRow>
          <Field label="Ciudad" required value={data.emp_ciudad} onChange={v => setField("emp_ciudad", v)} placeholder="Cartagena" maxLength={50} error={errors.emp_ciudad} />
          <Select label="Tamaño de empresa" required value={data.emp_tamano} onChange={v => setField("emp_tamano", v)} options={TAMANOS_EMPRESA} error={errors.emp_tamano} />
        </FormRow>
        <FormRow>
          <Field label="Teléfono fijo u oficina" value={data.emp_telefono} onChange={v => setField("emp_telefono", v)} placeholder="Opcional" maxLength={20} />
          <Field label="Correo electrónico corporativo" required type="email" value={data.contacto_principal_email} onChange={v => setField("contacto_principal_email", v)} placeholder="contacto@empresa.com" maxLength={80} error={errors.contacto_principal_email} />
        </FormRow>
      </Card>

      <SectionTitle>Representante legal</SectionTitle>
      <Card>
        <FormRow full>
          <Field label="Nombre completo" required value={data.emp_rl_nombre} onChange={v => setField("emp_rl_nombre", v)} placeholder="Como aparece en la cédula" maxLength={100} error={errors.emp_rl_nombre} />
        </FormRow>
        <FormRow>
          <Field label="Cédula" required value={data.emp_rl_cedula} onChange={v => setField("emp_rl_cedula", v)} placeholder="Sin puntos ni guiones" maxLength={15} inputMode="numeric" error={errors.emp_rl_cedula} />
          <Field label="Celular" required value={data.emp_rl_cel} onChange={v => setField("emp_rl_cel", v)} placeholder="3001234567" maxLength={15} error={errors.emp_rl_cel} />
        </FormRow>
        <FormRow full>
          <Field label="Correo electrónico del representante" required type="email" value={data.emp_rl_correo} onChange={v => setField("emp_rl_correo", v)} placeholder="correo@empresa.com" maxLength={80} error={errors.emp_rl_correo} />
        </FormRow>
      </Card>
    </>
  );
}

export function EmpresaStep2({ data, setField, errors, sameContact, setSameContact }) {
  return (
    <>
      <SectionTitle>Contacto operativo para coordinación</SectionTitle>
      <Card>
        <CheckItem
          checked={sameContact}
          onToggle={() => {
            const next = !sameContact;
            setSameContact(next);
            if (next) {
              setField("emp_op_nombre", data.emp_rl_nombre || "");
              setField("emp_op_cargo", "Representante legal");
              setField("emp_op_cel", data.emp_rl_cel || "");
              setField("emp_op_correo", data.emp_rl_correo || "");
              setField("contacto_principal_cel", data.emp_rl_cel || "");
            }
          }}
        >
          Es la misma persona que el representante legal
        </CheckItem>

        <div style={{ marginTop: 18, opacity: sameContact ? 0.6 : 1 }}>
          <FormRow full>
            <Field label="Nombre completo" required value={data.emp_op_nombre} onChange={v => setField("emp_op_nombre", v)} placeholder="Quien coordina el trabajo día a día" maxLength={100} error={errors.emp_op_nombre} disabled={sameContact} />
          </FormRow>
          <FormRow>
            <Field label="Cargo" required value={data.emp_op_cargo} onChange={v => setField("emp_op_cargo", v)} placeholder="Ej: Supervisor de operaciones" maxLength={60} error={errors.emp_op_cargo} disabled={sameContact} />
            <Field label="Celular" required value={data.emp_op_cel} onChange={v => {
              setField("emp_op_cel", v);
              setField("contacto_principal_cel", v);
            }} placeholder="3001234567" maxLength={15} error={errors.emp_op_cel} disabled={sameContact} />
          </FormRow>
          <FormRow full>
            <Field label="Correo electrónico" required type="email" value={data.emp_op_correo} onChange={v => setField("emp_op_correo", v)} placeholder="correo@empresa.com" maxLength={80} error={errors.emp_op_correo} disabled={sameContact} />
          </FormRow>
        </div>
      </Card>

      <SectionTitle>Descripción del servicio</SectionTitle>
      <Card>
        <FormRow full>
          <Select label="¿Qué servicio prestará en Atolon?" required value={data.servicio_tipo} onChange={v => setField("servicio_tipo", v)} options={SERVICIOS_EMPRESA} error={errors.servicio_tipo} />
        </FormRow>
        <FormRow full>
          <Textarea label="Descripción breve del trabajo" required value={data.servicio_desc} onChange={v => setField("servicio_desc", v)} placeholder="Ejemplo: Reparación del sistema de aire acondicionado de 4 habitaciones, incluye revisión de ductos y recarga de gas refrigerante R-410A." maxLength={500} error={errors.servicio_desc} />
        </FormRow>
      </Card>
    </>
  );
}

export function EmpresaStep3({ data, setField, errors }) {
  return (
    <>
      <SectionTitle>ARL de la empresa</SectionTitle>
      <Card>
        <FormRow>
          <Select label="ARL" required value={data.emp_arl} onChange={v => setField("emp_arl", v)} options={[...ARL_LIST, "Otra"]} error={errors.emp_arl} />
          <Select label="Clase de riesgo principal" required value={data.emp_clase_riesgo} onChange={v => setField("emp_clase_riesgo", v)} options={CLASES_RIESGO} error={errors.emp_clase_riesgo} />
        </FormRow>
        <FormRow>
          <Field label="Fecha última PILA pagada" required type="date" value={data.emp_fecha_pila} onChange={v => setField("emp_fecha_pila", v)} error={errors.emp_fecha_pila} />
          <Field label="N° planilla PILA" value={data.emp_num_pila} onChange={v => setField("emp_num_pila", v)} placeholder="Opcional" maxLength={30} />
        </FormRow>
      </Card>

      <SectionTitle>Sistema de Gestión SG-SST</SectionTitle>
      <Card>
        <FormRow full>
          <Field label="Nombre del responsable del SG-SST" required value={data.emp_sst_nombre} onChange={v => setField("emp_sst_nombre", v)} placeholder="Persona designada en su empresa" maxLength={100} error={errors.emp_sst_nombre} />
        </FormRow>
        <FormRow>
          <Field label="Licencia SST / N° curso 50h" required value={data.emp_sst_licencia} onChange={v => setField("emp_sst_licencia", v)} placeholder="N° de licencia o certificado" maxLength={50} error={errors.emp_sst_licencia} />
          <Select label="Puntaje Estándares Mínimos" required value={data.emp_sst_puntaje} onChange={v => setField("emp_sst_puntaje", v)} options={SST_PUNTAJES} error={errors.emp_sst_puntaje} />
        </FormRow>
        <FormRow>
          <Field label="Año de la última autoevaluación" value={data.emp_sst_ano} onChange={v => setField("emp_sst_ano", v)} placeholder="Ej: 2025" maxLength={4} />
        </FormRow>
      </Card>

      <Callout variant="warn" title="Su información será verificada">
        Los datos de ARL y PILA se validan contra el sistema RUAF del Ministerio de Salud. Si hay inconsistencias, nuestro Coordinador SST lo contactará para subsanarlas antes de autorizar el ingreso.
      </Callout>
    </>
  );
}

export function EmpresaStep6Declaracion({ data, setField, decs, toggleDec, errors }) {
  return (
    <>
      <Card>
        {DECS_EMPRESA.map((txt, i) => (
          <CheckItem key={i} checked={!!decs[i]} onToggle={() => toggleDec(i)}>
            {txt}
          </CheckItem>
        ))}
      </Card>

      <SectionTitle>Firma del representante legal</SectionTitle>
      <Card>
        <FormRow>
          <Field label="Nombre del firmante" required value={data.firma_nombre} onChange={v => setField("firma_nombre", v)} placeholder="Nombre completo" maxLength={100} error={errors.firma_nombre} />
          <Field label="Cédula del firmante" required value={data.firma_cedula} onChange={v => setField("firma_cedula", v)} placeholder="Sin puntos" maxLength={15} error={errors.firma_cedula} />
        </FormRow>
        <div style={{ fontSize: 12, opacity: 0.8, fontStyle: "italic", marginTop: 8 }}>
          Al presionar "Enviar registro" en la pantalla final, esta firma se considera manifiesta y vinculante conforme al artículo 7 de la Ley 527 de 1999 sobre firmas electrónicas.
        </div>
      </Card>
    </>
  );
}
