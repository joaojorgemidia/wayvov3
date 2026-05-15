import { addDays, addWeeks, addMonths, addYears, parseISO, format } from "date-fns";

export type RecurrenceUnit = "diario" | "semanal" | "mensal" | "anual";

/**
 * Gera as datas (yyyy-MM-dd) das ocorrências futuras de uma série recorrente
 * usando o padrão de calendário "A cada N [unidade] durante T ocorrências".
 *
 * - `baseDateISO`: data do lançamento original (NÃO incluída no retorno).
 * - `unit`: unidade do intervalo (dia / semana / mês / ano).
 * - `totalOccurrences`: quantas repetições futuras gerar.
 * - `interval`: a cada quantas unidades. Ex.: a cada 3 dias, a cada 2 semanas.
 *               Padrão 1.
 *
 * Garantias:
 *  - Semanas mantêm o MESMO DIA DA SEMANA da data base.
 *  - Meses mantêm o MESMO DIA DO MÊS (com ajuste do date-fns para meses
 *    mais curtos, ex.: dia 31 → último dia do mês).
 *  - Anos mantêm a mesma data.
 */
export function generateRecurrenceDates(
  baseDateISO: string,
  unit: RecurrenceUnit,
  totalOccurrences: number,
  interval: number = 1,
): string[] {
  if (!baseDateISO || totalOccurrences <= 0) return [];
  const base = parseISO(baseDateISO);
  const step = Math.max(1, Math.floor(interval || 1));
  const total = Math.max(0, Math.floor(totalOccurrences));
  const out: string[] = [];

  for (let i = 1; i <= total; i++) {
    const offset = i * step;
    const next =
      unit === "diario" ? addDays(base, offset)
      : unit === "semanal" ? addWeeks(base, offset)
      : unit === "anual" ? addYears(base, offset)
      : addMonths(base, offset);
    out.push(format(next, "yyyy-MM-dd"));
  }
  return out;
}

/**
 * Materializa ocorrências de uma série recorrente sem duplicar lançamentos
 * pré-existentes. Adota irmãos compatíveis (mesma data/valor/categoria/moto/cliente)
 * em vez de criar novos.
 */
export interface MaterializeEntry {
  id: string;
  tipo: "receita" | "despesa";
  categoria: string;
  valor: number;
  data: string;
  dataPrevista?: string;
  motoId?: string | null;
  clienteId?: string | null;
  placa?: string;
  clienteNome?: string;
  descricao?: string;
  conta?: string;
  natureza?: string;
  rentalId?: string | null;
  serieId?: string;
  fixedOriginId?: string;
  recorrente?: boolean;
  despesaFixa?: boolean;
  recorrenciaTipo?: RecurrenceUnit;
  recorrenciaVezes?: number;
  recorrenciaPorPeriodo?: number;
  pago?: boolean;
  ignorarNaFatura?: boolean;
  faturaCartaoId?: string | null;
  companyId?: string;
}

export function materializeRecurrences<T extends MaterializeEntry>(
  entries: T[],
  newId: () => string = () => Math.random().toString(36).slice(2),
  catNorm: (c: string, t: "receita" | "despesa") => string = (c) => c,
): { entries: T[]; changed: boolean } {
  const bases = entries.filter(e => !e.fixedOriginId && (e.recorrente || e.despesaFixa));
  if (!bases.length) return { entries, changed: false };

  const next = [...entries];
  let changed = false;

  // Pre-build lookups rebuilt once per base (negligible cost vs O(n) per occurrence)
  function buildSeriesSet(baseId: string, seriesId: string): Set<string> {
    const s = new Set<string>();
    for (const e of next) {
      if (e.id === baseId) continue;
      if (e.fixedOriginId === baseId || (e.serieId && e.serieId === seriesId)) {
        s.add(e.dataPrevista || e.data);
      }
    }
    return s;
  }

  // adopt map: two keys per candidate to handle the motoId-OR-placa match condition
  // key format: `tipo|normCat|valor|clienteId|moto:<motoId>|date`
  //         or: `tipo|normCat|valor|clienteId|placa:<placa>|date`
  function buildAdoptMap(baseId: string): Map<string, number> {
    const m = new Map<string, number>();
    for (let i = 0; i < next.length; i++) {
      const e = next[i];
      if (e.id === baseId || e.fixedOriginId || e.serieId) continue;
      const normCat = catNorm(e.categoria, e.tipo);
      const date = e.dataPrevista || e.data;
      const clientKey = e.clienteId ?? "";
      const prefix = `${e.tipo}|${normCat}|${e.valor}|${clientKey}`;
      m.set(`${prefix}|moto:${e.motoId ?? ""}|${date}`, i);
      if ((e.placa || "") !== "") {
        m.set(`${prefix}|placa:${e.placa}|${date}`, i);
      }
    }
    return m;
  }

  for (const base of bases) {
    const seedDate = base.dataPrevista || base.data;
    const seriesId = base.serieId || base.id;
    const total = base.despesaFixa ? 24 : Math.max(base.recorrenciaVezes || 0, 0);
    const interval = Math.max(1, base.recorrenciaPorPeriodo || 1);
    const dates = generateRecurrenceDates(seedDate, (base.recorrenciaTipo || "mensal"), total, interval);

    let seriesDates = buildSeriesSet(base.id, seriesId);
    let adoptMap = buildAdoptMap(base.id);

    const baseNormCat = catNorm(base.categoria, base.tipo);
    const baseClientKey = base.clienteId ?? "";
    const basePrefix = `${base.tipo}|${baseNormCat}|${base.valor}|${baseClientKey}`;

    for (const occ of dates) {
      if (seriesDates.has(occ)) continue;

      const keyByMoto = `${basePrefix}|moto:${base.motoId ?? ""}|${occ}`;
      const keyByPlaca = (base.placa || "") !== "" ? `${basePrefix}|placa:${base.placa}|${occ}` : null;
      const adoptIdx = adoptMap.get(keyByMoto) ?? (keyByPlaca ? adoptMap.get(keyByPlaca) : undefined) ?? -1;

      if (adoptIdx >= 0) {
        next[adoptIdx] = { ...next[adoptIdx], serieId: seriesId, fixedOriginId: base.id };
        adoptMap.delete(keyByMoto);
        if (keyByPlaca) adoptMap.delete(keyByPlaca);
        seriesDates.add(occ);
        changed = true;
      } else {
        next.push({
          ...base,
          id: newId(),
          serieId: seriesId,
          fixedOriginId: base.id,
          data: occ,
          dataPrevista: occ,
          pago: false,
        });
        seriesDates.add(occ);
        changed = true;
      }
    }
  }

  return { entries: next, changed };
}