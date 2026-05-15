import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://gps.brasilsatgps.com.br/api";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { endpoint, method = "GET", params = {}, body } = await req.json();

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

    const url = `${BASE}/${endpoint}${qs ? "?" + qs : ""}`;

    const fetchOptions: RequestInit =
      method === "POST"
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
          }
        : { method: "GET" };

    const resp = await fetch(url, fetchOptions);
    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brasilsat-proxy error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
