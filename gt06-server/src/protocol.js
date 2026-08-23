// Parser do protocolo GT06 (rastreador GPS binário via TCP).
//
// Formato do pacote:
//   [78 78] [len:1] [protocolo:1] [conteúdo:N] [serial:2] [crc:2] [0D 0A]
// (pacotes 79 79 usam len de 2 bytes — não tratados aqui: nenhum dos pacotes
// básicos que interessam pro nosso escopo, posição/heartbeat/login, costuma
// precisar disso; se aparecer um 79 79 no log, é sinal de que o firmware manda
// um pacote estendido que ainda não cobrimos.)
//
// AVISO: existem várias variantes de "clone GT06" no mercado com pequenas
// diferenças de layout de bytes. Isto implementa a leitura mais documentada do
// protocolo "core" (login, posição GPS, heartbeat) — os logs em hex de cada
// pacote bruto (ver index.js) servem pra conferir/ajustar contra o aparelho real
// assim que ele conectar.

export const PROTO = {
  LOGIN: 0x01,
  GPS_LOCATION: 0x12,
  GPS_LBS_STATUS: 0x22, // GPS + LBS combinado (variante mais nova)
  STATUS_HEARTBEAT: 0x13,
  ALARM: 0x16,
};

// ─── CRC-16/X-25 (poly 0x1021, init 0xFFFF, refin/refout, xorout 0xFFFF) ──────
// Mesmo algoritmo usado pelo protocolo GT06 pra validar o pacote.
const CRC_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
    }
    table[i] = crc & 0xffff;
  }
  return table;
})();

export function crc16(buf) {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc = ((crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]) & 0xffff;
  }
  return (crc ^ 0xffff) & 0xffff;
}

// ─── Extrai pacotes completos de um buffer acumulado (pode conter vários,
// ou um pacote parcial no final — devolve os pacotes prontos + o restante) ────
export function splitPackets(buffer) {
  const packets = [];
  let offset = 0;
  while (offset < buffer.length) {
    // procura o start bit 78 78
    if (buffer[offset] !== 0x78 || buffer[offset + 1] !== 0x78) {
      offset++;
      continue;
    }
    if (offset + 3 > buffer.length) break; // não deu pra ler nem o length ainda
    const len = buffer[offset + 2];
    const totalLen = 2 /*start*/ + 1 /*len*/ + len + 2 /*stop*/;
    if (offset + totalLen > buffer.length) break; // pacote incompleto, espera mais dados
    const packet = buffer.subarray(offset, offset + totalLen);
    if (packet[totalLen - 2] === 0x0d && packet[totalLen - 1] === 0x0a) {
      packets.push(packet);
      offset += totalLen;
    } else {
      // stop bits não bateram — descarta esse 78 78 e tenta achar o próximo
      offset += 2;
    }
  }
  return { packets, rest: buffer.subarray(offset) };
}

// ─── Decodifica um pacote (já validado com start/stop bits corretos) ─────────
export function parsePacket(packet) {
  const len = packet[2];
  const protocolNumber = packet[3];
  // len cobre protocolo(1) + conteúdo(N) + serial(2) + crc(2) = N + 5
  const contentLen = Math.max(0, len - 5);
  const content = packet.subarray(4, 4 + contentLen);
  const serial = packet.readUInt16BE(4 + contentLen);
  const crcReceived = packet.readUInt16BE(4 + contentLen + 2);
  // CRC cobre do byte de length (inclusive) até o fim do serial (exclusive do próprio CRC)
  const crcCalc = crc16(packet.subarray(2, 4 + contentLen + 2));
  const crcOk = crcReceived === crcCalc;

  const result = { protocolNumber, serial, content, crcOk, raw: packet };

  if (!crcOk) return result;

  switch (protocolNumber) {
    case PROTO.LOGIN:
      result.imei = decodeImei(content);
      break;
    case PROTO.GPS_LOCATION:
    case PROTO.GPS_LBS_STATUS:
      result.gps = decodeGps(content);
      break;
    case PROTO.STATUS_HEARTBEAT:
      result.status = decodeStatus(content);
      break;
    default:
      break;
  }
  return result;
}

