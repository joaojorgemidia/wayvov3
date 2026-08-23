// Rastreador GT06 avulso (sem plataforma) — diferente de BrasilSat/Velotrack, não
// há login/API externa: um servidor TCP próprio (ver gt06-server/, roda numa VPS)
// decodifica o protocolo binário do aparelho e grava a última posição direto na
// tabela gt06_devices do Supabase. Aqui só lemos essa tabela — RLS já filtra por
// empresa (mesma policy multi-tenant do resto do app), mas como um usuário pode
// ter acesso a mais de uma empresa, ainda precisamos filtrar explicitamente pela
// empresa ATIVA (senão apareceriam misturados dispositivos de outra empresa que o
// usuário também administra) — por isso o companyId viaja dentro do "token" (ver
// authenticate() abaixo e o ajuste em RastreamentoPage.tsx que injeta companyId em
// todo config antes de chamar authenticate, não só pra este provedor).
import { supabase } from "@/integrations/supabase/client";
import { companyKey } from "@/lib/tracker-types";
import type { DeviceTrack, DeviceInfo, AlarmRecord, PlaybackPoint } from "@/lib/tracker-types";

export type { DeviceTrack, DeviceInfo, AlarmRecord, PlaybackPoint };

export interface Gt06Config {
  companyId?: string;
}

export interface Gt06Token {
  expires_at: number;
  companyId: string;
}

// Sem credenciais reais — o "login" é só amarrar o token à empresa ativa.
export async function authenticate(config: Gt06Config): Promise<Gt06Token> {
  if (!config.companyId) throw new Error("Empresa não identificada");
  return {
    // token nunca expira de fato (não há sessão externa pra renovar) — usamos uma
    // data bem distante só pra satisfazer getValidToken() em tracker.ts.
    expires_at: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    companyId: config.companyId,
  };
}

// Depois de quanto tempo sem atualização um dispositivo é considerado offline.
// O intervalo de heartbeat é configurável no aparelho (varia por fabricante) —
// o aparelho real de teste desta empresa reconecta a cada ~15-20min, então 5min
// deixava ele marcado como "offline" na maior parte do tempo mesmo funcionando
// normalmente. 25min dá folga sobre esse ciclo observado; se o intervalo real do
// aparelho for outro, ajustar aqui.
const OFFLINE_THRESHOLD_MS = 25 * 60 * 1000;

type Gt06Row = {
  imei: string;
  apelido: string | null;
  moto_id: string | null;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  course: number | null;
  acc: number | null;
  gps_time: string | null;
  address: string | null;
  battery: number | null;
  updated_at: string;
  motorcycles: { placa: string | null } | { placa: string | null }[] | null;
};

const SELECT_COLUMNS = "imei, apelido, moto_id, lat, lng, speed, course, acc, gps_time, address, battery, updated_at, motorcycles(placa)";

function motoPlaca(row: Gt06Row): string | null {
  const m = Array.isArray(row.motorcycles) ? row.motorcycles[0] : row.motorcycles;
  return m?.placa || null;
}

function rowToDeviceInfo(row: Gt06Row): DeviceInfo {
  return {
    imei: row.imei,
    deviceName: motoPlaca(row) || row.apelido || row.imei,
    deviceType: "GT06",
  };
}

function rowToDeviceTrack(row: Gt06Row): DeviceTrack {
  const updatedMs = new Date(row.updated_at).getTime();
  const offline = Date.now() - updatedMs > OFFLINE_THRESHOLD_MS;
  return {
    imei: row.imei,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    speed: row.speed ?? 0,
    course: row.course ?? 0,
    acc: row.acc ?? 0,
    gpstime: row.gps_time ? new Date(row.gps_time).getTime() : updatedMs,
    statusCode: offline ? "Offline" : undefined,
    deviceName: motoPlaca(row) || row.apelido || row.imei,
    address: row.address ?? undefined,
    // % aproximado, convertido pelo servidor a partir do enum 0-6 do protocolo
    // (ver gt06-server/src/index.js) — não é uma leitura precisa de voltagem.
    battery: row.battery ?? undefined,
  };
}

export async function getDeviceList(token: Gt06Token): Promise<DeviceInfo[]> {
  const { data, error } = await supabase
    .from("gt06_devices")
    .select(SELECT_COLUMNS)
    .eq("company_id", token.companyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Gt06Row[]).map(rowToDeviceInfo);
}

export async function trackDevices(token: Gt06Token): Promise<DeviceTrack[]> {
  const { data, error } = await supabase
    .from("gt06_devices")
    .select(SELECT_COLUMNS)
    .eq("company_id", token.companyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Gt06Row[]).map(rowToDeviceTrack);
}

// Fora do escopo v1 — sem histórico de trajeto nem alarmes pra este provedor
// (ver RastreamentoPage.tsx, que já esconde as abas Histórico/Alarmes pra "gt06").
export async function getPlayback(): Promise<PlaybackPoint[]> {
  return [];
}
export async function getAlarms(): Promise<AlarmRecord[]> {
  return [];
}

// Fora do escopo v1 — protocolo GT06 básico não reporta km rodado nem suporta
// bloqueio remoto (nem todo clone tem o hardware de relé). Os botões que
// chamariam isso já ficam escondidos na UI pra este provedor; isto aqui é só um
// backstop caso algo chame mesmo assim.
export async function setMileage(): Promise<void> {
  throw new Error("Sincronização de quilometragem não é suportada para rastreador GT06");
}
export async function setRelay(): Promise<void> {
  throw new Error("Bloqueio remoto não é suportado para rastreador GT06");
}

// ─── Apelido local (localStorage, por empresa) — mesmo padrão de brasilsat.ts ─

const NAMES_KEY = "gt06-device-names-v1";

export function loadDeviceNames(companyId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(companyKey(NAMES_KEY, companyId)) ?? "{}");
  } catch {
    return {};
  }
}

export function saveDeviceName(companyId: string, imei: string, name: string) {
  const names = loadDeviceNames(companyId);
  if (name.trim()) names[imei] = name.trim();
  else delete names[imei];
  localStorage.setItem(companyKey(NAMES_KEY, companyId), JSON.stringify(names));
}

// ─── Sincronização de KM — não se aplica ao GT06, mas o driver precisa expor a
// interface (nunca é de fato usada: syncKm() sai cedo pra esse provedor). ──────

export interface KmSyncConfig {
  marginKm: number;
}

export function loadKmSyncConfig(_companyId: string): KmSyncConfig {
  return { marginKm: 0 };
}
export function saveKmSyncConfig(_companyId: string, _cfg: KmSyncConfig) {
  // no-op — sem km sync pra este provedor
}

// ─── "Config" de conexão — não guarda credencial nenhuma, só existe pra manter
// a interface uniforme com os outros provedores (connect() sempre chama saveConfig
// depois de autenticar). ────────────────────────────────────────────────────────

const CONFIG_KEY = "gt06-config-v1";

export function loadGt06Config(companyId: string): Gt06Config | null {
  try {
    const raw = localStorage.getItem(companyKey(CONFIG_KEY, companyId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveGt06Config(companyId: string, cfg: Gt06Config) {
  localStorage.setItem(companyKey(CONFIG_KEY, companyId), JSON.stringify(cfg));
}

export function clearGt06Config(companyId: string) {
  localStorage.removeItem(companyKey(CONFIG_KEY, companyId));
}
