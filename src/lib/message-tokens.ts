/**
 * Dicionário central de TOKENS para mensagens (WhatsApp, e-mail, contratos, etc).
 *
 * Convenção:
 *  - Token sempre entre chaves e em MAIÚSCULAS, somente ASCII (sem acentos).
 *  - Use sublinhado (_) para separar palavras compostas. Ex.: {KM_ATUAL}.
 *  - Builders abaixo recebem entidades do domínio e devolvem o mapa pronto.
 *  - Renderize com `applyTokens(template, tokens)` ou `tokenize(text, tokens)`
 *    para o caminho inverso (texto → template).
 */

import { Motorcycle, Client, Rental } from "@/lib/types";

export type TokenMap = Record<string, string>;

// ============== Catálogo de tokens (referência) ==============
/** Tokens conhecidos por domínio. Usado para documentação/autocomplete. */
export const TOKEN_CATALOG = {
  veiculo: [
    "{PLACA}",
    "{MARCA}",
    "{MODELO}",
    "{ANO}",
    "{COR}",
    "{CHASSI}",
    "{RENAVAM}",
    "{NUM_MOTOR}",
    "{KM_ATUAL}",
    "{TIPO_VEICULO}",
    "{PROPRIETARIO}",
  ],
  locacao: [
    "{NUMERO_LOCACAO}",
    "{DATA_INICIO}",
    "{HORA_INICIO}",
    "{DATA_FIM_CONTRATO}",
    "{PROXIMO_PAGAMENTO}",
    "{VALOR_DIARIO}",
    "{VALOR_CAUCAO}",
    "{PLANO}",
    "{FREQUENCIA_PAGAMENTO}",
    "{LOCAL_RETIRADA}",
    "{LOCAL_DEVOLUCAO}",
    "{KM_INICIO}",
    "{NIVEL_COMBUSTIVEL}",
    "{RAIO_CIRCULACAO}",
    "{VENDEDOR}",
  ],
  locatario: [
    "{NOME}",
    "{CPF}",
    "{TELEFONE}",
    "{EMAIL}",
    "{ENDERECO}",
    "{CEP}",
    "{CIDADE}",
    "{ESTADO}",
    "{EMERGENCIA_NOME_1}",
    "{EMERGENCIA_TEL_1}",
    "{EMERGENCIA_NOME_2}",
    "{EMERGENCIA_TEL_2}",
  ],
  condutor: [
    "{CNH}",
    "{CNH_CATEGORIA}",
    "{CNH_VALIDADE}",
  ],
  trocaOleo: [
    "{KM_TROCA}",
    "{DATA_TROCA}",
    "{PROX_OLEO_KM}",
    "{PROX_FILTRO_KM}",
    "{KM_ATRASO}",
    "{DIAS_SEM_TROCA}",
    "{MEDIA_ATRASO_KM}",
    "{AMOSTRAS_ATRASO}",
    "{PALAVRA_CHAVE}",
    "{DATA_HOJE}",
  ],
  manutencao: [
    "{CATEGORIA}",
    "{FORNECEDOR}",
    "{DATA_AGENDADA}",
  ],
  cobranca: [
    "{SEMANA_NUMERO}",
    "{SEMANA_PERIODO}",
    "{SEMANA_INICIO}",
    "{SEMANA_FIM}",
    "{SEMANAS_PAGAS}",
    "{SEMANAS_PENDENTES}",
    "{SEMANAS_TOTAL}",
    "{VALOR_COBRANCA}",
    "{DATA_VENCIMENTO}",
    "{DATA_PAGAMENTO}",
    "{DIAS_ATRASO}",
    "{ATRASO_TEXTO}",
    "{MULTA_ATRASO}",
    "{JUROS_DEVIDO}",
    "{JUROS_PAGOS}",
    "{JUROS_PENDENTES}",
    "{COBRANCA_TIPO}",
  ],
} as const;