// IMEI vem em 8 bytes BCD (cada nibble = 1 dígito). O resultado costuma sair
// com 15-16 dígitos; removemos um zero à esquerda se sobrar 16.
function decodeImei(content) {
  let digits = "";
  for (let i = 0; i < 8 && i < content.length; i++) {
    const byte = content[i];
    digits += ((byte >> 4) & 0xf).toString();
    digits += (byte & 0xf).toString();
  }
  return digits.replace(/^0+(?=\d{15}$)/, "");
}

// Pacote de posição GPS (0x12/0x22): data/hora + lat/lng + velocidade + curso.
function decodeGps(content) {
  if (content.length < 18) return null;
  const year = 2000 + content[0];
  const month = content[1];
  const day = content[2];
  const hour = content[3];
  const minute = content[4];
  const second = content[5];
  // byte 6: comprimento do bloco GPS (nibble alto) + nº de satélites (nibble baixo) — não usado aqui
  const latRaw = content.readUInt32BE(7);
  const lngRaw = content.readUInt32BE(11);
  const speed = content[15];
  const courseStatus = content.readUInt16BE(16);

  // Latitude/longitude vêm como (graus * 60 * 30000). Sinal (N/S, E/W) e se o
  // fix é "tempo real" ficam nos bits altos de courseStatus:
  //   bit 0x0400 = 0 -> hemisfério sul (inverte o sinal da latitude)
  //   bit 0x0800 = 1 -> hemisfério oeste (inverte o sinal da longitude)
  //   bits 0x03FF = curso em graus (0-359)
  // A polaridade do bit de longitude (0x0800) foi confirmada/corrigida contra um
  // aparelho real (clone GT06) — a documentação "padrão" do protocolo costuma
  // descrever o oposto (bit setado = leste), mas esse firmware manda invertido;
  // ver aviso no topo do arquivo sobre variação entre clones.
  let lat = latRaw / 30000 / 60;
  let lng = lngRaw / 30000 / 60;
  if ((courseStatus & 0x0400) === 0) lat = -lat;
  if ((courseStatus & 0x0800) !== 0) lng = -lng;
  const course = courseStatus & 0x03ff;
  const realTimeFix = (courseStatus & 0x2000) !== 0;

  const gpsTime = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return { lat, lng, speed, course, realTimeFix, gpsTime };
}

// Pacote de status/heartbeat (0x13): traz o estado do ACC (motor ligado/desligado).
function decodeStatus(content) {
  if (content.length < 1) return null;
  const terminalInfo = content[0];
  // bit 0x02 do byte de info do terminal = ACC (motor) ligado
  const acc = (terminalInfo & 0x02) !== 0 ? 1 : 0;
  const voltageLevel = content.length > 1 ? content[1] : null;
  const gsmSignal = content.length > 2 ? content[2] : null;
  return { acc, voltageLevel, gsmSignal };
}

// ─── Monta o pacote de ACK que precisa ser respondido pra cada pacote recebido
// (senão o aparelho considera a conexão morta e reconecta em loop). ───────────
export function buildAck(protocolNumber, serial) {
  const content = Buffer.alloc(0);
  const len = 1 + content.length + 2 + 2; // protocolo + conteúdo + serial + crc
  const body = Buffer.alloc(1 + len - 2); // len byte + protocolo + conteúdo + serial (sem crc ainda)
  body[0] = len;
  body[1] = protocolNumber;
  body.writeUInt16BE(serial, 2);
  const crc = crc16(body);
  return Buffer.concat([
    Buffer.from([0x78, 0x78]),
    body,
    Buffer.from([(crc >> 8) & 0xff, crc & 0xff]),
    Buffer.from([0x0d, 0x0a]),
  ]);
}
