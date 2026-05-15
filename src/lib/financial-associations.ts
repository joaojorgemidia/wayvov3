/**
 * Centralized financial association resolver.
 * Single source of truth for linking transactions to motos, clients, and rentals.
 */
import { FinancialEntry, Motorcycle, Client, Rental } from "./types";

/** Normalize plate to uppercase, no spaces/dashes */
export function normalizePlaca(p: string): string {
  return (p || "").toUpperCase().replace(/[\s\-]/g, "");
}

/** Normalize name for comparison */
function normalizeName(n: string): string {
  return (n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Extract plate from description like "Aluguel — TFY4G05 (João)" */
function extractPlacaFromDesc(desc: string): string | null {
  // Pattern: letters+digits in plate format after "—" or "-"
  const m = desc.match(/[—\-]\s*([A-Z]{3}\d[A-Z0-9]\d{2})/i);
  return m ? m[1].toUpperCase() : null;
}

/** Extract client name from description like "Aluguel — TFY4G05 (João Nilson Da Silva)" */
function extractClientFromDesc(desc: string): string | null {
  const m = desc.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : null;
}

// Categories that are always operacional
const ALWAYS_OPERACIONAL = new Set([
  "aluguel", "caucao", "manutencao_receita", "manutencao_despesa", "multa_transito_receita",
  "multa_transito", "juros_atraso", "venda_moto", "compra_moto", "lava_jato",
  "seguro", "rastreador", "pecas_receita",
]);

export interface AssociationContext {
  motos: Motorcycle[];
  clients: Client[];
  rentals: Rental[];
  // Optional pre-built indexes (populated by resolveAllAssociations for bulk use)
  motoByPlaca?: Map<string, Motorcycle>;
  motoById?: Map<string, Motorcycle>;
  clientByNorm?: Map<string, Client>;
  clientById?: Map<string, Client>;
}

/**
 * Resolve all associations for a single entry.
 * Prioritizes explicit placa/clienteNome fields, then extracts from description.
 * Returns a new entry with resolved motoId, clienteId, placa, clienteNome, natureza.
 */
export function resolveAssociations(
  entry: FinancialEntry,
  ctx: AssociationContext,
  /** Optional source data from import (placa, cliente fields) */
  source?: { placa?: string; cliente?: string; conta?: string }
): FinancialEntry {
  const updated = { ...entry };

  // 1. Determine plate: source > entry.placa > extract from description
  // If motoId is explicitly null and placa is empty, user cleared it — don't re-extract
  const userClearedMoto = entry.motoId === null && !entry.placa;
  let placa = normalizePlaca(source?.placa || entry.placa || "");
  if (!placa && !userClearedMoto) {
    const extracted = extractPlacaFromDesc(entry.descricao);
    if (extracted) placa = normalizePlaca(extracted);
  }

  // 2. Determine client name: source > entry.clienteNome > extract from description
  // If clienteId is explicitly null and clienteNome is empty, user cleared it — don't re-extract
  const userClearedClient = entry.clienteId === null && !entry.clienteNome;
  let clienteNome = source?.cliente || entry.clienteNome || "";
  if (!clienteNome && !userClearedClient) {
    const extracted = extractClientFromDesc(entry.descricao);
    if (extracted) clienteNome = extracted;
  }

  // 3. Resolve motoId from plate
  if (placa) {
    updated.placa = placa;
    const moto = ctx.motoByPlaca ? ctx.motoByPlaca.get(placa) : ctx.motos.find(m => normalizePlaca(m.placa) === placa);
    if (moto) updated.motoId = moto.id;
  } else if (updated.motoId) {
    const moto = ctx.motoById ? ctx.motoById.get(updated.motoId) : ctx.motos.find(m => m.id === updated.motoId);
    if (moto) updated.placa = normalizePlaca(moto.placa);
  }

  // 4. Resolve clienteId from name
  if (clienteNome) {
    updated.clienteNome = clienteNome;
    const normalizedTarget = normalizeName(clienteNome);
    const client = ctx.clientByNorm ? ctx.clientByNorm.get(normalizedTarget) : ctx.clients.find(c => normalizeName(c.nome) === normalizedTarget);
    if (client) updated.clienteId = client.id;
  } else if (updated.clienteId) {
    const client = ctx.clientById ? ctx.clientById.get(updated.clienteId) : ctx.clients.find(c => c.id === updated.clienteId);
    if (client) updated.clienteNome = client.nome;
  }

  // 5. Resolve rentalId and backfill missing links
  if (updated.motoId || updated.clienteId) {
    const bestRental = findBestRental(updated, ctx.rentals);
    if (bestRental) {
      updated.rentalId = bestRental.id;
      if (!updated.motoId && !userClearedMoto) updated.motoId = bestRental.motoId;
      if (!updated.clienteId && !userClearedClient) updated.clienteId = bestRental.clienteId;
    }
  }

  if (!updated.placa && updated.motoId && !userClearedMoto) {
    const moto = ctx.motoById ? ctx.motoById.get(updated.motoId) : ctx.motos.find(m => m.id === updated.motoId);
    if (moto) updated.placa = normalizePlaca(moto.placa);
  }

  if (!updated.clienteNome && updated.clienteId && !userClearedClient) {
    const client = ctx.clientById ? ctx.clientById.get(updated.clienteId) : ctx.clients.find(c => c.id === updated.clienteId);
    if (client) updated.clienteNome = client.nome;
  }

  // 6. Natureza: operacional if has plate or category is always operacional
  // Preserve explicit "investimento" or "administrativa" choices made by the user.
  if (updated.natureza !== "investimento" && updated.natureza !== "administrativa") {
    if (updated.placa || ALWAYS_OPERACIONAL.has(updated.categoria)) {
      updated.natureza = "operacional";
    }
  }

  // 7. Conta from source
  if (source?.conta && !updated.conta) {
    updated.conta = source.conta;
  }

  return updated;
}

/**
 * Find best matching rental for a transaction.
 * Score-based: motoId match + clienteId match + date within range.
 */
function findBestRental(entry: FinancialEntry, rentals: Rental[]): Rental | null {
  if (!rentals.length) return null;

  let best: Rental | null = null;
  let bestScore = 0;

  for (const r of rentals) {
    let score = 0;
    if (entry.motoId && r.motoId === entry.motoId) score += 3;
    if (entry.clienteId && r.clienteId === entry.clienteId) score += 2;
    // Date within rental period
    const entryDate = entry.data;
    if (entryDate >= r.dataInicio) {
      if (!r.dataFim || entryDate <= r.dataFim) score += 1;
      if (r.dataFimContrato && entryDate <= r.dataFimContrato) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  return bestScore >= 3 ? best : null; // Require at least moto match
}

/**
 * Bulk resolve all entries against source import data.
 * Used for the definitive patch that fixes all associations.
 */
export function resolveAllAssociations(
  entries: FinancialEntry[],
  ctx: AssociationContext,
  importData?: any[]
): FinancialEntry[] {
  // Pre-build indexes so resolveAssociations O(1) lookups instead of O(n) .find()
  const motoByPlaca = new Map<string, (typeof ctx.motos)[0]>();
  for (const m of ctx.motos) motoByPlaca.set(normalizePlaca(m.placa), m);
  const motoById = new Map<string, (typeof ctx.motos)[0]>();
  for (const m of ctx.motos) motoById.set(m.id, m);
  const clientByNorm = new Map<string, (typeof ctx.clients)[0]>();
  for (const c of ctx.clients) clientByNorm.set(normalizeName(c.nome), c);
  const clientById = new Map<string, (typeof ctx.clients)[0]>();
  for (const c of ctx.clients) clientById.set(c.id, c);
  const ctxIndexed = { ...ctx, motoByPlaca, motoById, clientByNorm, clientById };

  return entries.map(entry => {
    // Find matching source entry from import data
    let source: { placa?: string; cliente?: string; conta?: string } | undefined;
    if (importData && entry.id.startsWith("imp_")) {
      const src = importData.find((s: any) =>
        (s.valor === entry.valor && s.data === entry.data && s.descricao === entry.descricao) ||
        (s.valor === entry.valor && s.data === entry.data &&
          (s.categoria === entry.categoria || s.categoria?.toLowerCase().replace(/\s+/g, "_") === entry.categoria))
      );
      if (src) {
        source = { placa: src.placa, cliente: src.cliente, conta: src.conta };
      }
    }
    return resolveAssociations(entry, ctxIndexed as any, source);
  });
}
