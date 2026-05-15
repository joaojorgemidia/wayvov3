import { describe, it, expect } from "vitest";
import { generateRecurrenceDates, materializeRecurrences } from "./recurrence";

describe("generateRecurrenceDates", () => {
  it("a cada 1 mês durante 24 ocorrências, mantendo o dia 15", () => {
    const dates = generateRecurrenceDates("2026-01-15", "mensal", 24, 1);
    expect(dates).toHaveLength(24);
    expect(dates[0]).toBe("2026-02-15");
    expect(dates[11]).toBe("2027-01-15");
    expect(dates[23]).toBe("2028-01-15");
    // Todas no dia 15
    expect(dates.every((d) => d.endsWith("-15"))).toBe(true);
  });

  it("a cada 1 semana mantém o mesmo dia da semana", () => {
    // 2026-01-01 = quinta-feira
    const dates = generateRecurrenceDates("2026-01-01", "semanal", 4, 1);
    expect(dates).toEqual(["2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29"]);
    dates.forEach((d) => {
      expect(new Date(d + "T00:00:00").getDay()).toBe(4); // quinta
    });
  });

  it("a cada 3 dias durante 5 ocorrências", () => {
    const dates = generateRecurrenceDates("2026-01-01", "diario", 5, 3);
    expect(dates).toEqual([
      "2026-01-04", "2026-01-07", "2026-01-10", "2026-01-13", "2026-01-16",
    ]);
  });

  it("a cada 2 semanas durante 3 ocorrências", () => {
    const dates = generateRecurrenceDates("2026-01-01", "semanal", 3, 2);
    expect(dates).toEqual(["2026-01-15", "2026-01-29", "2026-02-12"]);
  });

  it("a cada 2 meses, mantendo o dia", () => {
    const dates = generateRecurrenceDates("2026-01-10", "mensal", 3, 2);
    expect(dates).toEqual(["2026-03-10", "2026-05-10", "2026-07-10"]);
  });

  it("dia 31: meses curtos caem no último dia (comportamento date-fns)", () => {
    const dates = generateRecurrenceDates("2026-01-31", "mensal", 3, 1);
    expect(dates[0]).toBe("2026-02-28"); // fev não tem 31
    expect(dates[1]).toBe("2026-03-31");
    expect(dates[2]).toBe("2026-04-30");
  });

  it("anual a cada 1 ano durante 5 anos", () => {
    const dates = generateRecurrenceDates("2026-06-10", "anual", 5, 1);
    expect(dates).toEqual([
      "2027-06-10", "2028-06-10", "2029-06-10", "2030-06-10", "2031-06-10",
    ]);
  });

  it("retorna vazio quando totalOccurrences = 0", () => {
    expect(generateRecurrenceDates("2026-01-01", "mensal", 0, 1)).toEqual([]);
  });

  it("trata interval inválido (0) como 1", () => {
    const a = generateRecurrenceDates("2026-01-01", "mensal", 2, 0);
    const b = generateRecurrenceDates("2026-01-01", "mensal", 2, 1);
    expect(a).toEqual(b);
  });
});

describe("materializeRecurrences (anti-duplicação)", () => {
  const baseRecur = {
    id: "base1", tipo: "receita" as const, categoria: "aluguel", valor: 100,
    data: "2026-01-06", dataPrevista: "2026-01-06",
    motoId: "m1", clienteId: "c1", placa: "ABC1D23",
    recorrente: true, recorrenciaTipo: "semanal" as const,
    recorrenciaVezes: 3, recorrenciaPorPeriodo: 1, pago: false,
  };

  it("não duplica quando já existe lançamento compatível (descrição/conta diferentes)", () => {
    const preExisting = {
      id: "pre1", tipo: "receita" as const, categoria: "aluguel", valor: 100,
      data: "2026-01-13", dataPrevista: "2026-01-13",
      motoId: "m1", clienteId: "c1", placa: "ABC1D23",
      descricao: "Aluguel 1ª cobrança - ABC1D23 - João",
      conta: "Banco X", pago: false,
    };
    const { entries, changed } = materializeRecurrences([baseRecur as any, preExisting as any]);
    expect(changed).toBe(true);
    // total: base + adotado(pre1) + 2 novas (20, 27)
    expect(entries.length).toBe(4);
    const adopted = entries.find(e => e.id === "pre1")!;
    expect(adopted.serieId).toBe("base1");
    expect(adopted.fixedOriginId).toBe("base1");
    // não deve haver dois itens em 13/01
    const on13 = entries.filter(e => (e.dataPrevista || e.data) === "2026-01-13");
    expect(on13.length).toBe(1);
  });

  it("é idempotente: rodar 2x não duplica", () => {
    const r1 = materializeRecurrences([baseRecur as any]);
    const r2 = materializeRecurrences(r1.entries);
    expect(r2.changed).toBe(false);
    expect(r2.entries.length).toBe(r1.entries.length);
    expect(r1.entries.length).toBe(1 + 3); // base + 3
  });

  it("não materializa séries de despesa fora dos critérios (clienteId diferente cria nova)", () => {
    const pre = {
      id: "pre2", tipo: "receita" as const, categoria: "aluguel", valor: 100,
      data: "2026-01-13", dataPrevista: "2026-01-13",
      motoId: "m1", clienteId: "c2", placa: "ABC1D23", pago: false,
    };
    const { entries } = materializeRecurrences([baseRecur as any, pre as any]);
    const on13 = entries.filter(e => (e.dataPrevista || e.data) === "2026-01-13");
    expect(on13.length).toBe(2); // pre2 (cliente diferente) + nova da série
  });
});