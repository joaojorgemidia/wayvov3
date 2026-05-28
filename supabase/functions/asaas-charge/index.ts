import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_BASE = "https://www.asaas.com/api/v3";

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

    // 2b. Busca a locação e a config Asaas da empresa
    let multaAtraso = 0;
    let jurosAtrasoMes = 0;
    let contratoNumero: number | null = null;
    let asaasConfig: Record<string, any> | null = null;

    if (entry.rental_id) {
      const { data: rental } = await supabase
        .from("rentals")
        .select("multa_atraso, juros_atraso_mes, numero")
        .eq("id", entry.rental_id)
        .single();
      if (rental) {
        contratoNumero = rental.numero != null ? Number(rental.numero) : null;
        // Fallback para valores do contrato (usado se a empresa não configurou o Asaas)
        multaAtraso = Number(rental.multa_atraso) || 0;
        jurosAtrasoMes = Number(rental.juros_atraso_mes) || 0;
      }
    }

    // Config da empresa sobrepõe os valores do contrato
    if (entry.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("asaas_config")
        .eq("id", entry.company_id)
        .single();
      if (company?.asaas_config) {
        asaasConfig = company.asaas_config;
        if (asaasConfig.enabled) {
          multaAtraso = Number(asaasConfig.multaAtraso) || 0;
          jurosAtrasoMes = Number(asaasConfig.jurosAtrasoMes) || 0;
        }
      }
    }

    const apiKey = resolveApiKey(asaasConfig);

    // Placa: vem direto da entrada (já resolvida) ou fallback da moto
    const placa = entry.placa || null;

    // Referência da semana: caução = semana anterior (já usada); aluguel = próxima semana (a ser usada)
    const categoria = (entry.categoria || "").toLowerCase();
    const isCaucao = categoria === "caucao";
    const isAluguelOuCaucao = categoria === "aluguel" || isCaucao;
    const dueRef = new Date((entry.data_prevista || entry.data) + "T00:00:00");
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    const MS_DAY = 86400000;
    const weekStart = isCaucao
      ? new Date(dueRef.getTime() - 7 * MS_DAY)
      : new Date(dueRef.getTime());
    const weekEnd = isCaucao
      ? new Date(dueRef.getTime() - 1 * MS_DAY)
      : new Date(dueRef.getTime() + 6 * MS_DAY);
    const semanaRef = isAluguelOuCaucao
      ? `${fmt(weekStart)} a ${fmt(weekEnd)}/${weekEnd.getFullYear()}`
      : null;

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
    const dueDate = entry.data_prevista || entry.data;
    const today = new Date().toISOString().split("T")[0];
    // Asaas não aceita vencimento no passado; usa amanhã como mínimo
    const effectiveDueDate = dueDate >= today ? dueDate : today;

    const paymentPayload: Record<string, unknown> = {
      customer: asaasCustomerId,
      billingType: "BOLETO",
      value: Number(entry.valor),
      dueDate: effectiveDueDate,
      description: [
        contratoNumero != null ? `Contrato #${contratoNumero}` : null,
        placa ? `Placa ${placa}` : null,
        semanaRef ? `Ref. ${semanaRef}` : null,
      ].filter(Boolean).join(" · "),
      externalReference: entry.id,
      postalService: false,
    };

    // Multa por atraso
    if (multaAtraso > 0) {
      paymentPayload.fine = { value: multaAtraso, type: "FIXED" };
    }

    // Juros mensais
    if (jurosAtrasoMes > 0) {
      paymentPayload.interest = { value: jurosAtrasoMes };
    }

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

    // 5. Atualiza a entrada com os dados do boleto
    await supabase
      .from("financial_entries")
      .update({
        asaas_payment_id: payment.id,
        asaas_status: payment.status,
        asaas_boleto_url: payment.bankSlipUrl || null,
        asaas_invoice_url: payment.invoiceUrl || null,
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
