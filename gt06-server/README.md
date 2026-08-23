# gt06-server

Servidor TCP standalone que recebe conexões de rastreadores GT06 (protocolo binário
via SIM/celular), decodifica login/posição/heartbeat e grava a última posição de
cada dispositivo na tabela `gt06_devices` do Supabase.

Não faz parte do build do app Wayvo (Vite) — roda como um processo separado, hoje
numa VPS própria (Ubuntu 24.04).

## Rodar localmente

```bash
cp .env.example .env   # preencher SUPABASE_SERVICE_ROLE_KEY
npm install
npm start
```

Testar o parser sem precisar do aparelho físico:

```bash
node src/protocol.test.mjs
```

## Deploy (Docker)

```bash
docker build -t wayvo-gt06-server .
docker run -d --name gt06-server --restart unless-stopped \
  -p 5023:5023 --env-file .env wayvo-gt06-server
docker logs -f gt06-server
```

## Configurar o rastreador físico

O aparelho precisa ser configurado (normalmente via SMS pro chip dele — o comando
exato varia por fabricante, ver manual do aparelho) pra apontar pro IP público da
VPS e a porta configurada (padrão `5023`).

Assim que ele conectar pela primeira vez, uma linha nova aparece em `gt06_devices`
com `company_id` e `moto_id` nulos — precisa ser atribuída manualmente (por SQL, ou
futuramente por uma tela) antes de aparecer no app.

## Limitações conhecidas (v1)

- Só guarda a última posição — sem histórico de trajeto.
- Sem suporte a bloqueio remoto (relé) do motor.
- O layout de bytes do protocolo GT06 varia entre fabricantes de "clone" — os logs
  em hexadecimal de cada pacote recebido (stdout) servem pra conferir/ajustar o
  parser (`src/protocol.js`) contra o aparelho real, caso a decodificação de
  latitude/longitude/hemisfério saia errada na primeira conexão.
