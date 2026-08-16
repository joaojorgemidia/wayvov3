import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRoleRows } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id);
    const callerRoles = (callerRoleRows || []).map((r: any) => r.role);
    const callerIsSuperAdmin = callerRoles.includes("superadmin");
    const callerIsAdmin = callerIsSuperAdmin || callerRoles.includes("admin");
    if (!callerIsAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { email, password, display_name, role, company_ids } = await req.json();

    if (!email || !password || !role || !company_ids?.length) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // "admin" é um cargo POR EMPRESA (gestor de uma locadora) — diferente de
    // "superadmin" (staff da plataforma). Sem essa checagem, o gestor de UMA
    // empresa conseguia criar um usuário com acesso a QUALQUER empresa, ou até
    // já nascendo superadmin.
    if (!callerIsSuperAdmin) {
      if (role === "superadmin") {
        return new Response(JSON.stringify({ error: "Você não pode conceder o cargo superadmin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: callerCompanies } = await adminClient
        .from("user_companies").select("company_id").eq("user_id", caller.id);
      const callerCompanyIds = (callerCompanies || []).map((c: any) => c.company_id);
      if ((company_ids as string[]).some((cid) => !callerCompanyIds.includes(cid))) {
        return new Response(JSON.stringify({ error: "Você só pode dar acesso a empresas que você mesmo gerencia" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Create user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name || email },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = newUser.user.id;

    // Add role
    await adminClient.from("user_roles").insert({ user_id: userId, role });

    // Add companies
    const companyRows = company_ids.map((cid: string) => ({ user_id: userId, company_id: cid }));
    await adminClient.from("user_companies").insert(companyRows);

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
