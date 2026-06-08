import type { FinancialEntry } from "@/lib/types";

export interface CreditCardLike {
  id: string;
  nome: string;
  tipo: "banco" | "cartao";
  diaVencimento: number | null;
  diaFechamento?: number | null;
  contaPagamento?: string | null;
}

export interface CardInvoice {
  dueDate: string;       // "2026-07-05" ISO
  ymKey: string;         // "2026-07"
  label: string;         // "5 jul 2026"
  status: "Aberta" | "Parcial" | "Zerada" | "Paga";
  total: number;         // soma das despesas nesta fatura
}

/**
 * Dado a data de compra e os dados do cartão, retorna o YYYY-MM da fatura
 * em que essa compra vai cair (baseado no dia de fechamento e vencimento).
 *
 * Regra:
 *  - Se a compra é feita ATÉ o dia de fechamento (inclusive) → vai para a fatura
 *    cujo vencimento é no ciclo atual.
 *  - Se a compra é feita APÓS o dia de fechamento → vai para a fatura do próximo ciclo.
 *  - Se não há dia de fechamento configurado → assume fechamento no último dia do mês.
 */
export function computeCardInvoiceYm(purchaseIso: string, card: CreditCardLike): string {
  try {
    const d = new Date(purchaseIso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return purchaseIso.slice(0, 7);
    const closingDay = card.diaFechamento ?? lastDayOfMonth(d.getFullYear(), d.getMonth());
    const dueDay = card.diaVencimento || 1;
    // Passou do fechamento? Vai pro próximo ciclo.
    const closingMonthOffset = d.getDate() > closingDay ? 1 : 0;
    // Vencimento no mesmo mês que o fechamento ou depois? Fica no mesmo mês de fechamento.
    const dueMonthOffsetFromClosing = dueDay <= closingDay ? 1 : 0;
    const offset = closingMonthOffset + dueMonthOffsetFromClosing;
    const inv = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    return ymKey(inv);
  } catch {
    return purchaseIso.slice(0, 7);
  }
}

/**
 * Retorna a data ISO de vencimento da fatura para um dado mês/ano.
 */
export function computeCardDueIso(ym: string, card: CreditCardLike): string {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const dueDay = Math.min(card.diaVencimento || 1, lastDayOfMonth(y, m));
  return `${ym}-${String(dueDay).padStart(2, "0")}`;
}

/**
 * Retorna a lista de faturas de um cartão (passadas + futuras) com status calculado.
 */
export function getCardInvoicesList(
  card: CreditCardLike,
  entries: FinancialEntry[],
  { monthsBack = 2, monthsForward = 7 }: { monthsBack?: number; monthsForward?: number } = {},
): CardInvoice[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fatura "Aberta": se hoje ainda está antes do fechamento, é o mês atual;
  // se passou do fechamento, já é o próximo mês.
  const closingDay = card.diaFechamento ?? lastDayOfMonth(today.getFullYear(), today.getMonth());
  const openBase = new Date(today.getFullYear(), today.getMonth(), 1);
  if (today.getDate() > closingDay) {
    openBase.setMonth(openBase.getMonth() + 1);
  }
  const openYm = ymKey(openBase);

  const invoices: CardInvoice[] = [];

  for (let i = -monthsBack; i <= monthsForward; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const y = d.getFullYear();
    const mo = d.getMonth();
    const ym = ymKey(d);
    const dueDay = Math.min(card.diaVencimento || 1, lastDayOfMonth(y, mo));
    const dueIso = `${ym}-${String(dueDay).padStart(2, "0")}`;

    const invoiceId = `inv__${card.id}__${ym}`;
    const isPaid = entries.some(e => e.id === invoiceId && e.pago);

    // Usa computeCardInvoiceYm para garantir que entradas antigas (dataPrevista = data)
    // também sejam contabilizadas na fatura correta.
    const total = entries.reduce((sum, e) => {
      if (e.categoria === "fatura_cartao" || e.tipo !== "despesa" || e.ignorada || e.deletedAt) return sum;
      if (e.conta !== card.nome) return sum;
      return computeCardInvoiceYm(e.data, card) === ym
        ? sum + (Number(e.valor) || 0)
        : sum;
    }, 0);

    let status: CardInvoice["status"];
    if (isPaid) status = "Paga";
    else if (ym === openYm) status = "Aberta";
    else if (total > 0) status = "Parcial";
    else status = "Zerada";

    const dueDate = new Date(y, mo, dueDay);
    const label = dueDate.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });

    invoices.push({ dueDate: dueIso, ymKey: ym, label, status, total });
  }

  return invoices;
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
 */
