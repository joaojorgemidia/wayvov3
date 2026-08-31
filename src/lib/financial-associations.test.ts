import { describe, expect, it } from "vitest";

import { FinancialEntry, Rental } from "@/lib/types";
import { resolveAssociations } from "@/lib/financial-associations";

const MOTO = { id: "moto-1", placa: "ABC1D23" } as any;
const THIAGO = { id: "cli-thiago", nome: "Thiago Joel" } as any;
const CTX = (rentals: Rental[]) => ({ motos: [MOTO], clients: [THIAGO], rentals });

function rental(over: Partial<Rental> = {}): Rental {
  return {
    id: "r1", motoId: MOTO.id, clienteId: THIAGO.id,
    dataInicio: "2025-10-01", dataFim: "2025-10-31", dataFimContrato: "2025-10-31",
    status: "finalizada",
    ...over,
  } as Rental;
}

function multaDespesa(over: Partial<FinancialEntry> = {}): FinancialEntry {
  return {
    id: "e1", tipo: "despesa", categoria: "multa_transito", subcategoria: "Locadora",
    descricao: "Multa — ABC1D23 | Cometimento: 11/10/2025 | Auto: X",
    valor: 300, data: "2026-08-31", // data do PAGAMENTO (meses depois)
    motoId: MOTO.id, rentalId: null, clienteId: null,
    pago: true, tags: ["multa"], conta: "", natureza: "operacional",
    ...over,
  };
}

describe("resolveAssociations — multa", () => {
  it("vincula o locatário cujo contrato cobre a data do cometimento", () => {
    const out = resolveAssociations(multaDespesa(), CTX([rental()]));
    expect(out.clienteId).toBe(THIAGO.id);
    expect(out.rentalId).toBe("r1");
  });

  it("não vincula ninguém quando nenhum contrato cobre o cometimento (multa da locadora)", () => {
    // contrato do Thiago começa depois do cometimento
    const out = resolveAssociations(
      multaDespesa(),
      CTX([rental({ dataInicio: "2026-03-30", dataFim: null, dataFimContrato: null })]),
    );
    expect(out.clienteId).toBeNull();
    expect(out.rentalId).toBeNull();
  });

  it("ignora locação histórica sem locatário mesmo cobrindo a data", () => {
    const out = resolveAssociations(
      multaDespesa(),
      CTX([rental({ id: "hist", clienteId: null })]),
    );
    expect(out.clienteId).toBeNull();
    expect(out.rentalId).toBeNull();
  });

  it("não usa a data do pagamento para escolher o contrato", () => {
    const historico = rental({ id: "out", dataInicio: "2025-10-01", dataFim: "2025-10-31" });
    const atual = rental({ id: "ago", dataInicio: "2026-08-01", dataFim: null, dataFimContrato: null });
    const out = resolveAssociations(multaDespesa(), CTX([atual, historico]));
    expect(out.rentalId).toBe("out"); // o de outubro, não o vigente na data de pagamento
  });

  it("não mexe no vínculo legado quando não há contrato com locatário cobrindo o cometimento", () => {
    // não cria vínculo novo, mas também não apaga o que já estava lá (correção é caso a caso)
    const out = resolveAssociations(
      multaDespesa({ rentalId: "hist", descricao: "Multa — ABC1D23 | Cometimento: 11/10/2025" }),
      CTX([rental({ id: "hist", clienteId: null })]),
    );
    expect(out.clienteId).toBeNull();
    expect(out.rentalId).toBe("hist");
  });
});
