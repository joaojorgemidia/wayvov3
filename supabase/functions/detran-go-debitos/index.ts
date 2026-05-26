import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INFOSIMPLES_BASE = "https://api.infosimples.com/api/v2/consultas/detran/go/debitos";

async function consultarDebitos(
  placa: string,
  renavam: string,
  login: string,
  senha: string,
): Promise<{ data: unknown[]; error: string | null }> {
  const token = Deno.env.get("INFOSIMPLES_TOKEN");
  if (!token) return { data: [], error: "INFOSIMPLES_TOKEN não configurado." };

  const params = new URLSearchParams({
    token,
    timeout: "600",
    ignore_site_receipt: "1",
    placa: placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
    renavam: renavam.replace(/\D/g, ""),
    login_cpf: login,
    login_senha: senha,
    pkcs12_cert: "",
    pkcs12_pass: "",
  });

  const res = await fetch(`${INFOSIMPLES_BASE}?${params}`, { signal: AbortSignal.timeout(90_000) });
  const json = await res.json();

  // code 1 = sucesso, code 100 = sucesso com avisos
  if (json.code !== 1 && json.code !== 100) {
    const msg = json.errors?.[0] || json.code_message || `Código ${json.code}`;
    return { data: [], error: String(msg) };
  }

  return { data: json.data || [], error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { motoIds, companyId } = await req.json() as { motoIds: string[]; companyId: string };

    if (!Array.isArray(motoIds) || motoIds.length === 0) {
      return new Response(JSON.stringify({ error: "motoIds é obrigatório e deve ser um array." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId é obrigatório." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Lê as credenciais DETRAN da empresa
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("detran_config")
      .eq("id", companyId)
      .single();

    if (companyErr || !company) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const detranConfig = company.detran_config as { login: string; senhaHash: string } | null;
    if (!detranConfig?.login || !detranConfig?.senhaHash) {
      return new Response(
        JSON.stringify({
          error: "DETRAN_NOT_CONFIGURED",
          message: "Credenciais do DETRAN-GO não configuradas. Acesse Configurações para conectar.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Busca as motos
    const { data: motos, error: motosErr } = await supabase
      .from("motorcycles")
      .select("id, placa, renavam")
      .in("id", motoIds)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (motosErr) throw new Error(motosErr.message);

    const results = await Promise.allSettled(
      (motos ?? []).map(async (moto: { id: string; placa: string; renavam: string }) => {
        if (!moto.placa || !moto.renavam) {
          return {
            motoId: moto.id, placa: moto.placa || "—",
            data: [], error: "Placa ou RENAVAM não cadastrado nesta moto.",
          };
        }
        const { data, error } = await consultarDebitos(
          moto.placa, moto.renavam, detranConfig.login, detranConfig.senhaHash,
        );
        return { motoId: moto.id, placa: moto.placa, data, error };
      }),
    );

    const output = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { motoId: null, placa: "—", data: [], error: String((r as PromiseRejectedResult).reason) },
    );

    return new Response(JSON.stringify({ results: output }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[detran-go-debitos]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
