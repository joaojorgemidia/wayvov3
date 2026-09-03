// Camada de abstração entre a página de Rastreamento e os provedores de GPS
// suportados (BrasilSat, Velotrack). Cada empresa escolhe um provedor na
// primeira configuração; o restante da página opera sobre essa interface comum.

import { supabase } from "@/integrations/supabase/client";
import * as brasilsat from "@/lib/brasilsat";
import * as velotrack from "@/lib/velotrack";
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

// GT06 (rastreador avulso, sem plataforma) NÃO entra aqui — não é um
// TrackerProvider (sem login/token/playback/alarmes/km-sync/relé). É uma fonte
// de dados sempre ativa por empresa, buscada em paralelo e combinada na mesma
// tela pelo RastreamentoPage.tsx — ver src/lib/gt06.ts.
export const DRIVERS: Record<TrackerProvider, TrackerDriver> = {
  brasilsat: brasilsatDriver,
  velotrack: velotrackDriver,
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

// ─── Config compartilhada por empresa (banco) ────────────────────────────────
// O localStorage acima continua sendo o cache local de cada navegador. A fonte
// de verdade, quando existe, é a tabela company_tracker_configs: configurou uma
// vez (qualquer usuário/dispositivo) e todo mundo da empresa entra direto, sem
// passar de novo pela tela de login. RLS isola por empresa — ver a migração
// 20260903160000_add_company_tracker_configs.sql.

export interface SharedTrackerConfig {
  provider: TrackerProvider;
  credentials: AnyTrackerConfig;
}

export async function loadSharedTrackerConfig(companyId: string): Promise<SharedTrackerConfig | null> {
  if (!companyId || companyId === "default") return null;
  try {
    const { data, error } = await supabase
      .from("company_tracker_configs")
      .select("provider, credentials")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error || !data) return null;
    if (data.provider !== "brasilsat" && data.provider !== "velotrack") return null;
    return { provider: data.provider, credentials: (data.credentials ?? {}) as AnyTrackerConfig };
  } catch {
    return null;
  }
}

// Best-effort: se o usuário não tiver permissão de escrita (RLS), a conexão
// continua valendo pelo cache local — só não fica compartilhada com a empresa.
export async function saveSharedTrackerConfig(
  companyId: string,
  provider: TrackerProvider,
  credentials: AnyTrackerConfig,
): Promise<boolean> {
  if (!companyId || companyId === "default") return false;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("company_tracker_configs")
      .upsert({
        company_id: companyId,
        provider,
        credentials,
        updated_at: new Date().toISOString(),
        updated_by: userData.user?.id ?? null,
      });
    return !error;
  } catch {
    return false;
  }
}

export async function clearSharedTrackerConfig(companyId: string): Promise<void> {
  if (!companyId || companyId === "default") return;
  try {
    await supabase.from("company_tracker_configs").delete().eq("company_id", companyId);
  } catch { /* ignora */ }
}
