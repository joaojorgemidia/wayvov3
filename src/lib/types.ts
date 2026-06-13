export interface OilChangeRecord {
  id: string;
  data: string; // ISO date
  km: number;
}

export interface Motorcycle {
  id: string;
  placa: string;
  modelo: string;
  anoFabricacao: number | null;
  anoModelo: number | null;
  cor: string;
  chassi: string;
  renavam: string;
  numMotor: string;
  aplicativo: string;
  tipo: "propria" | "terceiro";
  proprietario?: string;
  ultimaVistoria: string | null;
  ultimaTrocaOleo: string | null;
  kmTrocaOleo: number | null;
  kmAtual: number | null;
  historicoOleo: OilChangeRecord[];
  status: "disponivel" | "alugada" | "manutencao" | "inativa" | "vendida";
  dataVenda: string | null; // ISO date
  valorVenda: number | null;
  kmVenda: number | null;
  // Patrimônio
  kmCompra: number | null;
  valorCompra: number | null;
  dataCompra: string | null; // ISO date
  valorFipe: number | null;
  dataFipe: string | null; // ISO date da consulta FIPE
  lucroOperacional: number | null; // lucro acumulado com aluguéis
  decisao: "manter" | "monitorar" | "avaliar_venda" | null;
  // Documento CRLV
  crlvPdfName: string | null;
  crlvPdfData: string | null; // base64 data for download
  crlvStoragePath?: string | null;
  // Forma de aquisição
  formaCompra?: "vista" | "financiada" | "parcelada";
  valorEntrada?: number | null;
  numParcelas?: number | null;
  valorParcela?: number | null;
  parcelasPagas?: number | null;
  diaVencimento?: number | null; // dia do mês (1-31) do vencimento das parcelas
}

export interface Client {
  id: string;
  nome: string;
  cpf: string;
  cnh: string;
  cnhCategoria: string;
  cnhValidade: string | null; // ISO date
  cnhPdfName: string | null;
  cnhPdfData: string | null; // base64 data for download
  cnhStoragePath?: string | null;
  telefone: string;
  email: string;
  // Endereço detalhado
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  comprovanteEnderecoName: string | null;
  comprovanteEnderecoData: string | null; // base64 data for download
  comprovanteEnderecoStoragePath?: string | null;
  // Contatos de emergência
  emergenciaNome1: string;
  emergenciaTel1: string;
  emergenciaNome2: string;
  emergenciaTel2: string;
  observacoes: string;
  createdAt: string; // ISO date
  asaasCustomerId?: string | null;
}

export interface CaucaoParcela {
  id: string;
  valor: number;
  data: string; // ISO date
  status: "recebido" | "pendente";
}

export interface Rental {
  id: string;
  numero?: number; // auto-generated sequential number
  motoId: string;
  clienteId: string;
  vendedor: string;
  dataInicio: string; // ISO date
  horaInicio: string; // HH:mm
  dataFim: string | null; // ISO date — fim real
  dataFimContrato: string | null; // ISO date — calculada
  proximoPagamento: string | null; // ISO date
  tempoMinimoContrato: number | null; // meses
  frequenciaPagamento: "semanal" | "quinzenal" | "mensal" | "";
  /** true = locatário paga antecipado (cobrança no início do período). false = pós-pago (cobrança ao final). */
  cobrancaPrePaga: boolean;
  valorDiario: number;
  valorCaucao: number;
  caucaoPendente: boolean;
  caucaoParcelado: boolean;
  parcelasCaucao: CaucaoParcela[];
  multaAtraso: number;
  jurosAtrasoMes: number;
  localRetirada: string;
  localDevolucao: string;
  kmInicio: number;
  kmFim: number | null;
  nivelCombustivel: string;
  plano: string;
  raioCirculacao: string;
  seguroTerceiros: boolean;
  gerarCobrancaCaucao: boolean;
  gerarCobrancaPagamento: boolean;
  status: "ativa" | "finalizada" | "cancelada";
  checklistRetirada: ChecklistItem[];
  checklistDevolucao: ChecklistItem[];
  observacoes: string;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  item: string;
  ok: boolean;
  observacao: string;
}

