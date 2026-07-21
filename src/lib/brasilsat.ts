import { supabase } from "@/integrations/supabase/client";
import { md5 } from "@/lib/md5";
import { companyKey } from "@/lib/tracker-types";
import type { DeviceTrack, DeviceInfo, AlarmRecord, PlaybackPoint } from "@/lib/tracker-types";

export type { DeviceTrack, DeviceInfo, AlarmRecord, PlaybackPoint };

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BrasilSatConfig {
  account: string;
  password: string;
}

export interface BrasilSatToken {
  access_token: string;
  expires_at: number; // ms timestamp
}

// ─── Proxy ────────────────────────────────────────────────────────────────────

const PROXY_FN = "brasilsat-proxy";

async function callProxy(payload: {
  endpoint: string;
  method?: "GET" | "POST";
  params?: Record<string, string | number>;
  body?: Record<string, unknown>;
}): Promise<any> {
  const { data, error } = await supabase.functions.invoke(PROXY_FN, {
    body: payload,
  });
  if (error) throw new Error(error.message);
  if (data?.code !== 0 && data?.code !== undefined) {
    throw new Error(`BrasilSat error ${data.code}: ${data.message || "Erro desconhecido"}`);
  }
  return data;
}

// ─── Autenticação ─────────────────────────────────────────────────────────────

