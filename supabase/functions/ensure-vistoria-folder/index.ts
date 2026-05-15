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
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "sem-nome";
}

async function findFolder(name: string, parentId: string | null): Promise<string | null> {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name = '${escapeQ(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentClause}`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
  const res = await fetch(url, { headers: gatewayHeaders() });
  if (!res.ok) throw new Error(`Drive list folder falhou [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const body: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) body.parents = [parentId];
  const res = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Drive create folder falhou [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function ensureFolder(name: string, parentId: string | null): Promise<string> {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  return await createFolder(name, parentId);
}

async function getFolderWebLink(folderId: string): Promise<string | null> {
  const url = `${DRIVE_API}/files/${folderId}?fields=webViewLink`;
  const res = await fetch(url, { headers: gatewayHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;
}

async function resolveRootId(): Promise<string> {
  const configured = Deno.env.get("VISTORIA_DRIVE_ROOT_ID");
  if (configured && configured.trim()) return configured.trim();
  return await ensureFolder(ROOT_FOLDER_NAME, null);
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
    const placas: string[] = Array.isArray(body.placas)
      ? body.placas.map((p: unknown) => sanitize(String(p ?? ""))).filter(Boolean)
      : body.placa ? [sanitize(String(body.placa))] : [];
    const locatarios: string[] = Array.isArray(body.locatarios)
      ? body.locatarios.map((l: unknown) => sanitize(String(l ?? ""))).filter(Boolean)
      : body.locatario ? [sanitize(String(body.locatario))] : [];
    const dataStr = body.data ? sanitize(String(body.data)) : null;
    const createMediaSubfolders = body.createMediaSubfolders === true;

    if (placas.length === 0 && locatarios.length === 0) {
      return new Response(JSON.stringify({ error: "placa(s) ou locatario(s) obrigatório(s)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rootId = await resolveRootId();
    const created: Array<Record<string, unknown>> = [];

    // Pastas de placa (com subpasta de locatário e data, se fornecidos)
    for (const placa of placas) {
      const placaId = await ensureFolder(placa, rootId);
      const placaLink = await getFolderWebLink(placaId);
      const entry: Record<string, unknown> = {
        kind: "placa",
        placa,
        folderId: placaId,
        webViewLink: placaLink,
      };
      // Se locatario(s) fornecidos, cria subpasta(s) sob a placa
      const locsForPlaca = locatarios.length ? locatarios : [];
      for (const loc of locsForPlaca) {
        const locId = await ensureFolder(loc, placaId);
        entry[`locatario_${loc}`] = locId;
        if (dataStr) {
          const dataId = await ensureFolder(dataStr, locId);
          entry[`data_${loc}`] = dataId;
          entry[`data_${loc}_webViewLink`] = await getFolderWebLink(dataId);
          if (createMediaSubfolders) {
            await ensureFolder("fotos", dataId);
            await ensureFolder("videos", dataId);
          }
        }
      }
      // Caso só tenha placa + data (sem locatário), cria a data direto sob a placa
      if (locsForPlaca.length === 0 && dataStr) {
        const dataId = await ensureFolder(dataStr, placaId);
        entry["data"] = dataId;
        entry["data_webViewLink"] = await getFolderWebLink(dataId);
        if (createMediaSubfolders) {
          await ensureFolder("fotos", dataId);
          await ensureFolder("videos", dataId);
        }
      }
      created.push(entry);
    }

    // Quando só recebemos locatários (sem placa), apenas garantimos as pastas raiz por locatário
    // Aqui assumimos que o caller também passou as placas relevantes; nada extra a fazer.

    return new Response(JSON.stringify({ ok: true, created }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ensure-vistoria-folder error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});