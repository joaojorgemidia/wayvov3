import { supabase } from "@/integrations/supabase/client";
import { md5 } from "@/lib/md5";
import { companyKey } from "@/lib/tracker-types";
import type { DeviceTrack, DeviceInfo, AlarmRecord, PlaybackPoint } from "@/lib/tracker-types";

export type { DeviceTrack, DeviceInfo, AlarmRecord, PlaybackPoint };

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface VelotrackConfig {
  login: string;
  senha: string;
}

export interface VelotrackToken {
  uid: string;        // desc_uid_retorno — vai no header "uid" de toda requisição
  browser: string;     // desc_useragent enviado no login — vai no header "browser"
  idcustomer: number;
  iduser: number;
  expires_at: number;  // ms timestamp
}

const USER_AGENT = "WAYVO/1.0";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // Velotrack não informa expiração; reautentica a cada 4h

// ─── Proxy ────────────────────────────────────────────────────────────────────

const PROXY_FN = "velotrack-proxy";

async function callProxy(payload: {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  params?: Record<string, string | number>;
  body?: Record<string, unknown>;
  uid?: string;
  browser?: string;
}): Promise<any> {
  const { data, error } = await supabase.functions.invoke(PROXY_FN, {
    body: payload,
  });
  if (error) throw new Error(error.message);
  if (data?.error) {
    const d = data.data;
    const msg = typeof d === "string" ? d
      : Array.isArray(d) ? d.join("; ")
      : d?.message ?? "Erro desconhecido";
    throw new Error(`Velotrack error ${data.status ?? ""}: ${msg}`);
  }
  return data;
}

// ─── Autenticação ─────────────────────────────────────────────────────────────