export function reconcileCardInvoices(
  entries: FinancialEntry[],
  cards: CreditCardLike[],
  suppressedIds: Set<string> = new Set(),
): FinancialEntry[] {
  const cardByName = new Map<string, CreditCardLike>();
  cards.filter(c => c.tipo === "cartao").forEach(c => cardByName.set(c.nome, c));
  if (cardByName.size === 0) return entries;

  // Collect advance payments: fatura_cartao entries with serieId "adv_[cardId]",
  // paid and NOT auto-generated. They reduce the matching invoice's remaining amount.
  const advancesByKey = new Map<string, number>(); // "cardId::YYYY-MM" -> total paid
  entries.forEach((e) => {
    if (e.categoria !== "fatura_cartao") return;
    if (e.id.startsWith("inv__") || e.id.startsWith("fatura-")) return;
    if (!e.pago || !e.serieId?.startsWith("adv_")) return;
    const cardId = e.serieId.slice(4);
    const dueStr = e.dataPrevista || e.data;
    if (!dueStr) return;
    const due = new Date(dueStr + "T00:00:00");
    if (Number.isNaN(due.getTime())) return;
    const advYm = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
    advancesByKey.set(`${cardId}::${advYm}`, (advancesByKey.get(`${cardId}::${advYm}`) || 0) + (Number(e.valor) || 0));
  });

  // Group despesas posted to a card by (cardId, invoice YYYY-MM).
  // Uses computeCardInvoiceYm so old entries (dataPrevista = data) are grouped correctly.
  const groups = new Map<string, { card: CreditCardLike; ym: string; total: number; ids: string[] }>();

  entries.forEach((e) => {
    if (e.categoria === "fatura_cartao") return;
    if (e.tipo !== "despesa") return;
    if (e.ignorada) return;
    const card = cardByName.get(e.conta || "");
    if (!card) return;
    if (!e.data) return;
    const ym = computeCardInvoiceYm(e.data, card);
    const key = `${card.id}::${ym}`;
    const g = groups.get(key) || { card, ym, total: 0, ids: [] };
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
    if (suppressedIds.has(id)) return;
    desired.add(id);
    const [yStr, mStr] = g.ym.split("-");
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    const dueDay = Math.min(g.card.diaVencimento || 1, lastDayOfMonth(y, m));
    const dueIso = `${yStr}-${mStr}-${String(dueDay).padStart(2, "0")}`;
    const prev = existingInvoices.get(id);
    const advances = advancesByKey.get(`${g.card.id}::${g.ym}`) || 0;
    const remaining = Math.max(0, Math.round((g.total - advances) * 100) / 100);
    const fullyPaidByAdvances = advances > 0 && remaining <= 0.001;
    const merged: FinancialEntry = {
      id,
      tipo: "despesa",
      categoria: "fatura_cartao",
      subcategoria: undefined,
      descricao: `Fatura ${g.card.nome} • ${g.ym}`,
      valor: remaining,
      data: (prev?.pago || fullyPaidByAdvances) ? (prev?.data || dueIso) : dueIso,
      dataPrevista: dueIso,
      motoId: null,
      rentalId: null,
      clienteId: null,
      pago: prev?.pago || fullyPaidByAdvances,
      conta: prev?.conta || g.card.contaPagamento || "",
      natureza: "administrativa",
      tags: ["Fatura cartão"],
      observacao: prev?.observacao || `Pagamento automático da fatura do cartão ${g.card.nome}.`,
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
