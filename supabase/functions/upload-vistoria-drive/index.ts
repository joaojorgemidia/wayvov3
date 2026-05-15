import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";
const DRIVE_API = `${GATEWAY_BASE}/drive/v3`;
const DRIVE_UPLOAD = `${GATEWAY_BASE}/upload/drive/v3`;
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

async function findFolder(name: string, parentId: string | null): Promise<string | null> {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name = '${escapeQ(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentClause}`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
  const res = await fetch(url, { headers: gatewayHeaders() });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive list folder falhou [${res.status}]: ${t}`);
  }
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const body: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) body.parents = [parentId];
  const res = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive create folder falhou [${res.status}]: ${t}`);
  }
  const data = await res.json();
  return data.id;
}

async function ensureFolder(name: string, parentId: string | null): Promise<string> {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  return await createFolder(name, parentId);
}

async function resolveRootId(): Promise<string> {
  const configured = Deno.env.get("VISTORIA_DRIVE_ROOT_ID");
  if (configured && configured.trim()) return configured.trim();
  return await ensureFolder(ROOT_FOLDER_NAME, null);
}

async function uploadFile(
  parentId: string,
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<{ id: string; webViewLink: string | null }> {
  const boundary = `lovable-${crypto.randomUUID()}`;
  const metadata = { name: filename, parents: [parentId] };
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: "POST",
      headers: {
        ...gatewayHeaders(),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive upload falhou [${res.status}]: ${t}`);
  }
  const data = await res.json();
  return { id: data.id, webViewLink: data.webViewLink ?? null };
}

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

    const form = await req.formData();
    const placa = sanitize(String(form.get("placa") ?? ""));
    const data = sanitize(String(form.get("data") ?? ""));
    const companyId = String(form.get("company_id") ?? "");
    const locatarioRaw = String(form.get("locatario") ?? "").trim();
    const locatario = locatarioRaw ? sanitize(locatarioRaw) : "";
    const file = form.get("file");

    if (!placa || !data || !companyId || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica que o usuário tem acesso à empresa
    const { data: companies } = await supabase.rpc("get_user_companies", {
      _user_id: claims.claims.sub,
    });
    if (!Array.isArray(companies) || !companies.includes(companyId)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isVideo = (file.type || "").startsWith("video");
    const mediaFolder = isVideo ? "videos" : "fotos";

    const rootId = await resolveRootId();
    const placaId = await ensureFolder(placa, rootId);
    const parentForData = locatario ? await ensureFolder(locatario, placaId) : placaId;
    const dataId = await ensureFolder(data, parentForData);
    const mediaId = await ensureFolder(mediaFolder, dataId);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { id, webViewLink } = await uploadFile(
      mediaId,
      sanitize(file.name),
      file.type || "application/octet-stream",
      bytes,
    );

    return new Response(
      JSON.stringify({
        fileId: id,
        webViewLink,
        name: file.name,
        type: file.type,
        size: file.size,
        folder: locatario
          ? `${ROOT_FOLDER_NAME}/${placa}/${locatario}/${data}/${mediaFolder}`
          : `${ROOT_FOLDER_NAME}/${placa}/${data}/${mediaFolder}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("upload-vistoria-drive error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});