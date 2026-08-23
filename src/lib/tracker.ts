// Camada de abstração entre a página de Rastreamento e os provedores de GPS
// suportados (BrasilSat, Velotrack). Cada empresa escolhe um provedor na
// primeira configuração; o restante da página opera sobre essa interface comum.

import * as brasilsat from "@/lib/brasilsat";
import * as velotrack from "@/lib/velotrack";
import * as gt06 from "@/lib/gt06";
import { companyKey, type TrackerProvider, type DeviceInfo, type DeviceTrack, type PlaybackPoint, type AlarmRecord } from "@/lib/tracker-types";

export type { TrackerProvider, DeviceInfo, DeviceTrack, PlaybackPoint, AlarmRecord };

export type AnyTrackerToken = { expires_at: number } & Record<string, unknown>;
export type AnyTrackerConfig = Record<string, string>;

export interface CredentialField {
  key: string;
  label: string;
  type?: "text" | "password";
}

export interface TrackerDriver {
  label: string;
  credentialFields: CredentialField[];
  authenticate(config: AnyTrackerConfig): Promise<AnyTrackerToken>;
  getDeviceList(token: AnyTrackerToken): Promise<DeviceInfo[]>;
  trackDevices(token: AnyTrackerToken, imeis: string[]): Promise<DeviceTrack[]>;
  getPlayback(token: AnyTrackerToken, imei: string, begin: number, end: number): Promise<PlaybackPoint[]>;
  getAlarms(token: AnyTrackerToken, imei: string, begin: number, end: number): Promise<AlarmRecord[]>;
  setMileage(token: AnyTrackerToken, imei: string, km: number): Promise<void>;
  setRelay(token: AnyTrackerToken, imei: string, value: 0 | 1): Promise<void>;
  loadDeviceNames(companyId: string): Record<string, string>;
  saveDeviceName(companyId: string, imei: string, name: string): void;
  loadKmSyncConfig(companyId: string): { marginKm: number };
  saveKmSyncConfig(companyId: string, cfg: { marginKm: number }): void;
  loadConfig(companyId: string): AnyTrackerConfig | null;
  saveConfig(companyId: string, cfg: AnyTrackerConfig): void;
  clearConfig(companyId: string): void;
}

const brasilsatDriver: TrackerDriver = {
  label: "BrasilSat GPS",
  credentialFields: [
    { key: "account", label: "Conta", type: "text" },
    { key: "password", label: "Senha", type: "password" },
  ],
  authenticate: (config) => brasilsat.authenticate(config as unknown as brasilsat.BrasilSatConfig),
  getDeviceList: (token) => brasilsat.getDeviceList((token as any).access_token),
  trackDevices: (token, imeis) => brasilsat.trackDevices((token as any).access_token, imeis),
  getPlayback: (token, imei, begin, end) => brasilsat.getPlayback((token as any).access_token, imei, begin, end),
  getAlarms: (token, imei, begin, end) => brasilsat.getAlarms((token as any).access_token, imei, begin, end),
  setMileage: (token, imei, km) => brasilsat.setMileage((token as any).access_token, imei, km),
  setRelay: (token, imei, value) => brasilsat.setRelay((token as any).access_token, imei, value),
  loadDeviceNames: brasilsat.loadDeviceNames,
  saveDeviceName: brasilsat.saveDeviceName,
  loadKmSyncConfig: brasilsat.loadKmSyncConfig,
  saveKmSyncConfig: brasilsat.saveKmSyncConfig,
  loadConfig: (companyId) => brasilsat.loadBrasilSatConfig(companyId) as unknown as AnyTrackerConfig | null,
  saveConfig: (companyId, cfg) => brasilsat.saveBrasilSatConfig(companyId, cfg as unknown as brasilsat.BrasilSatConfig),
  clearConfig: brasilsat.clearBrasilSatConfig,
};

