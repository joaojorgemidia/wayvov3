import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";
const CRON_SECRET = "wayvo-cron-internal";
const MS_DAY = 86400000;

async function asaasGet(path: string, apiKey: string) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: "GET",
    headers: { "access_token": apiKey, "Content-Type": "application/json" },
  });
  return res.json();
}

async function asaasPut(path: string, apiKey: string, body: object) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: "PUT",
    headers: { "access_token": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || JSON.stringify(data);
    throw new Error(`Asaas PUT ${path}: ${msg}`);
  }
  return data;
}

// Espelha src/lib/cobranca-week-stats.ts, mesma lógica usada em asaas-charge, para a
// descrição do boleto mostrar a mesma referência de semana do app.
function computeSemanaNumero(dataInicio: string, cobrancaPrePaga: boolean, dueStr: string): number | null {
  const ini = new Date(dataInicio + "T12:00:00");
  const due = new Date(dueStr + "T12:00:00");
  const diffDays = Math.round((due.getTime() - ini.getTime()) / MS_DAY);
  if (diffDays < 0) return null;
  if (cobrancaPrePaga || diffDays < 6) return Math.round(diffDays / 7) + 1;
  return Math.max(1, Math.round(diffDays / 7));
}

function computeSemanaPeriodo(dataInicio: string, cobrancaPrePaga: boolean, dueStr: string): { inicio: Date; fim: Date } {
  const ini = new Date(dataInicio + "T12:00:00");
  const due = new Date(dueStr + "T12:00:00");
  let inicioPeriodo: Date;
  if (cobrancaPrePaga) {
    inicioPeriodo = new Date(due);
  } else {
    inicioPeriodo = new Date(due);
    inicioPeriodo.setDate(inicioPeriodo.getDate() - 6);
    if (inicioPeriodo < ini) inicioPeriodo = new Date(due);
  }
  const fimPeriodo = new Date(inicioPeriodo);
  fimPeriodo.setDate(fimPeriodo.getDate() + 6);
  return { inicio: inicioPeriodo, fim: fimPeriodo };
}

