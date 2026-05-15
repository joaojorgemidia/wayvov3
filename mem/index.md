# Project Memory

## Core
WhatsApp: SEMPRE usar `buildWhatsAppUrl()` de `src/lib/whatsapp.ts` (formato wa.me, nunca api.whatsapp.com).
Tokens de mensagem: usar dicionário central `src/lib/message-tokens.ts` (catálogo, builders e `applyTokens`).
Lovable Cloud habilitado. RLS por `company_id` via `get_user_companies(auth.uid())`.

## Memories
- [Cobranças & Follow-ups](mem://features/cobrancas) — Régua por módulo, sinalização auto + envio manual, página /cobrancas
- [Data protection](mem://constraints/data-protection)
- [WhatsApp links](mem://constraints/whatsapp-links)
- [Message tokens](mem://preferences/message-tokens)
