import {
  DollarSign, Wrench, Shield, FileText, Car, Package, CreditCard, Wallet, ArrowLeftRight,
} from "lucide-react";

export const CATEGORY_LABEL_TO_VALUE: Record<string, string> = {
  "Aluguel": "aluguel",
  "Caução": "caucao",
  "Manutenção": "manutencao_receita",
  "Multa de Trânsito": "multa_transito_receita",
  "Venda de Moto": "venda_moto",
  "Peças": "pecas_receita",
  "Juros por Atraso": "juros_atraso",
  "Outros": "outro_receita",
  "Compra de Moto": "compra_moto",
  "Peças e Manutenção": "manutencao_despesa",
  "Seguro": "seguro",
  "Rastreador": "rastreador",
  "Multas de Trânsito": "multa_transito",
  "Imposto": "imposto",
  "Sistema": "sistema",
  "Equipe": "equipe",
  "Marketing": "marketing",
  "Lava-Jato": "lava_jato",
  "Lava-jato": "lava_jato",
  "Taxas": "taxas",
  "Assinaturas": "assinaturas",
};

export const CATEGORY_LABEL_TO_VALUE_DESPESA: Record<string, string> = {
  "Manutenção": "manutencao_despesa",
  "Multa de Trânsito": "multa_transito",
  "Outros": "outro_despesa",
  "Peças": "manutencao_despesa",
};

export const CATEGORY_SIBLINGS: Record<string, string[]> = {
  manutencao_receita: ["manutencao_receita", "manutencao_despesa"],
  manutencao_despesa: ["manutencao_receita", "manutencao_despesa"],
  multa_transito_receita: ["multa_transito_receita", "multa_transito"],
  multa_transito: ["multa_transito_receita", "multa_transito"],
  outro_receita: ["outro_receita", "outro_despesa"],
  outro_despesa: ["outro_receita", "outro_despesa"],
  pecas_receita: ["pecas_receita"],
};

export const DEFAULT_CATEGORIAS = {
  receita: [
    { value: "aluguel", label: "Aluguel", icon: Car },
    { value: "caucao", label: "Caução", icon: Shield },
    { value: "manutencao_receita", label: "Manutenção", icon: Wrench },
    { value: "multa_transito_receita", label: "Multa de Trânsito", icon: FileText },
    { value: "venda_moto", label: "Venda de Moto", icon: Package },
    { value: "pecas_receita", label: "Peças", icon: Package },
    { value: "juros_atraso", label: "Juros por Atraso", icon: DollarSign },
    { value: "ajuste_saldo", label: "Ajuste de Saldo", icon: ArrowLeftRight },
    { value: "transferencia", label: "Transferência", icon: ArrowLeftRight },
    { value: "outro_receita", label: "Outros", icon: DollarSign },
  ],
  despesa: [
    { value: "compra_moto", label: "Compra de Moto", icon: Package },
    { value: "manutencao_despesa", label: "Manutenção", icon: Wrench },
    { value: "seguro", label: "Seguro", icon: Shield },
    { value: "rastreador", label: "Rastreador", icon: Car },
    { value: "multa_transito", label: "Multa de Trânsito", icon: FileText },
    { value: "imposto", label: "Imposto", icon: FileText },
    { value: "sistema", label: "Sistema", icon: CreditCard },
    { value: "equipe", label: "Equipe", icon: Wallet },
    { value: "marketing", label: "Marketing", icon: DollarSign },
    { value: "lava_jato", label: "Lava-jato", icon: Car },
    { value: "taxas", label: "Taxas", icon: CreditCard },
    { value: "assinaturas", label: "Assinaturas", icon: CreditCard },
    { value: "ajuste_saldo", label: "Ajuste de Saldo", icon: ArrowLeftRight },
    { value: "fatura_cartao", label: "Fatura de Cartão", icon: CreditCard },
    { value: "transferencia", label: "Transferência", icon: ArrowLeftRight },
    { value: "outro_despesa", label: "Outros", icon: DollarSign },
  ],
};

/** Categorias geradas automaticamente pelo sistema — sempre exibidas, não podem ser removidas. */
export const SYSTEM_CATEGORY_VALUES = new Set([
  "aluguel",
  "caucao",
  "juros_atraso",
  "transferencia",
  "fatura_cartao",
  "ajuste_saldo",
  "compra_moto",
  "venda_moto",
  "manutencao_receita",
  "manutencao_despesa",
]);

export const DEFAULT_SUBCATEGORIAS: Record<string, string[]> = {
  manutencao_receita: ["Corretiva", "Preventiva"],
  compra_moto: ["Financiamento", "Parcelamento"],
  manutencao_despesa: ["Corretiva", "Preventiva"],
  imposto: ["MEI", "IPVA", "Licenciamento", "CRLV"],
  equipe: ["Pró Labore", "Transporte", "Alimentação", "Folha de Pagamento"],
  marketing: ["Tráfego Pago", "Brindes"],
  taxas: ["Administradora de Cobranças", "Taxa Asaas", "Taxa de boleto", "Taxa de mensageria", "Taxa de transferência", "Taxa de antecipação", "Taxa PIX"],
};

export const DEFAULT_TAGS: Record<string, string[]> = {
  aluguel: ["Semanal", "Quinzenal", "Mensal", "Adiantamento", "Velo Bank"],
  caucao: ["Entrada", "Renovação"],
  manutencao_receita: ["Sinistro", "Custo Compartilhado"],
  multa_transito_receita: ["Recuperada", "Renainf"],
  venda_moto: ["À Vista", "Parcelado"],
  pecas_receita: ["Estoque", "Avulsa"],
  juros_atraso: ["Semanal", "Mensal"],
  compra_moto: ["Pan", "Bradesco", "C6", "Parcela", "Entrada", "Detran", "Cartório", "Vistoria"],
  seguro: ["Mensal", "Anual", "Tokio Marine"],
  rastreador: ["Mensalidade", "Instalação", "Brasilsat", "Airtag"],
  manutencao_despesa: ["Pneu", "Freio", "Elétrica", "Funilaria", "Motor", "Suspensão", "Óleo", "Filtro", "Correia", "Revisão"],
  multa_transito: ["Absorvida", "Não Recuperada"],
  lava_jato: ["Higienização", "Entrega"],
  equipe: ["Salário", "Freelancer", "Comissão"],
  sistema: ["Velo", "Consulta de Antecedentes"],
  marketing: ["Meta Ads", "Google Ads"],
  "marketing:Tráfego Pago": ["Meta Ads", "Google Ads"],
  imposto: ["Das MEI", "Parcelamento MEI"],
  taxas: ["Detran", "Cartório"],
  assinaturas: ["Mensal", "Anual"],
};

export const CATEGORY_COLORS = [
  "hsl(220, 70%, 50%)", "hsl(150, 60%, 40%)", "hsl(38, 92%, 50%)",
  "hsl(280, 60%, 50%)", "hsl(0, 72%, 51%)", "hsl(180, 60%, 40%)",
  "hsl(320, 60%, 50%)", "hsl(60, 70%, 45%)", "hsl(200, 70%, 50%)",
  "hsl(100, 50%, 45%)",
];
