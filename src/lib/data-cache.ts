/**
 * Global data cache bridge.
 * 
 * The DataProvider populates this cache from the database.
 * The existing store.ts load/save functions read/write to this cache
 * instead of localStorage, making all pages work with the database
 * without any page-level changes.
 */

import { useSyncExternalStore } from "react";
import type { Motorcycle, Client, Rental, Fine, Maintenance, FinancialEntry } from "@/lib/types";
import { maskClient, maskMoto, maskRental, maskFine, maskMaintenance, maskFinancial } from "@/lib/privacy-mask";

export interface BankAccountData {
  id: string;
  nome: string;
  banco: string;
  saldoInicial: number;
  tipo?: "banco" | "cartao";
  diaFechamento?: number | null;
  diaVencimento?: number | null;
  limite?: number;
  contaPagamento?: string | null;
  bandeira?: string | null;
  descricao?: string | null;
}

interface DataCache {
  motos: Motorcycle[];
  clients: Client[];
  rentals: Rental[];
  fines: Fine[];
  maintenance: Maintenance[];
  financial: FinancialEntry[];
  bankAccounts: BankAccountData[];
  initialized: boolean;
}

// Global mutable cache
const cache: DataCache = {
  motos: [],
  clients: [],
  rentals: [],
  fines: [],
  maintenance: [],
  financial: [],
  bankAccounts: [],
  initialized: false,
};

// Callbacks for persisting changes back to the database
type SaveCallback = (table: string, items: any[]) => Promise<void>;
type BulkInsertCallback = (table: string, items: any[]) => Promise<void>;
let _onSave: SaveCallback | null = null;
let _onBulkInsert: BulkInsertCallback | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notifyCacheChange() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDataCache(data: Partial<DataCache>) {
  if (data.motos !== undefined) cache.motos = data.motos;
  if (data.clients !== undefined) cache.clients = data.clients;
  if (data.rentals !== undefined) cache.rentals = data.rentals;
  if (data.fines !== undefined) cache.fines = data.fines;
  if (data.maintenance !== undefined) cache.maintenance = data.maintenance;
  if (data.financial !== undefined) cache.financial = data.financial;
  if (data.bankAccounts !== undefined) cache.bankAccounts = data.bankAccounts;
  cache.initialized = true;
  notifyCacheChange();
}

export function isDataCacheInitialized(): boolean {
  return cache.initialized;
}

// ─── Privacy/Demo mask ──────────────────────────────────────────
let privacyEnabled = false;
const maskedCache: DataCache = {
  motos: [], clients: [], rentals: [], fines: [], maintenance: [], financial: [], bankAccounts: [], initialized: false,
};
let maskedVersion = -1;

function rebuildMaskedCache() {
  maskedCache.motos = cache.motos.map(maskMoto);
  maskedCache.clients = cache.clients.map(maskClient);
  maskedCache.rentals = cache.rentals.map(maskRental);
  maskedCache.fines = cache.fines.map(maskFine);
  maskedCache.maintenance = cache.maintenance.map(maskMaintenance);
  maskedCache.financial = cache.financial.map(maskFinancial);
  maskedCache.bankAccounts = cache.bankAccounts;
  maskedCache.initialized = cache.initialized;
  maskedVersion = version;
}

function activeCache(): DataCache {
  if (!privacyEnabled) return cache;
  if (maskedVersion !== version) rebuildMaskedCache();
  return maskedCache;
}

export function setPrivacyEnabled(v: boolean) {
  if (privacyEnabled === v) return;
  privacyEnabled = v;
  notifyCacheChange();
}

export function isPrivacyEnabled(): boolean {
  return privacyEnabled;
}

export function getDataCache(): DataCache {
  return activeCache();
}

export function getRealDataCache(): DataCache {
  return cache;
}

export function useDataCacheSnapshot(): DataCache {
  useSyncExternalStore(subscribe, () => version, () => version);
  return activeCache();
}

export function setSaveCallback(cb: SaveCallback) {
  _onSave = cb;
}

export function getSaveCallback(): SaveCallback | null {
  if (privacyEnabled) {
    // Bloqueia gravações enquanto o modo de privacidade está ativo,
    // evitando sobrescrever dados reais com versões mascaradas.
    return async () => {
      console.warn("[privacy] save bloqueado: modo demo ativo");
      throw new Error("Modo demo ativo — desative para salvar alterações.");
    };
  }
  return _onSave;
}

export function setBulkInsertCallback(cb: BulkInsertCallback) {
  _onBulkInsert = cb;
}

export function getBulkInsertCallback(): BulkInsertCallback | null {
  if (privacyEnabled) {
    return async () => {
      throw new Error("Modo demo ativo — desative para salvar alterações.");
    };
  }
  return _onBulkInsert;
}

export function clearDataCache() {
  cache.motos = [];
  cache.clients = [];
  cache.rentals = [];
  cache.fines = [];
  cache.maintenance = [];
  cache.financial = [];
  cache.bankAccounts = [];
  cache.initialized = false;
  _onSave = null;
  _onBulkInsert = null;
  notifyCacheChange();
}
