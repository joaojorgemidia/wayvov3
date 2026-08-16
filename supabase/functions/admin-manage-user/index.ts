import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: any, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRoleRows } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id);
    const callerRoles = (callerRoleRows || []).map((r: any) => r.role);
    const callerIsSuperAdmin = callerRoles.includes("superadmin");
    const callerIsAdmin = callerIsSuperAdmin || callerRoles.includes("admin");
    if (!callerIsAdmin) return json({ error: "Admin only" }, 403);

    // "admin" é um cargo POR EMPRESA (gestor de uma locadora) — diferente de
    // "superadmin" (staff da plataforma, gerencia todas as empresas). Sem essa
    // distinção, o gestor de UMA empresa conseguia editar/excluir usuários de
    // QUALQUER empresa, se dar acesso a empresas que não são dele, ou até se
    // promover a superadmin — daí a régua abaixo pra quem não é superadmin.
    let callerCompanyIds: string[] = [];
    if (!callerIsSuperAdmin) {
      const { data: callerCompanies } = await adminClient
        .from("user_companies").select("company_id").eq("user_id", caller.id);
      callerCompanyIds = (callerCompanies || []).map((c: any) => c.company_id);
    }

    const body = await req.json();
    const { action, user_id } = body;
    if (!action || !user_id) return json({ error: "Missing fields" }, 400);

    // Um admin de empresa só pode mexer em usuários que já são exclusivamente
    // das empresas dele — nunca em alguém de outra empresa nem em um superadmin.
    if (!callerIsSuperAdmin) {
      const [{ data: targetRoleRows }, { data: targetCompanyRows }] = await Promise.all([
        adminClient.from("user_roles").select("role").eq("user_id", user_id),
        adminClient.from("user_companies").select("company_id").eq("user_id", user_id),
      ]);
      const targetRoles = (targetRoleRows || []).map((r: any) => r.role);
      if (targetRoles.includes("superadmin")) {
        return json({ error: "Você não pode gerenciar um superadmin" }, 403);
      }
      const targetCompanyIds = (targetCompanyRows || []).map((c: any) => c.company_id);
      const outsideCaller = targetCompanyIds.some((cid: string) => !callerCompanyIds.includes(cid));
      if (targetCompanyIds.length > 0 && outsideCaller) {
        return json({ error: "Você só pode gerenciar usuários da sua própria empresa" }, 403);
      }
    }

    if (action === "delete") {
      if (user_id === caller.id) return json({ error: "Você não pode excluir a si mesmo" }, 400);
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("user_companies").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("user_id", user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "update") {
      const { display_name, email, password, role, company_ids } = body;

      if (!callerIsSuperAdmin) {
        if (role === "superadmin") {
          return json({ error: "Você não pode conceder o cargo superadmin" }, 403);
        }
        if (Array.isArray(company_ids) && company_ids.some((cid: string) => !callerCompanyIds.includes(cid))) {
          return json({ error: "Você só pode dar acesso a empresas que você mesmo gerencia" }, 403);
        }
      }

      const updates: any = {};
      if (email) updates.email = email;
      if (password) updates.password = password;
      if (display_name) updates.user_metadata = { display_name };
      if (Object.keys(updates).length) {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, updates);
        if (error) return json({ error: error.message }, 400);
      }

      if (display_name || email) {
        const profileUpdate: any = {};
        if (display_name) profileUpdate.display_name = display_name;
        if (email) profileUpdate.email = email;
        await adminClient.from("profiles").update(profileUpdate).eq("user_id", user_id);
      }

      if (role) {
        await adminClient.from("user_roles").delete().eq("user_id", user_id);
        await adminClient.from("user_roles").insert({ user_id, role });
      }

      if (Array.isArray(company_ids)) {
        await adminClient.from("user_companies").delete().eq("user_id", user_id);
        if (company_ids.length) {
          await adminClient.from("user_companies").insert(
            company_ids.map((cid: string) => ({ user_id, company_id: cid })),
          );
        }
      }

      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});