const fmtDM = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verifica autenticação: cron interno ou service role
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") || "";
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  if (cronSecret !== CRON_SECRET && !isServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const todayStr = new Date().toISOString().split("T")[0];
  const todayTs = new Date(todayStr + "T00:00:00").getTime();

  // Busca cobranças de aluguel/caução vencidas, ainda não pagas, com boleto Asaas gerado.
  // Multa/juros de atraso só se aplicam a essas duas categorias — mesma regra usada em
  // todo o resto do app (calcValorAtualizado, asaas-charge).
  const { data: entries, error } = await supabase
    .from("financial_entries")
    .select("id, company_id, rental_id, valor, data, data_prevista, descricao, observacao, placa, categoria, asaas_payment_id")
    .eq("pago", false)
    .in("categoria", ["aluguel", "caucao"])
    .not("asaas_payment_id", "is", null)
    .lt("data_prevista", todayStr)
    .is("deleted_at", null);

  if (error) {
    console.error("[asaas-update-fines] query error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!entries?.length) {
    return new Response(JSON.stringify({ updated: 0, skipped: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pré-carrega configs das empresas e dados das locações envolvidas
  const companyIds = [...new Set(entries.map((e: any) => e.company_id).filter(Boolean))];
  const companyConfigs = new Map<string, { apiKey: string; cobrancaConfig: Record<string, any> }>();
  for (const companyId of companyIds) {
    const { data: company } = await supabase
      .from("companies")
      .select("asaas_config, cobranca_config")
      .eq("id", companyId)
      .single();
    const apiKey = company?.asaas_config?.apiKey;
    if (apiKey) {
      companyConfigs.set(companyId as string, {
        apiKey,
        cobrancaConfig: company?.cobranca_config || { multaAtraso: 15, jurosDiario: 7, jurosMes: 0 },
      });
    }
  }

  const rentalIds = [...new Set(entries.map((e: any) => e.rental_id).filter(Boolean))];
  const rentals = new Map<string, any>();
  if (rentalIds.length > 0) {
    const { data: rentalRows } = await supabase
      .from("rentals")
      .select("id, multa_atraso, juros_atraso_mes, numero, data_inicio, cobranca_pre_paga")
      .in("id", rentalIds);
    for (const r of rentalRows || []) rentals.set(r.id, r);
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of entries as any[]) {
    const cfg = entry.company_id ? companyConfigs.get(entry.company_id) : null;
    if (!cfg) { skipped++; continue; }

    const rental = entry.rental_id ? rentals.get(entry.rental_id) : null;
    const multaAtraso = rental?.multa_atraso != null ? Number(rental.multa_atraso) : (Number(cfg.cobrancaConfig.multaAtraso) || 0);
    const jurosMes = rental?.juros_atraso_mes != null ? Number(rental.juros_atraso_mes) : (Number(cfg.cobrancaConfig.jurosMes) || 0);
    const jurosDiario = Number(cfg.cobrancaConfig.jurosDiario) || 0;

    const dueStr = entry.data_prevista || entry.data;
    const dueTs = new Date(dueStr + "T00:00:00").getTime();
    const diasAtraso = Math.max(0, Math.floor((todayTs - dueTs) / MS_DAY));
    if (diasAtraso <= 0) { skipped++; continue; }

    // Saldo restante de um pagamento parcial anterior — a multa/juros já foi somada UMA
    // vez ao calcular esse saldo (ver asaas-charge/FinanceiroPage/CobrancasSemanaPage).
    // Recalcular multa/juros aqui de novo dobraria o encargo a cada rodada de atraso do
    // mesmo saldo — mesmo critério usado no resto do app (isSaldoRestanteEntry).
    if ((entry.observacao || "").startsWith("Saldo devedor de pagamento parcial")) { skipped++; continue; }

    const baseValor = Number(entry.valor) || 0;
    const multaFixa = multaAtraso;
    const jurosDiarioTotal = jurosDiario * diasAtraso;
    const jurosMesTotal = baseValor * (jurosMes / 100 / 30) * diasAtraso;
    const totalJuros = multaFixa + jurosDiarioTotal + jurosMesTotal;
    const valorAtualizado = Math.round((baseValor + totalJuros) * 100) / 100;

    try {
      // Busca o pagamento atual no Asaas para não atualizar à toa nem mexer em pago/cancelado
      const current = await asaasGet(`/payments/${entry.asaas_payment_id}`, cfg.apiKey);
      if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "REFUNDED", "DELETED"].includes(current?.status)) {
        skipped++; continue;
      }
      if (Math.abs(Number(current?.value ?? 0) - valorAtualizado) < 0.01) { skipped++; continue; } // já está correto

      // Explicação do valor — vai tanto na descrição do boleto quanto na observação local.
      const parts: string[] = [`Valor original ${fmtBRL(baseValor)}`];
      if (multaFixa > 0) parts.push(`Multa ${fmtBRL(multaFixa)}`);
      if (jurosDiarioTotal > 0) parts.push(`Juros ${fmtBRL(jurosDiario)}/dia × ${diasAtraso}d = ${fmtBRL(jurosDiarioTotal)}`);
      if (jurosMesTotal > 0) parts.push(`Juros ${jurosMes}%/mês (${diasAtraso}d) = ${fmtBRL(jurosMesTotal)}`);
      const explicacao = `${parts.join(" + ")} = ${fmtBRL(valorAtualizado)} (${diasAtraso}d em atraso)`;

      let semanaRef: string | null = null;
      if (rental?.data_inicio) {
        const num = computeSemanaNumero(rental.data_inicio, !!rental.cobranca_pre_paga, dueStr);
        if (num != null) {
          const { inicio, fim } = computeSemanaPeriodo(rental.data_inicio, !!rental.cobranca_pre_paga, dueStr);
          semanaRef = `Semana ${String(num).padStart(2, "0")}: ${fmtDM(inicio)} até ${fmtDM(fim)}`;
        }
      }
      const descricaoBoleto = [
        entry.categoria === "caucao" ? "Caução" : "Aluguel",
        rental?.numero != null ? `Contrato #${rental.numero}` : null,
        entry.placa ? `Placa ${entry.placa}` : null,
        semanaRef,
        explicacao,
      ].filter(Boolean).join(" · ");

      // Asaas exige vencimento >= hoje em qualquer atualização (mesmo que dueDate não
      // mude de fato) — sem isso, a chamada é recusada com "data mínima de vencimento".
      // E só deixa alterar fine/interest de uma cobrança "pendente": uma vez vencida,
      // essas regras ficam travadas (mesmo que ainda não tenha sido paga). Tenta zerá-las
      // (evita dupla contagem sobre o valor já com acréscimos embutidos); se o Asaas
      // recusar por já estar vencida, atualiza só valor/vencimento/descrição mesmo assim.
      try {
        await asaasPut(`/payments/${entry.asaas_payment_id}`, cfg.apiKey, {
          value: valorAtualizado,
          dueDate: todayStr,
          fine: { value: 0, type: "FIXED" },
          interest: { value: 0 },
          description: descricaoBoleto,
        });
      } catch (fineErr) {
        const fineMsg = fineErr instanceof Error ? fineErr.message : String(fineErr);
        if (!fineMsg.includes("multa de uma cobrança pendente") && !fineMsg.includes("pendente")) throw fineErr;
        await asaasPut(`/payments/${entry.asaas_payment_id}`, cfg.apiKey, {
          value: valorAtualizado,
          dueDate: todayStr,
          description: descricaoBoleto,
        });
      }

      await supabase
        .from("financial_entries")
        .update({ observacao: explicacao })
        .eq("id", entry.id);

      console.log(`[asaas-update-fines] entry ${entry.id}: value → ${valorAtualizado} (${diasAtraso}d)`);
      updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[asaas-update-fines] entry ${entry.id}: ${msg}`);
      errors.push(`${entry.id}: ${msg}`);
    }
  }

  return new Response(JSON.stringify({ updated, skipped, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
