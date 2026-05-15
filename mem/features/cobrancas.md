---
name: Cobranças & Follow-ups
description: Régua de cobrança por módulo (pagamento, multa, óleo, vistoria, manutenção). Sinalização automática + envio manual.
type: feature
---
- Tabelas: `collection_rules` (1 por empresa+módulo, com array `stages`) e `collection_followups` (histórico).
- Módulos cobertos: pagamento, multa, oleo, vistoria, manutencao.
- Padrão: 3 etapas (configurável), offset em DIAS após o vencimento.
- Disparo: SINALIZAÇÃO automática (frontend calcula a etapa esperada) + ENVIO MANUAL via 3 botões (copiar mensagem / copiar telefone / enviar WhatsApp). Cada clique grava em `collection_followups`.
- Régua esgotada: item vai para aba "Escalados" exigindo ação manual.
- Regularização: pagamento pago, multa paga, troca registrada, vistoria/manutenção concluída → não aparece mais como pendente.
- Página: `/cobrancas` (Pendentes / Escalados / Configurações).
- Badge inline reutilizável: `<FollowupBadge>` em `src/components/FollowupBadge.tsx`.
- Hooks: `useCollections()` em `src/hooks/useCollections.ts`.
- Templates aceitam tokens do dicionário central (`message-tokens.ts`).
