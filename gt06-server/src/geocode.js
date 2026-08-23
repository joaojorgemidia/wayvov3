// Reverse geocoding via Nominatim (OpenStreetMap, gratuito). A política de uso
// deles pede no máximo 1 requisição/segundo e um User-Agent identificando o app
// — o limitador abaixo garante isso mesmo se aparecerem vários dispositivos no
// futuro (uma fila única, todo o processo compartilha o mesmo intervalo mínimo).

const MIN_INTERVAL_MS = 1100; // um pouco de folga sobre o limite de 1 req/s
const MOVED_THRESHOLD_M = 30; // só regeocodifica se andou mais que isso
const STALE_MS = 2 * 60 * 1000; // ou se o endereço em cache já passou disso

let lastCallAt = 0;
let chain = Promise.resolve();

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Decide se vale a pena chamar o Nominatim de novo pra essa posição, com base
// na última posição já salva no banco (evita geocodificar toda atualização —
// o rastreador pode mandar posição a cada 30-60s mesmo parado no mesmo lugar).
export function shouldGeocode(last, lat, lng) {
  if (!last?.address || !last?.lat || !last?.lng) return true;
  if (!last.updated_at) return true;
  const ageMs = Date.now() - new Date(last.updated_at).getTime();
  if (ageMs > STALE_MS) return true;
  return haversineMeters(last.lat, last.lng, lat, lng) > MOVED_THRESHOLD_M;
}

// Enfileira a chamada no limitador global — nunca deixa duas requisições saírem
// com menos de MIN_INTERVAL_MS de intervalo, mesmo se chamado concorrentemente.
function throttled(fn) {
  chain = chain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  return chain;
}

// Retorna o endereço completo (string) ou null se falhar — falha aqui nunca
// deve impedir a posição de ser salva, só o campo address fica vazio.
export async function reverseGeocode(lat, lng) {
  try {
    return await throttled(async () => {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=0&zoom=18`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Wayvo-GT06-Tracker/1.0 (rastreamento de frota)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.display_name ?? null;
    });
  } catch (err) {
    console.warn("[geocode] falha ao consultar Nominatim:", err.message);
    return null;
  }
}
