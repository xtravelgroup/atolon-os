// Helper para invocar edge functions con logging automático.
//
// Uso (drop-in replacement de supabase.functions.invoke):
//   import { invokeFn } from "./lib/edgeFn";
//   const { data, error } = await invokeFn("send-whatsapp", { body: {...} });
//
// Registra el inicio (status='pending'), la duración, el resultado y
// cualquier error en public.edge_function_log. Si el caller no quiere
// logging (e.g. ya está en un edge function que se loggea solo), pasar
// opts.skipLog = true.

import { supabase } from "./supabase";

export async function invokeFn(functionName, opts = {}) {
  const { body = null, headers = {}, skipLog = false, correlationId, caller, ...rest } = opts;

  const startTs = Date.now();
  let logRowId = null;

  // Inserción inicial — pending
  if (!skipLog) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const inferredCaller = caller || user?.email || "anonymous";
      const { data, error } = await supabase.from("edge_function_log").insert({
        function_name:  functionName,
        status:         "pending",
        caller:         inferredCaller,
        correlation_id: correlationId || null,
        payload:        body ? truncate(body) : null,
      }).select("id").single();
      if (!error) logRowId = data.id;
    } catch { /* no romper la invocación principal por un fallo de log */ }
  }

  let result, errorObj, httpStatus;

  try {
    const resp = await supabase.functions.invoke(functionName, { body, headers, ...rest });
    result = resp.data;
    errorObj = resp.error;
    httpStatus = errorObj?.context?.status || (errorObj ? 500 : 200);
  } catch (e) {
    errorObj = e;
    httpStatus = 0;
  }

  const durationMs = Date.now() - startTs;
  const status = errorObj ? (durationMs >= 25000 ? "timeout" : "error") : "ok";

  // Update final
  if (!skipLog && logRowId) {
    try {
      await supabase.from("edge_function_log")
        .update({
          finished_at:   new Date().toISOString(),
          duration_ms:   durationMs,
          status,
          http_status:   httpStatus,
          error_message: errorObj ? String(errorObj?.message || errorObj).slice(0, 1000) : null,
          result:        result ? truncate(result) : null,
        })
        .eq("id", logRowId);
    } catch { /* swallow */ }
  }

  return { data: result, error: errorObj, durationMs, status };
}

// Truncar payloads grandes para que el log no explote
function truncate(obj, maxChars = 4000) {
  try {
    const s = typeof obj === "string" ? obj : JSON.stringify(obj);
    if (s.length <= maxChars) return obj;
    return { __truncated: true, preview: s.slice(0, maxChars) };
  } catch {
    return { __unserializable: true };
  }
}
