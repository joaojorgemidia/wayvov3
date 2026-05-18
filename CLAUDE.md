# WAYVO — Mapa do Projeto

## Stack
React 18 + TypeScript + Vite + Supabase + React Query + shadcn/ui + Tailwind

## Arquitetura de dados
- Todos os dados dos usuários vivem no Supabase (nuvem)
- Frontend acessa via: src/lib/store.ts → src/lib/data-cache.ts → DataContext.tsx
- DataContext.tsx faz as queries ao Supabase e popula o cache global
- Componentes leem do cache via useDataCacheSnapshot() ou hooks seletivos

## Onde cada coisa está

### Contextos (src/contexts/)
- AuthContext.tsx — autenticação Supabase
- CompanyContext.tsx — empresa ativa do usuário
- DataContext.tsx — carrega e sincroniza todos os dados do banco. Contém saveFn,
  bulkInsertFn, realtime subscriptions. NÃO contém lógica de UI.

### Cache e persistência (src/lib/)
- data-cache.ts — cache global em memória. useDataCacheSnapshot() retorna tudo.
- store.ts — funções loadXxx/saveXxx usadas pelas páginas
- db-mappers.ts — conversão entre formato DB (snake_case) e app (camelCase)
- types.ts — todos os tipos TypeScript do domínio
- financeiro-constants.ts — constantes de categorias/tags do módulo financeiro

### Páginas (src/pages/)
- FinanceiroPage.tsx — módulo financeiro completo (maior arquivo, ~4000 linhas)
- LocacoesPage.tsx — gestão de locações ativas
- ClientesPage.tsx — cadastro e consulta de clientes
- MotosPage.tsx — gestão da frota (tabs: Frota, Patrimônio, Vendidos)
- ManutencoesPage.tsx — ordens de manutenção
- CobrancasPage.tsx — painel de cobranças
- CobrancasSemanaPage.tsx — cobranças da semana
- TrocaOleoPage.tsx — controle de troca de óleo
- VistoriaPage.tsx — vistorias de entrada/saída
- ContasPage.tsx — contas bancárias e saldos
- MultasPage.tsx — multas de trânsito
- RelatoriosPage.tsx — relatórios consolidados
- RastreamentoPage.tsx — rastreamento GPS (usa Leaflet)
- Dashboard / Index — KPIs principais

### Componentes chave (src/components/)
- MotoDialog.tsx — form completo de cadastro/edição de moto (~1470 linhas)
- AppSidebar.tsx — navegação lateral
- Layout.tsx — shell da aplicação autenticada
- locacoes/RentalWizard.tsx — wizard de nova locação
- motos/ — tabs da página de motos (FrotaTab, PatrimonioTab, VendidosTab)

### Hooks (src/hooks/)
- useSupabaseData.ts — hooks CRUD genéricos por tabela
- useCollections.ts — lógica de cobranças/régua de cobrança
- usePermissions.ts — controle de permissões por role

### Edge Functions (supabase/functions/) — NUNCA MODIFICAR
- asaas-charge, asaas-webhook — integração de pagamentos
- extract-cnh, extract-crlv, extract-comprovante — OCR de documentos
- upload-vistoria-drive — upload para Google Drive
- lookup-fipe — consulta tabela FIPE
- signup-with-company — criação de conta com empresa

## Convenções
- Imports de componentes: @/components/...
- Imports de lib: @/lib/...
- Imports de páginas: ./pages/...
- Nomes de arquivo: PascalCase para componentes, camelCase para lib/hooks
- Banco de dados: snake_case. App: camelCase. Conversão em db-mappers.ts.
- IDs: crypto.randomUUID() no frontend, replicado no banco via upsert
- Soft delete: coluna deleted_at (nunca DELETE físico)

## O que NÃO fazer
- Nunca chamar Supabase diretamente de páginas — usar store.ts ou useSupabaseData
- Nunca usar localStorage para dados de negócio — apenas para config de UI
- Nunca duplicar mappers — tudo em db-mappers.ts
- Nunca modificar /supabase/functions/ sem instrução explícita