// ============== Descrições amigáveis dos tokens ==============
export const TOKEN_DESCRIPTIONS: Record<string, string> = {
  // Veículo
  "{PLACA}": "Placa da moto",
  "{MARCA}": "Marca (Honda, Yamaha…)",
  "{MODELO}": "Modelo da moto",
  "{ANO}": "Ano/modelo",
  "{COR}": "Cor",
  "{CHASSI}": "Chassi",
  "{RENAVAM}": "Renavam",
  "{NUM_MOTOR}": "Número do motor",
  "{KM_ATUAL}": "Km atual da moto",
  "{TIPO_VEICULO}": "Própria ou Terceiro",
  "{PROPRIETARIO}": "Proprietário (se terceiro)",
  // Locação
  "{NUMERO_LOCACAO}": "Número da locação",
  "{DATA_INICIO}": "Data de início da locação",
  "{HORA_INICIO}": "Hora de início",
  "{DATA_FIM_CONTRATO}": "Data fim do contrato",
  "{PROXIMO_PAGAMENTO}": "Próximo pagamento",
  "{VALOR_DIARIO}": "Valor diário",
  "{VALOR_CAUCAO}": "Valor da caução",
  "{PLANO}": "Plano (Aluguel / Moto no Final)",
  "{FREQUENCIA_PAGAMENTO}": "Frequência de pagamento",
  "{LOCAL_RETIRADA}": "Local de retirada",
  "{LOCAL_DEVOLUCAO}": "Local de devolução",
  "{KM_INICIO}": "Km inicial da locação",
  "{NIVEL_COMBUSTIVEL}": "Nível de combustível na retirada",
  "{RAIO_CIRCULACAO}": "Raio de circulação permitido",
  "{VENDEDOR}": "Vendedor responsável",
  // Locatário
  "{NOME}": "Nome do locatário",
  "{CPF}": "CPF do locatário",
  "{TELEFONE}": "Telefone do locatário",
  "{EMAIL}": "E-mail do locatário",
  "{ENDERECO}": "Endereço completo",
  "{CEP}": "CEP",
  "{CIDADE}": "Cidade",
  "{ESTADO}": "Estado (UF)",
  "{EMERGENCIA_NOME_1}": "Contato de emergência 1 — nome",
  "{EMERGENCIA_TEL_1}": "Contato de emergência 1 — telefone",
  "{EMERGENCIA_NOME_2}": "Contato de emergência 2 — nome",
  "{EMERGENCIA_TEL_2}": "Contato de emergência 2 — telefone",
  // Condutor
  "{CNH}": "Número da CNH",
  "{CNH_CATEGORIA}": "Categoria da CNH",
  "{CNH_VALIDADE}": "Validade da CNH",
  // Troca de óleo
  "{KM_TROCA}": "Km registrado na troca",
  "{DATA_TROCA}": "Data da troca",
  "{PROX_OLEO_KM}": "Km da próxima troca de óleo",
  "{PROX_FILTRO_KM}": "Km da próxima troca de filtro",
  "{KM_ATRASO}": "Km além do limite (atraso)",
  "{DIAS_SEM_TROCA}": "Dias desde a última troca",
  "{MEDIA_ATRASO_KM}": "Média de atraso (km) das últimas trocas",
  "{AMOSTRAS_ATRASO}": "Quantas trocas usadas na média",
  "{PALAVRA_CHAVE}": "Palavra-chave do dia (anti-fraude)",
  "{DATA_HOJE}": "Data de hoje",
  // Manutenção
  "{CATEGORIA}": "Categoria/tipo da manutenção (Revisão, Reparo, etc.)",
  "{FORNECEDOR}": "Fornecedor / oficina responsável",
  "{DATA_AGENDADA}": "Data agendada da manutenção",
  // Cobrança
  "{SEMANA_NUMERO}": "Número da semana cobrada (1ª, 2ª…)",
  "{SEMANA_PERIODO}": "Período da semana (ex.: 26/05 a 01/06)",
  "{SEMANA_INICIO}": "Início do período da semana",
  "{SEMANA_FIM}": "Fim do período da semana",
  "{SEMANAS_PAGAS}": "Quantidade de semanas pagas pelo locatário",
  "{SEMANAS_PENDENTES}": "Quantidade de semanas pendentes",
  "{SEMANAS_TOTAL}": "Total de semanas cobradas (pagas + pendentes)",
  "{VALOR_COBRANCA}": "Valor da cobrança/parcela",
  "{DATA_VENCIMENTO}": "Data de vencimento da cobrança",
  "{DATA_PAGAMENTO}": "Data em que o pagamento foi efetivado",
  "{DIAS_ATRASO}": "Dias em atraso (calculado pela data do pagamento)",
  "{ATRASO_TEXTO}": "Texto do atraso (ex.: 3 dias)",
  "{MULTA_ATRASO}": "Multa por atraso (R$)",
  "{JUROS_DEVIDO}": "Total de juros + multa devidos",
  "{JUROS_PAGOS}": "Juros/multa já pagos no recebimento",
  "{JUROS_PENDENTES}": "Juros/multa ainda em aberto",
  "{COBRANCA_TIPO}": "Tipo de cobrança (Pré-paga / Pós-paga)",
};

