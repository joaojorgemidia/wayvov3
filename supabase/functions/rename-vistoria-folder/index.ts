import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";
const DRIVE_API = `${GATEWAY_BASE}/drive/v3`;
const ROOT_FOLDER_NAME = "Vistorias";

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

function escapeQ(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitize(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

async function findFolderId(name: string, parentId: string | null): Promise<string | null> {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name = '${escapeQ(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentClause}`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
  const res = await fetch(url, { headers: gatewayHeaders() });
  if (!res.ok) throw new Error(`Drive list falhou [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function renameFolder(id: string, newName: string) {
  const res = await fetch(`${DRIVE_API}/files/${id}`, {
    method: "PATCH",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error(`Drive rename falhou [${res.status}]: ${await res.text()}`);
}

async function resolveRootId(): Promise<string | null> {
  const configured = Deno.env.get("VISTORIA_DRIVE_ROOT_ID");
  if (configured && configured.trim()) return configured.trim();
  return await findFolderId(ROOT_FOLDER_NAME, null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const placa = sanitize(String(body.placa ?? ""));
    const suffix = sanitize(String(body.suffix ?? "Vendida"));
    if (!placa) {
      return new Response(JSON.stringify({ error: "placa obrigatória" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rootId = await resolveRootId();
    if (!rootId) {
      return new Response(JSON.stringify({ skipped: true, reason: "Raiz Vistorias não existe" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newName = `${placa} - ${suffix}`;
    // Se já está renomeada, nada a fazer
    const already = await findFolderId(newName, rootId);
    if (already) {
      return new Response(JSON.stringify({ ok: true, alreadyRenamed: true, folderId: already }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const placaFolderId = await findFolderId(placa, rootId);
    if (!placaFolderId) {
      return new Response(JSON.stringify({ skipped: true, reason: "Pasta da placa não existe" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await renameFolder(placaFolderId, newName);
    return new Response(JSON.stringify({ ok: true, folderId: placaFolderId, newName }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rename-vistoria-folder error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});