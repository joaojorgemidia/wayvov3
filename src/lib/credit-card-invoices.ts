import type { FinancialEntry } from "@/lib/types";

export interface CreditCardLike {
  id: string;
  nome: string;
  tipo: "banco" | "cartao";
  diaVencimento: number | null;
  contaPagamento?: string | null;
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Generates/refreshes pending "Pagamento de fatura" expense entries for each
 * credit card based on the despesas posted to that card. One invoice per
 * (card, month-of-due-date). The invoice debits the card's contaPagamento.
 *
 * Returns the new entries array (with invoices added/updated and stale
 * ones removed). Pure function — caller decides when to persist.
 */
export function reconcileCardInvoices(
  entries: FinancialEntry[],
  cards: CreditCardLike[],
): FinancialEntry[] {
  const cardByName = new Map<string, CreditCardLike>();
  cards.filter(c => c.tipo === "cartao").forEach(c => cardByName.set(c.nome, c));
  if (cardByName.size === 0) return entries;

  // Group despesas posted to a card by (cardId, month-YYYY-MM of due date).
  // Invoice entries themselves (categoria "fatura_cartao") are excluded.
  const groups = new Map<string, { card: CreditCardLike; ym: string; total: number; ids: string[] }>();

  entries.forEach((e) => {
    if (e.categoria === "fatura_cartao") return;
    if (e.tipo !== "despesa") return;
    if (e.ignorada) return;
    const card = cardByName.get(e.conta || "");
    if (!card) return;
    const dueStr = e.dataPrevista || e.data;
    if (!dueStr) return;
    const due = new Date(dueStr + "T00:00:00");
    if (Number.isNaN(due.getTime())) return;
    const key = `${card.id}::${ymKey(due)}`;
    const g = groups.get(key) || { card, ym: ymKey(due), total: 0, ids: [] };
    g.total += Number(e.valor) || 0;
    g.ids.push(e.id);
    groups.set(key, g);
  });

  // Build a map of existing invoice entries by their stable id pattern.
  const invoiceId = (cardId: string, ym: string) => `inv__${cardId}__${ym}`;
  const existingInvoices = new Map<string, FinancialEntry>();
  entries.forEach(e => {
    if (e.categoria === "fatura_cartao" && (e.id.startsWith("inv__") || e.id.startsWith("fatura-"))) {
      existingInvoices.set(e.id, e);
    }
  });

  const result: FinancialEntry[] = [];
  // Keep all non-invoice entries as-is.
  entries.forEach(e => {
    if (!(e.categoria === "fatura_cartao" && (e.id.startsWith("inv__") || e.id.startsWith("fatura-")))) {
      result.push(e);
    }
  });

  const desired = new Set<string>();
  groups.forEach((g) => {
    const id = invoiceId(g.card.id, g.ym);
    desired.add(id);
    const [yStr, mStr] = g.ym.split("-");
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    const dueDay = Math.min(g.card.diaVencimento || 1, lastDayOfMonth(y, m));
    const dueIso = `${yStr}-${mStr}-${String(dueDay).padStart(2, "0")}`;
    const prev = existingInvoices.get(id);
    // Preserve user changes if they marked it pago/ignorada or changed contaPagamento
    const merged: FinancialEntry = {
      id,
      tipo: "despesa",
      categoria: "fatura_cartao",
      subcategoria: undefined,
      descricao: `Fatura ${g.card.nome} • ${g.ym}`,
      valor: Math.round(g.total * 100) / 100,
      data: prev?.pago ? (prev.data || dueIso) : dueIso,
      dataPrevista: dueIso,
      motoId: null,
      rentalId: null,
      clienteId: null,
      pago: prev?.pago || false,
      conta: prev?.conta || g.card.contaPagamento || "",
      natureza: "administrativa",
      tags: ["Fatura cartão"],
      observacao: prev?.observacao || `Pagamento automático da fatura do cartão ${g.card.nome}.`,
      // Fatura é ignorada nos totais (as compras individuais já contam),
      // mas continua afetando o saldo da conta de pagamento.
      ignorada: prev?.ignorada !== undefined ? prev.ignorada : true,
      classificacaoManual: prev?.classificacaoManual || false,
      createdAt: prev?.createdAt,
    };
    result.push(merged);
  });

  // Remove stale invoices (no longer have any despesa backing them) only if
  // not paid — paid invoices are historical and must be kept.
  existingInvoices.forEach((inv, id) => {
    if (!desired.has(id) && inv.pago) {
      result.push(inv);
    }
  });

  return result;
}