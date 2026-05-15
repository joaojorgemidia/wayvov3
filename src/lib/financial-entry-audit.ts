import { FinancialEntry, Motorcycle } from "./types";

function normalizeAuditText(value?: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeAuditPlaca(value?: string) {
  return (value || "").toUpperCase().replace(/[\s-]/g, "");
}

function sameStringArray(a?: string[], b?: string[]) {
  const left = a || [];
  const right = b || [];
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function shouldLockManualClassification(current: FinancialEntry, previous?: FinancialEntry | null) {
  if (!previous) return true;

  return current.tipo !== previous.tipo ||
    current.categoria !== previous.categoria ||
    (current.subcategoria || "") !== (previous.subcategoria || "") ||
    !sameStringArray(current.tags, previous.tags);
}

export function auditCompraMotoEntry(
  entry: FinancialEntry,
  motos: Motorcycle[] = [],
  normalizedCategory = entry.categoria,
): FinancialEntry {
  if (entry.tipo !== "despesa" || normalizedCategory !== "compra_moto") return entry;

  if (entry.classificacaoManual) {
    return entry.categoria === "compra_moto"
      ? entry
      : { ...entry, categoria: "compra_moto" };
  }

  const fallbackPlaca =
    entry.placa ||
    motos.find((m) => m.id === entry.motoId)?.placa ||
    entry.descricao.match(/[A-Z]{3}\d[A-Z0-9]\d{2}/i)?.[0] ||
    "";

  const placa = normalizeAuditPlaca(fallbackPlaca);
  const isNvp = placa.includes("NVP");
  const auditText = normalizeAuditText([
    entry.descricao,
    entry.observacao,
    entry.subcategoria,
    ...(entry.tags || []),
  ].filter(Boolean).join(" "));

  const hasDetran = auditText.includes("detran") || auditText.includes("transfer");
  const hasCartorio = auditText.includes("cartorio");
  const hasVistoria = auditText.includes("vistoria");

  const nextSubcategoria = hasDetran || hasCartorio || hasVistoria
    ? ""
    : (isNvp ? "Parcelamento" : "Financiamento");

  const nextTags = hasDetran
    ? ["Detran"]
    : hasCartorio
      ? ["Cartório"]
      : hasVistoria
        ? ["Vistoria"]
        : [isNvp ? "Entrada" : "Parcela"];

  if (
    entry.categoria === "compra_moto" &&
    (entry.subcategoria || "") === nextSubcategoria &&
    sameStringArray(entry.tags, nextTags)
  ) {
    return entry;
  }

  return {
    ...entry,
    categoria: "compra_moto",
    subcategoria: nextSubcategoria,
    tags: nextTags,
  };
}