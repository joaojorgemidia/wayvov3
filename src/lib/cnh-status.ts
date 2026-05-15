import { Client } from "./types";

export type CnhIssue = "vencida" | "vence_em_breve" | "sem_categoria_a" | "sem_validade" | "sem_cnh";

export interface CnhStatus {
  issues: CnhIssue[];
  hasBlocker: boolean; // vencida ou sem categoria A → impede locação de moto
  daysToExpire: number | null;
  label: string; // mensagem curta para exibir
}

/** Verifica se a categoria da CNH habilita motocicleta (categoria A ou combinações como AB, AC, AD, AE). */
export function categoriaHabilitaMoto(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return /a/i.test(categoria);
}

/**
 * Avalia o status da CNH de um cliente para fins de locação de motocicleta.
 * Regras:
 * - vencida: cnhValidade < hoje
 * - vence_em_breve: cnhValidade <= hoje + 30 dias
 * - sem_categoria_a: categoria não inclui "A"
 */
export function getCnhStatus(client: Pick<Client, "cnh" | "cnhCategoria" | "cnhValidade"> | null | undefined): CnhStatus {
  const issues: CnhIssue[] = [];
  let daysToExpire: number | null = null;

  if (!client || !client.cnh?.trim()) {
    return { issues: ["sem_cnh"], hasBlocker: true, daysToExpire: null, label: "CNH não cadastrada" };
  }

  if (!categoriaHabilitaMoto(client.cnhCategoria)) {
    issues.push("sem_categoria_a");
  }

  if (!client.cnhValidade) {
    issues.push("sem_validade");
  } else {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const validade = new Date(client.cnhValidade + "T00:00:00");
    const diff = Math.floor((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    daysToExpire = diff;
    if (diff < 0) issues.push("vencida");
    else if (diff <= 30) issues.push("vence_em_breve");
  }

  const hasBlocker = issues.includes("vencida") || issues.includes("sem_categoria_a") || issues.includes("sem_cnh");
  const labels: string[] = [];
  if (issues.includes("sem_categoria_a")) labels.push("não habilitado p/ moto (cat. A)");
  if (issues.includes("vencida")) labels.push(`CNH vencida há ${Math.abs(daysToExpire ?? 0)} dia(s)`);
  else if (issues.includes("vence_em_breve")) labels.push(`CNH vence em ${daysToExpire} dia(s)`);
  if (issues.includes("sem_validade")) labels.push("CNH sem validade informada");

  return { issues, hasBlocker, daysToExpire, label: labels.join(" · ") };
}