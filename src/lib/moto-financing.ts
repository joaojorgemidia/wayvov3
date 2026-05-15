import { Motorcycle, FinancialEntry } from "./types";

/**
 * Calcula o valor das parcelas/entrada já pagas do financiamento ou parcelamento
 * de uma moto, descontando quaisquer lançamentos financeiros equivalentes
 * já registrados no sistema (para evitar duplicação).
 *
 * Lógica:
 *  - Total teórico = valorEntrada + (parcelasPagas * valorParcela)
 *  - Valor já lançado = soma das despesas pagas/não-ignoradas dessa moto
 *    cuja categoria/descrição/observação indiquem financiamento/parcela/entrada.
 *  - Retorna max(0, total teórico − já lançado)
 */
export function computeFinancingPaidExtra(
  moto: Pick<Motorcycle, "id" | "formaCompra" | "valorEntrada" | "parcelasPagas" | "valorParcela">,
  financialEntries: FinancialEntry[],
): number {
  if (moto.formaCompra !== "financiada" && moto.formaCompra !== "parcelada") return 0;
  const total = (moto.valorEntrada || 0) + ((moto.parcelasPagas || 0) * (moto.valorParcela || 0));
  if (total <= 0) return 0;

  const KEYWORDS = /financ|parcela|entrada|aquisi|compra moto|compra da moto/i;
  const alreadyLogged = financialEntries.reduce((sum, e) => {
    if (e.motoId !== moto.id) return sum;
    if (e.tipo !== "despesa") return sum;
    if (e.ignorada || !e.pago) return sum;
    const haystack = `${e.categoria || ""} ${e.subcategoria || ""} ${e.descricao || ""} ${e.observacao || ""}`;
    if (!KEYWORDS.test(haystack)) return sum;
    return sum + (e.valor || 0);
  }, 0);

  return Math.max(0, total - alreadyLogged);
}
