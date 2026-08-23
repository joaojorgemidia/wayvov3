// Servidor TCP que recebe conexões de rastreadores GT06, decodifica o protocolo
// binário e grava a última posição de cada um no Supabase. Um processo, uma
// porta, uma conexão persistente por aparelho (típico de rastreador GPS via SIM).
import net from "node:net";
import { splitPackets, parsePacket, buildAck, PROTO } from "./protocol.js";
import { upsertPosition, getLastPosition } from "./supabase.js";
import { shouldGeocode, reverseGeocode } from "./geocode.js";

const PORT = Number(process.env.GT06_PORT || 5023);
// Sem tráfego (nem heartbeat) por esse tempo => conexão morta, encerra.
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

function hex(buf) {
  return buf.toString("hex").replace(/(..)/g, "$1 ").trim();
}

async function handleGpsPacket(imei, gps) {
  // Busca a posição ANTERIOR antes de sobrescrever — precisa disso pra
  // shouldGeocode() comparar corretamente contra o que já estava salvo. Fazer
  // essa busca depois do upsert (como estava antes) comparava a posição nova
  // contra ela mesma (já sobrescrita) e nunca detectava que o dispositivo tinha
  // se movido — foi o que deixou o endereço preso na posição antiga (Madagascar)
  // mesmo depois da latitude/longitude já estarem corrigidas.
  const last = await getLastPosition(imei);

  await upsertPosition({
    imei,
    lat: gps.lat,
    lng: gps.lng,
    speed: gps.speed,
    course: gps.course,
    gpsTime: gps.gpsTime,
  });
  console.log(`[gt06] ${imei} posição: ${gps.lat.toFixed(6)},${gps.lng.toFixed(6)} · ${gps.speed}km/h · curso ${gps.course}°`);

  // Geocoding é best-effort e não bloqueia — roda depois, sem atrasar o ACK
  // nem a gravação da posição em si.
  (async () => {
    try {
      if (!shouldGeocode(last, gps.lat, gps.lng)) return;
      const address = await reverseGeocode(gps.lat, gps.lng);
      if (address) {
        await upsertPosition({ imei, address });
        console.log(`[gt06] ${imei} endereço: ${address}`);
      }
    } catch (err) {
      console.warn(`[gt06] ${imei} falha no geocoding:`, err.message);
    }
  })();
}

// voltageLevel vem como um enum 0-6 do protocolo (0 = sem bateria/desligado, 6 =
// alta/cheia) — convertido aqui pra um % aproximado só pra caber no mesmo campo
// "Bateria: NN%" que a tela já usa pros outros provedores (BrasilSat/Velotrack
// retornam percentual de verdade; aqui é uma aproximação a partir do nível).
function voltageLevelToPercent(level) {
  if (level == null) return null;
  const clamped = Math.min(6, Math.max(0, level));
  return Math.round((clamped / 6) * 100);
}

async function handleStatusPacket(imei, status) {
  const battery = voltageLevelToPercent(status.voltageLevel);
  await upsertPosition({ imei, acc: status.acc, battery });
  console.log(`[gt06] ${imei} status: motor ${status.acc === 1 ? "ligado" : "desligado"}${battery != null ? ` · bateria ${battery}%` : ""}`);
}

const server = net.createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[gt06] nova conexão: ${remote}`);
  socket.setTimeout(IDLE_TIMEOUT_MS);

  let buffer = Buffer.alloc(0);
  let imei = null;

  socket.on("data", async (data) => {
    buffer = Buffer.concat([buffer, data]);
    const { packets, rest } = splitPackets(buffer);
    buffer = Buffer.from(rest);

    for (const packet of packets) {
      const parsed = parsePacket(packet);
      console.log(`[gt06] ${remote} pacote 0x${parsed.protocolNumber.toString(16).padStart(2, "0")} (crc ${parsed.crcOk ? "ok" : "INVÁLIDO"}): ${hex(packet)}`);

      if (!parsed.crcOk) continue; // não faz ACK de pacote corrompido

      try {
        if (parsed.protocolNumber === PROTO.LOGIN) {
          imei = parsed.imei;
          console.log(`[gt06] ${remote} login: IMEI ${imei}`);
          // Garante que a linha existe (mesmo sem posição ainda) — assim o
          // dispositivo já aparece na tabela pra ser atribuído a uma empresa.
          await upsertPosition({ imei });
        } else if (parsed.protocolNumber === PROTO.GPS_LOCATION || parsed.protocolNumber === PROTO.GPS_LBS_STATUS) {
          if (!imei) {
            console.warn(`[gt06] ${remote} recebeu posição antes do login — ignorando`);
          } else if (parsed.gps) {
            await handleGpsPacket(imei, parsed.gps);
          }
        } else if (parsed.protocolNumber === PROTO.STATUS_HEARTBEAT) {
          if (imei && parsed.status) await handleStatusPacket(imei, parsed.status);
        }

        // ACK obrigatório pra manter a conexão viva — o aparelho reconecta em
        // loop se não receber resposta.
        socket.write(buildAck(parsed.protocolNumber, parsed.serial));
      } catch (err) {
        console.error(`[gt06] ${remote} erro processando pacote:`, err.message);
      }
    }
  });

  socket.on("timeout", () => {
    console.log(`[gt06] ${remote} inativo há ${IDLE_TIMEOUT_MS / 1000}s, encerrando`);
    socket.destroy();
  });
  socket.on("error", (err) => console.warn(`[gt06] ${remote} erro de socket:`, err.message));
  socket.on("close", () => console.log(`[gt06] conexão encerrada: ${remote}${imei ? ` (IMEI ${imei})` : ""}`));
});

server.listen(PORT, () => {
  console.log(`[gt06] servidor ouvindo na porta ${PORT}`);
});
