import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";
const MS_DAY = 86400000;

async function asaas(path: string, method: string, apiKey: string, body?: object) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: {
      "access_token": apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || JSON.stringify(data);
    throw new Error(`Asaas ${method} ${path} falhou: ${msg}`);
  }
  return data;
}

function resolveApiKey(companyConfig: Record<string, any> | null): string {
  const key = companyConfig?.apiKey || Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new Error("Chave de API Asaas não configurada para esta empresa");
  return key;
}

// Espelha src/lib/cobranca-week-stats.ts (computeSemanaNumero/computeSemanaPeriodo) para o
// boleto mostrar a mesma referência de semana ("Semana NN: DD/MM até DD/MM") que o app.
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

const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { entryId } = await req.json();
    if (!entryId) {
      return new Response(JSON.stringify({ error: "entryId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Busca a entrada financeira
    const { data: entry, error: entryErr } = await supabase
      .from("financial_entries")
      .select("*")
      .eq("id", entryId)
      .single();

    if (entryErr || !entry) {
      return new Response(JSON.stringify({ error: "Entrada não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (entry.asaas_payment_id) {
      return new Response(JSON.stringify({ error: "Boleto já gerado para esta entrada", paymentId: entry.asaas_payment_id }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!entry.cliente_id) {
      return new Response(JSON.stringify({ error: "Entrada não possui cliente vinculado" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Busca o cliente
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("*")
      .eq("id", entry.cliente_id)
      .single();

    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!client.email) {
      return new Response(JSON.stringify({ error: "Cliente não possui e-mail cadastrado" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2b. Busca a locação e as configs da empresa
    let contratoNumero: number | null = null;
    let rentalDataInicio: string | null = null;
    let rentalCobrancaPrePaga = false;
    let rentalMultaAtraso: number | null = null;
    let rentalJurosAtrasoMes: number | null = null;
    let asaasConfig: Record<string, any> | null = null;

    if (entry.rental_id) {
      const { data: rental } = await supabase
        .from("rentals")
        .select("multa_atraso, juros_atraso_mes, numero, data_inicio, cobranca_pre_paga")
        .eq("id", entry.rental_id)
        .single();
      if (rental) {
        contratoNumero = rental.numero != null ? Number(rental.numero) : null;
        rentalDataInicio = rental.data_inicio || null;
        rentalCobrancaPrePaga = !!rental.cobranca_pre_paga;
        rentalMultaAtraso = rental.multa_atraso != null ? Number(rental.multa_atraso) : null;
        rentalJurosAtrasoMes = rental.juros_atraso_mes != null ? Number(rental.juros_atraso_mes) : null;
      }
    }

    // cobranca_config é a MESMA config usada no resto do app para calcular o "valor
    // atualizado" de uma cobrança em atraso (Financeiro/Cobranças). asaas_config só traz
    // ajustes específicos do Asaas (chave de API, notificações, desconto) — nunca deve
    // sobrescrever multa/juros, senão o boleto diverge do que o app mostra pro usuário.
    let cobrancaConfig: Record<string, any> = { multaAtraso: 15, jurosDiario: 7, jurosMes: 0 };
    if (entry.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("asaas_config, cobranca_config")
        .eq("id", entry.company_id)
        .single();
      if (company?.asaas_config) asaasConfig = company.asaas_config;
      if (company?.cobranca_config) cobrancaConfig = company.cobranca_config;
    }

    const multaAtraso = rentalMultaAtraso ?? (Number(cobrancaConfig.multaAtraso) || 0);
    const jurosAtrasoMes = rentalJurosAtrasoMes ?? (Number(cobrancaConfig.jurosMes) || 0);
    const jurosDiario = Number(cobrancaConfig.jurosDiario) || 0;

    const apiKey = resolveApiKey(asaasConfig);

    // Placa: vem direto da entrada (já resolvida) ou fallback da moto
    const placa = entry.placa || null;

    const normCat = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const categoria = normCat(entry.categoria || "");
    const isCaucao = categoria === "caucao";
    const isAluguelOuCaucao = categoria === "aluguel" || isCaucao;

    // Rótulo legível da categoria, para o boleto deixar claro do que se trata quando
    // não é aluguel/caução (que já têm a referência de semana explicando sozinha).
    const CATEGORIA_LABELS: Record<string, string> = {
      aluguel: "Aluguel",
      caucao: "Caução",
      manutencao_receita: "Manutenção",
      multa_transito_receita: "Multa de Trânsito",
      venda_moto: "Venda de Moto",
      pecas_receita: "Peças",
      juros_atraso: "Juros por Atraso",
      outro_receita: "Outros",
    };
    const categoriaLabel = CATEGORIA_LABELS[categoria] || null;

    const dueStr = entry.data_prevista || entry.data;
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

    // Referência de período: usa a MESMA numeração de semana do app (computeSemanaNumero)
    // quando a locação tem data de início — senão cai no formato genérico "Ref. DD/MM a DD/MM".
    let semanaRef: string | null = null;
    if (isAluguelOuCaucao && rentalDataInicio) {
      const refDate = isCaucao ? new Date(new Date(dueStr + "T12:00:00").getTime() - 7 * MS_DAY) : new Date(dueStr + "T12:00:00");
      const refDateStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}-${String(refDate.getDate()).padStart(2, "0")}`;
      const num = computeSemanaNumero(rentalDataInicio, rentalCobrancaPrePaga, refDateStr);
      if (num != null) {
        const { inicio, fim } = computeSemanaPeriodo(rentalDataInicio, rentalCobrancaPrePaga, refDateStr);
        semanaRef = `Semana ${String(num).padStart(2, "0")}: ${fmt(inicio)} até ${fmt(fim)}`;
      }
    }
    if (!semanaRef && isAluguelOuCaucao) {
      const dueRef = new Date(dueStr + "T00:00:00");
      const weekStart = isCaucao ? new Date(dueRef.getTime() - 7 * MS_DAY) : new Date(dueRef.getTime());
      const weekEnd = isCaucao ? new Date(dueRef.getTime() - 1 * MS_DAY) : new Date(dueRef.getTime() + 6 * MS_DAY);
      semanaRef = `Ref. ${fmt(weekStart)} a ${fmt(weekEnd)}/${weekEnd.getFullYear()}`;
    }

    // 3. Cria ou reutiliza cliente no Asaas
    let asaasCustomerId = client.asaas_customer_id;

    if (!asaasCustomerId) {
      const cpfCnpj = client.cpf?.replace(/\D/g, "");
      const customerPayload: Record<string, string> = {
        name: client.nome,
        email: client.email,
        externalReference: client.id,
      };
      if (cpfCnpj) customerPayload.cpfCnpj = cpfCnpj;
      if (client.telefone) customerPayload.mobilePhone = client.telefone.replace(/\D/g, "");
      if (client.cep) customerPayload.postalCode = client.cep.replace(/\D/g, "");
      if (client.rua) customerPayload.address = client.rua;
      if (client.numero) customerPayload.addressNumber = client.numero;
      if (client.bairro) customerPayload.province = client.bairro;

      const newCustomer = await asaas("/customers", "POST", apiKey, customerPayload);
      asaasCustomerId = newCustomer.id;

      await supabase
        .from("clients")
        .update({ asaas_customer_id: asaasCustomerId })
        .eq("id", client.id);
    }

    // 4. Cria o boleto no Asaas
    const today = new Date().toISOString().split("T")[0];
    // Asaas não aceita vencimento no passado; usa hoje como mínimo
    const effectiveDueDate = dueStr >= today ? dueStr : today;

    // Dias de atraso reais (vencimento verdadeiro, não o "hoje" usado só pra satisfazer o
    // Asaas) — usados pra decidir se o valor já deve vir com os acréscimos embutidos.
    const dueDateObj = new Date(dueStr + "T00:00:00");
    const todayObj = new Date(today + "T00:00:00");
    const diasAtrasoReal = Math.max(0, Math.floor((todayObj.getTime() - dueDateObj.getTime()) / MS_DAY));

    // Parcelamento (individual ou acordo de dívida agrupada): o texto do lançamento já é
    // autoexplicativo ("Acordo de parcelamento de dívida – Parcela 2/6"), então o boleto
    // usa ele em vez do resumo genérico Contrato/Placa/Semana.
    const isParcelamento = entry.subcategoria === "Parcelamento";

    const baseValor = Number(entry.valor) || 0;

    // Multa/juros de atraso só se aplicam a aluguel e caução — mesma regra usada em todo o
    // resto do app (ex: calcValorAtualizado no Financeiro/Cobranças). O app usa multa fixa +
    // juros diário (R$/dia) + juros mensal (%) — o Asaas não tem um equivalente nativo para
    // "R$/dia fixo" via fine/interest, então quando a cobrança JÁ está em atraso na hora de
    // gerar o boleto, o valor com os acréscimos é calculado aqui (mesma fórmula do app) e
    // embutido direto no valor do boleto, em vez de deixar o Asaas recalcular sozinho (o que
    // gerava um total divergente do mostrado no app). Para cobranças ainda não vencidas,
    // mantém o comportamento anterior: valor base + fine/interest como acréscimo futuro.
    let valorBoleto = baseValor;
    let fineToApply: { value: number; type: string } | null = null;
    let interestToApply: { value: number } | null = null;
    // Explicação do valor quando a multa/juros já vêm embutidos no valor do boleto (cobrança
    // já vencida na hora de gerar) — mesmo formato usado pelo cron asaas-update-fines, pra não
    // ficar um valor "seco" sem explicar de onde veio o acréscimo.
    let explicacaoAtraso: string | null = null;

    if (isAluguelOuCaucao) {
      if (diasAtrasoReal > 0) {
        const jurosDiarioTotal = jurosDiario * diasAtrasoReal;
        const jurosMesTotal = baseValor * (jurosAtrasoMes / 100 / 30) * diasAtrasoReal;
        const jurosCalc = jurosMesTotal + jurosDiarioTotal + multaAtraso;
        valorBoleto = Math.round((baseValor + jurosCalc) * 100) / 100;

        const parts: string[] = [`Valor original ${fmtBRL(baseValor)}`];
        if (multaAtraso > 0) parts.push(`Multa ${fmtBRL(multaAtraso)}`);
        if (jurosDiarioTotal > 0) parts.push(`Juros ${fmtBRL(jurosDiario)}/dia × ${diasAtrasoReal}d = ${fmtBRL(jurosDiarioTotal)}`);
        if (jurosMesTotal > 0) parts.push(`Juros ${jurosAtrasoMes}%/mês (${diasAtrasoReal}d) = ${fmtBRL(jurosMesTotal)}`);
        explicacaoAtraso = `${parts.join(" + ")} = ${fmtBRL(valorBoleto)} (${diasAtrasoReal}d em atraso)`;
      } else {
        if (multaAtraso > 0 && multaAtraso < baseValor) {
          fineToApply = { value: multaAtraso, type: "FIXED" };
        }
        if (jurosAtrasoMes > 0) {
          interestToApply = { value: jurosAtrasoMes };
        }
      }
    }

    const paymentPayload: Record<string, unknown> = {
      customer: asaasCustomerId,
      billingType: "BOLETO",
      value: valorBoleto,
      dueDate: effectiveDueDate,
      description: isParcelamento
        ? [entry.descricao, contratoNumero != null ? `Contrato #${contratoNumero}` : null]
            .filter(Boolean).join(" · ")
        : [
            categoriaLabel,
            contratoNumero != null ? `Contrato #${contratoNumero}` : null,
            placa ? `Placa ${placa}` : null,
            semanaRef,
            explicacaoAtraso || (entry.observacao ? String(entry.observacao) : null),
          ].filter(Boolean).join(" · "),
      externalReference: entry.id,
      postalService: false,
    };

    if (fineToApply) paymentPayload.fine = fineToApply;
    if (interestToApply) paymentPayload.interest = interestToApply;

    // Desconto para pagamento antecipado (somente via config da empresa)
    if (asaasConfig?.enabled && asaasConfig?.descontoEnabled && asaasConfig?.descontoValor > 0) {
      paymentPayload.discount = {
        value: asaasConfig.descontoValor,
        dueDateLimitDays: asaasConfig.descontoDias || 0,
        type: "PERCENTAGE",
      };
    }

    // Notificações ao cliente
    const notifications: Record<string, unknown>[] = [];
    if (asaasConfig?.enabled) {
      if (asaasConfig.notifyDaysBefore > 0) {
        notifications.push({
          enabled: true,
          emailEnabledForCustomer: true,
          smsEnabledForCustomer: true,
          scheduleOffset: asaasConfig.notifyDaysBefore,
          event: "PAYMENT_DUEDATE_WARNING",
        });
      }
      if (asaasConfig.notifyOnDueDate) {
        notifications.push({
          enabled: true,
          emailEnabledForCustomer: true,
          smsEnabledForCustomer: true,
          scheduleOffset: 0,
          event: "PAYMENT_DUEDATE_WARNING",
        });
      }
      if (asaasConfig.notifyDaysAfterDelay > 0) {
        notifications.push({
          enabled: true,
          emailEnabledForCustomer: true,
          smsEnabledForCustomer: true,
          scheduleOffset: asaasConfig.notifyDaysAfterDelay,
          event: "PAYMENT_OVERDUE",
        });
      }
    } else {
      // Padrão: notificar 2 dias antes se não houver config
      notifications.push({
        enabled: true,
        emailEnabledForCustomer: true,
        smsEnabledForCustomer: true,
        scheduleOffset: 2,
        event: "PAYMENT_DUEDATE_WARNING",
      });
    }
    if (notifications.length > 0) {
      paymentPayload.notifications = notifications;
    }

    const payment = await asaas("/payments", "POST", apiKey, paymentPayload);

    // 5. Atualiza a entrada com os dados do boleto (e a explicação do acréscimo, se houver,
    // pra ficar igual ao que o asaas-update-fines grava quando recalcula um boleto vencido)
    await supabase
      .from("financial_entries")
      .update({
        asaas_payment_id: payment.id,
        asaas_status: payment.status,
        asaas_boleto_url: payment.bankSlipUrl || null,
        asaas_invoice_url: payment.invoiceUrl || null,
        ...(explicacaoAtraso ? { observacao: explicacaoAtraso } : {}),
      })
      .eq("id", entryId);

    return new Response(
      JSON.stringify({
        success: true,
        paymentId: payment.id,
        status: payment.status,
        boletoUrl: payment.bankSlipUrl,
        invoiceUrl: payment.invoiceUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[asaas-charge]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
