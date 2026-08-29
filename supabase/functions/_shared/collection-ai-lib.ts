// Portado (não importado) de src/lib/collections.ts, src/lib/message-tokens.ts,
// src/lib/oil-kpis.ts e src/lib/whatsapp.ts para rodar em Deno, sem depender de
// React/localStorage/path aliases do frontend. Mantém a MESMA lógica de negócio
// usada em /cobrancas — qualquer mudança de régua/token/vencimento de óleo no
// frontend precisa ser replicada aqui manualmente.

// ============== Telefone (mesma regra de src/lib/whatsapp.ts) ==============
const DEFAULT_DDI = "55";

export function normalizePhone(rawPhone: string | null | undefined): string {
  if (!rawPhone) return "";
  const digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith(DEFAULT_DDI) && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return DEFAULT_DDI + digits;
  }
  return digits;
}

// ============== Tokens de mensagem (subset de src/lib/message-tokens.ts) ====
export type TokenMap = Record<string, string>;

export interface MotoRow {
  id: string;
  placa?: string | null;
  modelo?: string | null;
  ano_modelo?: number | null;
  cor?: string | null;
  chassi?: string | null;
  renavam?: string | null;
  num_motor?: string | null;
  km_atual?: number | null;
  km_compra?: number | null;
  km_troca_oleo?: number | null;
  ultima_troca_oleo?: string | null;
  historico_oleo?: { id: string; data: string; km: number }[] | null;
  tipo?: string | null;
  proprietario?: string | null;
  status?: string | null;
}

export interface RentalRow {
  id: string;
  moto_id?: string | null;
  cliente_id?: string | null;
  status?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  numero?: number | null;
  created_at?: string | null;
}

export interface ClientRow {
  id: string;
  nome?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  cnh?: string | null;
  cnh_categoria?: string | null;
  cnh_validade?: string | null;
  emergencia_nome1?: string | null;
  emergencia_tel1?: string | null;
  emergencia_nome2?: string | null;
  emergencia_tel2?: string | null;
}

const fmtNumber = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("pt-BR"));
const fmtMoney = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
};

function detectMarca(modelo: string): string {
  const m = (modelo || "").toLowerCase();
  if (m.includes("honda")) return "Honda";
  if (m.includes("yamaha")) return "Yamaha";
  if (m.includes("suzuki")) return "Suzuki";
  if (m.includes("kawasaki")) return "Kawasaki";
  if (m.includes("bmw")) return "BMW";
  if (m.includes("haojue")) return "Haojue";
  if (m.includes("shineray")) return "Shineray";
  return "";
}

function vehicleTokens(m?: MotoRow | null): TokenMap {
  if (!m) return {};
  return {
    "{PLACA}": m.placa ?? "",
    "{MARCA}": detectMarca(m.modelo ?? ""),
    "{MODELO}": m.modelo ?? "",
    "{ANO}": m.ano_modelo != null ? String(m.ano_modelo) : "",
    "{COR}": m.cor ?? "",
    "{CHASSI}": m.chassi ?? "",
    "{RENAVAM}": m.renavam ?? "",
    "{NUM_MOTOR}": m.num_motor ?? "",
    "{KM_ATUAL}": fmtNumber(m.km_atual),
    "{TIPO_VEICULO}": m.tipo === "terceiro" ? "Terceiro" : "Própria",
    "{PROPRIETARIO}": m.proprietario ?? "",
  };
}

function rentalTokens(r?: RentalRow | null): TokenMap {
  if (!r) return {};
  return {
    "{NUMERO_LOCACAO}": r.numero != null ? `#${String(r.numero).padStart(5, "0")}` : "",
    "{DATA_INICIO}": fmtDate(r.data_inicio),
  };
}

function clientTokens(c?: ClientRow | null): TokenMap {
  if (!c) return {};
  const endereco = [
    c.rua,
    c.numero ? `nº ${c.numero}` : "",
    c.complemento,
    c.bairro,
    c.cidade && c.estado ? `${c.cidade}/${c.estado}` : c.cidade || c.estado,
  ].filter(Boolean).join(", ");
  return {
    "{NOME}": c.nome ?? "",
    "{CPF}": c.cpf ?? "",
    "{TELEFONE}": c.telefone ?? "",
    "{EMAIL}": c.email ?? "",
    "{ENDERECO}": endereco,
    "{CEP}": c.cep ?? "",
    "{CIDADE}": c.cidade ?? "",
    "{ESTADO}": c.estado ?? "",
    "{EMERGENCIA_NOME_1}": c.emergencia_nome1 ?? "",
    "{EMERGENCIA_TEL_1}": c.emergencia_tel1 ?? "",
    "{EMERGENCIA_NOME_2}": c.emergencia_nome2 ?? "",
    "{EMERGENCIA_TEL_2}": c.emergencia_tel2 ?? "",
  };
}

function driverTokens(c?: ClientRow | null): TokenMap {
  if (!c) return {};
  return {
    "{CNH}": c.cnh ?? "",
    "{CNH_CATEGORIA}": c.cnh_categoria ?? "",
    "{CNH_VALIDADE}": fmtDate(c.cnh_validade),
  };
}