export async function authenticate(config: VelotrackConfig): Promise<VelotrackToken> {
  const time = Date.now();
  const login = config.login.trim();
  const senha = config.senha.trim();
  const descUid = md5(`${login}:${md5(senha)}:${time}`);
  const data = await callProxy({
    endpoint: "/login",
    method: "POST",
    body: { desc_uid: descUid, desc_useragent: USER_AGENT, desc_data: time },
  });
  if (!data?.desc_uid_retorno) {
    throw new Error(data?.message || "Login ou senha inválidos");
  }
  return {
    uid: data.desc_uid_retorno,
    browser: data.desc_useragent ?? USER_AGENT,
    idcustomer: Number(data.idcustomer),
    iduser: Number(data.iduser),
    expires_at: Date.now() + SESSION_TTL_MS,
  };
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function parseSqlDateTime(s?: string): number {
  if (!s) return 0;
  const t = new Date(s.replace(" ", "T")).getTime();
  return isNaN(t) ? 0 : t;
}

function toBrDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function toBrTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ─── Posições / dispositivos ──────────────────────────────────────────────────
// Velotrack retorna dispositivo + última posição em uma única chamada.

async function fetchPositions(token: VelotrackToken): Promise<any[]> {
  const data = await callProxy({
    endpoint: `/customer/${token.idcustomer}/devices-footer/true/unlimited`,
    uid: token.uid,
    browser: token.browser,
  });
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export async function getDeviceList(token: VelotrackToken): Promise<DeviceInfo[]> {
  const records = await fetchPositions(token);
  return records.map((r) => ({
    imei: String(r.iddevice ?? ""),
    deviceName: r.vehicle_code || r.description || String(r.iddevice ?? ""),
    deviceType: r.model_vehicle || "",
    status: r.connected,
  }));
}

export async function trackDevices(token: VelotrackToken): Promise<DeviceTrack[]> {
  const records = await fetchPositions(token);
  return records.map((r) => {
    const offline = r.active === false || (r.offline_hours != null && Number(r.offline_hours) >= 2);
    return {
      imei: String(r.iddevice ?? ""),
      lat: parseFloat(r.latitude ?? "0"),
      lng: parseFloat(r.longitude ?? "0"),
      speed: Number(r.speed ?? 0),
      course: Number(r.course ?? 0),
      acc: r.is_connected ? 1 : 0,
      gpstime: parseSqlDateTime(r.command_date_unformatted),
      deviceName: r.vehicle_code || r.description || "",
      statusCode: offline ? "Offline" : undefined,
      // odometro vem em metros (mesma unidade de leitura usada no ajuste via /odometer)
      mileage: r.odometer != null && Number(r.odometer) > 0 ? Number(r.odometer) / 1000 : undefined,
      externalBattery: r.battery_voltage_vehicle != null && r.battery_voltage_vehicle !== ""
        ? Number(r.battery_voltage_vehicle) : undefined,
      address: r.address || undefined,
      alarm: r.interestpoint ? `Ponto de interesse: ${r.interestpoint}` : undefined,
    };
  });
}

// ─── Histórico de trajeto ──────────────────────────────────────────────────────

export async function getPlayback(
  token: VelotrackToken,
  iddevice: string,
  begintime: number,
  endtime: number
): Promise<PlaybackPoint[]> {
  const data = await callProxy({
    endpoint: `/customer/${token.idcustomer}/device/${iddevice}/coordinates`,
    params: {
      scenario: "mobile",
      dthr_inicio: toBrDate(begintime),
      hora_inicio: toBrTime(begintime),
      dthr_fim: toBrDate(endtime),
      hora_fim: toBrTime(endtime),
    },
    uid: token.uid,
    browser: token.browser,
  });
  const records: any[] = Array.isArray(data) ? data : (data?.results ?? []);
  return records
    .map((r) => ({
      lat: parseFloat(r.latitude ?? "0"),
      lng: parseFloat(r.longitude ?? "0"),
      gpstime: parseSqlDateTime(r.first_command_date ?? r.date_creation),
      speed: Number(r.speed ?? 0),
      course: Number(r.course ?? 0),
    }))
    .filter((p) => !isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0 && p.lng !== 0);
}

// ─── Alarmes ──────────────────────────────────────────────────────────────────
// O Velotrack não expõe um endpoint dedicado de alarmes; aproximamos usando os
// eventos com "alert"/record_type de alerta dentro do trajeto do período.

export async function getAlarms(
  token: VelotrackToken,
  iddevice: string,
  begintime: number,
  endtime: number
): Promise<AlarmRecord[]> {
  const data = await callProxy({
    endpoint: `/customer/${token.idcustomer}/device/${iddevice}/coordinates`,
    params: {
      scenario: "mobile",
      dthr_inicio: toBrDate(begintime),
      hora_inicio: toBrTime(begintime),
      dthr_fim: toBrDate(endtime),
      hora_fim: toBrTime(endtime),
    },
    uid: token.uid,
    browser: token.browser,
  });
  const records: any[] = Array.isArray(data) ? data : (data?.results ?? []);
  return records
    .filter((r) => r.alert || /alerta/i.test(String(r.record_type ?? "")))
    .map((r) => ({
      imei: iddevice,
      alarmType: String(r.record_type ?? ""),
      alarmTypeName: r.alert || r.record_type || "Alerta",
      lat: parseFloat(r.latitude ?? "0"),
      lng: parseFloat(r.longitude ?? "0"),
      speed: Number(r.speed ?? 0),
      gpstime: parseSqlDateTime(r.first_command_date ?? r.date_creation),
      address: r.address,
    }));
}

// ─── Comandos de dispositivo (bloqueio/desbloqueio) ───────────────────────────

async function findCommand(token: VelotrackToken, iddevice: string, matcher: RegExp) {
  const data = await callProxy({
    endpoint: `/customer/${token.idcustomer}/devices/${iddevice}/model-command`,
    uid: token.uid,
    browser: token.browser,
  });
  const results: any[] = data?.results ?? [];
  return results.find((c) => matcher.test(String(c.description ?? "")));
}

export async function setRelay(token: VelotrackToken, iddevice: string, value: 0 | 1): Promise<void> {
  const matcher = value === 0 ? /bloque/i : /desbloque|libera/i;
  const command = await findCommand(token, iddevice, matcher);
  if (!command) {
    throw new Error("Este rastreador não possui comando de bloqueio/desbloqueio disponível");
  }
  await callProxy({
    endpoint: `/customer/${token.idcustomer}/devices/${iddevice}/commands`,
    method: "POST",
    body: {
      command: command.command_text,
      iddevice: Number(iddevice),
      idmodelcommand: command.idmodelcommand,
      iduser: token.iduser,
    },
    uid: token.uid,
    browser: token.browser,
  });
}

// mileageKm em km; API espera o odômetro em metros (mesma unidade de leitura).
export async function setMileage(token: VelotrackToken, iddevice: string, mileageKm: number): Promise<void> {
  const now = Date.now();
  await callProxy({
    endpoint: `/customer/${token.idcustomer}/odometer`,
    method: "POST",
    body: {
      iddevice: Number(iddevice),
      odometer_data: toBrDate(now),
      odometer_hora: toBrTime(now).slice(0, 5),
      odometer_value: Math.round(mileageKm * 1000),
    },
    uid: token.uid,
    browser: token.browser,
  });
}

// ─── Nomes customizados (localStorage, por empresa) ──────────────────────────

const NAMES_KEY = "velotrack-device-names-v1";

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

// ─── Config de sincronização de KM (por empresa) ─────────────────────────────

export interface KmSyncConfig {
  marginKm: number;
}

const KM_SYNC_CONFIG_KEY = "velotrack-km-sync-config-v1";

export function loadKmSyncConfig(companyId: string): KmSyncConfig {
  try {
    const raw = localStorage.getItem(companyKey(KM_SYNC_CONFIG_KEY, companyId));
    if (!raw) return { marginKm: 0 };
    return { marginKm: 0, ...JSON.parse(raw) };
  } catch {
    return { marginKm: 0 };
  }
}

export function saveKmSyncConfig(companyId: string, cfg: KmSyncConfig) {
  localStorage.setItem(companyKey(KM_SYNC_CONFIG_KEY, companyId), JSON.stringify(cfg));
}

// ─── Config de credenciais (por empresa) ─────────────────────────────────────

const CONFIG_KEY = "velotrack-config-v1";

export function loadVelotrackConfig(companyId: string): VelotrackConfig | null {
  try {
    const raw = localStorage.getItem(companyKey(CONFIG_KEY, companyId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveVelotrackConfig(companyId: string, cfg: VelotrackConfig) {
  localStorage.setItem(companyKey(CONFIG_KEY, companyId), JSON.stringify(cfg));
}

export function clearVelotrackConfig(companyId: string) {
  localStorage.removeItem(companyKey(CONFIG_KEY, companyId));
}
