/**
 * Privacy / Demo Mask
 *
 * Quando ativado, substitui dados sensíveis (nomes, CPF, CNH, telefone, e-mail,
 * placas, chassi, renavam, endereços, etc.) por valores fictícios determinísticos.
 * Mesmo id => mesmo valor fake, para que o usuário possa gravar demos consistentes.
 *
 * Aplicado no nível do cache (data-cache.ts), de forma que TODA a UI que lê do
 * cache passa a ver os valores mascarados sem alterações página a página.
 */

import type { Motorcycle, Client, Rental, Fine, Maintenance, FinancialEntry } from "./types";

// Hash determinístico simples (FNV-1a 32-bit)
function hash(input: string): number {
  let h = 0x811c9dc5;
  const s = String(input ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: string): T {
  return arr[hash(seed) % arr.length];
}

function digits(seed: string, len: number): string {
  let h = hash(seed);
  let out = "";
  while (out.length < len) {
    out += String(h % 10);
    h = Math.floor(h / 10) || hash(out + seed);
  }
  return out.slice(0, len);
}

const FIRST_NAMES = [
  "Lucas","João","Pedro","Rafael","Bruno","Felipe","Gabriel","Thiago","Diego","Gustavo",
  "Marcelo","Rodrigo","Eduardo","Vinícius","Daniel","Carlos","Matheus","Leonardo","André","Renato",
  "Alexandre","Leandro","Fábio","Henrique","Ricardo","Paulo","Roberto","Sérgio","Márcio","Tiago",
];
const LAST_NAMES = [
  "Silva","Santos","Oliveira","Souza","Pereira","Lima","Costa","Almeida","Rodrigues","Carvalho",
  "Gomes","Martins","Araújo","Barbosa","Ribeiro","Nascimento","Moreira","Cardoso","Teixeira","Mendes",
];
const STREETS = ["Rua das Flores","Av. Brasil","Rua Sete de Setembro","Av. Paulista","Rua das Acácias","Rua do Comércio","Av. Atlântica"];
const CITIES = ["São Paulo","Rio de Janeiro","Belo Horizonte","Curitiba","Porto Alegre","Salvador","Recife"];
const STATES = ["SP","RJ","MG","PR","RS","BA","PE"];

export function maskName(seed: string): string {
  if (!seed) return seed;
  return `${pick(FIRST_NAMES, "fn:" + seed)} ${pick(LAST_NAMES, "ln:" + seed)}`;
}

export function maskCpf(seed: string): string {
  if (!seed) return seed;
  const d = digits("cpf:" + seed, 11);
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
}

export function maskCnpj(seed: string): string {
  if (!seed) return seed;
  const d = digits("cnpj:" + seed, 14);
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
}

export function maskCompanyName(seed: string): string {
  if (!seed) return seed;
  const suffixes = ["Locadora","Motos","Rental","Frota","Fleet","Mobilidade"];
  const tags = ["Demo","Alpha","Beta","Prime","Plus","Star","Pro"];
  return `${pick(suffixes, "co1:" + seed)} ${pick(tags, "co2:" + seed)}`;
}

export function maskCnh(seed: string): string {
  if (!seed) return seed;
  return digits("cnh:" + seed, 11);
}

export function maskPhone(seed: string): string {
  if (!seed) return seed;
  const d = digits("tel:" + seed, 9);
  return `(11) 9${d.slice(0,4)}-${d.slice(4,8)}`;
}

export function maskEmail(seed: string): string {
  if (!seed) return seed;
  const n = (hash("em:" + seed) % 9000) + 1000;
  return `cliente${n}@exemplo.com`;
}

export function maskPlaca(seed: string): string {
  if (!seed) return seed;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const h = hash("pl:" + seed);
  const a = letters[h % 26];
  const b = letters[Math.floor(h / 26) % 26];
  const c = letters[Math.floor(h / (26 * 26)) % 26];
  const d = digits("pl2:" + seed, 4);
  const letterMid = letters[hash("plm:" + seed) % 26];
  return `${a}${b}${c}${d[0]}${letterMid}${d.slice(2,4)}`;
}

export function maskChassi(seed: string): string {
  if (!seed) return seed;
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  let h = hash("ch:" + seed);
  let out = "";
  for (let i = 0; i < 17; i++) {
    out += chars[h % chars.length];
    h = Math.floor(h / chars.length) || hash(out);
  }
  return out;
}

export function maskImei(seed: string): string {
  if (!seed) return seed;
  return digits("imei:" + seed, 15);
}

export function maskRenavam(seed: string): string {
  if (!seed) return seed;
  return digits("rv:" + seed, 11);
}

export function maskNumMotor(seed: string): string {
  if (!seed) return seed;
  return "MTR" + digits("mt:" + seed, 8);
}

export function maskAddress(seedId: string) {
  const idx = hash("addr:" + seedId);
  return {
    cep: `${digits("cep:" + seedId, 5).slice(0,5)}-${digits("cep2:" + seedId, 3)}`,
    rua: STREETS[idx % STREETS.length],
    numero: String((idx % 900) + 100),
    complemento: "",
    bairro: "Centro",
    cidade: CITIES[idx % CITIES.length],
    estado: STATES[idx % STATES.length],
  };
}

// ─── Transformers ────────────────────────────────────────────────

export function maskClient(c: Client): Client {
  if (!c) return c;
  const seed = c.id || c.cpf || c.nome;
  const addr = maskAddress(seed);
  return {
    ...c,
    nome: maskName(seed),
    cpf: c.cpf ? maskCpf(seed) : c.cpf,
    cnh: c.cnh ? maskCnh(seed) : c.cnh,
    telefone: c.telefone ? maskPhone(seed) : c.telefone,
    email: c.email ? maskEmail(seed) : c.email,
    cep: c.cep ? addr.cep : c.cep,
    rua: c.rua ? addr.rua : c.rua,
    numero: c.numero ? addr.numero : c.numero,
    complemento: c.complemento ? "" : c.complemento,
    bairro: c.bairro ? addr.bairro : c.bairro,
    cidade: c.cidade ? addr.cidade : c.cidade,
    estado: c.estado ? addr.estado : c.estado,
    emergenciaNome1: c.emergenciaNome1 ? maskName("e1:" + seed) : c.emergenciaNome1,
    emergenciaTel1: c.emergenciaTel1 ? maskPhone("e1:" + seed) : c.emergenciaTel1,
    emergenciaNome2: c.emergenciaNome2 ? maskName("e2:" + seed) : c.emergenciaNome2,
    emergenciaTel2: c.emergenciaTel2 ? maskPhone("e2:" + seed) : c.emergenciaTel2,
    observacoes: c.observacoes ? "" : c.observacoes,
  };
}

export function maskMoto(m: Motorcycle): Motorcycle {
  if (!m) return m;
  const seed = m.id || m.placa || m.chassi;
  return {
    ...m,
    placa: m.placa ? maskPlaca(seed) : m.placa,
    chassi: m.chassi ? maskChassi(seed) : m.chassi,
    renavam: m.renavam ? maskRenavam(seed) : m.renavam,
    numMotor: m.numMotor ? maskNumMotor(seed) : m.numMotor,
    proprietario: m.proprietario ? maskName("own:" + seed) : m.proprietario,
  };
}

export function maskRental(r: Rental): Rental {
  // ids ficam intactos para lookups; apenas observações são limpas
  return { ...r, observacoes: r.observacoes ? "" : r.observacoes };
}

export function maskFine(f: Fine): Fine {
  return { ...f, descricao: f.descricao ? "Infração de trânsito" : f.descricao };
}

export function maskMaintenance(m: Maintenance): Maintenance {
  return { ...m, descricao: m.descricao ? m.descricao : m.descricao, fornecedor: m.fornecedor ? "Oficina Exemplo" : m.fornecedor };
}

export function maskFinancial(e: FinancialEntry): FinancialEntry {
  return {
    ...e,
    placa: e.placa ? maskPlaca(e.placa) : e.placa,
    clienteNome: e.clienteNome ? maskName(e.clienteNome) : e.clienteNome,
    observacao: e.observacao ? "" : e.observacao,
  };
}
