// Componente de subida de documentos a Supabase Storage (bucket "contratistas-docs").
// Inserta metadata en contratistas_documentos.

import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { C } from "./constants";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];

export default function FileUploader({ docDef, uploaded, contratistaId, onDone, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_BYTES) {
      onError?.("El archivo es muy grande (máx 10 MB).");
      e.target.value = "";
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      onError?.("Tipo no permitido. Solo PDF, JPG o PNG.");
      e.target.value = "";
      return;
    }
    if (!contratistaId) {
      onError?.("Primero complete los datos iniciales.");
      e.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${contratistaId}/${docDef.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      const { error: upErr } = await supabase.storage
        .from("contratistas-docs")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // Si ya existía un doc para este tipo, marcar el anterior como reemplazado (borrar).
      if (uploaded?.id) {
        try { await supabase.from("contratistas_documentos").delete().eq("id", uploaded.id); } catch { /* non-fatal */ }
      }

      const { data: row, error: insErr } = await supabase
        .from("contratistas_documentos")
        .insert({
          contratista_id: contratistaId,
          tipo: docDef.id,
          nombre_original: file.name,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      onDone?.(docDef.id, { id: row.id, name: file.name, path });
    } catch (err) {
      console.error("[FileUploader] error:", err);
      onError?.(err.message || "Error al subir el archivo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const isUploaded = !!uploaded?.name;

  return (
    <div
      style={{
        background: isUploaded ? C.successBg : C.white,
        border: `1px solid ${isUploaded ? C.success : C.border}`,
        borderLeft: docDef.required && !isUploaded ? `3px solid ${C.warn}` : undefined,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginBottom: 4 }}>
          {docDef.name}{docDef.required ? " *" : ""}
        </div>
        <div style={{ fontSize: 11, color: C.navyLight, lineHeight: 1.4 }}>{docDef.hint}</div>
        {isUploaded && (
          <div style={{ fontSize: 11, color: C.success, marginTop: 4, fontWeight: 700 }}>
            ✓ {uploaded.name}
          </div>
        )}
      </div>

      <div style={{
        fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 800,
        padding: "4px 10px",
        background: isUploaded ? C.success : C.sandPale,
        color: isUploaded ? C.white : C.navy,
        whiteSpace: "nowrap",
      }}>
        {isUploaded ? "Subido" : docDef.required ? "Requerido" : "Opcional"}
      </div>

      <label
        style={{
          background: isUploaded ? "transparent" : C.navy,
          color: isUploaded ? C.navy : C.white,
          border: isUploaded ? `1px solid ${C.border}` : "none",
          padding: "10px 16px", fontSize: 11, letterSpacing: 1.5,
          textTransform: "uppercase", fontWeight: 800, cursor: busy ? "wait" : "pointer",
          whiteSpace: "nowrap", opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Subiendo…" : isUploaded ? "Reemplazar" : "Subir"}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          style={{ display: "none" }}
          onChange={handle}
          disabled={busy}
        />
      </label>
    </div>
  );
}
