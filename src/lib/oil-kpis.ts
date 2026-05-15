import { Motorcycle, OilChangeRecord, Rental, Client } from "@/lib/types";

// ============== Configuração persistente ==============
export interface BrandConfig {
  oilKm: number;
  filterKm?: number;
  /** km/dia específico da marca; usado quando o modo "padrão por marca" está ativo no global. */
  defaultKmPerDay?: number;
}

export interface OilGlobalConfig {
  /** Janela de tolerância (km) para considerar a troca "dentro do prazo". */
  windowKm: number;
  /** km/dia padrão da frota quando não há histórico suficiente do locatário. */
  defaultKmPerDay: number;
  /** Quando true, usa o km/dia definido por marca (BrandConfig.defaultKmPerDay) ao invés do global. */
  useBrandDefault?: boolean;
  /** Lista de palavras-chave usadas para o vídeo de vistoria (sorteia por dia). */
  keywords: string[];
  /** Dias sem atualização da troca para considerar VENCIDA (atraso). */
  overdueDays?: number;
  /** Período (em dias) que a palavra-chave da vistoria em vídeo fica válida. */
  keywordPeriodDays?: number;
  /** Nº mínimo de trocas consecutivas conformes para considerar locatário "disciplinado" (modo adaptativo). */
  adaptiveMinTrocas?: number;
}

export const DEFAULT_BRAND_CONFIG: Record<string, BrandConfig> = {
  honda: { oilKm: 1000 },
  yamaha: { oilKm: 2000, filterKm: 4000 },
  outras: { oilKm: 1000 },
};

export const DEFAULT_GLOBAL_CONFIG: OilGlobalConfig = {
  windowKm: 70,
  defaultKmPerDay: 1000 / 7, // 1000 km/semana
  keywords: [
    "girassol", "pantera", "oceano", "cometa", "bambu", "vulcao",
    "tigre", "eclipse", "raposa", "horizonte", "trovao", "labareda",
    "falcao", "deserto", "rubi", "safira", "aurora", "fenix",
    "leopardo", "neon", "aguia", "magma", "polar", "tornado",
  ],
  overdueDays: 10,
  keywordPeriodDays: 1,
  adaptiveMinTrocas: 3,
};

const BRAND_KEY = "wayvo:troca-oleo:brand-config";
const GLOBAL_KEY = "wayvo:troca-oleo:global-config";

export function loadBrandConfig(): Record<string, BrandConfig> {
  try {
    const raw = localStorage.getItem(BRAND_KEY);
    if (!raw) return { ...DEFAULT_BRAND_CONFIG };
    return { ...DEFAULT_BRAND_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BRAND_CONFIG };
  }
}

export function saveBrandConfig(cfg: Record<string, BrandConfig>) {
  localStorage.setItem(BRAND_KEY, JSON.stringify(cfg));
}

export function loadGlobalConfig(): OilGlobalConfig {
  try {
    const raw = localStorage.getItem(GLOBAL_KEY);
    if (!raw) return { ...DEFAULT_GLOBAL_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_GLOBAL_CONFIG,
      ...parsed,
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0
        ? parsed.keywords
        : DEFAULT_GLOBAL_CONFIG.keywords,
    };
  } catch {
    return { ...DEFAULT_GLOBAL_CONFIG };
  }
}

export function saveGlobalConfig(cfg: OilGlobalConfig) {
  localStorage.setItem(GLOBAL_KEY, JSON.stringify(cfg));
}

// ============== Helpers ==============
export function detectBrand(modelo: string): string {
  const m = (modelo || "").toLowerCase();
  if (m.includes("honda")) return "honda";
  if (m.includes("yamaha")) return "yamaha";
  return "outras";
}

export function brandConfigFor(modelo: string, cfg: Record<string, BrandConfig>): BrandConfig {
  return cfg[detectBrand(modelo)] ?? cfg["outras"] ?? { oilKm: 1000 };
}

