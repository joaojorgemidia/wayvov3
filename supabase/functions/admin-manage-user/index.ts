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
    const { data: callerRoles } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin");
    if (!callerRoles?.length) return json({ error: "Admin only" }, 403);

    const body = await req.json();
    const { action, user_id } = body;
    if (!action || !user_id) return json({ error: "Missing fields" }, 400);

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