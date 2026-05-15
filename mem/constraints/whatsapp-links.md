---
name: WhatsApp links
description: Padrão obrigatório para gerar todos os links do WhatsApp no projeto
type: constraint
---

# Regras obrigatórias para links do WhatsApp

**SEMPRE use o helper `buildWhatsAppUrl(phone, message)` de `@/lib/whatsapp`.**
Nunca monte URLs do WhatsApp manualmente em outros arquivos.

## Padrão da URL

```
https://wa.me/[número]?text=[mensagem]
```

## Regras

- ❌ **NUNCA** usar `api.whatsapp.com` — bloqueado por browsers/iframes (ERR_BLOCKED_BY_RESPONSE)
- ✅ Número: DDI + DDD + número, **apenas dígitos** (ex: `5562999887766`)
- ✅ DDI Brasil = `55` (adicionado automaticamente pelo helper quando ausente)
- ✅ Sanitizar números dinâmicos: `rawPhone.replace(/\D/g, '')`
- ✅ Mensagem **sempre** via `encodeURIComponent()` — nunca encodar manualmente
- ✅ **OBRIGATÓRIO**: `target="_blank"` **E** `rel="noopener noreferrer"` em TODOS os links wa.me. Nunca abrir na mesma aba, em iframe ou em qualquer container embutido — sempre nova aba.
- ✅ Preferir `<a href={url} target="_blank" rel="noopener noreferrer">` em vez de `window.open()` (este é bloqueado dentro do iframe do preview)
- ✅ Se for absolutamente necessário usar `window.open()`: `window.open(url, '_blank', 'noopener,noreferrer')`

## Formatação suportada na mensagem (WhatsApp)

- Negrito: `*texto*`
- Itálico: `_texto_`
- Tachado: `~texto~`
- Monoespaçado: ` ```texto``` `
- Emojis: suportados nativamente
- Acentos e pontuação: suportados

`encodeURIComponent()` cuida automaticamente de todos esses caracteres — **nunca encodar manualmente**.

## Exemplo de uso correto

```tsx
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const url = buildWhatsAppUrl(cliente.telefone, "*Olá!* Vim pelo sistema 🏍️");

<a href={url} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
```

## Helper existente

`src/lib/whatsapp.ts` exporta:
- `sanitizeWhatsAppNumber(rawPhone)` — remove não-dígitos e adiciona DDI 55
- `buildWhatsAppUrl(rawPhone, message)` — monta a URL completa no padrão `wa.me`

**Why:** Browsers bloqueiam `api.whatsapp.com` em iframes (CSP/X-Frame). Centralizar a lógica garante consistência e evita regressões.
