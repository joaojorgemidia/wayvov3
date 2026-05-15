---
name: Message tokens dictionary
description: Padrão único de placeholders {TOKEN} para mensagens (WhatsApp, e-mail, contratos) — builders centralizados em src/lib/message-tokens.ts
type: preference
---

## Regra
Toda mensagem dinâmica do sistema (WhatsApp, e-mail, modelos editáveis, contratos)
deve usar **placeholders padronizados** vindos do dicionário central
`src/lib/message-tokens.ts`. Nunca interpolar valores diretos em templates editáveis.

## Convenção de nome
- Sempre `{TOKEN}` em **MAIÚSCULAS**, **somente ASCII**.
- Sublinhado `_` para palavras compostas: `{KM_ATUAL}`, `{NUM_MOTOR}`, `{NIVEL_COMBUSTIVEL}`.
- Nada de acentos/símbolos: use `NUM_MOTOR` (não `Nº_MOTOR`), `NIVEL_COMBUSTIVEL` (não `NÍVEL`).

## Como aplicar
```ts
import { buildAllTokens, applyTokens } from "@/lib/message-tokens";

const tokens = buildAllTokens({ moto, rental, cliente, oil: { ... } });
const text = applyTokens(template, tokens);
```

Builders disponíveis:
- `vehicleTokens(moto)` → PLACA, MARCA, MODELO, ANO, COR, CHASSI, RENAVAM, NUM_MOTOR, KM_ATUAL, TIPO_VEICULO, PROPRIETARIO
- `rentalTokens(rental)` → NUMERO_LOCACAO, DATA_INICIO, HORA_INICIO, DATA_FIM_CONTRATO, PROXIMO_PAGAMENTO, VALOR_DIARIO, VALOR_CAUCAO, PLANO, FREQUENCIA_PAGAMENTO, LOCAL_RETIRADA, LOCAL_DEVOLUCAO, KM_INICIO, NIVEL_COMBUSTIVEL, RAIO_CIRCULACAO, VENDEDOR
- `clientTokens(cliente)` → NOME, CPF, TELEFONE, EMAIL, ENDERECO, CEP, CIDADE, ESTADO, EMERGENCIA_NOME_1/TEL_1/NOME_2/TEL_2
- `driverTokens(cliente)` → CNH, CNH_CATEGORIA, CNH_VALIDADE
- `oilTokens({ kmTroca, dataTroca, proxOleoKm, proxFiltroKm, kmAtraso, diasSemTroca, mediaAtrasoKm, amostrasAtraso, palavraChave, dataHoje })`

Inverso: `tokenize(text, tokens)` → substitui valores conhecidos por `{TOKEN}` (usado ao salvar modelo editado pelo usuário).

**Why:** unifica todas as mensagens, evita placeholders inconsistentes (`{nome}`, `{Nome}`, `{NOME_CLIENTE}`) e permite usuário criar templates editáveis seguros.

**How to apply:** ao adicionar nova mensagem, NUNCA criar tokens locais — sempre estender o catálogo em `message-tokens.ts` se faltar algo.