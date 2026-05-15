import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TOKEN = "wayvo-onetime-htm-2026";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token, email, password } = await req.json();
    if (token !== ALLOWED_TOKEN) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) return new Response(JSON.stringify({ error: listErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const user = list.users.find((u: any) => (u.email || "").toLowerCase() === String(email).toLowerCase());
    if (!user) return new Response(JSON.stringify({ error: "user not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true, user_id: user.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
