import { supabase } from "@/integrations/supabase/client";

// ─── MD5 (necessário para a assinatura da BrasilSat) ─────────────────────────
// Implementação compacta de domínio público

function md5(str: string): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  function binlMD5(x: number[], len: number) {
    x[len >> 5] |= 0x80 << len % 32;
    x[(((len + 64) >>> 9) << 4) + 14] = len;
    let i, olda, oldb, oldc, oldd;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (i = 0; i < x.length; i += 16) {
      olda = a; oldb = b; oldc = c; oldd = d;
      a = md5ff(a, b, c, d, x[i], 7, -680876936);
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
      b = md5gg(b, c, d, a, x[i], 20, -373897302);
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
      a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
      d = md5hh(d, a, b, c, x[i], 11, -358537222);
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
      a = md5ii(a, b, c, d, x[i], 6, -198630844);
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
      a = safeAdd(a, olda); b = safeAdd(b, oldb);
      c = safeAdd(c, oldc); d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  }
  function binl2rstr(input: number[]) {
    let output = "";
    for (let i = 0; i < input.length * 32; i += 8)
      output += String.fromCharCode((input[i >> 5] >>> i % 32) & 0xff);
    return output;
  }
  function rstr2binl(input: string) {
    const output: number[] = Array(input.length >> 2).fill(0);
    for (let i = 0; i < input.length; i++)
      output[i >> 2] |= input.charCodeAt(i) << (i % 4 * 8);
    return output;
  }
  function rstr2hex(input: string) {
    const hexTab = "0123456789abcdef";
    let output = "";
    for (let i = 0; i < input.length; i++) {
      const x = input.charCodeAt(i);
      output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f);
    }
    return output;
  }
  function rstrMD5(s: string) {
    return binl2rstr(binlMD5(rstr2binl(s), s.length * 8));
  }
  function str2rstrUTF8(input: string) {
    return unescape(encodeURIComponent(input));
  }
  return rstr2hex(rstrMD5(str2rstrUTF8(str)));
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BrasilSatConfig {
  account: string;
  password: string;
}

export interface BrasilSatToken {
  access_token: string;
  expires_at: number; // ms timestamp
}

export interface DeviceTrack {
  imei: string;
  lat: number;
  lng: number;
  speed: number;
  course: number;
  acc: number;               // 1 = motor ligado, 0 = desligado
  gpstime: number;           // unix timestamp (ms normalizado)
  statusCode?: string;       // "Moving" | "Stopped" | "Offline"
  statusDuration?: number;   // segundos no status atual
  accDuration?: number;      // segundos no estado ACC atual
  deviceName?: string;
  icon?: string;
  relay?: number;            // 0 = cortado/bloqueado, 1 = normal
  alarm?: string;            // descrição de alarmes/status extras
  battery?: number;          // % bateria interna
  externalBattery?: number;  // tensão bateria externa (V)
  externalPower?: number;    // 1 = bateria externa conectada
  mileage?: number;          // odômetro total (km)
  mileageDay?: number;       // km do dia
  fuel?: number;             // nível combustível (%)
  temperature?: number;      // temperatura (°C)
  address?: string;          // endereço reverso (se disponível)
  signal?: number;           // força do sinal
}

export interface DeviceInfo {
  imei: string;
  deviceName: string;
  deviceType: string;
  icon?: string;
  status?: string;
}

export interface AlarmRecord {
  imei: string;
  alarmType: string;
  alarmTypeName: string;
  lat: number;
  lng: number;
  speed: number;
  gpstime: number;
  address?: string;
}

export interface PlaybackPoint {
  lat: number;
  lng: number;
  gpstime: number;
  speed: number;
  course: number;
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

// ─── Helpers de chave por empresa ────────────────────────────────────────────

function companyKey(base: string, companyId: string) {
  return `${base}:${companyId}`;
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
