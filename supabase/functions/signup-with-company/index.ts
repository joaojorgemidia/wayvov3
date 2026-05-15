import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "empresa";
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const display_name = String(body.display_name ?? "").trim();
    const company_name = String(body.company_name ?? "").trim();
    const cnpj_raw = String(body.cnpj ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!display_name || display_name.length < 2 || display_name.length > 100) {
      return new Response(JSON.stringify({ error: "Nome inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!company_name || company_name.length < 2 || company_name.length > 100) {
      return new Response(JSON.stringify({ error: "Nome da empresa inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const cnpjDigits = onlyDigits(cnpj_raw);
    if (cnpjDigits.length !== 14) {
      return new Response(JSON.stringify({ error: "CNPJ deve ter 14 dígitos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: "Senha deve ter pelo menos 8 caracteres" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const company_id = `${slugify(company_name)}-${cnpjDigits.slice(-6)}`;

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name,
        company_name,
        company_id,
        cnpj: cnpjDigits,
      },
    });

    if (createError || !newUser?.user) {
      const raw = createError?.message || "Falha ao criar usuário";
      const friendly = /already (been )?registered|already exists|duplicate/i.test(raw)
        ? "Este e-mail já está cadastrado. Faça login ou use outro e-mail."
        : raw;
      return new Response(JSON.stringify({ error: friendly }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = newUser.user.id;

    await adminClient.from("user_roles").insert({ user_id: userId, role: "admin" });
    await adminClient.from("user_companies").insert({ user_id: userId, company_id });

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      company_id,
      company_name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
