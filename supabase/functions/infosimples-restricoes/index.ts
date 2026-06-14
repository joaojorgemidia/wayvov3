import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INFOSIMPLES_URL = "https://api.infosimples.com/api/v2/consultas/detran/restricoes";

async function consultarRestricoes(
  uf: string,
  placa: string,
  renavam: string,
  chassi: string,
  loginField: "cpf" | "cnpj",
  login: string,
  senha: string,
): Promise<{ existeRestricao: boolean; restricoes: string[]; error: string | null }> {
  const token = Deno.env.get("INFOSIMPLES_TOKEN");
  if (!token) return { existeRestricao: false, restricoes: [], error: "INFOSIMPLES_TOKEN não configurado." };

  const body = new URLSearchParams({
    token,
    timeout: "600",
    uf: uf.toUpperCase(),
    placa: placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
    renavam: renavam.replace(/\D/g, ""),
    chassi: chassi.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
  });

  if (login) body.set(loginField === "cnpj" ? "login_cnpj" : "login_cpf", login);
  if (senha) body.set("login_senha", senha);

  const res = await fetch(INFOSIMPLES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(90_000),
  });

  const json = await res.json();

  if (json.code !== 200 && json.code !== 1 && json.code !== 100) {
    const msg = json.errors?.[0] || json.code_message || `Código ${json.code}`;
    return { existeRestricao: false, restricoes: [], error: String(msg).slice(0, 300) };
  }

  const dataItems: unknown[] = Array.isArray(json.data) ? json.data : [];
  const item = dataItems[0];

  if (!item || typeof item !== "object") {
    return { existeRestricao: false, restricoes: [], error: null };
  }

  const record = item as Record<string, unknown>;
  const existeRestricao = record.existe_restricao === true;
  const restricoes = Array.isArray(record.restricoes)
    ? (record.restricoes as unknown[])
        .filter((r): r is string => typeof r === "string")
        .map((r) => r.replace(/[<>"]/g, "").slice(0, 300))
    : [];

  return { existeRestricao, restricoes, error: null };
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

    const detranConfig = company.detran_config as {
      login: string;
      senhaHash: string;
      loginField?: "cpf" | "cnpj";
      uf?: string;
    } | null;

    if (!detranConfig?.login || !detranConfig?.senhaHash) {
      return new Response(
        JSON.stringify({
          error: "DETRAN_NOT_CONFIGURED",
          message: "Credenciais DETRAN não configuradas. Acesse Configurações para conectar.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const uf = (detranConfig.uf || "GO").toUpperCase();
    const loginField: "cpf" | "cnpj" = detranConfig.loginField ?? "cpf";

    const { data: motos, error: motosErr } = await supabase
      .from("motorcycles")
      .select("id, placa, renavam, chassi")
      .in("id", motoIds)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (motosErr) throw new Error(motosErr.message);

    const results = await Promise.allSettled(
      (motos ?? []).map(async (moto: { id: string; placa: string; renavam: string; chassi: string }) => {
        if (!moto.placa || !moto.renavam) {
          return { motoId: moto.id, placa: moto.placa || "—", existeRestricao: false, restricoes: [], error: "Placa ou RENAVAM não cadastrado." };
        }
        if (!moto.chassi) {
          return { motoId: moto.id, placa: moto.placa, existeRestricao: false, restricoes: [], error: "Chassi não cadastrado nesta moto. Atualize o cadastro." };
        }
        const result = await consultarRestricoes(
          uf, moto.placa, moto.renavam, moto.chassi, loginField,
          detranConfig.login, detranConfig.senhaHash,
        );
        return { motoId: moto.id, placa: moto.placa, ...result };
      }),
    );

    const output = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { motoId: null, placa: "—", existeRestricao: false, restricoes: [], error: String((r as PromiseRejectedResult).reason) },
    );

    return new Response(JSON.stringify({ results: output }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[infosimples-restricoes]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
