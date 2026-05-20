import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "vistorias";

function sanitize(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "sem-nome";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const placa = sanitize(String(form.get("placa") ?? ""));
    const date = sanitize(String(form.get("data") ?? ""));
    const companyId = String(form.get("company_id") ?? "");
    const locatarioRaw = String(form.get("locatario") ?? "").trim();
    const locatario = locatarioRaw ? sanitize(locatarioRaw) : "";
    const file = form.get("file");

    if (!placa || !date || !companyId || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: companies } = await userClient.rpc("get_user_companies", { _user_id: user.id });
    if (!Array.isArray(companies) || !companies.includes(companyId)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isVideo = (file.type || "").startsWith("video");
    const mediaFolder = isVideo ? "videos" : "fotos";
    const timestamp = Date.now();
    const safeFilename = sanitize(file.name);
    const locatarioPart = locatario ? `${locatario}/` : "";
    const storagePath = `${companyId}/${placa}/${locatarioPart}${date}/${mediaFolder}/${timestamp}-${safeFilename}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: bytes,
      },
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("Storage upload failed:", uploadRes.status, errText);
      return new Response(JSON.stringify({ error: `Falha ao enviar arquivo: ${uploadRes.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        storagePath,
        name: file.name,
        type: file.type,
        size: file.size,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("upload-vistoria error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
