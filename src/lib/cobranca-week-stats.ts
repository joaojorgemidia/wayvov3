/**
 * Helpers para calcular metadados de cobrança semanal (semana N, período,
 * pagas vs pendentes) a partir de uma locação e suas entradas financeiras.
 */
import type { Rental, FinancialEntry } from "@/lib/types";
import type { CobrancaEventInput } from "@/lib/message-tokens";

const MS_DAY = 86400000;

function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calcula o nº da semana cobrada relativa ao início da locação. */
export function computeSemanaNumero(
  rental: Pick<Rental, "dataInicio" | "cobrancaPrePaga"> | null | undefined,
  due: Date | null,
): number | null {
  if (!rental?.dataInicio || !due) return null;
  const ini = parseISODate(rental.dataInicio);
  if (!ini) return null;
  const diffDays = Math.round((due.getTime() - ini.getTime()) / MS_DAY);
  if (diffDays < 0) return null;
  // Usa Math.round nas divisões para tolerar desvios de 1-3 dias entre
  // vencimentos criados antes de a locação virar pré/pós-paga.
  return rental.cobrancaPrePaga
    ? Math.round(diffDays / 7) + 1
    : Math.max(1, Math.round(diffDays / 7));
}

/** Janela [início, fim] da semana cobrada (datas ISO yyyy-mm-dd). */
export function computeSemanaPeriodo(
  rental: Pick<Rental, "dataInicio" | "cobrancaPrePaga"> | null | undefined,
  due: Date | null,
): { inicio: string | null; fim: string | null } {
  if (!rental?.dataInicio || !due) return { inicio: null, fim: null };
  const ini = parseISODate(rental.dataInicio);
  if (!ini) return { inicio: null, fim: null };
  let inicioPeriodo: Date;
  if (rental.cobrancaPrePaga) {
    // Pré-pago: vencimento = início do período
    inicioPeriodo = new Date(due);
  } else {
    // Pós-pago: vencimento = fim do período → início é 6 dias antes
    inicioPeriodo = new Date(due);
    inicioPeriodo.setDate(inicioPeriodo.getDate() - 6);
  }
  const fimPeriodo = new Date(inicioPeriodo);
  fimPeriodo.setDate(fimPeriodo.getDate() + 6);
  return { inicio: toISO(inicioPeriodo), fim: toISO(fimPeriodo) };
}

/** Conta semanas pagas e pendentes do locatário (categoria "aluguel"). */
export function computeSemanasStats(
  rental: Pick<Rental, "id"> | null | undefined,
  financial: FinancialEntry[],
): { pagas: number; pendentes: number; total: number } {
  if (!rental?.id) return { pagas: 0, pendentes: 0, total: 0 };
  let pagas = 0;
  let pendentes = 0;
  for (const e of financial) {
    if (e.rentalId !== rental.id) continue;
    if (e.tipo !== "receita") continue;
    if (e.ignorada) continue;
    if ((e.categoria || "").toLowerCase() !== "aluguel") continue;
    if (e.pago) pagas += 1;
    else pendentes += 1;
  }
  return { pagas, pendentes, total: pagas + pendentes };
}

/** Monta CobrancaEventInput pronto para buildAllTokens({ cobranca }). */
export function buildCobrancaEvent(args: {
  rental?: Rental | null;
  entry?: FinancialEntry | null;
  due?: Date | null;
  financial: FinancialEntry[];
  diasAtraso?: number | null;
}): CobrancaEventInput {
  const { rental, entry, financial } = args;
  const due =
    args.due ??
    parseISODate(entry?.dataPrevista || entry?.data || null);
  const semanaNumero = computeSemanaNumero(rental ?? null, due);
  const { inicio, fim } = computeSemanaPeriodo(rental ?? null, due);
  const stats = computeSemanasStats(rental ?? null, financial);
  return {
    semanaNumero,
    semanaInicio: inicio,
    semanaFim: fim,
    semanasPagas: stats.pagas,
    semanasPendentes: stats.pendentes,
    semanasTotal: stats.total,
    valorCobranca: entry?.valor ?? null,
    dataVencimento: entry?.dataPrevista || entry?.data || null,
    diasAtraso: args.diasAtraso ?? null,
    cobrancaPrePaga: rental?.cobrancaPrePaga ?? null,
  };
}