export interface Fine {
  id: string;
  motoId: string;
  clienteId: string | null;
  rentalId: string | null;
  dataMulta: string; // ISO date
  dataNotificacao: string | null;
  valor: number;
  descricao: string;
  status: "pendente" | "paga" | "contestada" | "transferida";
  responsavel: "locadora" | "cliente";
  origem?: "manual" | "detran";
  autoInfracao?: string | null;
  codigoInfracao?: string | null;
}

export interface MaintenanceItem {
  id: string;
  classificacao?: "Reparo" | "Troca de Óleo";
  tipo: "peca" | "servico";
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

export interface Maintenance {
  id: string;
  motoId: string;
  numeroOS?: string | null;
  tipo: string;
  natureza: "corretiva" | "preventiva";
  data: string; // ISO date — entrada na oficina
  dataFim?: string | null; // ISO date — saída da oficina
  km: number | null;
  custo: number;
  descricao: string;
  fornecedor: string;
  oficina: string;
  conta: string; // conta bancária de débito da despesa
  dataPagamentoPrevisto?: string | null; // ISO date — previsão de pagamento à oficina
  pagamentoRealizado?: boolean; // se o pagamento à oficina já foi efetuado
  quemPaga: "locadora" | "locatario" | "locatario_direto";
  vincularLocatario: boolean; // false = OS não vinculada a nenhum locatário
  valorLocatario?: number | null;
  cobrarParcelado?: boolean;
  entradaLocatario?: number | null;
  numeroParcelas?: number | null;
  status: "agendada" | "em_andamento" | "concluida";
  itens: MaintenanceItem[];
}

export interface FinancialEntry {
  id: string;
  tipo: "receita" | "despesa";
  categoria: string;
  subcategoria?: string;
  descricao: string;
  valor: number;
  data: string; // ISO date — data do pagamento
  dataPrevista?: string; // ISO date — data prevista / vencimento
  dataOriginal?: string; // ISO date — data original do vencimento (preservada em reagendamentos)
  motoId: string | null;
  rentalId: string | null;
  clienteId: string | null;
  pago: boolean;
  recorrente?: boolean;
  recorrenciaTipo?: "mensal" | "semanal" | "anual" | "diario";
  recorrenciaVezes?: number;
  /** Quantas vezes por período (ex.: 3 vezes por semana). Padrão: 1. */
  recorrenciaPorPeriodo?: number;
  despesaFixa?: boolean;
  ignorada?: boolean;
  observacao?: string;
  tags?: string[];
  conta?: string; // ex: "Caixa", "Banco", "Cartão"
  natureza?: "operacional" | "administrativa" | "investimento";
  placa?: string; // placa direta (fallback quando motoId não resolve)
  clienteNome?: string; // nome do cliente direto (fallback quando clienteId não resolve)
  classificacaoManual?: boolean; // impede auditorias automáticas de sobrescrever correções manuais
  serieId?: string; // identifica recorrências da mesma série
  fixedOriginId?: string; // identifica ocorrências geradas automaticamente a partir de um lançamento fixo
  recurringGroupId?: string | null; // UUID compartilhado por TODAS as ocorrências do mesmo lote recorrente
  createdAt?: string; // data de criação do registro
  asaasPaymentId?: string | null;
  asaasStatus?: string | null; // "PENDING" | "RECEIVED" | "OVERDUE" | "REFUNDED"
  asaasBoletoUrl?: string | null;
  asaasInvoiceUrl?: string | null;
}

export interface BudgetEntry {
  id: string;
  categoria: string;
  tipo: "receita" | "despesa";
  limite: number;
  mesAno: string; // "2026-04"
}

export const DEFAULT_CHECKLIST_ITEMS = [
  "Freio dianteiro",
  "Freio traseiro",
  "Pneu dianteiro",
  "Pneu traseiro",
  "Farol",
  "Lanterna",
  "Setas",
  "Retrovisores",
  "Embreagem",
  "Acelerador",
  "Suspensão",
  "Escapamento",
  "Carenagem / Lataria",
  "Banco",
  "Chave / Ignição",
  "Documentação (CRLV)",
  "Nível de óleo",
  "Corrente / Relação",
];
