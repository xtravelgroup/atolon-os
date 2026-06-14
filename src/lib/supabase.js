import { createClient } from "@supabase/supabase-js";
import { wrapSupabaseForAudit } from "./auditMode";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

const raw = url && key ? createClient(url, key) : null;

// Wrap para que el modo auditoría intercepte writes globalmente.
// Cuando setAuditMode(false) (default), pasa todo sin overhead.
// Cuando un usuario con rol_id='auditor' inicia sesión, AtolanOS llama
// setAuditMode(true) y desde ahí cualquier insert/update/delete/upsert
// devuelve { data: null, error: { code: "AUDIT_READ_ONLY" } }.
export const supabase = raw ? wrapSupabaseForAudit(raw) : null;