/** Resolve o km/dia padrão (sem histórico do locatário) considerando o toggle "padrão por marca". */
export function defaultKmPerDayFor(
  modelo: string,
  brandCfg: Record<string, BrandConfig>,
  globalCfg: OilGlobalConfig,
): number {
  if (globalCfg.useBrandDefault) {
    const bc = brandConfigFor(modelo, brandCfg);
    if (typeof bc.defaultKmPerDay === "number" && bc.defaultKmPerDay > 0) {
      return bc.defaultKmPerDay;
    }
  }
  return globalCfg.defaultKmPerDay;
}

export function lastOilChange(m: Motorcycle): OilChangeRecord | null {
  if (!m.historicoOleo || m.historicoOleo.length === 0) {
    if (m.ultimaTrocaOleo && m.kmTrocaOleo != null) {
      return { id: "legacy", data: m.ultimaTrocaOleo, km: m.kmTrocaOleo };
    }
    return null;
  }
  return [...m.historicoOleo].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  )[0];
}

export function sortedHistory(m: Motorcycle): OilChangeRecord[] {
  return [...(m.historicoOleo || [])].sort(
    (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
  );
}

// ============== Situação por moto ==============
export type OilSituation = "ok" | "atencao" | "vencida" | "sem_dados";

export interface OilStatus {
  situation: OilSituation;
  label: string;
  proxOleoKm: number;
  proxFiltroKm: number | null;
  kmRestantes: number; // negativo = atrasada
  kmAtraso: number; // positivo se vencida (km além do limite)
  diasDesdeUltima: number | null;
}

export function getOilStatus(
  m: Motorcycle,
  brandCfg: Record<string, BrandConfig>,
  globalCfg: OilGlobalConfig,
  rentals: Rental[] = [],
): OilStatus {
  const last = lastOilChange(m);
  const cfg = brandConfigFor(m.modelo, brandCfg);
  const kmAtual = m.kmAtual ?? 0;
  // Âncora para "próxima troca" quando não há histórico de óleo: usar o km
  // de compra (ou 0). NUNCA ancorar no km atual — atualizar o hodômetro
  // não é uma troca de óleo e não deve empurrar o alvo da próxima troca.
  const anchorKm = m.kmCompra ?? 0;
  if (!last) {
    // Se a moto está em locação ativa e já ultrapassou o prazo (em dias) sem
    // nenhum registro de troca, considerar VENCIDA.
    const activeRental = rentals.find((r) => r.motoId === m.id && r.status === "ativa");
    const overdueDays = globalCfg.overdueDays ?? 10;
    if (activeRental?.dataInicio) {
      const diasDesdeInicio = Math.floor(
        (Date.now() - new Date(activeRental.dataInicio).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diasDesdeInicio > overdueDays) {
        return {
          situation: "vencida",
          label: `Vencida (${diasDesdeInicio} dias sem registro)`,
          proxOleoKm: anchorKm + cfg.oilKm,
          proxFiltroKm: cfg.filterKm ? anchorKm + cfg.filterKm : null,
          kmRestantes: 0,
          kmAtraso: 0,
          diasDesdeUltima: diasDesdeInicio,
        };
      }
    }
    const proxOleoKmSemReg = anchorKm + cfg.oilKm;
    return {
      situation: "sem_dados",
      label: "Sem registro",
      proxOleoKm: proxOleoKmSemReg,
      proxFiltroKm: cfg.filterKm ? anchorKm + cfg.filterKm : null,
      kmRestantes: Math.max(0, proxOleoKmSemReg - kmAtual),
      kmAtraso: 0,
      diasDesdeUltima: null,
    };
  }
  const proxOleoKm = last.km + cfg.oilKm;
  const proxFiltroKm = cfg.filterKm ? last.km + cfg.filterKm : null;
  const kmRestantes = proxOleoKm - kmAtual;
  const kmAtraso = Math.max(0, kmAtual - proxOleoKm);
  const overdueDays = globalCfg.overdueDays ?? 10;
  const msDia = 1000 * 60 * 60 * 24;
  const diasDesdeUltima = Math.floor(
    (Date.now() - new Date(last.data).getTime()) / msDia,
  );
  let situation: OilSituation;
  // Regra adicional: se faz mais dias que o configurado desde a última troca,
  // considerar VENCIDA independente do KM (mesmo que registrada hoje com data antiga).
  if (diasDesdeUltima > overdueDays) {
    situation = "vencida";
  } else
  // Vencida quando passou do KM limite E:
  //  - locatário tem últimas 3 trocas consecutivas DENTRO da tolerância:
  //      usa km/dia adaptativo dele e só vence se projeção em `overdueDays` ultrapassar a tolerância
  //  - caso contrário (sem 3 trocas consecutivas conformes / sem locatário / sem histórico):
  //      aplica direto a regra "diasDesdeUltima > overdueDays"
  if (kmAtraso > 0) {
    const minTrocas = globalCfg.adaptiveMinTrocas ?? 3;
    const adaptKpd = adaptiveKmPerDay(m, rentals, cfg.oilKm, globalCfg.windowKm, minTrocas);
    if (adaptKpd != null) {
      // locatário disciplinado: projeta consumo em overdueDays
      const projecao = adaptKpd * overdueDays;
      situation = projecao > globalCfg.windowKm ? "vencida" : "atencao";
    } else {
      // sem amostra confiável: usa critério de dias
      situation = diasDesdeUltima > overdueDays ? "vencida" : "atencao";
    }
  } else if (kmRestantes <= globalCfg.windowKm) {
    situation = "atencao";
  } else {
    situation = "ok";
  }
  const label =
    situation === "vencida"
      ? `Vencida (${diasDesdeUltima} dias sem troca · +${kmAtraso.toLocaleString("pt-BR")} km)`
      : situation === "atencao"
        ? kmAtraso > 0
          ? `Atenção (+${kmAtraso.toLocaleString("pt-BR")} km · ${diasDesdeUltima}d)`
          : `Próxima (${kmRestantes.toLocaleString("pt-BR")} km)`
        : `Em dia (${kmRestantes.toLocaleString("pt-BR")} km)`;
  return { situation, label, proxOleoKm, proxFiltroKm, kmRestantes, kmAtraso, diasDesdeUltima };
}

// ============== KPIs agregados ==============
export interface OilKpis {
  conformidadePct: number | null; // % de trocas dentro de ±windowKm do agendado
  conformidadeTotal: number;
  conformidadeOk: number;
  atrasoMedioKm: number | null; // média de km além do limite (apenas trocas com atraso)
  atrasoAmostras: number;
  vencidasAgora: number; // qtd de motos com situation = "vencida"
  reincidenciaPct: number | null; // % de locatários que atrasaram > 1 vez
  reincidenciaTotalLocatarios: number;
  reincidenciaReincidentes: number;
}

/**
 * Calcula desvio (km) de uma troca em relação ao km esperado (anterior + oilKm).
 * Retorna null se não houver troca anterior para comparar.
 */
function changeDeviation(prev: OilChangeRecord, curr: OilChangeRecord, oilKm: number): number {
  const esperado = prev.km + oilKm;
  return curr.km - esperado; // positivo = atraso
}

/**
 * Resolve qual locatário estava com a moto em uma data.
 * Retorna o id do cliente ou null.
 */
function clientForDate(motoId: string, dataISO: string, rentals: Rental[]): string | null {
  const t = new Date(dataISO).getTime();
  const candidate = rentals.find((r) => {
    if (r.motoId !== motoId) return false;
    const ini = new Date(r.dataInicio).getTime();
    const fim = r.dataFim ? new Date(r.dataFim).getTime() : Infinity;
    return t >= ini && t <= fim;
  });
  return candidate?.clienteId ?? null;
}

export function computeKpis(
  motos: Motorcycle[],
  rentals: Rental[],
  brandCfg: Record<string, BrandConfig>,
  globalCfg: OilGlobalConfig,
): OilKpis {
  let conformOk = 0;
  let conformTot = 0;
  let atrasoSoma = 0;
  let atrasoCount = 0;
  let vencidas = 0;

  // reincidência: por locatário, quantas trocas atrasadas (desvio > windowKm)
  const lateByClient = new Map<string, number>();
  const totalByClient = new Map<string, number>();

  for (const m of motos) {
    const cfg = brandConfigFor(m.modelo, brandCfg);
    const hist = sortedHistory(m);
    for (let i = 1; i < hist.length; i++) {
      const dev = changeDeviation(hist[i - 1], hist[i], cfg.oilKm);
      conformTot++;
      if (Math.abs(dev) <= globalCfg.windowKm) conformOk++;
      if (dev > 0) {
        atrasoSoma += dev;
        atrasoCount++;
      }
      const clienteId = clientForDate(m.id, hist[i].data, rentals);
      if (clienteId) {
        totalByClient.set(clienteId, (totalByClient.get(clienteId) ?? 0) + 1);
        if (dev > globalCfg.windowKm) {
          lateByClient.set(clienteId, (lateByClient.get(clienteId) ?? 0) + 1);
        }
      }
    }
    const status = getOilStatus(m, brandCfg, globalCfg, rentals);
    if (status.situation === "vencida") vencidas++;
  }

  const reincidentes = Array.from(lateByClient.values()).filter((n) => n >= 2).length;
  const totalLocatarios = totalByClient.size;

  return {
    conformidadePct: conformTot > 0 ? (conformOk / conformTot) * 100 : null,
    conformidadeTotal: conformTot,
    conformidadeOk: conformOk,
    atrasoMedioKm: atrasoCount > 0 ? atrasoSoma / atrasoCount : null,
    atrasoAmostras: atrasoCount,
    vencidasAgora: vencidas,
    reincidenciaPct: totalLocatarios > 0 ? (reincidentes / totalLocatarios) * 100 : null,
    reincidenciaTotalLocatarios: totalLocatarios,
    reincidenciaReincidentes: reincidentes,
  };
}

// ============== Estimativa adaptativa de próxima troca ==============
export interface NextChangeEstimate {
  proxOleoKm: number;
  proxFiltroKm: number | null;
  proxOleoData: string | null; // ISO
  kmPorDia: number;
  fonte: "adaptativa" | "padrao" | "sem_dados";
}

/**
 * Verifica se as últimas N trocas do locatário ativo na moto foram feitas
 * dentro de ±windowKm do agendado. Se sim, calcula km/dia real do locatário.
 */
function adaptiveKmPerDay(
  m: Motorcycle,
  rentals: Rental[],
  oilKm: number,
  windowKm: number,
  minTrocas: number,
): number | null {
  const hist = sortedHistory(m);
  // Precisamos de pelo menos minTrocas intervalos (= minTrocas+1 trocas no histórico)
  if (hist.length < minTrocas + 1) return null;
  // Se houver locatário ativo, restringir às trocas DESDE o início da locação
  const activeRental = rentals.find((r) => r.motoId === m.id && r.status === "ativa");
  let pool = hist;
  if (activeRental) {
    const ini = new Date(activeRental.dataInicio).getTime();
    pool = hist.filter((h) => new Date(h.data).getTime() >= ini);
    if (pool.length < minTrocas + 1) return null;
  }
  // Pegar os últimos `minTrocas` intervalos consecutivos e exigir que TODOS estejam dentro da tolerância
  const tail = pool.slice(-(minTrocas + 1));
  let kmTotal = 0;
  let diasTotal = 0;
  for (let i = 1; i < tail.length; i++) {
    const dev = changeDeviation(tail[i - 1], tail[i], oilKm);
    if (Math.abs(dev) > windowKm) return null; // qualquer troca fora da tolerância invalida
    const km = tail[i].km - tail[i - 1].km;
    const dias =
      (new Date(tail[i].data).getTime() - new Date(tail[i - 1].data).getTime()) /
      (1000 * 60 * 60 * 24);
    if (km <= 0 || dias <= 0) return null;
    kmTotal += km;
    diasTotal += dias;
  }
  if (diasTotal <= 0) return null;
  return kmTotal / diasTotal;
}

export function estimateNextChange(
  m: Motorcycle,
  rentals: Rental[],
  brandCfg: Record<string, BrandConfig>,
  globalCfg: OilGlobalConfig,
): NextChangeEstimate {
  const last = lastOilChange(m);
  const cfg = brandConfigFor(m.modelo, brandCfg);
  if (!last) {
    const anchorKm = m.kmCompra ?? 0;
    return {
      proxOleoKm: anchorKm + cfg.oilKm,
      proxFiltroKm: cfg.filterKm ? anchorKm + cfg.filterKm : null,
      proxOleoData: null,
      kmPorDia: defaultKmPerDayFor(m.modelo, brandCfg, globalCfg),
      fonte: "sem_dados",
    };
  }
  const proxOleoKm = last.km + cfg.oilKm;
  const proxFiltroKm = cfg.filterKm ? last.km + cfg.filterKm : null;
  const adaptKpd = adaptiveKmPerDay(m, rentals, cfg.oilKm, globalCfg.windowKm, globalCfg.adaptiveMinTrocas ?? 3);
  const kmPorDia = adaptKpd ?? defaultKmPerDayFor(m.modelo, brandCfg, globalCfg);
  const kmAtual = m.kmAtual ?? last.km;
  const kmRestantes = Math.max(0, proxOleoKm - kmAtual);
  const diasRestantes = kmPorDia > 0 ? kmRestantes / kmPorDia : 0;
  const proxOleoData = new Date(Date.now() + diasRestantes * 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    proxOleoKm,
    proxFiltroKm,
    proxOleoData,
    kmPorDia,
    fonte: adaptKpd != null ? "adaptativa" : "padrao",
  };
}

// ============== Palavra-chave do dia ==============
export function keywordOfTheDay(
  keywords: string[],
  date: Date = new Date(),
  periodDays: number = 1,
): string {
  const list = keywords.length > 0 ? keywords : DEFAULT_GLOBAL_CONFIG.keywords;
  // seed determinístico por bloco de N dias desde uma época fixa
  const period = Math.max(1, Math.floor(periodDays));
  const epochDays = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
  const seed = Math.floor(epochDays / period);
  return list[seed % list.length];
}

// ============== Mensagens WhatsApp para atrasos ==============
export function buildAtrasoMessage(opts: {
  clienteNome: string;
  placa: string;
  modelo: string;
  kmAtual: number;
  proxOleoKm: number;
  kmAtraso: number;
  diasSemTroca?: number | null;
}): string {
  const { clienteNome, placa, modelo, kmAtual, proxOleoKm, kmAtraso, diasSemTroca } = opts;
  const linhas = [
    `Olá, ${clienteNome || "[NOME]"}! 👋`,
    "",
    `Identificamos que sua moto *${placa}*${modelo ? ` (${modelo})` : ""} está com a *troca de óleo vencida*. ⚠️`,
    "",
    `📍 *Limite era:* ${proxOleoKm.toLocaleString("pt-BR")} Km`,
    `🔴 *Km atual:* ${kmAtual.toLocaleString("pt-BR")} Km (+${kmAtraso.toLocaleString("pt-BR")} Km além do limite)`,
    ...(diasSemTroca != null
      ? [`⏱️ *Sem registro de troca há:* ${diasSemTroca} dias`]
      : []),
    "",
    `Para regularizar, por favor *envie agora uma foto do painel atualizado* mostrando o hodômetro. 📸`,
    "",
    `Após confirmação, agendaremos a troca o quanto antes para evitar danos ao motor. 🛠️`,
    "",
    `Qualquer dúvida, estamos à disposição. 🏍️`,
  ];
  return linhas.join("\n");
}

export function buildReincidenciaMessage(opts: {
  clienteNome: string;
  placa: string;
  modelo: string;
  kmAtual: number;
  proxOleoKm: number;
  kmAtraso: number;
  palavraChave: string;
  dataHoje: string; // dd/mm/aaaa
  diasSemTroca?: number | null;
  mediaAtrasoKm?: number | null;
  amostrasAtraso?: number;
}): string {
  const {
    clienteNome, placa, modelo, kmAtual, proxOleoKm, kmAtraso, palavraChave, dataHoje, diasSemTroca,
    mediaAtrasoKm, amostrasAtraso,
  } = opts;
  const linhas = [
    `Olá, ${clienteNome || "[NOME]"}! ⚠️`,
    "",
    `A moto *${placa}*${modelo ? ` (${modelo})` : ""} está com a *troca de óleo vencida*.`,
    `Para revalidar a quilometragem no sistema, será necessária uma *vistoria em vídeo* obrigatória.`,
    "",
    `📍 *Limite era:* ${proxOleoKm.toLocaleString("pt-BR")} Km`,
    `🔴 *Km atual:* ${kmAtual.toLocaleString("pt-BR")} Km (+${kmAtraso.toLocaleString("pt-BR")} Km além do limite)`,
    ...(diasSemTroca != null
      ? [`⏱️ *Sem registro de troca há:* ${diasSemTroca} dias`]
      : []),
    ...(mediaAtrasoKm != null && (amostrasAtraso ?? 0) > 0
      ? [`📊 *Média de atraso (últimas ${amostrasAtraso} trocas):* +${Math.round(mediaAtrasoKm).toLocaleString("pt-BR")} Km acima do limite`]
      : []),
    "",
    `🎥 *INSTRUÇÕES DO VÍDEO (obrigatórias):*`,
    `• Duração mínima: *1 min e 30s*`,
    `• Mostrar o *km total* do painel ligado`,
    `• Gravar *360º* da moto mostrando todos os detalhes (frente, laterais, traseira, pneus)`,
    `• No início do vídeo, *fale ou escreva* a palavra-chave do dia + a data:`,
    "",
    `🔑 *Palavra-chave de hoje:* *${palavraChave.toUpperCase()}*`,
    `📅 *Data:* ${dataHoje}`,
    "",
    `Envie o vídeo agora para revalidarmos a quilometragem no sistema e liberarmos o agendamento da troca. 🛠️`,
    "",
    `Em caso de não envio, a locação poderá ser suspensa conforme contrato.`,
  ];
  return linhas.join("\n");
}

/**
 * Calcula a média de km de atraso (acima do limite) das últimas N trocas
 * desse cliente em qualquer moto. Considera apenas trocas com desvio positivo
 * acima da janela de tolerância.
 */
export function clientAvgLateKm(
  clienteId: string | null,
  motos: Motorcycle[],
  rentals: Rental[],
  brandCfg: Record<string, BrandConfig>,
  windowKm: number,
  lastN: number = 3,
): { mediaKm: number | null; amostras: number } {
  if (!clienteId) return { mediaKm: null, amostras: 0 };
  const desvios: { data: string; dev: number }[] = [];
  for (const m of motos) {
    const cfg = brandConfigFor(m.modelo, brandCfg);
    const hist = sortedHistory(m);
    for (let i = 1; i < hist.length; i++) {
      const cId = clientForDate(m.id, hist[i].data, rentals);
      if (cId !== clienteId) continue;
      const dev = changeDeviation(hist[i - 1], hist[i], cfg.oilKm);
      if (dev > windowKm) desvios.push({ data: hist[i].data, dev });
    }
  }
  if (desvios.length === 0) return { mediaKm: null, amostras: 0 };
  desvios.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  const tail = desvios.slice(0, lastN);
  const soma = tail.reduce((acc, x) => acc + x.dev, 0);
  return { mediaKm: soma / tail.length, amostras: tail.length };
}

/**
 * Conta quantas vezes o cliente atual da moto já atrasou (desvio > windowKm)
 * em qualquer moto. Usado para detectar reincidência.
 */
export function clientLateCount(
  clienteId: string | null,
  motos: Motorcycle[],
  rentals: Rental[],
  brandCfg: Record<string, BrandConfig>,
  windowKm: number,
): number {
  if (!clienteId) return 0;
  let count = 0;
  for (const m of motos) {
    const cfg = brandConfigFor(m.modelo, brandCfg);
    const hist = sortedHistory(m);
    for (let i = 1; i < hist.length; i++) {
      const cId = clientForDate(m.id, hist[i].data, rentals);
      if (cId !== clienteId) continue;
      const dev = changeDeviation(hist[i - 1], hist[i], cfg.oilKm);
      if (dev > windowKm) count++;
    }
  }
  return count;
}

/** Util para o dialog de mensagem usar nomes prontos. */
export function clientNameById(clientes: Client[], id: string | null): string {
  if (!id) return "";
  return clientes.find((c) => c.id === id)?.nome ?? "";
}