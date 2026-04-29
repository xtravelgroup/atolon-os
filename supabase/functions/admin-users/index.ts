// admin-users — Gestión de usuarios usando Supabase Admin API.
// Crea/actualiza/elimina usuarios manteniendo en sincronía:
//   · auth.users         (autenticación, password)
//   · public.usuarios    (perfil, módulos, rol, permisos)
//
// Endpoints:
//   POST   /admin-users/create   { nombre, email, telefono?, rol_id, modulos[], pin?, notas?, avatar_color, password? }
//   POST   /admin-users/update   { id, ...patch }                  -- patch.email/password opcionales
//   POST   /admin-users/reset-password  { id, password }
//   DELETE /admin-users/delete   ?id=XXX
//
// Requiere que el caller esté autenticado (JWT en Authorization).
// Solo crea usuarios; el caller debe tener permiso (validado en Usuarios.jsx,
// no aquí — la función confía en que solo admins llaman).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const DEFAULT_PASSWORD = "Atolon26";

// Admin client (service_role)
function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Verificar que el caller esté autenticado (cualquier user válido — el
// front-end ya valida que sea admin antes de permitir abrir el form).
async function requireAuth(req: Request): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const auth = req.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, error: "Falta Authorization Bearer token" };
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) return { ok: false, error: "Token inválido" };
  return { ok: true, userId: data.user.id };
}

