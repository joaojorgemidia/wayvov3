import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INFOSIMPLES_URL = "https://api.infosimples.com/api/v2/consultas/detran/go/debitos";

function parseBrDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

interface SafeInfracao {
  categoria: string;
  auto_infracao: string | null;
  data_infracao: string | null;
  data_vencimento: string | null;
  data_notificacao: string | null;
  valor: number;
  valor_desconto: number;
  descricao: string;
  orgao_atuador: string;
  grupo: string;
  situacao: string;
  responsavel_infracao: "PROPRIETARIO" | "CONDUTOR" | string;
}

function extractInfracoes(data0: Record<string, unknown>): SafeInfracao[] {
  const infracoes = data0.infracoes;
  if (!infracoes || typeof infracoes !== "object") return [];

  const inf = infracoes as Record<string, unknown>;
  const categories: Array<[string, unknown]> = [
    ["vencida", inf.vencidas],
    ["nao_vencida", inf.nao_vencida],
    ["notificada", inf.notificada],
    ["nao_notificada", inf.nao_notificada],
    ["sob_juros", inf.sob_juice],
    ["parcelada", inf.parcelada],
    ["sne", inf.sne],
  ];

  const result: SafeInfracao[] = [];

  for (const [categoria, items] of categories) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;

      const valor = typeof it.valor === "number" && isFinite(it.valor) && it.valor >= 0 && it.valor < 1_000_000
        ? Math.round(it.valor * 100) / 100
        : 0;
      const valorDesconto = typeof it.valor_desconto === "number" && isFinite(it.valor_desconto)
        ? Math.round(it.valor_desconto * 100) / 100
        : 0;

      result.push({
        categoria,
        auto_infracao: typeof it.ait === "string" ? it.ait.replace(/\W/g, "").slice(0, 50) : null,
        data_infracao: parseBrDate(it.data_infracao),
        data_vencimento: parseBrDate(it.data_vencimento ?? it.boleto_vencimento),
        data_notificacao: parseBrDate(it.data_notificacao),
        valor,
        valor_desconto: valorDesconto,
        descricao: typeof it.infracao_descricao === "string"
          ? it.infracao_descricao.replace(/[<>"']/g, "").slice(0, 200)
          : "MULTA DE TRÂNSITO",
        orgao_atuador: typeof it.orgao_atuador === "string"
          ? it.orgao_atuador.slice(0, 100)
          : "",
        grupo: typeof it.grupo_infracao === "string" ? it.grupo_infracao : "",
        situacao: typeof it.situacao === "string" ? it.situacao.slice(0, 100) : "",
        responsavel_infracao: typeof it.responsavel_infracao === "string"
          ? it.responsavel_infracao.toUpperCase()
          : "PROPRIETARIO",
      });
    }
  }

  return result;
}

async function consultarDebitos(
  placa: string,
  renavam: string,
  login: string,
  senha: string,
): Promise<{ data: SafeInfracao[]; error: string | null }> {
  const token = Deno.env.get("INFOSIMPLES_TOKEN");
  if (!token) return { data: [], error: "INFOSIMPLES_TOKEN não configurado." };

  const body = new URLSearchParams({
    token,
    timeout: "600",
    placa: placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
    renavam: renavam.replace(/\D/g, ""),
  });

  if (login) body.set("login_cpf", login);
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
    return { data: [], error: String(msg).slice(0, 300) };
  }

  const rawData: unknown[] = Array.isArray(json.data) ? json.data : [];
  const data0 = rawData[0];

  if (!data0 || typeof data0 !== "object") {
    return { data: [], error: null };
  }

  const infracoes = extractInfracoes(data0 as Record<string, unknown>);
  return { data: infracoes, error: null };
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

    const detranConfig = company.detran_config as { login: string; senhaHash: string } | null;
    if (!detranConfig?.login || !detranConfig?.senhaHash) {
      return new Response(
        JSON.stringify({
          error: "DETRAN_NOT_CONFIGURED",
          message: "Credenciais DETRAN-GO não configuradas. Acesse Configurações para conectar.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
          return { motoId: moto.id, placa: moto.placa || "—", data: [], error: "Placa ou RENAVAM não cadastrado." };
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