const velotrackDriver: TrackerDriver = {
  label: "Velotrack",
  credentialFields: [
    { key: "login", label: "Login", type: "text" },
    { key: "senha", label: "Senha", type: "password" },
  ],
  authenticate: (config) => velotrack.authenticate(config as unknown as velotrack.VelotrackConfig),
  getDeviceList: (token) => velotrack.getDeviceList(token as unknown as velotrack.VelotrackToken),
  trackDevices: (token) => velotrack.trackDevices(token as unknown as velotrack.VelotrackToken),
  getPlayback: (token, imei, begin, end) => velotrack.getPlayback(token as unknown as velotrack.VelotrackToken, imei, begin, end),
  getAlarms: (token, imei, begin, end) => velotrack.getAlarms(token as unknown as velotrack.VelotrackToken, imei, begin, end),
  setMileage: (token, imei, km) => velotrack.setMileage(token as unknown as velotrack.VelotrackToken, imei, km),
  setRelay: (token, imei, value) => velotrack.setRelay(token as unknown as velotrack.VelotrackToken, imei, value),
  loadDeviceNames: velotrack.loadDeviceNames,
  saveDeviceName: velotrack.saveDeviceName,
  loadKmSyncConfig: velotrack.loadKmSyncConfig,
  saveKmSyncConfig: velotrack.saveKmSyncConfig,
  loadConfig: (companyId) => velotrack.loadVelotrackConfig(companyId) as unknown as AnyTrackerConfig | null,
  saveConfig: (companyId, cfg) => velotrack.saveVelotrackConfig(companyId, cfg as unknown as velotrack.VelotrackConfig),
  clearConfig: velotrack.clearVelotrackConfig,
};

// GT06: aparelho avulso sem plataforma — servidor TCP próprio (gt06-server/,
// numa VPS) grava a última posição direto no Supabase. Sem credenciais reais;
// "conectar" só amarra o provedor à empresa ativa (ver gt06.ts authenticate()).
const gt06Driver: TrackerDriver = {
  label: "GT06 (avulso)",
  credentialFields: [],
  authenticate: (config) => gt06.authenticate(config as unknown as gt06.Gt06Config),
  getDeviceList: (token) => gt06.getDeviceList(token as unknown as gt06.Gt06Token),
  trackDevices: (token) => gt06.trackDevices(token as unknown as gt06.Gt06Token),
  getPlayback: () => gt06.getPlayback(),
  getAlarms: () => gt06.getAlarms(),
  setMileage: () => gt06.setMileage(),
  setRelay: () => gt06.setRelay(),
  loadDeviceNames: gt06.loadDeviceNames,
  saveDeviceName: gt06.saveDeviceName,
  loadKmSyncConfig: gt06.loadKmSyncConfig,
  saveKmSyncConfig: gt06.saveKmSyncConfig,
  loadConfig: (companyId) => gt06.loadGt06Config(companyId) as unknown as AnyTrackerConfig | null,
  saveConfig: (companyId, cfg) => gt06.saveGt06Config(companyId, cfg as unknown as gt06.Gt06Config),
  clearConfig: gt06.clearGt06Config,
};

export const DRIVERS: Record<TrackerProvider, TrackerDriver> = {
  brasilsat: brasilsatDriver,
  velotrack: velotrackDriver,
  gt06: gt06Driver,
};

// ─── Provedor escolhido pela empresa ──────────────────────────────────────────

const PROVIDER_KEY = "tracker-provider-v1";

export function loadTrackerProvider(companyId: string): TrackerProvider | null {
  try {
    const raw = localStorage.getItem(companyKey(PROVIDER_KEY, companyId));
    if (raw === "brasilsat" || raw === "velotrack") return raw;
  } catch { /* ignora */ }
  // Compatibilidade: empresas que já tinham BrasilSat configurado antes da
  // introdução de múltiplos provedores continuam funcionando sem reconfigurar.
  if (brasilsat.loadBrasilSatConfig(companyId)?.account) return "brasilsat";
  return null;
}

export function saveTrackerProvider(companyId: string, provider: TrackerProvider) {
  localStorage.setItem(companyKey(PROVIDER_KEY, companyId), provider);
}

export function clearTrackerProvider(companyId: string) {
  localStorage.removeItem(companyKey(PROVIDER_KEY, companyId));
}
