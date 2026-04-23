// Pasos 1, 2, 3 y 5 (Curso+declaración) del flujo Persona Natural.
// Paso 4 (documentos) usa WizardDocumentos.

import { Field, Select, Textarea, FormRow, Card, Callout, SectionTitle, CheckItem } from "./FormField";
import {
  RH_LIST, OFICIOS_NATURAL, DURACIONES, REGIMENES,
  ARL_NATURAL, ARL_ESTADOS, DECS_NATURAL,
} from "./constants";

export function NaturalStep1({ data, setField, errors }) {
  return (
    <>
      <Card>
        <FormRow full>
          <Field label="Nombres y apellidos completos" required value={data.nat_nombre} onChange={v => setField("nat_nombre", v)} placeholder="Como aparece en su cédula" maxLength={100} error={errors.nat_nombre} />
        </FormRow>
        <FormRow>
          <Field label="Cédula de ciudadanía" required value={data.nat_cedula} onChange={v => setField("nat_cedula", v)} placeholder="Sin puntos" maxLength={15} inputMode="numeric" error={errors.nat_cedula} />
          <Field label="Fecha de nacimiento" required type="date" value={data.nat_fecha_nac} onChange={v => setField("nat_fecha_nac", v)} error={errors.nat_fecha_nac} />
        </FormRow>
        <FormRow>
          <Select label="RH / tipo de sangre" required value={data.nat_rh} onChange={v => setField("nat_rh", v)} options={RH_LIST} error={errors.nat_rh} />
          <Field label="Ciudad de residencia" required value={data.nat_ciudad} onChange={v => setField("nat_ciudad", v)} placeholder="Cartagena" maxLength={50} error={errors.nat_ciudad} />
        </FormRow>
        <FormRow full>
          <Field label="Dirección de residencia" required value={data.nat_direccion} onChange={v => setField("nat_direccion", v)} placeholder="Dirección completa" maxLength={120} error={errors.nat_direccion} />
        </FormRow>
        <FormRow>
          <Field label="Celular" required value={data.nat_celular} onChange={v => { setField("nat_celular", v); setField("contacto_principal_cel", v); }} placeholder="3001234567" maxLength={15} error={errors.nat_celular} />
          <Field label="Correo electrónico" required type="email" value={data.nat_correo} onChange={v => { setField("nat_correo", v); setField("contacto_principal_email", v); }} placeholder="correo@ejemplo.com" maxLength={80} error={errors.nat_correo} />
        </FormRow>
      </Card>

      <SectionTitle>Contacto de emergencia</SectionTitle>
      <Card>
        <FormRow>
          <Field label="Nombre completo" required value={data.nat_emerg_nombre} onChange={v => setField("nat_emerg_nombre", v)} placeholder="Quién llamar si pasa algo" maxLength={100} error={errors.nat_emerg_nombre} />
          <Field label="Parentesco" required value={data.nat_emerg_parentesco} onChange={v => setField("nat_emerg_parentesco", v)} placeholder="Ej: Esposa, hermano, madre" maxLength={30} error={errors.nat_emerg_parentesco} />
        </FormRow>
        <FormRow full>
          <Field label="Teléfono celular" required value={data.nat_emerg_tel} onChange={v => setField("nat_emerg_tel", v)} placeholder="3001234567" maxLength={15} error={errors.nat_emerg_tel} />
        </FormRow>
      </Card>
    </>
  );
}

export function NaturalStep2({ data, setField, errors }) {
  return (
    <Card>
      <FormRow>
        <Select label="Oficio principal" required value={data.nat_oficio} onChange={v => setField("nat_oficio", v)} options={OFICIOS_NATURAL} error={errors.nat_oficio} />
        <Field label="Años de experiencia" required type="number" value={data.nat_experiencia} onChange={v => setField("nat_experiencia", v)} placeholder="Ej: 5" min={0} max={50} error={errors.nat_experiencia} />
      </FormRow>
      <FormRow full>
        <Textarea label="Descripción del servicio a prestar" required value={data.servicio_desc} onChange={v => setField("servicio_desc", v)} placeholder="Ejemplo: Reparación de fuga en tubería de cocina, cambio de grifería y sellado de sanitario." maxLength={500} error={errors.servicio_desc} />
      </FormRow>
      <FormRow>
        <Field label="Fecha prevista del trabajo" required type="date" value={data.fecha_inicio} onChange={v => setField("fecha_inicio", v)} error={errors.fecha_inicio} />
        <Select label="Duración estimada" required value={data.duracion} onChange={v => setField("duracion", v)} options={DURACIONES} error={errors.duracion} />
      </FormRow>
    </Card>
  );
}

