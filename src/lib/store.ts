import { Motorcycle, Client, Rental, Fine, Maintenance, FinancialEntry } from "./types";
import { getActiveCompanyId } from "./companies";
import { isDataCacheInitialized, getDataCache, getSaveCallback } from "./data-cache";

function companyKey(base: string): string {
  return `${getActiveCompanyId()}:${base}`;
}

const MOTOS_BASE = "motos";
const CLIENTS_BASE = "clients";
const RENTALS_BASE = "rentals";
const FINES_BASE = "fines";
const MAINTENANCE_BASE = "maintenance";
const FINANCIAL_BASE = "financial";

// Motos
export function loadMotos(): Motorcycle[] {
  if (isDataCacheInitialized()) return getDataCache().motos;
  return [];
}
export function saveMotos(motos: Motorcycle[]) {
  const cb = getSaveCallback();
  if (cb) return cb("motorcycles", motos);
}

// Clients
export function loadClients(): Client[] {
  if (isDataCacheInitialized()) return getDataCache().clients;
  return [];
}
export function saveClients(data: Client[]) {
  const cb = getSaveCallback();
  if (cb) return cb("clients", data);
}

// Rentals
export function loadRentals(): Rental[] {
  if (isDataCacheInitialized()) return getDataCache().rentals;
  return [];
}
export function saveRentals(data: Rental[]) {
  const cb = getSaveCallback();
  if (cb) return cb("rentals", data);
}

// Fines
export function loadFines(): Fine[] {
  if (isDataCacheInitialized()) return getDataCache().fines;
  return [];
}
export function saveFines(data: Fine[]) {
  const cb = getSaveCallback();
  if (cb) return cb("fines", data);
}

// Maintenance
export function loadMaintenance(): Maintenance[] {
  if (isDataCacheInitialized()) return getDataCache().maintenance;
  return [];
}
export function saveMaintenance(data: Maintenance[]) {
  const cb = getSaveCallback();
  if (cb) return cb("maintenance", data);
}

// Financial
export function loadFinancial(): FinancialEntry[] {
  if (isDataCacheInitialized()) return getDataCache().financial;
  return [];
}
export function saveFinancial(data: FinancialEntry[]): Promise<void> {
  const cb = getSaveCallback();
  if (cb) return cb("financial_entries", data);
  // Rejeita explicitamente para que o chamador possa tratar o erro com catch/toast
  const err = new Error("[saveFinancial] saveFn não registrado — sessão pode ter expirado");
  console.error(err);
  return Promise.reject(err);
}

// Rastreadores config (UI config - kept in localStorage)
const RASTREADORES_BASE = "rastreadores";
const DEFAULT_RASTREADORES = ["BrasilSat", "Trackolid Pro", "Porto Leal (Branco)", "Porto Leal (Preto)"];

function loadData<T>(key: string, fallback: T): T {
  const stored = localStorage.getItem(key);
  if (stored) return JSON.parse(stored);
  return fallback;
}

function saveData<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to save to localStorage key "${key}"`, e);
  }
}

export function loadRastreadores(): string[] {
  return loadData(companyKey(RASTREADORES_BASE), DEFAULT_RASTREADORES);
}
export function saveRastreadores(data: string[]) { saveData(companyKey(RASTREADORES_BASE), data); }

// Custom financial config (categories, subcategories, tags, contas) - UI config kept in localStorage
const FIN_CONFIG_BASE = "fin_config";

export interface FinConfig {
  customCategorias: { receita: { value: string; label: string }[]; despesa: { value: string; label: string }[] };
  customSubcategorias: Record<string, string[]>;
  customTags: Record<string, string[]>;
  customContas: string[];
  removedDefaults?: { receita: string[]; despesa: string[] };
  removedSubcategorias?: Record<string, string[]>;
  removedTags?: Record<string, string[]>;
}

const defaultFinConfig: FinConfig = {
  customCategorias: { receita: [], despesa: [] },
  customSubcategorias: {},
  customTags: {},
  customContas: [],
  removedSubcategorias: {},
  removedTags: {},
};

export function loadFinConfig(): FinConfig { return loadData(companyKey(FIN_CONFIG_BASE), defaultFinConfig); }
export function saveFinConfig(data: FinConfig) { saveData(companyKey(FIN_CONFIG_BASE), data); }

// Maintenance config — oficinas pré-configuradas
const MAINT_CONFIG_BASE = "maintenance-config";

export interface Oficina {
  id: string;
  nome: string;
  endereco: string;
  responsavel: string;
}

export interface MaintenanceConfig {
  oficinas: Oficina[];
  tipos: string[];
}

const DEFAULT_TIPOS_SEED = ["Troca de Óleo", "Revisão", "Reparo", "Vistoria", "Outro"];

const defaultMaintenanceConfig: MaintenanceConfig = {
  oficinas: [],
  tipos: [...DEFAULT_TIPOS_SEED],
};

export function loadMaintenanceConfig(): MaintenanceConfig {
  const raw = loadData(companyKey(MAINT_CONFIG_BASE), defaultMaintenanceConfig) as any;
  const oficinas: Oficina[] = Array.isArray(raw.oficinas)
    ? raw.oficinas.map((o: any) =>
        typeof o === "string"
          ? { id: crypto.randomUUID(), nome: o, endereco: "", responsavel: "" }
          : o,
      )
    : [];
  // Migração: versão anterior usava DEFAULT_TIPOS fixos + customTipos separado
  let tipos: string[];
  if (Array.isArray(raw.tipos) && raw.tipos.length > 0) {
    tipos = raw.tipos;
  } else if (Array.isArray(raw.customTipos) && raw.customTipos.length > 0) {
    tipos = [...DEFAULT_TIPOS_SEED, ...raw.customTipos];
  } else {
    tipos = [...DEFAULT_TIPOS_SEED];
  }
  return { oficinas, tipos };
}
export function saveMaintenanceConfig(data: MaintenanceConfig) {
  saveData(companyKey(MAINT_CONFIG_BASE), data);
}
