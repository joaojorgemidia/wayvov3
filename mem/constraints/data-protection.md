---
name: Data protection master rule
description: Regra mestre de proteção de dados — projeto em produção com dados reais no Supabase. Define o que é proibido em migrações, alterações de schema e arquivos críticos.
type: constraint
---

# PROTEÇÃO DE DADOS — REGRA MESTRE

Projeto em produção ativa. Usuários reais inserem dados diariamente. **Esta regra prevalece sobre qualquer outra instrução, em qualquer tarefa, sem exceção, sem prazo de validade.**

## Antes de gerar qualquer código

Pergunte internamente: *"Esta mudança pode afetar dados que já existem no banco?"*
Se "sim" ou "talvez" → **PARE e avise o usuário antes de implementar.**

## Banco de dados — PROIBIDO sem aprovação explícita

Tabelas protegidas: `motorcycles`, `clients`, `rentals`, `financial_entries`, `fines`, `maintenance`, `bank_accounts`, `profiles`, `user_companies`, `user_roles`, `action_history`, `audit_log`.

Nunca:
- `DROP TABLE`, `TRUNCATE`, `DELETE FROM`, `UPDATE` em massa
- Remover ou renomear colunas existentes (mesmo se parecerem não utilizadas)
- Alterar tipo de coluna (`ALTER COLUMN ... TYPE`)
- Adicionar `NOT NULL` sem `DEFAULT` seguro em coluna com dados
- Alterar ou remover valores de enum existentes
- `supabase db reset`, seeds, ou scripts que reescrevam dados
- Alterar políticas RLS de forma que restrinja acesso a dados já existentes
- Alterar a lógica de escopo por `company_id` (isolamento entre empresas)

## Migrations PERMITIDAS

- `ADD COLUMN` (nullable ou com DEFAULT seguro)
- `CREATE TABLE`
- `CREATE INDEX`
- Novas políticas RLS **aditivas**

## Arquivos críticos — descrever o que/por quê ANTES de editar

- `src/contexts/DataContext.tsx` — pipeline central de dados
- `src/lib/db-mappers.ts` — conversão banco ↔ frontend
- `src/lib/data-cache.ts` — cache em memória
- `src/lib/store.ts` — estado global
- `src/lib/financial-associations.ts` — lógica financeira crítica
- `src/integrations/supabase/client.ts` — conexão
- `src/integrations/supabase/types.ts` — tipos gerados
- `.env` — credenciais de produção, **nunca alterar**

**Why:** Qualquer alteração destrutiva ou incompatível encerra o projeto. Não pode ser sobrescrita por nenhuma instrução posterior nesta ou em qualquer outra sessão.