// ============== Contextos por etapa ==============
/**
 * Define quais grupos de tokens aparecem em cada contexto/etapa do sistema.
 * Usado pelo componente TokenPalette para filtrar a paleta exibida ao usuário.
 */
export type TokenContext =
  | "troca-oleo"
  | "manutencao"
  | "vistoria"
  | "locacao"
  | "multa"
  | "cobranca"
  | "geral";

export const CONTEXT_GROUPS: Record<TokenContext, (keyof typeof TOKEN_CATALOG)[]> = {
  "troca-oleo": ["locatario", "veiculo", "trocaOleo"],
  manutencao:   ["locatario", "veiculo", "manutencao", "locacao"],
  vistoria:     ["locatario", "veiculo", "locacao", "trocaOleo"],
  locacao:      ["locatario", "condutor", "veiculo", "locacao"],
  multa:        ["locatario", "condutor", "veiculo", "locacao"],
  cobranca:     ["locatario", "locacao", "cobranca"],
  geral:        ["locatario", "condutor", "veiculo", "locacao", "trocaOleo", "manutencao", "cobranca"],
};

export const GROUP_LABELS: Record<keyof typeof TOKEN_CATALOG, string> = {
  veiculo: "Veículo",
  locacao: "Locação",
  locatario: "Locatário",
  condutor: "Condutor",
  trocaOleo: "Troca de Óleo",
  manutencao: "Manutenção",
  cobranca: "Cobrança",
};

/** Retorna os grupos de tokens (com label, lista, descrição e valor preenchido)
 *  para um contexto, considerando o mapa de valores atuais. */
export function tokensByContext(
  ctx: TokenContext,
  values: TokenMap = {},
): { group: string; label: string; items: { token: string; description: string; value: string }[] }[] {
  return CONTEXT_GROUPS[ctx].map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: TOKEN_CATALOG[group].map((token) => ({
      token,
      description: TOKEN_DESCRIPTIONS[token] ?? "",
      value: values[token] ?? "",
    })),
  }));
}

// ============== Helpers de formatação ==============
const fmtKm = (n: number | null | undefined) =>
  n == null ? "" : `${n.toLocaleString("pt-BR")} Km`;

const fmtNumber = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("pt-BR");

const fmtMoney = (n: number | null | undefined) =>
  n == null
    ? ""
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
};

/** Detecta marca a partir do nome do modelo (Honda, Yamaha, etc). */
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

// ============== Builders por entidade ==============

/** Tokens de um veículo (Motocicleta). */
export function vehicleTokens(m?: Motorcycle | null): TokenMap {
  if (!m) return {};
  return {
    "{PLACA}": m.placa ?? "",
    "{MARCA}": detectMarca(m.modelo ?? ""),
    "{MODELO}": m.modelo ?? "",
    "{ANO}": m.anoModelo != null ? String(m.anoModelo) : "",
    "{COR}": m.cor ?? "",
    "{CHASSI}": m.chassi ?? "",
    "{RENAVAM}": m.renavam ?? "",
    "{NUM_MOTOR}": m.numMotor ?? "",
    "{KM_ATUAL}": fmtNumber(m.kmAtual),
    "{TIPO_VEICULO}": m.tipo === "terceiro" ? "Terceiro" : "Própria",
    "{PROPRIETARIO}": m.proprietario ?? "",
  };
}