export function NaturalStep3({ data, setField, errors }) {
  return (
    <>
      <Card>
        <FormRow>
          <Field label="EPS (salud)" required value={data.nat_eps} onChange={v => setField("nat_eps", v)} placeholder="Ej: Sura, Sanitas, Nueva EPS" maxLength={60} error={errors.nat_eps} />
          <Select label="Régimen" required value={data.nat_regimen} onChange={v => setField("nat_regimen", v)} options={REGIMENES} error={errors.nat_regimen} />
        </FormRow>
        <FormRow>
          <Field label="AFP (pensión)" required value={data.nat_afp} onChange={v => setField("nat_afp", v)} placeholder="Ej: Porvenir, Protección, Colfondos" maxLength={60} error={errors.nat_afp} />
          <Field label="Caja de compensación" value={data.nat_caja} onChange={v => setField("nat_caja", v)} placeholder="Opcional — Ej: Comfamiliar" maxLength={60} />
        </FormRow>
      </Card>

      <SectionTitle>ARL (riesgos laborales)</SectionTitle>
      <Callout variant="warn" title="Importante sobre su ARL">
        Si su contrato con Atolon es superior a un mes, NOSOTROS (Atolon) lo afiliaremos a la ARL. Usted solo escoge cuál. Si el trabajo es corto (menos de un mes) y de bajo riesgo, puede presentarnos su propia afiliación.
      </Callout>
      <Card>
        <FormRow>
          <Select label="ARL elegida" required value={data.nat_arl} onChange={v => setField("nat_arl", v)} options={ARL_NATURAL} error={errors.nat_arl} />
          <Select label="Estado" required value={data.nat_arl_estado} onChange={v => setField("nat_arl_estado", v)} options={ARL_ESTADOS} error={errors.nat_arl_estado} />
        </FormRow>
      </Card>
    </>
  );
}

export function NaturalStep5CursoDeclaracion({ data, setField, decs, toggleDec, errors }) {
  return (
    <>
      <SectionTitle>Curso interactivo de inducción</SectionTitle>
      <Card>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "#0D1B3E", marginBottom: 18 }}>
          Antes de venir a Atolon debe completar un curso corto en su celular. Toma unos 15 minutos. Al aprobar recibe un certificado con código único que debe presentar el día del trabajo.
        </p>
        <FormRow>
          <Select
            label="¿Ya completó el curso?" required
            value={data.nat_curso_completado === true ? "si" : data.nat_curso_completado === false ? "no" : ""}
            onChange={v => setField("nat_curso_completado", v === "si")}
            options={[{ value: "si", label: "Sí, ya lo completé" }, { value: "no", label: "No, lo voy a hacer después" }]}
            error={errors.nat_curso_completado}
          />
          {data.nat_curso_completado && (
            <Field label="Código del certificado" required value={data.nat_codigo_curso} onChange={v => setField("nat_codigo_curso", v)} placeholder="ATL-XXXXXXXX-XXXXXXXX" maxLength={40} error={errors.nat_codigo_curso} />
          )}
        </FormRow>
        <Callout title="Enlace al curso">
          Una vez envíe este registro, le enviaremos el enlace al curso por correo y WhatsApp. Tiene hasta el día anterior al trabajo para completarlo.
        </Callout>
      </Card>

      <SectionTitle>Declaraciones</SectionTitle>
      <Card>
        {DECS_NATURAL.map((txt, i) => (
          <CheckItem key={i} checked={!!decs[i]} onToggle={() => toggleDec(i)}>
            {txt}
          </CheckItem>
        ))}
      </Card>
    </>
  );
}
