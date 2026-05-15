import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges",
};

const DRIVE_API = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

function gatewayHeaders() {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY ausente");
  if (!driveKey) throw new Error("GOOGLE_DRIVE_API_KEY ausente");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": driveKey,
  };
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const fileId = url.searchParams.get("fileId");
    const inspectionId = url.searchParams.get("inspectionId");
    const download = url.searchParams.get("download") === "1";
    if (!fileId || !inspectionId) {
      return new Response(JSON.stringify({ error: "fileId e inspectionId obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valida posse via RLS — se SELECT retorna a vistoria, o usuário tem acesso
    const { data: insp, error: inspErr } = await supabase
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
    const found = media.find((m: any) => m?.fileId === fileId);
    if (!found) {
      return new Response(JSON.stringify({ error: "Arquivo não pertence à vistoria" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream do arquivo
    const driveHeaders: Record<string, string> = { ...gatewayHeaders() };
    const range = req.headers.get("range");
    if (range) driveHeaders.Range = range;

    const driveRes = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: driveHeaders,
    });
    if (!driveRes.ok && driveRes.status !== 206) {
      const t = await driveRes.text();
      console.error("Drive download falhou", driveRes.status, t);
      return new Response(JSON.stringify({ error: `Drive [${driveRes.status}]` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", found.type || driveRes.headers.get("Content-Type") || "application/octet-stream");
    const cl = driveRes.headers.get("Content-Length");
    if (cl) headers.set("Content-Length", cl);
    const cr = driveRes.headers.get("Content-Range");
    if (cr) headers.set("Content-Range", cr);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=300");
    if (download) {
      headers.set("Content-Disposition", `attachment; filename="${found.name || "vistoria"}"`);
    } else {
      headers.set("Content-Disposition", `inline; filename="${found.name || "vistoria"}"`);
    }

    return new Response(driveRes.body, { status: driveRes.status, headers });
  } catch (e) {
    console.error("get-vistoria-media error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});