/** Tokens de uma locação. */
export function rentalTokens(r?: Rental | null): TokenMap {
  if (!r) return {};
  return {
    "{NUMERO_LOCACAO}": r.numero != null ? String(r.numero) : "",
    "{DATA_INICIO}": fmtDate(r.dataInicio),
    "{HORA_INICIO}": r.horaInicio ?? "",
    "{DATA_FIM_CONTRATO}": fmtDate(r.dataFimContrato),
    "{PROXIMO_PAGAMENTO}": fmtDate(r.proximoPagamento),
    "{VALOR_DIARIO}": fmtMoney(r.valorDiario),
    "{VALOR_CAUCAO}": fmtMoney(r.valorCaucao),
    "{PLANO}": r.plano === "moto_no_final" ? "Moto no Final" : r.plano === "aluguel" ? "Aluguel" : "",
    "{FREQUENCIA_PAGAMENTO}": r.frequenciaPagamento ?? "",
    "{LOCAL_RETIRADA}": r.localRetirada ?? "",
    "{LOCAL_DEVOLUCAO}": r.localDevolucao ?? "",
    "{KM_INICIO}": fmtNumber(r.kmInicio),
    "{NIVEL_COMBUSTIVEL}": r.nivelCombustivel ?? "",
    "{RAIO_CIRCULACAO}": r.raioCirculacao ?? "",
    "{VENDEDOR}": r.vendedor ?? "",
  };
}

/** Tokens do locatário (cliente). */
export function clientTokens(c?: Client | null): TokenMap {
  if (!c) return {};
  const endereco = [
    c.rua,
    c.numero ? `nº ${c.numero}` : "",
    c.complemento,
    c.bairro,
    c.cidade && c.estado ? `${c.cidade}/${c.estado}` : c.cidade || c.estado,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    "{NOME}": c.nome ?? "",
    "{CPF}": c.cpf ?? "",
    "{TELEFONE}": c.telefone ?? "",
    "{EMAIL}": c.email ?? "",
    "{ENDERECO}": endereco,
    "{CEP}": c.cep ?? "",
    "{CIDADE}": c.cidade ?? "",
    "{ESTADO}": c.estado ?? "",
    "{EMERGENCIA_NOME_1}": c.emergenciaNome1 ?? "",
    "{EMERGENCIA_TEL_1}": c.emergenciaTel1 ?? "",
    "{EMERGENCIA_NOME_2}": c.emergenciaNome2 ?? "",
    "{EMERGENCIA_TEL_2}": c.emergenciaTel2 ?? "",
  };
}

/** Tokens do condutor (CNH do cliente). */
export function driverTokens(c?: Client | null): TokenMap {
  if (!c) return {};
  return {
    "{CNH}": c.cnh ?? "",
    "{CNH_CATEGORIA}": c.cnhCategoria ?? "",
    "{CNH_VALIDADE}": fmtDate(c.cnhValidade),
  };
}

/** Dados específicos de uma operação de troca de óleo. */
export interface OilEventInput {
  kmTroca?: number | null;
  dataTroca?: string | null;
  proxOleoKm?: number | null;
  proxFiltroKm?: number | null;
  kmAtraso?: number | null;
  diasSemTroca?: number | null;
  mediaAtrasoKm?: number | null;
  amostrasAtraso?: number | null;
  palavraChave?: string | null;
  dataHoje?: string | null;
}

/** Tokens da troca de óleo (atraso ou sucesso). */
export function oilTokens(e?: OilEventInput | null): TokenMap {
  if (!e) return {};
  return {
    "{KM_TROCA}": fmtNumber(e.kmTroca),
    "{DATA_TROCA}": fmtDate(e.dataTroca),
    "{PROX_OLEO_KM}": fmtNumber(e.proxOleoKm),
    "{PROX_FILTRO_KM}": fmtNumber(e.proxFiltroKm),
    "{KM_ATRASO}": fmtNumber(e.kmAtraso),
    "{DIAS_SEM_TROCA}": e.diasSemTroca != null ? String(e.diasSemTroca) : "",
    "{MEDIA_ATRASO_KM}":
      e.mediaAtrasoKm != null ? Math.round(e.mediaAtrasoKm).toLocaleString("pt-BR") : "",
    "{AMOSTRAS_ATRASO}": e.amostrasAtraso != null ? String(e.amostrasAtraso) : "",
    "{PALAVRA_CHAVE}": (e.palavraChave ?? "").toUpperCase(),
    "{DATA_HOJE}": e.dataHoje ?? "",
  };
}

