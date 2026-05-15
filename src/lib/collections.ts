/**
 * Sistema de cobranças / follow-ups.
 *
 * Conceitos:
 *  - Régua: configuração POR MÓDULO de quantas etapas existem, quantos
 *    dias após o vencimento cada etapa dispara, e qual o template padrão
 *    da mensagem.
 *  - Follow-up: registro de envio de uma etapa para uma pendência específica.
 *  - Pendência: qualquer entidade vencida (pagamento, multa, óleo, vistoria,
 *    manutenção) ainda não regularizada.
 *
 * Modo de disparo: SINALIZAÇÃO automática + ENVIO manual.
 * O sistema apenas calcula qual etapa deveria estar pendente hoje. O
 * usuário ainda clica num dos 3 botões (copiar mensagem / copiar telefone /
 * enviar WhatsApp) para registrar que a ação foi feita.
 */

export type CollectionModule =
  | "pagamento"
  | "multa"
  | "outras_receitas"
  | "oleo"
  | "vistoria"
  | "manutencao";

export type FollowupChannel = "whatsapp" | "copy_msg" | "copy_phone" | "manual";

export interface CollectionStage {
  stage: number;        // 1, 2, 3...
  offset_days: number;  // dias após o vencimento
  template: string;     // mensagem padrão (aceita tokens {NOME}, etc.)
}

export interface CollectionRule {
  id?: string;
  company_id: string;
  module: CollectionModule;
  enabled: boolean;
  stages: CollectionStage[];
}

export interface CollectionFollowup {
  id: string;
  company_id: string;
  module: CollectionModule;
  entity_id: string;
  cliente_id: string | null;
  moto_id: string | null;
  stage_number: number;
  channel: FollowupChannel;
  message_snapshot: string;
  sent_at: string;
  sent_by: string | null;
  regularized_at: string | null;
  escalated: boolean;
  created_at: string;
}

export const MODULE_LABELS: Record<CollectionModule, string> = {
  pagamento: "Aluguel",
  multa: "Multas de trânsito",
  outras_receitas: "Outras receitas",
  oleo: "Troca de Óleo",
  vistoria: "Vistoria",
  manutencao: "Manutenção",
};

/** Régua padrão (3 etapas) sugerida para cada módulo. */
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
  return {
    company_id: companyId,
    module,
    enabled: true,
    stages: DEFAULT_STAGES[module],
  };
}

/** Diferença em dias inteiros entre hoje e a data de vencimento (ISO). */
export function daysOverdue(dueDateISO: string | null | undefined, today = new Date()): number {
  if (!dueDateISO) return 0;
  const due = new Date(dueDateISO.length === 10 ? dueDateISO + "T00:00:00" : dueDateISO);
  if (Number.isNaN(due.getTime())) return 0;
  const ms = today.getTime() - due.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Dada uma régua e os dias em atraso, retorna a etapa MÁXIMA que já deveria
 * ter sido disparada. 0 = ainda não atingiu a 1ª etapa.
 */
export function expectedStage(rule: CollectionRule, daysLate: number): number {
  if (!rule.enabled || rule.stages.length === 0) return 0;
  let max = 0;
  for (const s of rule.stages) {
    if (daysLate >= s.offset_days) max = Math.max(max, s.stage);
  }
  return max;
}

/** Última etapa registrada (não regularizada) para uma entidade. */
export function lastSentStage(followups: CollectionFollowup[], module: CollectionModule, entityId: string): number {
  return followups
    .filter((f) => f.module === module && f.entity_id === entityId && !f.regularized_at)
    .reduce((max, f) => Math.max(max, f.stage_number), 0);
}

/**
 * "Alerta Máximo": a pendência só é considerada escalada quando TODAS as
 * etapas configuradas já foram efetivamente enviadas e o item segue sem
 * regularização. Apenas estar atrasado não basta — precisa ter histórico de
 * follow-ups completo.
 */
export function isEscalated(rule: CollectionRule, sentStage: number): boolean {
  if (rule.stages.length === 0) return false;
  return sentStage >= rule.stages.length;
}

export function stageLabel(stageNumber: number, total: number): string {
  if (stageNumber <= 0) return "Aguardando vencimento";
  return `${stageNumber}º follow-up enviado`;
}

export interface PendingItem {
  module: CollectionModule;
  entityId: string;
  clienteId: string | null;
  motoId: string | null;
  descricao: string;
  dueDateISO: string | null;
  daysLate: number;
  expectedStage: number;
  sentStage: number;
  escalated: boolean;
  /** etapa que o usuário deveria disparar agora (próxima após sentStage, limitada à expectedStage) */
  nextStage: number;
  totalStages: number;
  template: string;
  /** valor em R$ quando aplicável (pagamento, multa, manutenção). */
  valor?: number;
  /** rótulo da categoria/subtipo (ex.: Aluguel, Caução, Outra receita). */
  categoriaLabel?: string;
}