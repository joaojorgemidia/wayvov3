export interface AsaasConfig {
  apiKey?: string;                // chave de API da conta Asaas desta empresa
  enabled: boolean;
  multaAtraso: number;
  jurosAtrasoMes: number;
  descontoEnabled: boolean;
  descontoValor: number;
  descontoDias: number;
  notifyDaysBefore: number;       // 0 = desativado
  notifyOnDueDate: boolean;
  notifyDaysAfterDelay: number;   // 0 = desativado
}

export const DEFAULT_ASAAS_CONFIG: AsaasConfig = {
  enabled: false,
  multaAtraso: 0,
  jurosAtrasoMes: 0,
  descontoEnabled: false,
  descontoValor: 0,
  descontoDias: 0,
  notifyDaysBefore: 2,
  notifyOnDueDate: false,
  notifyDaysAfterDelay: 0,
};

export interface DetranConfig {
  login: string;
  senhaHash: string; // armazenado como recebido do usuário, protegido por RLS
}

export interface CobrancaConfig {
  multaAtraso: number;   // R$ fixos por atraso
  jurosDiario: number;   // R$ por dia de atraso
  jurosMes: number;      // % ao mês (usado quando a locação não tem juros próprio)
}

export const DEFAULT_COBRANCA_CONFIG: CobrancaConfig = {
  multaAtraso: 15,
  jurosDiario: 7,
  jurosMes: 0,
};

export interface Company {
  id: string;
  nome: string;
  cnpj: string;
  asaasConfig?: AsaasConfig | null;
  detranConfig?: DetranConfig | null;
  cobrancaConfig?: CobrancaConfig | null;
}

const COMPANIES_KEY = "moto-fleet-companies-v1";
const ACTIVE_COMPANY_KEY = "moto-fleet-active-company";

export function loadCompanies(): Company[] {
  const stored = localStorage.getItem(COMPANIES_KEY);
  if (stored) {
    try {
      const parsed: Company[] = JSON.parse(stored);
      // Filter out legacy hardcoded placeholder IDs that no longer match real data
      return parsed.filter(c => c.id !== "motovia" && c.id !== "loca2rodas");
    } catch {
      return [];
    }
  }
  return [];
}

export function saveCompanies(companies: Company[]) {
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(companies));
}

export function getActiveCompanyId(): string {
  return localStorage.getItem(ACTIVE_COMPANY_KEY) || "";
}

export function setActiveCompanyId(id: string) {
  localStorage.setItem(ACTIVE_COMPANY_KEY, id);
}

export function getCompanyFeatureFlags(companyId: string) {
  return {
    applyCompraMotoCorrections: companyId === "motovia",
    filterImportedEntries: companyId === "loca2rodas",
  };
}