/** Dados específicos de uma cobrança/parcela. */
export interface CobrancaEventInput {
  semanaNumero?: number | null;
  semanaInicio?: string | null;
  semanaFim?: string | null;
  semanasPagas?: number | null;
  semanasPendentes?: number | null;
  semanasTotal?: number | null;
  valorCobranca?: number | null;
  dataVencimento?: string | null;
  diasAtraso?: number | null;
  cobrancaPrePaga?: boolean | null;
  /** Multa/juros calculados com base na data de pagamento informada. */
  multaAtraso?: number | null;
  jurosDevido?: number | null;
  jurosPago?: number | null;
  jurosPendente?: number | null;
  dataPagamento?: string | null;
}

/** Tokens de uma cobrança (semana, status pagamento, etc.). */
export function cobrancaTokens(e?: CobrancaEventInput | null): TokenMap {
  if (!e) return {};
  const ini = fmtDate(e.semanaInicio);
  const fim = fmtDate(e.semanaFim);
  const periodo = ini && fim ? `${ini} a ${fim}` : ini || fim || "";
  const atrasoTxt =
    e.diasAtraso != null && e.diasAtraso > 0
      ? `${e.diasAtraso} ${e.diasAtraso === 1 ? "dia" : "dias"}`
      : "";
  return {
    "{SEMANA_NUMERO}": e.semanaNumero != null ? `${e.semanaNumero}ª` : "",
    "{SEMANA_PERIODO}": periodo,
    "{SEMANA_INICIO}": ini,
    "{SEMANA_FIM}": fim,
    "{SEMANAS_PAGAS}": e.semanasPagas != null ? String(e.semanasPagas) : "",
    "{SEMANAS_PENDENTES}": e.semanasPendentes != null ? String(e.semanasPendentes) : "",
    "{SEMANAS_TOTAL}": e.semanasTotal != null ? String(e.semanasTotal) : "",
    "{VALOR_COBRANCA}": fmtMoney(e.valorCobranca),
    "{DATA_VENCIMENTO}": fmtDate(e.dataVencimento),
    "{DATA_PAGAMENTO}": fmtDate(e.dataPagamento),
    "{DIAS_ATRASO}": e.diasAtraso != null ? String(e.diasAtraso) : "",
    "{ATRASO_TEXTO}": atrasoTxt,
    "{MULTA_ATRASO}": fmtMoney(e.multaAtraso),
    "{JUROS_DEVIDO}": fmtMoney(e.jurosDevido),
    "{JUROS_PAGOS}": fmtMoney(e.jurosPago),
    "{JUROS_PENDENTES}": fmtMoney(e.jurosPendente),
    "{COBRANCA_TIPO}":
      e.cobrancaPrePaga == null ? "" : e.cobrancaPrePaga ? "Pré-paga" : "Pós-paga",
  };
}

// ============== Composição & render ==============

/** Junta múltiplos mapas — o último vence em caso de chave repetida. */
export function mergeTokens(...maps: (TokenMap | undefined | null)[]): TokenMap {
  const out: TokenMap = {};
  for (const m of maps) if (m) Object.assign(out, m);
  return out;
}

/** Substitui placeholders ({TOKEN}) pelos valores atuais. */
export function applyTokens(template: string, tokens: TokenMap): string {
  let out = template;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(value ?? "");
  }
  return out;
}

/** Caminho inverso: substitui valores conhecidos por placeholders.
 *  Ordena do valor mais longo para o mais curto para evitar colisões. */
export function tokenize(text: string, tokens: TokenMap): string {
  let out = text;
  const entries = Object.entries(tokens)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [token, value] of entries) {
    out = out.split(value).join(token);
  }
  return out;
}

/** Atalho: monta o conjunto completo (Veículo + Locação + Locatário + Condutor + Troca de Óleo + Cobrança). */
export function buildAllTokens(args: {
  moto?: Motorcycle | null;
  rental?: Rental | null;
  cliente?: Client | null;
  oil?: OilEventInput | null;
  cobranca?: CobrancaEventInput | null;
}): TokenMap {
  return mergeTokens(
    vehicleTokens(args.moto ?? null),
    rentalTokens(args.rental ?? null),
    clientTokens(args.cliente ?? null),
    driverTokens(args.cliente ?? null),
    oilTokens(args.oil ?? null),
    cobrancaTokens(args.cobranca ?? null),
  );
}