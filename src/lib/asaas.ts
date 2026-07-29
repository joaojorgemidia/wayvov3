import { supabase } from "@/integrations/supabase/client";
import { FinancialEntry } from "./types";

const ASAAS_TERMINAL_STATUSES = ["RECEIVED", "CANCELLED", "REFUNDED", "REFUND_REQUESTED"];

// Cancela no Asaas os boletos das entradas informadas antes delas serem descartadas
// localmente (parcelamento de dívida, encerramento de contrato, edição de locação etc.).
// Sem isso, o boleto antigo continua aberto e pagável no Asaas mesmo depois que a cobrança
// correspondente já não existe mais no financeiro — se o cliente pagar esse boleto "órfão",
// o pagamento nunca aparece no sistema (a cobrança some antes de o webhook/cron conseguir
// achar alguma entrada pra atualizar). Retorna quantos cancelamentos falharam.
export async function cancelAsaasEntries(
  entries: FinancialEntry[],
  companyId: string | undefined,
): Promise<number> {
  const cancellable = entries.filter(e => !!e.asaasPaymentId && !ASAAS_TERMINAL_STATUSES.includes(e.asaasStatus || ""));
  if (cancellable.length === 0) return 0;
  const results = await Promise.allSettled(
    cancellable.map(e =>
      supabase.functions.invoke("asaas-cancel-payment", {
        body: { asaasPaymentId: e.asaasPaymentId, companyId },
      }),
    ),
  );
  return results.filter(r => r.status === "fulfilled" && r.value.error).length
    + results.filter(r => r.status === "rejected").length;
}
