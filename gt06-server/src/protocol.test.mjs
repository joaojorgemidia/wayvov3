// Teste local (sem aparelho físico) — valida framing/CRC/decodificação com
// pacotes construídos à mão. Rodar com: node src/protocol.test.mjs
import { crc16, splitPackets, parsePacket, buildAck, PROTO } from "./protocol.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error(`FALHOU: ${msg}`); }
  else console.log(`ok: ${msg}`);
}

// ─── Monta um pacote válido (login) a mão pra testar o parser ────────────────
function buildTestPacket(protocolNumber, content, serial) {
  const len = 1 + content.length + 2 + 2;
  const body = Buffer.concat([
    Buffer.from([len, protocolNumber]),
    content,
    Buffer.from([(serial >> 8) & 0xff, serial & 0xff]),
  ]);
  const crc = crc16(body);
  return Buffer.concat([
    Buffer.from([0x78, 0x78]),
    body,
    Buffer.from([(crc >> 8) & 0xff, crc & 0xff]),
    Buffer.from([0x0d, 0x0a]),
  ]);
}

// ─── Login: IMEI 123456789012345 em BCD (8 bytes, com zero à esquerda) ──────
const imeiDigits = "0123456789012345"; // 16 dígitos (1 zero à esquerda + 15 do IMEI)
const imeiBytes = Buffer.alloc(8);
for (let i = 0; i < 8; i++) {
  const hi = parseInt(imeiDigits[i * 2], 10);
  const lo = parseInt(imeiDigits[i * 2 + 1], 10);
  imeiBytes[i] = (hi << 4) | lo;
}
const loginPacket = buildTestPacket(PROTO.LOGIN, imeiBytes, 1);
const { packets: loginPackets, rest: loginRest } = splitPackets(loginPacket);
assert(loginPackets.length === 1, "login: extraiu exatamente 1 pacote");
assert(loginRest.length === 0, "login: sem sobra no buffer");
const loginParsed = parsePacket(loginPackets[0]);
assert(loginParsed.crcOk, "login: CRC válido");
assert(loginParsed.imei === "123456789012345", `login: IMEI decodificado corretamente (veio "${loginParsed.imei}")`);

// ─── GPS: lat -16.6799 (Goiânia), lng -49.2550, velocidade 42km/h, curso 180° ─
const lat = -16.6799;
const lng = -49.2550;
const latRaw = Math.round(Math.abs(lat) * 30000 * 60);
const lngRaw = Math.round(Math.abs(lng) * 30000 * 60);
const speed = 42;
const course = 180;
// bit 0x0400 = 0 (sul), bit 0x0800 = 1 (oeste — polaridade confirmada contra
// aparelho real, ver comentário em decodeGps), bit 0x2000 = 1 (fix tempo real)
const courseStatus = course | 0x0800 | 0x2000;
const gpsContent = Buffer.alloc(18);
gpsContent[0] = 26; // ano (2026)
gpsContent[1] = 8;  // mês
gpsContent[2] = 23; // dia
gpsContent[3] = 12; // hora
gpsContent[4] = 30; // minuto
gpsContent[5] = 0;  // segundo
gpsContent[6] = 0xc0; // satélites (irrelevante pro teste)
gpsContent.writeUInt32BE(latRaw, 7);
gpsContent.writeUInt32BE(lngRaw, 11);
gpsContent[15] = speed;
gpsContent.writeUInt16BE(courseStatus, 16);

const gpsPacket = buildTestPacket(PROTO.GPS_LOCATION, gpsContent, 2);
const { packets: gpsPackets } = splitPackets(gpsPacket);
assert(gpsPackets.length === 1, "gps: extraiu exatamente 1 pacote");
const gpsParsed = parsePacket(gpsPackets[0]);
assert(gpsParsed.crcOk, "gps: CRC válido");
assert(Math.abs(gpsParsed.gps.lat - lat) < 0.0001, `gps: latitude bate (esperado ${lat}, veio ${gpsParsed.gps.lat})`);
assert(Math.abs(gpsParsed.gps.lng - lng) < 0.0001, `gps: longitude bate (esperado ${lng}, veio ${gpsParsed.gps.lng})`);
assert(gpsParsed.gps.speed === speed, `gps: velocidade bate (${gpsParsed.gps.speed})`);
assert(gpsParsed.gps.course === course, `gps: curso bate (${gpsParsed.gps.course})`);
assert(gpsParsed.gps.realTimeFix === true, "gps: flag de fix em tempo real bate");

// ─── Dois pacotes concatenados no mesmo buffer (simula TCP juntando writes) ──
const combined = Buffer.concat([loginPacket, gpsPacket]);
const { packets: combinedPackets, rest: combinedRest } = splitPackets(combined);
assert(combinedPackets.length === 2, `combinado: extraiu 2 pacotes (veio ${combinedPackets.length})`);
assert(combinedRest.length === 0, "combinado: sem sobra");

// ─── Pacote partido ao meio (simula TCP fragmentando) ────────────────────────
const half = Math.floor(loginPacket.length / 2);
const { packets: partialPackets, rest: partialRest } = splitPackets(loginPacket.subarray(0, half));
assert(partialPackets.length === 0, "fragmentado: nenhum pacote completo ainda");
assert(partialRest.length === half, "fragmentado: sobra guardada pra completar depois");
const { packets: completedPackets } = splitPackets(Buffer.concat([partialRest, loginPacket.subarray(half)]));
assert(completedPackets.length === 1, "fragmentado: completa corretamente ao juntar o resto");

// ─── ACK: o pacote de resposta que construímos precisa ele mesmo ser um
// pacote válido (round-trip: parseia o ACK que a gente gera) ─────────────────
const ack = buildAck(PROTO.LOGIN, 1);
const { packets: ackPackets } = splitPackets(ack);
assert(ackPackets.length === 1, "ack: é um pacote bem formado");
const ackParsed = parsePacket(ackPackets[0]);
assert(ackParsed.crcOk, "ack: CRC do próprio ACK válido");
assert(ackParsed.protocolNumber === PROTO.LOGIN, "ack: protocolo ecoado corretamente");
assert(ackParsed.serial === 1, "ack: serial ecoado corretamente");

console.log(failures === 0 ? "\nTodos os testes passaram." : `\n${failures} teste(s) falharam.`);
process.exit(failures === 0 ? 0 : 1);
