/**
 * Helper centralizado para gerar links do WhatsApp.
 *
 * REGRAS OBRIGATÓRIAS (ver instruções do projeto):
 *  - SEMPRE usar https://wa.me/[número]?text=[mensagem]
 *  - NUNCA usar api.whatsapp.com (bloqueado por browsers/iframes)
 *  - Número: DDI + DDD + número, apenas dígitos (ex: 5562999887766)
 *  - DDI Brasil = 55 (assumido quando ausente)
 *  - Mensagem encodada via encodeURIComponent
 *  - Link sempre abre em nova aba (target="_blank")
 *
 * Use SEMPRE este helper. Não monte URLs de WhatsApp manualmente em
 * outros arquivos.
 */

const DEFAULT_DDI = "55"; // Brasil

/**
 * Sanitiza um telefone removendo todos os caracteres não numéricos e normalizando
 * sempre para o padrão fixo 55DDDXXXXXXXXX (DDI 55 + DDD com 2 dígitos + número
 * com 9 dígitos, 13 dígitos no total). Números antigos sem o 9º dígito (8 dígitos)
 * recebem o "9" na frente do número — é o formato que o WhatsApp exige.
 * Retorna string vazia se não houver DDD reconhecível.
 */
export function sanitizeWhatsAppNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return "";
  // Remove um DDI 55 já presente para sempre normalizar a partir do número local (DDD + número).
  if (digits.startsWith(DEFAULT_DDI) && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length < 10) return digits; // sem DDD reconhecível — não força o padrão
  const ddd = digits.slice(0, 2);
  let numero = digits.slice(2);
  if (numero.length === 8) numero = "9" + numero; // celular antigo sem o 9º dígito
  else if (numero.length > 9) numero = numero.slice(-9); // descarta lixo residual à esquerda
  return DEFAULT_DDI + ddd + numero;
}

/**
 * Monta a URL do WhatsApp no formato canônico https://wa.me/[num]?text=[msg].
 * Se o número estiver vazio/ inválido, usa o formato sem número
 * (https://wa.me/?text=...) que abre o WhatsApp para o usuário escolher
 * o destinatário.
 */
export function buildWhatsAppUrl(rawPhone: string | null | undefined, message: string): string {
  const number = sanitizeWhatsAppNumber(rawPhone);
  const text = encodeURIComponent(message ?? "");
  return number
    ? `https://wa.me/${number}?text=${text}`
    : `https://wa.me/?text=${text}`;
}
