import { describe, expect, it } from "vitest";

import { FinancialEntry } from "@/lib/types";
import { auditCompraMotoEntry, shouldLockManualClassification } from "@/lib/financial-entry-audit";

function makeEntry(overrides: Partial<FinancialEntry> = {}): FinancialEntry {
  return {
    id: "1",
    tipo: "despesa",
    categoria: "compra_moto",
    subcategoria: "",
    descricao: "Compra de moto",
    valor: 100,
    data: "2026-03-16",
    motoId: null,
    rentalId: null,
    clienteId: null,
    pago: true,
    tags: [],
    conta: "",
    natureza: "operacional",
    ...overrides,
  };
}

describe("financial-entry-audit", () => {
  it("corrige taxa de detran sem forçar financiamento", () => {
    const audited = auditCompraMotoEntry(makeEntry({
      descricao: "Compra de moto",
      observacao: "Tx. Transferência Detran",
      tags: ["Parcela"],
      subcategoria: "Financiamento",
      placa: "PRH4961",
    }));

    expect(audited.subcategoria).toBe("");
    expect(audited.tags).toEqual(["Detran"]);
  });

  it("preserva correção manual do usuário", () => {
    const audited = auditCompraMotoEntry(makeEntry({
      subcategoria: "",
      tags: ["Detran"],
      classificacaoManual: true,
      observacao: "Tx. Transferência Detran",
    }));

    expect(audited.subcategoria).toBe("");
    expect(audited.tags).toEqual(["Detran"]);
  });

  it("detecta quando a classificação foi alterada manualmente", () => {
    const previous = makeEntry({ subcategoria: "Financiamento", tags: ["Parcela"] });
    const current = makeEntry({ subcategoria: "", tags: ["Detran"] });

    expect(shouldLockManualClassification(current, previous)).toBe(true);
  });
});