export async function authenticate(config: BrasilSatConfig): Promise<BrasilSatToken> {
  const time = Math.floor(Date.now() / 1000); // API exige segundos, não milissegundos
  const signature = md5(md5(config.password) + String(time));
  const data = await callProxy({
    endpoint: "authorization",
    params: { time, account: config.account, signature },
  });
  const expiresIn = (data.record?.expires_in ?? 7200) * 1000;
  return {
    access_token: data.record.access_token,
    expires_at: Date.now() + expiresIn - 60_000, // 1 min de margem
  };
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function getDeviceList(token: string): Promise<DeviceInfo[]> {
  const data = await callProxy({
    endpoint: "device/list",
    params: { access_token: token },
  });
  const records: any[] = Array.isArray(data.record) ? data.record : [];
  return records.map((r) => ({
    imei: r.imei ?? "",
    // platenumber é o nome/placa cadastrado pelo usuário na BrasilSat
    deviceName: r.platenumber || r.devicename || r.deviceName || r.name || r.alias || r.imei || "",
    deviceType: r.devicetype || r.deviceType || r.model || r.type || "",
    icon: r.icon,
    status: r.status,
  }));
}

export async function trackDevices(token: string, imeis: string[]): Promise<DeviceTrack[]> {
  if (imeis.length === 0) return [];
  const data = await callProxy({
    endpoint: "track",
    params: { access_token: token, imeis: imeis.join(",") },
  });
  const records: any[] = Array.isArray(data.record) ? data.record : [];
  return records.map((r) => {
    const gpstime = Number(r.gpstime ?? 0);
    const num = (v: any) => (v != null && v !== "" ? Number(v) : undefined);
    const str = (v: any) => (v != null && v !== "" ? String(v) : undefined);

    // accstatus: -1 = desligado, 1 = ligado
    const accRaw = r.accstatus ?? r.acc;
    const acc = accRaw != null ? (Number(accRaw) > 0 ? 1 : 0) : 0;

    // mileage: API retorna em metros
    const rawMileage = r.mileage != null ? Number(r.mileage) : null;
    const mileageKm = rawMileage != null && rawMileage > 0 ? rawMileage / 1000 : undefined;

    // acumula status extras para o campo "alarm"
    const alarmParts: string[] = [];
    if (r.chargestatus === "1" || r.chargestatus === 1) alarmParts.push("Bateria externa conectada");
    if (r.defensestatus === "1" || r.defensestatus === 1) alarmParts.push("Modo defesa ativo");
    const rawAlarm = str(r.alarm ?? r.alarmDesc ?? r.statusDesc);
    if (rawAlarm) alarmParts.push(rawAlarm);

    // acctime: duração em segundos no estado acc atual
    const acctimeSec = r.acctime != null ? Number(r.acctime) : 0;

    return {
      imei: r.imei ?? "",
      lat: parseFloat(r.latitude ?? r.lat ?? "0"),
      lng: parseFloat(r.longitude ?? r.lng ?? "0"),
      speed: Number(r.speed ?? 0),
      course: Number(r.course ?? r.direction ?? 0),
      acc,
      gpstime: gpstime > 0 && gpstime < 1e12 ? gpstime * 1000 : gpstime,
      deviceName: str(r.devicename ?? r.name ?? r.alias) ?? "",
      icon: r.icon,
      statusCode: str(r.statusCode ?? r.status),
      statusDuration: acctimeSec > 0 ? acctimeSec : undefined,
      accDuration: acctimeSec > 0 ? acctimeSec : undefined,
      relay: num(r.oilpowerstatus ?? r.relay ?? r.cut),
      alarm: alarmParts.length ? alarmParts.join(", ") : undefined,
      battery: num(r.battery ?? r.batteryLevel),
      // serverpower retornado em valor negativo; usar abs()
      // externalpower retornado pela API (pode ser negativo)
      externalBattery: r.externalpower != null && r.externalpower !== "" && !Array.isArray(r.externalpower)
        ? Math.abs(Number(r.externalpower)) : undefined,
      externalPower: num(r.chargestatus ?? r.oilpowerstatus),
      mileage: mileageKm,
      mileageDay: (() => {
        const raw = r.todaymileage ?? r.mileageDay ?? r.todayMileage ?? r.dailyMileage;
        if (raw == null || raw === "") return undefined;
        const n = Number(raw);
        if (!isFinite(n) || n <= 0) return undefined;
        // API retorna em metros — converter para km
        return n / 1000;
      })(),
      fuel: r.fuel !== "" && r.fuel != null ? num(r.fuel)
          : r.fuellevel !== "" && r.fuellevel != null ? num(r.fuellevel) : undefined,
      // temperature pode vir como array vazio quando não disponível
      temperature: !Array.isArray(r.temperature) && r.temperature != null && r.temperature !== ""
        ? Number(r.temperature) : undefined,
      address: str(r.address ?? r.location),
      signal: num(r.signal ?? r.signalLevel),
    };
  });
}

export async function getPlayback(
  token: string,
  imei: string,
  begintime: number,
  endtime: number
): Promise<PlaybackPoint[]> {
  const data = await callProxy({
    endpoint: "playback",
    params: { access_token: token, imei, begintime, endtime },
  });
  const raw: string = data.record ?? "";
  if (!raw) return [];
  return raw
    .split(";")
    .filter(Boolean)
    .map((seg: string) => {
      const [lng, lat, gpstime, speed, course] = seg.split(",");
      return {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        gpstime: parseInt(gpstime),
        speed: parseFloat(speed),
        course: parseFloat(course),
      };
    })
    .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
}

export async function getAlarms(
  token: string,
  imei: string,
  begintime: number,
  endtime: number
): Promise<AlarmRecord[]> {
  const data = await callProxy({
    endpoint: "alarm/list2",
    params: { access_token: token, imei, begintime, endtime },
  });
  const records: any[] = Array.isArray(data.record) ? data.record : [];
  return records.map((r) => ({
    imei: r.imei ?? "",
    alarmType: String(r.alarmType ?? ""),
    alarmTypeName: r.alarmTypeName ?? r.alarmType ?? "Alarme",
    lat: parseFloat(r.lat ?? 0),
    lng: parseFloat(r.lng ?? 0),
    speed: Number(r.speed ?? 0),
    gpstime: Number(r.gpstime ?? 0),
    address: r.address,
  }));
}

// ─── Comandos de dispositivo ──────────────────────────────────────────────────

// Envia comando via API command/send (BrasilSat OPEN API §2.5)
async function sendCommand(token: string, imei: string, command: string, paramData?: string): Promise<string> {
  const params: Record<string, string> = { access_token: token, imei, command };
  if (paramData) params.paramData = paramData;
  const data = await callProxy({
    endpoint: "command/send",
    params,
  });
  return data?.record?.commandid ?? "";
}

// mileageKm em km; API BrasilSat espera metros (mesmo formato que retorna).
// O comando em si é só "SET_MILEAGE" — o valor vai à parte, em paramData como
// JSON (ex.: {"mileage":"30"}). Mandar o valor colado no command (SET_MILEAGE,30)
// é rejeitado pela BrasilSat com o erro 20048 "unsupported command".
export async function setMileage(token: string, imei: string, mileageKm: number): Promise<void> {
  const meters = Math.round(mileageKm * 1000);
  await sendCommand(token, imei, "SET_MILEAGE", JSON.stringify({ mileage: String(meters) }));
}

// value: 0 = bloqueado (cortar combustível), 1 = liberado (restaurar)
// Comando BrasilSat: RELAY,1 = Stop Engine ; RELAY,0 = Restore Engine
export async function setRelay(token: string, imei: string, value: 0 | 1): Promise<void> {
  const cmd = value === 0 ? "RELAY,1" : "RELAY,0";
  await sendCommand(token, imei, cmd);
}

// ─── Nomes customizados (localStorage, por empresa) ──────────────────────────

const NAMES_KEY = "brasilsat-device-names-v1";

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
  marginKm: number; // km extras adicionados ao kmAtual do sistema ao sincronizar
}

const KM_SYNC_CONFIG_KEY = "brasilsat-km-sync-config-v1";

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

const CONFIG_KEY = "brasilsat-config-v1";

export function loadBrasilSatConfig(companyId: string): BrasilSatConfig | null {
  try {
    const raw = localStorage.getItem(companyKey(CONFIG_KEY, companyId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveBrasilSatConfig(companyId: string, cfg: BrasilSatConfig) {
  localStorage.setItem(companyKey(CONFIG_KEY, companyId), JSON.stringify(cfg));
}

export function clearBrasilSatConfig(companyId: string) {
  localStorage.removeItem(companyKey(CONFIG_KEY, companyId));
}
