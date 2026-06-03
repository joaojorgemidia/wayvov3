import * as XLSX from "xlsx";
import { Motorcycle, Rental, FinancialEntry, Client } from "./types";

// ──────────────────────────────────────────────────────────────────
// Schema definitions per entity
// ──────────────────────────────────────────────────────────────────

export type EntityKind = "financeiro" | "motos" | "locacoes";

// ──────────────────────────────────────────────────────────────────
// Category/subcategory normalization for imported financial rows
// Maps human labels (and common variants) to internal slugs used by
// the Financeiro filters & form selects.
// ──────────────────────────────────────────────────────────────────

function normKey(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CATEGORIA_RECEITA_MAP: Record<string, string> = {
  "aluguel": "aluguel",
  "caucao": "caucao",
  "manutencao": "manutencao_receita",
  "multa de transito": "multa_transito_receita",
  "multa transito": "multa_transito_receita",
  "venda de moto": "venda_moto",
  "venda moto": "venda_moto",
  "pecas": "pecas_receita",
  "juros por atraso": "juros_atraso",
  "juros atraso": "juros_atraso",
  "ajuste de saldo": "ajuste_saldo",
  "outros": "outro_receita",
  "outro": "outro_receita",
};

const CATEGORIA_DESPESA_MAP: Record<string, string> = {
  "compra de moto": "compra_moto",
  "compra moto": "compra_moto",
  "manutencao": "manutencao_despesa",
  "pecas e manutencao": "manutencao_despesa",
  "pecas": "manutencao_despesa",
  "seguro": "seguro",
  "rastreador": "rastreador",
  "multa de transito": "multa_transito",
  "multas de transito": "multa_transito",
  "imposto": "imposto",
  "sistema": "sistema",
  "equipe": "equipe",
  "marketing": "marketing",
  "lava jato": "lava_jato",
  "taxas": "taxas",
  "assinaturas": "assinaturas",
  "ajuste de saldo": "ajuste_saldo",
  "outros": "outro_despesa",
  "outro": "outro_despesa",
};

const VALID_SLUGS = new Set<string>([
  ...Object.values(CATEGORIA_RECEITA_MAP),
  ...Object.values(CATEGORIA_DESPESA_MAP),
]);

function normalizeImportedCategoria(raw: string, tipo: "receita" | "despesa"): string {
  if (!raw) return "";
  const k = normKey(raw);
  // If the spreadsheet already uses the slug, accept it directly
  const asSlug = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (VALID_SLUGS.has(asSlug)) return asSlug;
  const map = tipo === "despesa" ? CATEGORIA_DESPESA_MAP : CATEGORIA_RECEITA_MAP;
  if (map[k]) return map[k];
  // fallback: also try the other side, then return raw lowercased slug
  const other = tipo === "despesa" ? CATEGORIA_RECEITA_MAP : CATEGORIA_DESPESA_MAP;
  if (other[k]) return other[k];
  return asSlug;
}

// Subcategorias são salvas em Title Case nos selects (ex: "Financiamento", "Peças/Serviços").
function normalizeImportedSubcategoria(raw: string, _categoria: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Title-case each word, preserving "/" and "-"
  return trimmed
    .split(/(\s+|\/|-)/)
    .map(part => {
      if (/^\s+$/.test(part) || part === "/" || part === "-") return part;
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

interface FieldDef {
  key: string;
  label: string;
  example: string | number;
  required?: boolean;
  hint?: string;
}

export const SCHEMAS: Record<EntityKind, { fields: FieldDef[]; sheetName: string; fileName: string }> = {
  financeiro: {
    sheetName: "Lancamentos",
    fileName: "modelo-financeiro",
    fields: [
      { key: "tipo", label: "Tipo", example: "receita", required: true, hint: "receita ou despesa" },
      { key: "categoria", label: "Categoria", example: "aluguel", required: true },
      { key: "subcategoria", label: "Subcategoria", example: "" },
      { key: "descricao", label: "Descrição", example: "Aluguel semanal Honda CG 160", required: true },
      { key: "valor", label: "Valor (R$)", example: 350, required: true, hint: "Use ponto como separador decimal" },
      { key: "data", label: "Data", example: "2025-09-15", required: true, hint: "Formato YYYY-MM-DD ou DD/MM/AAAA" },
      { key: "pago", label: "Pago", example: "sim", hint: "sim ou não" },
      { key: "placa", label: "Placa", example: "ABC1D23" },
      { key: "clienteNome", label: "Cliente", example: "João da Silva" },
      { key: "conta", label: "Conta", example: "Caixa" },
      { key: "natureza", label: "Natureza", example: "operacional", hint: "operacional ou administrativa" },
      { key: "observacao", label: "Observação", example: "" },
    ],
  },
  motos: {
    sheetName: "Motos",
    fileName: "modelo-motos",
    fields: [
      { key: "placa", label: "Placa", example: "ABC1D23", required: true },
      { key: "modelo", label: "Modelo", example: "Honda CG 160 Fan", required: true },
      { key: "anoFabricacao", label: "Ano Fabricação", example: 2022 },
      { key: "anoModelo", label: "Ano Modelo", example: 2023 },
      { key: "cor", label: "Cor", example: "Vermelha" },
      { key: "chassi", label: "Chassi", example: "9C2KC1670NR000001" },
      { key: "renavam", label: "Renavam", example: "01234567890" },
      { key: "numMotor", label: "Nº Motor", example: "KC16E0000001" },
      { key: "tipo", label: "Tipo", example: "propria", hint: "propria ou terceiro" },
      { key: "proprietario", label: "Proprietário", example: "" },
      { key: "aplicativo", label: "Aplicativo", example: "Uber" },
      { key: "status", label: "Status", example: "disponivel", hint: "disponivel, alugada, manutencao, inativa, vendida" },
      { key: "kmAtual", label: "KM Atual", example: 12500 },
      { key: "kmCompra", label: "KM Compra", example: 0 },
      { key: "valorCompra", label: "Valor Compra (R$)", example: 14500 },
      { key: "dataCompra", label: "Data Compra", example: "2024-03-10" },
    ],
  },
  locacoes: {
    sheetName: "Locacoes",
    fileName: "modelo-locacoes",
    fields: [
      { key: "placa", label: "Placa", example: "ABC1D23", required: true, hint: "Placa da moto já cadastrada" },
      { key: "nomeCliente", label: "Nome", example: "João da Silva", required: true, hint: "Nome do locatário" },
      { key: "telefoneCliente", label: "Telefone", example: "(11) 91234-5678", required: true },
    ],
  },
};

// ──────────────────────────────────────────────────────────────────
// Template generation (download)
// ──────────────────────────────────────────────────────────────────

function buildTemplateRows(kind: EntityKind): Array<Record<string, any>> {
  const { fields } = SCHEMAS[kind];
  const exampleRow: Record<string, any> = {};
  const hintRow: Record<string, any> = {};
  fields.forEach(f => {
    exampleRow[f.label] = f.example;
    hintRow[f.label] = f.hint ? `(${f.hint})` : (f.required ? "(obrigatório)" : "");
  });
  return [hintRow, exampleRow];
}

export function downloadTemplate(kind: EntityKind, format: "csv" | "xlsx") {
  const rows = buildTemplateRows(kind);
  const ws = XLSX.utils.json_to_sheet(rows);
  const { sheetName, fileName } = SCHEMAS[kind];
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    triggerDownload(csv, `${fileName}.csv`, "text/csv;charset=utf-8;");
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    triggerDownload(new Blob([buf]), `${fileName}.xlsx`, "application/octet-stream");
  }
}

// ──────────────────────────────────────────────────────────────────
// Data export (existing records)
// ──────────────────────────────────────────────────────────────────

function entityToRows(kind: EntityKind, items: any[], lookups?: { motos?: Motorcycle[]; clients?: Client[] }): Array<Record<string, any>> {
  const motoMap = new Map((lookups?.motos || []).map(m => [m.id, m]));
  const clientMap = new Map((lookups?.clients || []).map(c => [c.id, c]));
  return items.map(item => {
    const row: Record<string, any> = {};
    SCHEMAS[kind].fields.forEach(f => {
      let v: any = item[f.key];
      if (kind === "financeiro") {
        if (f.key === "placa") v = item.placa || motoMap.get(item.motoId)?.placa || "";
        if (f.key === "clienteNome") v = item.clienteNome || clientMap.get(item.clienteId)?.nome || "";
        if (f.key === "pago") v = item.pago ? "sim" : "não";
      }
      if (kind === "locacoes") {
        if (f.key === "placa") v = motoMap.get(item.motoId)?.placa || "";
        if (f.key === "nomeCliente") v = clientMap.get(item.clienteId)?.nome || "";
        if (f.key === "telefoneCliente") v = clientMap.get(item.clienteId)?.telefone || "";
      }
      row[f.label] = v ?? "";
    });
    return row;
  });
}

export function downloadExport(
  kind: EntityKind,
  items: any[],
  format: "csv" | "xlsx",
  lookups?: { motos?: Motorcycle[]; clients?: Client[] },
) {
  const rows = entityToRows(kind, items, lookups);
  const ws = XLSX.utils.json_to_sheet(rows);
  const { sheetName, fileName } = SCHEMAS[kind];
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    triggerDownload(csv, `${fileName}-${stamp}.csv`, "text/csv;charset=utf-8;");
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    triggerDownload(new Blob([buf]), `${fileName}-${stamp}.xlsx`, "application/octet-stream");
  }
}

function triggerDownload(content: string | Blob, filename: string, mime: string) {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ──────────────────────────────────────────────────────────────────
// File parsing (upload)
// ──────────────────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<Array<Record<string, any>>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
  // Drop the hint row generated by our template (where required cells contain "(obrigatório)" etc.)
  return rows.filter(r => {
    const vals = Object.values(r).join("").toLowerCase();
    if (!vals.trim()) return false;
    if (vals.includes("(obrigatório)") || vals.includes("(opcional)")) return false;
    return true;
  });
}

// ──────────────────────────────────────────────────────────────────
// Row → Entity mapping & conflict detection
// ──────────────────────────────────────────────────────────────────

function getCell(row: Record<string, any>, label: string): string {
  // Lenient lookup: case-insensitive, trim, ignore accents in header matching
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const target = norm(label);
  for (const k of Object.keys(row)) {
    if (norm(k) === target) return String(row[k] ?? "").trim();
  }
  return "";
}

function normalizeText(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildFinancialFingerprint(entry: {
  data?: string | null;
  valor?: number | null;
  descricao?: string | null;
  tipo?: string | null;
  conta?: string | null;
  placa?: string | null;
  clienteNome?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  natureza?: string | null;
}) {
  return [
    entry.data || "",
    Number(entry.valor || 0).toFixed(2),
    normalizeText(entry.descricao || ""),
    normalizeText(entry.tipo || ""),
    normalizeText(entry.conta || ""),
    normalizeText(entry.placa || ""),
    normalizeText(entry.clienteNome || ""),
    normalizeText(entry.categoria || ""),
    normalizeText(entry.subcategoria || ""),
    normalizeText(entry.natureza || ""),
  ].join("|");
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const t = s.trim();

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const rawYear = Number(dmy[3]);
    const year = dmy[3].length === 2 ? 2000 + rawYear : rawYear;
    if (!isValidDateParts(year, month, day)) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function parseNumber(s: string): number {
  if (!s) return 0;
  // Strip currency symbols and spaces
  let str = String(s).replace(/[R$\s]/g, "").trim();
  if (!str) return 0;
  // Keep sign
  const negative = str.startsWith("-") || /^\(.*\)$/.test(str);
  str = str.replace(/^[-(]+|\)+$/g, "");

  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // Both present → the LAST one is the decimal separator (handles 1.234,56 and 1,234.56)
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      normalized = str.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = str.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only comma → Brazilian decimal (337,90) OR thousands (1,234). If exactly 3 digits after a single comma and no other separators, treat as thousands; otherwise decimal.
    const parts = str.split(",");
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0 && /^\d+$/.test(parts[0])) {
      // Ambiguous like "1,234" → assume thousands separator
      normalized = str.replace(",", "");
    } else {
      normalized = str.replace(/,/g, ".");
    }
  } else if (hasDot) {
    // Only dot → could be decimal (337.90) or thousands (1.234). If exactly 3 digits after a single dot, treat as thousands.
    const parts = str.split(".");
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0 && /^\d+$/.test(parts[0])) {
      normalized = str.replace(".", "");
    } else {
      normalized = str;
    }
  } else {
    normalized = str;
  }

  const n = parseFloat(normalized);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

function parseBool(s: string): boolean {
  const v = String(s).toLowerCase().trim();
  return v === "sim" || v === "true" || v === "1" || v === "s" || v === "yes";
}

export interface PreviewRow<T> {
  rowIndex: number; // 1-based, matching spreadsheet line
  data: T;
  status: "create" | "update" | "warning" | "skip" | "error";
  conflictWith?: string; // existing id
  message?: string;
  selected: boolean;
}

export function buildFinanceiroPreview(
  rows: Record<string, any>[],
  existing: FinancialEntry[],
): PreviewRow<FinancialEntry>[] {
  const seen = new Map<string, FinancialEntry[]>();
  existing.forEach(e => {
    const key = buildFinancialFingerprint(e);
    const bucket = seen.get(key) || [];
    bucket.push(e);
    seen.set(key, bucket);
  });
  return rows.map((row, idx) => {
    const tipo = (getCell(row, "Tipo").toLowerCase() === "despesa" ? "despesa" : "receita") as "receita" | "despesa";
    const data = parseDate(getCell(row, "Data"));
    const valor = parseNumber(getCell(row, "Valor (R$)") || getCell(row, "Valor"));
    const descricao = getCell(row, "Descrição");
    const errors: string[] = [];
    if (!data) errors.push("Data inválida");
    if (!valor) errors.push("Valor inválido");
    if (!descricao) errors.push("Descrição vazia");

    const rawCategoria = getCell(row, "Categoria");
    const rawSubcategoria = getCell(row, "Subcategoria");
    const categoria = normalizeImportedCategoria(rawCategoria, tipo);
    const subcategoria = normalizeImportedSubcategoria(rawSubcategoria, categoria);
    const paidRaw = getCell(row, "Pago");
    const conta = getCell(row, "Conta") || undefined;
    const placa = getCell(row, "Placa") || undefined;
    const clienteNome = getCell(row, "Cliente") || undefined;
    const natureza = (getCell(row, "Natureza").toLowerCase() === "administrativa" ? "administrativa" : "operacional");

    const key = buildFinancialFingerprint({
      data,
      valor,
      descricao,
      tipo,
      conta,
      placa,
      clienteNome,
      categoria,
      subcategoria,
      natureza,
    });
    const bucket = seen.get(key) || [];
    const conflict = bucket.shift();
    if (bucket.length) seen.set(key, bucket);
    else seen.delete(key);

    const entry: FinancialEntry = {
      id: conflict?.id || crypto.randomUUID(),
      tipo,
      categoria: categoria || (tipo === "despesa" ? "outro_despesa" : "outro_receita"),
      subcategoria: subcategoria || undefined,
      descricao,
      valor,
      data: data || new Date().toISOString().slice(0, 10),
      motoId: null,
      rentalId: null,
      clienteId: null,
      pago: paidRaw ? parseBool(paidRaw) : true,
      placa,
      clienteNome,
      conta,
      natureza,
      observacao: getCell(row, "Observação") || undefined,
    };

    return {
      rowIndex: idx + 2,
      data: entry,
      status: errors.length ? "error" : conflict ? "update" : "create",
      conflictWith: conflict?.id,
      message: errors.join("; "),
      selected: errors.length === 0,
    };
  });
}

export function buildMotosPreview(
  rows: Record<string, any>[],
  existing: Motorcycle[],
): PreviewRow<Motorcycle>[] {
  const byPlaca = new Map(existing.map(m => [m.placa.toUpperCase().trim(), m]));
  return rows.map((row, idx) => {
    const placa = getCell(row, "Placa").toUpperCase().trim();
    const modelo = getCell(row, "Modelo");
    const conflict = byPlaca.get(placa);
    const errors: string[] = [];
    if (!placa) errors.push("Placa obrigatória");
    const moto: Motorcycle = {
      id: conflict?.id || crypto.randomUUID(),
      placa,
      modelo,
      anoFabricacao: parseInt(getCell(row, "Ano Fabricação")) || null,
      anoModelo: parseInt(getCell(row, "Ano Modelo")) || null,
      cor: getCell(row, "Cor"),
      chassi: getCell(row, "Chassi"),
      renavam: getCell(row, "Renavam"),
      numMotor: getCell(row, "Nº Motor") || getCell(row, "Numero Motor"),
      aplicativo: getCell(row, "Aplicativo"),
      tipo: (getCell(row, "Tipo").toLowerCase() === "terceiro" ? "terceiro" : "propria"),
      proprietario: getCell(row, "Proprietário") || undefined,
      ultimaVistoria: null,
      ultimaTrocaOleo: null,
      kmTrocaOleo: null,
      kmAtual: parseInt(getCell(row, "KM Atual")) || null,
      historicoOleo: [],
      status: (getCell(row, "Status") || "disponivel") as Motorcycle["status"],
      dataVenda: null,
      valorVenda: null,
      kmVenda: null,
      kmCompra: parseInt(getCell(row, "KM Compra")) || null,
      valorCompra: parseNumber(getCell(row, "Valor Compra (R$)") || getCell(row, "Valor Compra")) || null,
      dataCompra: parseDate(getCell(row, "Data Compra")),
      valorFipe: null,
      dataFipe: null,
      lucroOperacional: null,
      decisao: null,
      crlvPdfName: null,
      crlvPdfData: null,
    };

    return {
      rowIndex: idx + 2,
      data: moto,
      status: errors.length ? "error" : conflict ? "update" : "create",
      conflictWith: conflict?.id,
      message: errors.join("; "),
      selected: errors.length === 0,
    };
  });
}

export function buildLocacoesPreview(
  rows: Record<string, any>[],
  existing: Rental[],
  motos: Motorcycle[],
  clients: Client[],
): PreviewRow<Rental>[] {
  const motoByPlaca = new Map(motos.map(m => [m.placa.toUpperCase().trim(), m]));
  const clientByPhone = new Map(
    clients
      .filter(c => (c.telefone || "").replace(/\D/g, ""))
      .map(c => [c.telefone.replace(/\D/g, ""), c]),
  );
  const clientByName = new Map(clients.map(c => [normalizeText(c.nome), c]));
  const clientByCpf = new Map(
    clients
      .filter(c => (c.cpf || "").replace(/\D/g, ""))
      .map(c => [c.cpf.replace(/\D/g, ""), c]),
  );

  return rows.map((row, idx) => {
    const placa = getCell(row, "Placa").toUpperCase().trim();
    const nomeCliente = getCell(row, "Nome") || getCell(row, "Nome Cliente") || getCell(row, "Locatário");
    const telefoneRaw = getCell(row, "Telefone") || getCell(row, "Telefone Cliente");
    const telefoneDigits = telefoneRaw.replace(/\D/g, "");
    const cpfRaw = getCell(row, "CPF");
    const cpfDigits = cpfRaw.replace(/\D/g, "");

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!placa) errors.push("Placa obrigatória");

    const moto = placa ? motoByPlaca.get(placa) : undefined;
    if (placa && !moto) {
      warnings.push("Moto não encontrada — vincule manualmente após a importação");
    }

    // Try to match client by CPF → phone → name
    let client = cpfDigits ? clientByCpf.get(cpfDigits) : undefined;
    if (!client && telefoneDigits) client = clientByPhone.get(telefoneDigits);
    if (!client && nomeCliente) client = clientByName.get(normalizeText(nomeCliente));

    let pendingClient: Client | undefined;
    if (!client) {
      if (nomeCliente) {
        pendingClient = {
          id: crypto.randomUUID(),
          nome: nomeCliente,
          cpf: cpfRaw || "",
          cnh: "",
          cnhCategoria: "",
          cnhValidade: null,
          cnhPdfName: null,
          cnhPdfData: null,
          telefone: telefoneRaw,
          email: "",
          cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
          comprovanteEnderecoName: null,
          comprovanteEnderecoData: null,
          emergenciaNome1: "", emergenciaTel1: "", emergenciaNome2: "", emergenciaTel2: "",
          observacoes: "",
          createdAt: new Date().toISOString().slice(0, 10),
        };
      } else {
        warnings.push("Locatário não encontrado — vincule manualmente após a importação");
      }
    }

    const dataInicioRaw = getCell(row, "Data Início") || getCell(row, "Data Inicio");
    const dataFimRaw = getCell(row, "Data Fim");
    const valorSemanalRaw = getCell(row, "Valor Semanal");
    const dataInicio = (dataInicioRaw ? parseDate(dataInicioRaw) : null) || new Date().toISOString().slice(0, 10);
    const dataFim = dataFimRaw ? parseDate(dataFimRaw) : null;
    const valorSemanal = valorSemanalRaw ? parseNumber(valorSemanalRaw) : 0;
    const clienteId = client?.id || pendingClient?.id || "";

    // Determine rental status from explicit Status column and dataFim
    const today = new Date().toISOString().slice(0, 10);
    const statusRaw = getCell(row, "Status");
    const statusNorm = statusRaw.toLowerCase().replace(/[^a-z]/g, "");
    let rentalStatus: Rental["status"] = "ativa";
    if (["encerrado", "encerrada", "finalizado", "finalizada"].includes(statusNorm)) {
      rentalStatus = "finalizada";
    } else if (["cancelado", "cancelada"].includes(statusNorm)) {
      rentalStatus = "cancelada";
    } else if (dataFim && dataFim < today) {
      rentalStatus = "finalizada";
    }

    // Find any active rental for this moto (regardless of client)
    const existingActiveForMoto = moto
      ? existing.find(r => r.motoId === moto.id && r.status === "ativa")
      : undefined;

    // Same moto + same client active → update that rental
    const isSameClientConflict = !!(
      existingActiveForMoto && clienteId && existingActiveForMoto.clienteId === clienteId
    );
    const conflict = isSameClientConflict ? existingActiveForMoto : undefined;

    // Different client holds an active rental for this moto and we'd also be ativa → warn
    const isDuplicatePlaca =
      rentalStatus === "ativa" && !!existingActiveForMoto && !isSameClientConflict;
    if (isDuplicatePlaca) {
      warnings.push("Já existe locação ativa para esta placa — deseja substituir?");
    }

    const rental: Rental = {
      id: conflict?.id || crypto.randomUUID(),
      motoId: moto?.id || "",
      clienteId,
      vendedor: "",
      dataInicio,
      horaInicio: "08:00",
      dataFim: dataFim,
      dataFimContrato: null,
      proximoPagamento: null,
      tempoMinimoContrato: null,
      frequenciaPagamento: "", cobrancaPrePaga: false,
      valorDiario: valorSemanal,
      valorCaucao: 0,
      caucaoPendente: false,
      caucaoParcelado: false,
      parcelasCaucao: [],
      multaAtraso: 0,
      jurosAtrasoMes: 0,
      localRetirada: "",
      localDevolucao: "",
      kmInicio: 0,
      kmFim: null,
      nivelCombustivel: "",
      plano: "aluguel",
      raioCirculacao: "",
      seguroTerceiros: false,
      gerarCobrancaCaucao: false,
      gerarCobrancaPagamento: false,
      status: rentalStatus,
      checklistRetirada: [],
      checklistDevolucao: [],
      observacoes: "",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    if (pendingClient) (rental as any).__pendingClient = pendingClient;
    if (placa) (rental as any).__placa = placa;
    const clienteNome = client?.nome || pendingClient?.nome || "";
    const clienteTelefone = client?.telefone || pendingClient?.telefone || "";
    if (clienteNome) (rental as any).__clienteNome = clienteNome;
    if (clienteTelefone) (rental as any).__telefone = clienteTelefone;

    const hasError = errors.length > 0;
    const hasWarning = warnings.length > 0;

    return {
      rowIndex: idx + 2,
      data: rental,
      status: hasError ? "error" : hasWarning ? "warning" : conflict ? "update" : "create",
      conflictWith: conflict?.id,
      message: hasError
        ? errors.join("; ")
        : hasWarning
          ? warnings.join("; ")
          : pendingClient
            ? "Novo locatário será criado"
            : "",
      selected: !hasError && !isDuplicatePlaca,
    };
  });
}