export function mergeTokens(...maps: (TokenMap | undefined | null)[]): TokenMap {
  const out: TokenMap = {};
  for (const m of maps) if (m) Object.assign(out, m);
  return out;
}

export function applyTokens(template: string, tokens: TokenMap): string {
  let out = template;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(value ?? "");
  }
  return out;
}

export function buildAllTokens(args: {
  moto?: MotoRow | null;
  rental?: RentalRow | null;
  cliente?: ClientRow | null;
  extra?: TokenMap;
}): TokenMap {
  return mergeTokens(
    vehicleTokens(args.moto ?? null),
    rentalTokens(args.rental ?? null),
    clientTokens(args.cliente ?? null),
    driverTokens(args.cliente ?? null),
    args.extra,
  );
}

// ============== Troca de óleo (subset de src/lib/oil-kpis.ts) ==============
// loadBrandConfig/loadGlobalConfig no frontend leem localStorage (config por
// navegador) — no servidor não há como enxergar isso, então usamos sempre os
// valores padrão. Se a empresa customizou km/marca via UI, essa automação
// ainda não reflete a customização (ver plano — melhoria futura: mover essa
// config pra tabela `companies`).
export interface BrandConfig {
  oilKm: number;
  filterKm?: number;
  defaultKmPerDay?: number;
}

export interface OilGlobalConfig {
  windowKm: number;
  defaultKmPerDay: number;
  useBrandDefault?: boolean;
  overdueDays?: number;
  adaptiveMinTrocas?: number;
}

export const DEFAULT_BRAND_CONFIG: Record<string, BrandConfig> = {
  honda: { oilKm: 1000 },
  yamaha: { oilKm: 2000, filterKm: 4000 },
  outras: { oilKm: 1000 },
};

export const DEFAULT_GLOBAL_CONFIG: OilGlobalConfig = {
  windowKm: 70,
  defaultKmPerDay: 1000 / 7,
  overdueDays: 10,
  adaptiveMinTrocas: 3,
};

interface OilChangeRecord { id: string; data: string; km: number; }

function detectBrand(modelo: string): string {
  const m = (modelo || "").toLowerCase();
  if (m.includes("honda")) return "honda";
  if (m.includes("yamaha")) return "yamaha";
  return "outras";
}

function brandConfigFor(modelo: string | null | undefined, cfg: Record<string, BrandConfig>): BrandConfig {
  return cfg[detectBrand(modelo || "")] ?? cfg["outras"] ?? { oilKm: 1000 };
}

function lastOilChange(m: MotoRow): OilChangeRecord | null {
  if (!m.historico_oleo || m.historico_oleo.length === 0) {
    if (m.ultima_troca_oleo && m.km_troca_oleo != null) {
      return { id: "legacy", data: m.ultima_troca_oleo, km: m.km_troca_oleo };
    }
    return null;
  }
  return [...m.historico_oleo].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0];
}

export type OilSituation = "ok" | "atencao" | "vencida" | "sem_dados";

export interface OilStatus {
  situation: OilSituation;
  kmAtraso: number;
  diasDesdeUltima: number | null;
}

export function getOilStatus(
  m: MotoRow,
  brandCfg: Record<string, BrandConfig>,
  globalCfg: OilGlobalConfig,
  rentals: RentalRow[] = [],
): OilStatus {
  const last = lastOilChange(m);
  const cfg = brandConfigFor(m.modelo, brandCfg);
  const kmAtual = m.km_atual ?? 0;
  if (!last) {
    const activeRental = rentals.find((r) => r.moto_id === m.id && r.status === "ativa");
    const overdueDays = globalCfg.overdueDays ?? 10;
    if (activeRental?.data_inicio) {
      const diasDesdeInicio = Math.floor((Date.now() - new Date(activeRental.data_inicio).getTime()) / 86400000);
      if (diasDesdeInicio > overdueDays) {
        return { situation: "vencida", kmAtraso: 0, diasDesdeUltima: diasDesdeInicio };
      }
    }
    return { situation: "sem_dados", kmAtraso: 0, diasDesdeUltima: null };
  }
  const proxOleoKm = last.km + cfg.oilKm;
  const kmRestantes = proxOleoKm - kmAtual;
  const kmAtraso = Math.max(0, kmAtual - proxOleoKm);
  // Km manda — dias só é rede de segurança pra moto SEM histórico de troca
  // nenhum (branch !last acima). Com histórico, dias parada em estoque não
  // deve empurrar a moto pra "vencida" sozinha; só o km rodado importa. Dias
  // só conta a partir de quando a moto está alugada de novo (mesma regra do
  // frontend — ver src/lib/oil-kpis.ts).
  const activeRental = rentals.find((r) => r.moto_id === m.id && r.status === "ativa");
  const diasDesdeUltima = activeRental?.data_inicio
    ? Math.floor((Date.now() - new Date(activeRental.data_inicio).getTime()) / 86400000)
    : null;

  // "Vencida" também é km-only: passou do limite por mais que a própria janela
  // de tolerância (windowKm) — mesma margem usada pra avisar "chegando perto".
  let situation: OilSituation;
  if (kmAtraso > globalCfg.windowKm) situation = "vencida";
  else if (kmAtraso > 0 || kmRestantes <= globalCfg.windowKm) situation = "atencao";
  else situation = "ok";
  return { situation, kmAtraso, diasDesdeUltima };
}

