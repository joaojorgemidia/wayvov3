// Rastreador GT06 avulso (sem plataforma) — diferente de BrasilSat/Velotrack, não
// há login/API externa: um servidor TCP próprio (ver gt06-server/, roda numa VPS)
// decodifica o protocolo binário do aparelho e grava a última posição direto na
// tabela gt06_devices do Supabase. Aqui só lemos essa tabela — RLS já filtra por
// empresa (mesma policy multi-tenant do resto do app).
//
// Diferente de BrasilSat/Velotrack, GT06 NÃO é um "TrackerProvider" — não tem
// login/token, playback, alarmes, km-sync nem bloqueio remoto. É uma fonte de
// dados sempre ativa por empresa (basta o companyId), mostrada sempre junto com
// qualquer rastreador de nuvem conectado — nunca uma alternativa exclusiva a
// eles. Ver RastreamentoPage.tsx, que busca isto em paralelo ao provedor de
// nuvem (se houver) e combina os dois na mesma tela.
import { supabase } from "@/integrations/supabase/client";
import { companyKey } from "@/lib/tracker-types";
import type { DeviceTrack, DeviceInfo } from "@/lib/tracker-types";

export type { DeviceTrack, DeviceInfo };

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
    motoId: row.moto_id,
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
    // Motor (ACC) propositalmente NÃO é preenchido aqui, mesmo a tabela tendo o
    // dado: nas TAGs GT06 avulsas o fio de ignição não é lido de forma confiável
    // (instalação sem esse sensor cabeado) — mostrar "ligado/desligado" seria
    // afirmar algo que não sabemos. Deixando undefined, a UI (statusLabel,
    // DeviceDetail) já trata como "informação indisponível" em vez de "desligado".
    gpstime: row.gps_time ? new Date(row.gps_time).getTime() : updatedMs,
    statusCode: offline ? "Offline" : undefined,
    deviceName: motoPlaca(row) || row.apelido || row.imei,
    address: row.address ?? undefined,
    // % aproximado, convertido pelo servidor a partir do enum 0-6 do protocolo
    // (ver gt06-server/src/index.js) — não é uma leitura precisa de voltagem.
    battery: row.battery ?? undefined,
  };
}

export async function getDeviceList(companyId: string): Promise<DeviceInfo[]> {
  const { data, error } = await supabase
    .from("gt06_devices")
    .select(SELECT_COLUMNS)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Gt06Row[]).map(rowToDeviceInfo);
}

export async function trackDevices(companyId: string): Promise<DeviceTrack[]> {
  const { data, error } = await supabase
    .from("gt06_devices")
    .select(SELECT_COLUMNS)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Gt06Row[]).map(rowToDeviceTrack);
}

// ─── Cadastro / vínculo com veículo ───────────────────────────────────────────
// A linha da TAG só existe depois que o aparelho físico conecta pela 1ª vez no
// servidor TCP (que grava com company_id nulo — ver gt06-server/src/supabase.js).
// "Cadastrar" aqui significa reivindicar essa linha pra empresa atual, digitando
// o IMEI impresso no aparelho. A policy de UPDATE (RLS) só deixa isso acontecer
// se a linha ainda não tiver dono (company_id IS NULL); depois disso vira uma
// TAG normal da empresa, editável só por quem já é dela.

// true = achou uma TAG sem dono com esse IMEI e vinculou à empresa atual.
// false = não achou nenhuma linha pra reivindicar — ou o aparelho ainda não
// conectou no servidor nenhuma vez, ou o IMEI já pertence a outra empresa (por
// segurança/RLS a gente não consegue distinguir os dois casos aqui).
export async function claimDevice(
  companyId: string,
  imei: string,
  opts: { motoId?: string | null; apelido?: string } = {},
): Promise<boolean> {
  const payload: Record<string, unknown> = { company_id: companyId };
  if (opts.motoId !== undefined) payload.moto_id = opts.motoId;
  if (opts.apelido !== undefined) payload.apelido = opts.apelido || null;
  const { data, error } = await supabase
    .from("gt06_devices")
    .update(payload)
    .eq("imei", imei.trim())
    .is("company_id", null)
    .select("imei");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

// true = o IMEI já pertence à empresa atual (já cadastrado antes) — usado só
// pra dar uma mensagem de erro melhor quando claimDevice() falha.
export async function deviceBelongsToCompany(companyId: string, imei: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("gt06_devices")
    .select("imei")
    .eq("imei", imei.trim())
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

// Troca/remove o veículo vinculado a uma TAG que já é da empresa (RLS normal,
// sem precisar do "claim" acima). Ao vincular um veículo, o apelido vira
// "GT06 | <placa>" — todo GT06 tem que ser identificável pela placa da moto. A UI
// já mostra a placa antes do apelido, mas gravar no apelido mantém a identificação
// mesmo que o vínculo seja removido depois. Ao desvincular, o apelido é preservado.
export const gt06Apelido = (placa: string) => `GT06 | ${placa.trim()}`;

export async function linkDeviceToMoto(
  companyId: string,
  imei: string,
  motoId: string | null,
  placa?: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = { moto_id: motoId };
  if (motoId && placa && placa.trim()) payload.apelido = gt06Apelido(placa);
  const { error } = await supabase
    .from("gt06_devices")
    .update(payload)
    .eq("imei", imei.trim())
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
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
