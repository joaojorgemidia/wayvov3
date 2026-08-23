// Grava a última posição de cada dispositivo GT06 no Supabase, usando a service
// role key (ignora RLS — é o único jeito de escrever nessa tabela, de propósito,
// já que a policy normal de INSERT/DELETE não existe pra staff).
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (ver .env.example)");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

// Upsert só das colunas de telemetria — company_id/moto_id/apelido nunca entram
// aqui, então uma linha já atribuída a uma empresa não é resetada a cada posição
// nova (INSERT ... ON CONFLICT DO UPDATE só toca as colunas presentes no payload).
export async function upsertPosition({ imei, lat, lng, speed, course, acc, gpsTime, address, battery }) {
  const payload = { imei, updated_at: new Date().toISOString() };
  if (lat != null) payload.lat = lat;
  if (lng != null) payload.lng = lng;
  if (speed != null) payload.speed = speed;
  if (course != null) payload.course = course;
  if (acc != null) payload.acc = acc;
  if (gpsTime != null) payload.gps_time = gpsTime.toISOString();
  if (address != null) payload.address = address;
  if (battery != null) payload.battery = battery;

  const { error } = await supabase.from("gt06_devices").upsert(payload, { onConflict: "imei" });
  if (error) throw new Error(`Falha ao gravar posição no Supabase: ${error.message}`);
}

// Busca a última posição já salva (usada pra decidir se vale a pena chamar o
// serviço de geocoding de novo — ver geocode.js).
export async function getLastPosition(imei) {
  const { data, error } = await supabase
    .from("gt06_devices")
    .select("lat, lng, address, updated_at")
    .eq("imei", imei)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler última posição: ${error.message}`);
  return data;
}
