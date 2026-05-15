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
 * Sanitiza um telefone removendo todos os caracteres não numéricos
 * e garantindo o DDI do Brasil quando ausente.
 * Retorna string vazia se não houver dígitos.
 */
export function sanitizeWhatsAppNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return "";
  const digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return "";
  // Já vem com DDI 55 (12 ou 13 dígitos: 55 + DDD(2) + número(8 ou 9))
  if (digits.startsWith(DEFAULT_DDI) && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // Número local (10 ou 11 dígitos com DDD) → adiciona DDI 55
  if (digits.length === 10 || digits.length === 11) {
    return DEFAULT_DDI + digits;
  }
  // Outros formatos (DDI estrangeiro, número curto): retorna como veio
  return digits;
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
