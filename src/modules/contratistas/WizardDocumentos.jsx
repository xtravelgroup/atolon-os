// Paso Documentos — renderiza upload items según tipo (empresa o natural).

import { useState } from "react";
import FileUploader from "./FileUploader";
import { Callout } from "./FormField";
import { UPLOAD_EMPRESA, UPLOAD_NATURAL, C } from "./constants";

export default function WizardDocumentos({ tipo, contratistaId, uploads, onChange }) {
  const list = tipo === "empresa" ? UPLOAD_EMPRESA : UPLOAD_NATURAL;
  const [msg, setMsg] = useState(null);

  const onDone = (docId, info) => {
    onChange({ ...uploads, [docId]: info });
    setMsg({ type: "success", text: `Archivo "${info.name}" subido.` });
    setTimeout(() => setMsg(null), 3000);
  };
  const onError = (text) => { setMsg({ type: "error", text }); setTimeout(() => setMsg(null), 4500); };

  return (
    <>
      {msg && (
        <div style={{
          padding: "10px 14px", marginBottom: 14,
          background: msg.type === "error" ? C.errorBg : C.successBg,
          border: `1px solid ${msg.type === "error" ? C.error : C.success}`,
          color: msg.type === "error" ? C.error : C.success,
          fontSize: 13, fontWeight: 700,
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {list.map(doc => (
          <FileUploader
            key={doc.id}
            docDef={doc}
            uploaded={uploads[doc.id]}
            contratistaId={contratistaId}
            onDone={onDone}
            onError={onError}
          />
        ))}
      </div>

      <Callout title="Opcional en este paso">
        Si no tiene los documentos a la mano ahora, puede finalizar el registro y enviarlos posteriormente al correo que le indicaremos. Sin embargo, su ingreso a la isla solo se autoriza cuando todos los documentos estén entregados y validados.
      </Callout>
    </>
  );
}
