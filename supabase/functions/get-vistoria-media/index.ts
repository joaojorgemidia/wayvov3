import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges",
};

const BUCKET = "vistorias";

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

    const url = new URL(req.url);
    const storagePath = url.searchParams.get("storagePath");
    const fileId = url.searchParams.get("fileId");
    const inspectionId = url.searchParams.get("inspectionId");
    const download = url.searchParams.get("download") === "1";

    if ((!storagePath && !fileId) || !inspectionId) {
      return new Response(JSON.stringify({ error: "storagePath (ou fileId) e inspectionId obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valida acesso via RLS — se SELECT retorna a vistoria, o usuário tem acesso
    const { data: insp, error: inspErr } = await userClient
      .from("inspections")
      .select("id, media")
      .eq("id", inspectionId)
      .is("deleted_at", null)
      .maybeSingle();
    if (inspErr || !insp) {
      return new Response(JSON.stringify({ error: "Vistoria não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const media = Array.isArray(insp.media) ? insp.media : [];
    const found = storagePath
      ? media.find((m: any) => m?.storagePath === storagePath)
      : media.find((m: any) => m?.fileId === fileId);

    if (!found) {
      return new Response(JSON.stringify({ error: "Arquivo não pertence à vistoria" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Arquivos legados (fileId do Google Drive) não são mais acessíveis
    if (!storagePath && fileId) {
      return new Response(JSON.stringify({ error: "Arquivo legado do Google Drive não disponível. Apenas novos uploads são suportados." }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream do arquivo via Supabase Storage (service role para bypass de RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const range = req.headers.get("range");

    const storageHeaders: Record<string, string> = {
      Authorization: `Bearer ${serviceRoleKey}`,
    };
    if (range) storageHeaders.Range = range;

    const storageRes = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`,
      { headers: storageHeaders },
    );

    if (!storageRes.ok && storageRes.status !== 206) {
      const t = await storageRes.text();
      console.error("Storage download failed", storageRes.status, t);
      return new Response(JSON.stringify({ error: `Storage [${storageRes.status}]` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = new Headers(corsHeaders);
    const contentType = found.type || storageRes.headers.get("Content-Type") || "application/octet-stream";
    headers.set("Content-Type", contentType);
    const cl = storageRes.headers.get("Content-Length");
    if (cl) headers.set("Content-Length", cl);
    const cr = storageRes.headers.get("Content-Range");
    if (cr) headers.set("Content-Range", cr);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=300");
    const filename = found.name || "vistoria";
    headers.set("Content-Disposition", download ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`);

    return new Response(storageRes.body, { status: storageRes.status, headers });
  } catch (e) {
    console.error("get-vistoria-media error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