function jsonResp(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url  = new URL(req.url);
  const path = url.pathname.replace(/^\/admin-users/, "");

  // Auth check (todos los endpoints requieren auth)
  const auth = await requireAuth(req);
  if (!auth.ok) return jsonResp({ error: auth.error }, 401);

  const SB = adminClient();

  try {
    // ════════════════════════════════════════════════════════════════════
    // POST /create — crea auth.user + public.usuarios atómicamente
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/create") {
      const body = await req.json();
      const { nombre, email, telefono, rol_id, modulos, pin, notas, avatar_color, password, activo } = body;
      if (!nombre || !email) return jsonResp({ error: "nombre y email son requeridos" }, 400);

      const cleanEmail = String(email).toLowerCase().trim();
      const finalPassword = (password || DEFAULT_PASSWORD).trim();

      // 1) Crear auth.user (email auto-confirmado)
      const { data: authData, error: authErr } = await SB.auth.admin.createUser({
        email: cleanEmail,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { nombre },
      });
      if (authErr) {
        // Si ya existe en auth, lo ignoramos y procedemos con el insert en usuarios
        // (caso típico: migración manual o reintento)
        if (!/already.*registered|exists/i.test(authErr.message || "")) {
          return jsonResp({ error: "auth.createUser: " + authErr.message }, 500);
        }
        console.warn("[admin-users] auth user ya existe, continuando:", cleanEmail);
      }

      // 2) Insertar en public.usuarios
      const usuarioId = `USR-${Date.now()}`;
      const { error: insErr } = await SB.from("usuarios").insert({
        id:           usuarioId,
        nombre:       nombre.trim(),
        email:        cleanEmail,
        telefono:     telefono || null,
        rol_id:       rol_id || null,
        modulos:      Array.isArray(modulos) ? modulos : null,
        pin:          pin || null,
        notas:        notas || null,
        activo:       activo !== false,
        avatar_color: avatar_color || null,
        must_change_password: true,
      });
      if (insErr) {
        // Rollback parcial — borrar el auth user que creamos arriba
        if (authData?.user?.id) {
          await SB.auth.admin.deleteUser(authData.user.id).catch(() => {});
        }
        return jsonResp({ error: "insert usuarios: " + insErr.message }, 500);
      }

      return jsonResp({
        ok: true,
        usuario_id: usuarioId,
        auth_id:    authData?.user?.id || null,
        password:   finalPassword,  // útil para mostrar al admin la primera vez
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /update — patch en usuarios; si cambia email, sincroniza auth
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/update") {
      const body = await req.json();
      const { id, password, ...patch } = body;
      if (!id) return jsonResp({ error: "id es requerido" }, 400);

      // Trae el row actual
      const { data: actual } = await SB.from("usuarios").select("email").eq("id", id).single();
      const oldEmail = actual?.email;

      // Si viene un email nuevo o password, actualizar auth
      const cleanEmail = patch.email ? String(patch.email).toLowerCase().trim() : null;
      if ((cleanEmail && cleanEmail !== oldEmail) || password) {
        // Buscar el auth user actual por email viejo
        const { data: authList } = await SB.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = authList?.users?.find(u => u.email?.toLowerCase() === (oldEmail || "").toLowerCase());
        if (authUser) {
          const upd: Record<string, unknown> = {};
          if (cleanEmail && cleanEmail !== oldEmail) {
            upd.email = cleanEmail;
            upd.email_confirm = true;
          }
          if (password) upd.password = password;
          if (Object.keys(upd).length) {
            const { error: updErr } = await SB.auth.admin.updateUserById(authUser.id, upd);
            if (updErr) return jsonResp({ error: "auth.updateUser: " + updErr.message }, 500);
          }
        } else if (cleanEmail) {
          // No hay auth — crearlo (caso: usuario legacy sin auth)
          await SB.auth.admin.createUser({
            email: cleanEmail,
            password: password || DEFAULT_PASSWORD,
            email_confirm: true,
            user_metadata: { nombre: patch.nombre },
          }).catch(() => {});
        }
      }

      // Update en usuarios
      const usuariosPatch: Record<string, unknown> = {};
      for (const k of ["nombre","email","telefono","rol_id","modulos","pin","notas","activo","avatar_color","must_change_password"]) {
        if (k in patch) usuariosPatch[k] = patch[k];
      }
      if (cleanEmail) usuariosPatch.email = cleanEmail;
      if (Object.keys(usuariosPatch).length) {
        const { error: upErr } = await SB.from("usuarios").update(usuariosPatch).eq("id", id);
        if (upErr) return jsonResp({ error: "update usuarios: " + upErr.message }, 500);
      }

      return jsonResp({ ok: true });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /reset-password — admin resetea clave de cualquier usuario
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/reset-password") {
      const body = await req.json();
      const { id, password } = body;
      if (!id) return jsonResp({ error: "id es requerido" }, 400);
      const finalPassword = (password || DEFAULT_PASSWORD).trim();

      const { data: u } = await SB.from("usuarios").select("email").eq("id", id).single();
      if (!u?.email) return jsonResp({ error: "Usuario no encontrado" }, 404);

      const { data: list } = await SB.auth.admin.listUsers({ page: 1, perPage: 1000 });
      let authUser = list?.users?.find(x => x.email?.toLowerCase() === u.email.toLowerCase());

      if (!authUser) {
        // Crear auth si no existe
        const { data: created, error: cErr } = await SB.auth.admin.createUser({
          email: u.email, password: finalPassword, email_confirm: true,
        });
        if (cErr) return jsonResp({ error: "auth.createUser: " + cErr.message }, 500);
        authUser = created.user;
      } else {
        const { error: uErr } = await SB.auth.admin.updateUserById(authUser.id, { password: finalPassword });
        if (uErr) return jsonResp({ error: "auth.updateUser: " + uErr.message }, 500);
      }

      // Marcar must_change_password
      await SB.from("usuarios").update({ must_change_password: true }).eq("id", id);

      return jsonResp({ ok: true, password: finalPassword });
    }

    // ════════════════════════════════════════════════════════════════════
    // DELETE /delete?id=USR-XXX — borra de auth + usuarios
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "DELETE" && path === "/delete") {
      const id = url.searchParams.get("id");
      if (!id) return jsonResp({ error: "id es requerido" }, 400);

      const { data: u } = await SB.from("usuarios").select("email").eq("id", id).single();
      if (u?.email) {
        const { data: list } = await SB.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = list?.users?.find(x => x.email?.toLowerCase() === u.email.toLowerCase());
        if (authUser) {
          await SB.auth.admin.deleteUser(authUser.id).catch(() => {});
        }
      }
      await SB.from("usuarios").delete().eq("id", id);
      return jsonResp({ ok: true });
    }

    return jsonResp({ error: "Endpoint no encontrado" }, 404);
  } catch (e) {
    console.error("admin-users error:", e);
    return jsonResp({ error: String((e as Error).message || e) }, 500);
  }
});
