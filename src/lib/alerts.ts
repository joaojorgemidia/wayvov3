import { Motorcycle } from "@/lib/types";

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export function deadlineDate(dateStr: string | null, days: number): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export type AlertStatus = "ok" | "warning" | "danger" | "none";

export function getOilTimeStatus(moto: Motorcycle): { status: AlertStatus; label: string; diasDesde: number | null } {
  const dias = daysSince(moto.ultimaTrocaOleo);
  if (dias == null) return { status: "none", label: "Sem dados", diasDesde: null };
  if (dias > 7) return { status: "danger", label: `${dias} dias (VENCIDO)`, diasDesde: dias };
  if (dias >= 5) return { status: "warning", label: `${dias} dias`, diasDesde: dias };
  return { status: "ok", label: `${dias} dias`, diasDesde: dias };
}

export function getOilKmStatus(moto: Motorcycle): { status: AlertStatus; label: string; kmRodados: number | null } {
  if (moto.kmTrocaOleo == null || moto.kmAtual == null) return { status: "none", label: "Sem dados", kmRodados: null };
  const kmRodados = moto.kmAtual - moto.kmTrocaOleo;
  if (kmRodados >= 1000) return { status: "danger", label: `${kmRodados.toLocaleString("pt-BR")} km (VENCIDO)`, kmRodados };
  if (kmRodados >= 800) return { status: "warning", label: `${kmRodados.toLocaleString("pt-BR")} km`, kmRodados };
  return { status: "ok", label: `${kmRodados.toLocaleString("pt-BR")} km`, kmRodados };
}

export function getInspectionStatus(moto: Motorcycle): { status: AlertStatus; label: string; diasDesde: number | null; prazo: string | null } {
  const dias = daysSince(moto.ultimaVistoria);
  const prazo = deadlineDate(moto.ultimaVistoria, 45);
  if (dias == null) return { status: "none", label: "Sem dados", diasDesde: null, prazo: null };
  if (dias > 45) return { status: "danger", label: `${dias} dias (VENCIDA)`, diasDesde: dias, prazo };
  if (dias >= 35) return { status: "warning", label: `${dias} dias`, diasDesde: dias, prazo };
  return { status: "ok", label: `${dias} dias`, diasDesde: dias, prazo };
}

export function worstStatus(...statuses: AlertStatus[]): AlertStatus {
  if (statuses.includes("danger")) return "danger";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("none")) return "none";
  return "ok";
}
