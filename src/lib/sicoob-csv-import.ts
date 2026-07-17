import { normalizeText } from "./text-normalize";

export interface ParsedStatementRow {
  data: string; // YYYY-MM-DD
  tipo: "credito" | "debito";
  valor: number;
  descricao: string;
  descricaoNormalizada: string;
  sicoobTransactionId: string; // chave sintética estável p/ idempotência (sem depender da API)
}

const HEADER_ALIASES = {
  data: ["data", "data lancamento", "data movimento", "dt lancamento"],
  descricao: ["historico", "descricao", "descricao lancamento", "lancamento", "detalhes"],
  valor: ["valor", "valor lancamento", "valor (r$)", "valor r$"],
  tipo: ["tipo", "d/c", "natureza", "cd"],
};

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(headerLine: string): string {
  return (headerLine.match(/;/g)?.length || 0) > (headerLine.match(/,/g)?.length || 0) ? ";" : ",";
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map((h) => normalizeText(h).replace(/["']/g, ""));
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(raw: string): string | null {
  const value = raw.trim().replace(/"/g, "");
  // dd/mm/yyyy ou dd-mm-yyyy
  const br = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  // yyyy-mm-dd (já ISO)
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  return null;
}

function parseValor(raw: string): number | null {
  const cleaned = raw.trim().replace(/"/g, "").replace(/[R$\s]/g, "");
  if (!cleaned) return null;
  // formato brasileiro: 1.234,56 -> 1234.56
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parser tolerante para o CSV exportado do internet banking Sicoob. Como o
 * formato exato de colunas pode variar entre exportações, tenta reconhecer
 * cabeçalhos comuns em português; se não houver coluna de tipo (C/D), infere
 * o sinal pelo valor (negativo = débito, positivo = crédito).
 */
export function parseSicoobCsv(csvText: string): { rows: ParsedStatementRow[]; skipped: number } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0 };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);

  const idxData = findColumnIndex(headers, HEADER_ALIASES.data);
  const idxDescricao = findColumnIndex(headers, HEADER_ALIASES.descricao);
  const idxValor = findColumnIndex(headers, HEADER_ALIASES.valor);
  const idxTipo = findColumnIndex(headers, HEADER_ALIASES.tipo);

  if (idxData === -1 || idxDescricao === -1 || idxValor === -1) {
    throw new Error(
      "Não foi possível reconhecer as colunas do CSV (esperado: data, histórico/descrição, valor). Verifique o arquivo exportado do internet banking Sicoob.",
    );
  }

  const rows: ParsedStatementRow[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const dataRaw = cells[idxData] || "";
    const descricaoRaw = cells[idxDescricao] || "";
    const valorRaw = cells[idxValor] || "";

    const data = parseDate(dataRaw);
    const valorBruto = parseValor(valorRaw);
    if (!data || valorBruto === null || !descricaoRaw.trim()) {
      skipped++;
      continue;
    }

    let tipo: "credito" | "debito";
    if (idxTipo !== -1) {
      const tipoRaw = normalizeText(cells[idxTipo] || "");
      tipo = tipoRaw.startsWith("d") ? "debito" : "credito";
    } else {
      tipo = valorBruto < 0 ? "debito" : "credito";
    }

    const valor = Math.round(Math.abs(valorBruto) * 100) / 100;
    const descricao = descricaoRaw.trim();
    const descricaoNormalizada = normalizeText(descricao);

    // Chave sintética estável (mesmo arquivo re-importado não duplica, graças ao
    // UNIQUE(company_id, sicoob_transaction_id) na tabela de staging).
    const sicoobTransactionId = `csv:${data}:${tipo}:${valor.toFixed(2)}:${descricaoNormalizada}`;

    rows.push({ data, tipo, valor, descricao, descricaoNormalizada, sicoobTransactionId });
  }

  return { rows, skipped };
}
