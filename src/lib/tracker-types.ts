// Tipos compartilhados entre os provedores de rastreamento GPS (BrasilSat, Velotrack, ...)

export type TrackerProvider = "brasilsat" | "velotrack";

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

// ─── Helpers de chave de localStorage por empresa (compartilhado entre provedores) ──

export function companyKey(base: string, companyId: string) {
  return `${base}:${companyId}`;
}
