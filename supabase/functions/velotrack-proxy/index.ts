import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://track.velotrack.com.br/api/index.php";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { endpoint, method = "GET", params = {}, body, uid, browser } = await req.json();

    if (!endpoint) {
      return new Response(JSON.stringify({ error: "endpoint obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
      ) as Record<string, string>
    ).toString();

    const url = `${BASE}${endpoint}${qs ? "?" + qs : ""}`;

    // Toda requisição além do /login exige os headers "uid" e "browser"
    // (uid = desc_uid_retorno e browser = desc_useragent obtidos no login).
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (uid) headers.uid = uid;
    if (browser) headers.browser = browser;

    const fetchOptions: RequestInit =
      method === "POST" || method === "PUT" || method === "DELETE"
        ? { method, headers, body: JSON.stringify(body ?? {}) }
        : { method: "GET", headers };

    const resp = await fetch(url, fetchOptions);
    const text = await resp.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    // Sempre responde 200 ao navegador (mesmo quando a Velotrack retorna erro),
    // repassando o status real dentro do corpo — se devolvêssemos o status HTTP
    // de erro da Velotrack, o supabase-js descarta o corpo e mostra só um erro
    // genérico ("non-2xx status code"), escondendo a mensagem real.
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: true, status: resp.status, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("velotrack-proxy error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