// ============== Régua de cobrança (subset de src/lib/collections.ts) =======
export type CollectionModule = "pagamento" | "multa" | "outras_receitas" | "oleo" | "vistoria" | "manutencao";

export interface CollectionStage {
  stage: number;
  offset_days: number;
  template: string;
}

export interface CollectionRule {
  company_id: string;
  module: CollectionModule;
  enabled: boolean;
  stages: CollectionStage[];
}

export const DEFAULT_STAGES: Record<CollectionModule, CollectionStage[]> = {
  pagamento: [
    { stage: 1, offset_days: 0, template: "Oi {NOME}, tudo bem? Passando para lembrar do pagamento da locação que vence hoje. Qualquer dúvida estou à disposição." },
    { stage: 2, offset_days: 3, template: "Olá {NOME}, identifiquei que o pagamento ainda não foi regularizado. Pode me confirmar uma previsão? Obrigado." },
    { stage: 3, offset_days: 7, template: "{NOME}, o pagamento segue em aberto há mais de uma semana. Precisamos resolver hoje para evitar suspensão da locação." },
  ],
  multa: [
    { stage: 1, offset_days: 0, template: "Oi {NOME}, foi registrada a multa de placa {PLACA}. Por favor confirme o recebimento." },
    { stage: 2, offset_days: 5, template: "{NOME}, a multa da placa {PLACA} ainda está em aberto. Pode me retornar?" },
    { stage: 3, offset_days: 15, template: "{NOME}, sem retorno sobre a multa da placa {PLACA}. Vamos precisar regularizar urgente." },
  ],
  outras_receitas: [
    { stage: 1, offset_days: 0, template: "Oi {NOME}, tudo bem? Passando para lembrar do pagamento pendente. Qualquer dúvida estou à disposição." },
    { stage: 2, offset_days: 3, template: "Olá {NOME}, identifiquei que esse pagamento ainda não foi regularizado. Pode me confirmar uma previsão?" },
    { stage: 3, offset_days: 7, template: "{NOME}, esse pagamento segue em aberto há mais de uma semana. Precisamos resolver hoje." },
  ],
  oleo: [
    { stage: 1, offset_days: 0, template: "Oi {NOME}, a troca de óleo da {PLACA} está vencida. Pode agendar?" },
    { stage: 2, offset_days: 3, template: "{NOME}, ainda sem agendamento da troca de óleo da {PLACA}. Não atrasar protege o motor da moto." },
    { stage: 3, offset_days: 7, template: "{NOME}, a troca de óleo da {PLACA} continua atrasada. Precisamos resolver agora." },
  ],
  vistoria: [
    { stage: 1, offset_days: 0, template: "Oi {NOME}, a vistoria da {PLACA} está vencida. Qual o melhor dia para você trazer?" },
    { stage: 2, offset_days: 7, template: "{NOME}, a vistoria da {PLACA} segue pendente. Pode me confirmar uma data?" },
    { stage: 3, offset_days: 15, template: "{NOME}, sem vistoria, a moto não pode continuar em circulação. Vamos resolver hoje?" },
  ],
  manutencao: [
    { stage: 1, offset_days: 0, template: "Oi {NOME}, a manutenção da {PLACA} está agendada/vencida. Confirma o horário?" },
    { stage: 2, offset_days: 7, template: "{NOME}, a manutenção da {PLACA} segue pendente. Pode me confirmar?" },
    { stage: 3, offset_days: 15, template: "{NOME}, manutenção em atraso compromete a segurança. Vamos agendar agora." },
  ],
};

export function defaultRule(companyId: string, module: CollectionModule): CollectionRule {
  return { company_id: companyId, module, enabled: true, stages: DEFAULT_STAGES[module] };
}

export function daysOverdue(dueDateISO: string | null | undefined, today = new Date()): number {
  if (!dueDateISO) return 0;
  const due = new Date(dueDateISO.length === 10 ? dueDateISO + "T00:00:00" : dueDateISO);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

export function expectedStage(rule: CollectionRule, daysLate: number): number {
  if (!rule.enabled || rule.stages.length === 0) return 0;
  let max = 0;
  for (const s of rule.stages) if (daysLate >= s.offset_days) max = Math.max(max, s.stage);
  return max;
}

interface FollowupRow {
  module: string;
  entity_id: string;
  stage_number: number;
  regularized_at: string | null;
  sent_at?: string;
}

export function lastSentStage(followups: FollowupRow[], module: CollectionModule, entityId: string): number {
  return followups
    .filter((f) => f.module === module && f.entity_id === entityId && !f.regularized_at)
    .reduce((max, f) => Math.max(max, f.stage_number), 0);
}

export function isEscalated(rule: CollectionRule, sentStage: number): boolean {
  if (rule.stages.length === 0) return false;
  return sentStage >= rule.stages.length;
}
