# twenty-edge

API do Twenty reimplementada em Hono, rodando 100% em Cloudflare Workers.

Não é um port do `twenty-server`: é uma reescrita que lê o código NestJS como
especificação. A auditoria mediu que portar o monólito custaria 29–49 pessoa-mês,
porque 7.094 dos 7.445 arquivos são alcançáveis de `main.ts` e ~40 mil linhas
(marketplace, logic functions, IMAP/SMTP, filas) não existem dentro de um isolate.

Três coisas tornam a reescrita barata:

1. **O ORM de records já não usa TypeORM** — `twenty-orm/sql/build-select-statement.util.ts`
   é um gerador de SQL escrito à mão sobre `pg`, com parâmetros nomeados.
2. **O GraphQL Yoga é nativo de `fetch`** e já é o que o Twenty usa.
3. **~88.000 linhas do núcleo são copiáveis** (`twenty-shared`, família `flat-*`,
   definições declarativas dos 31 objetos padrão).

## Stack

| Peça | Escolha | Por quê |
|---|---|---|
| HTTP | Hono | fetch-native, sem DI, sem decorators |
| Postgres | Hyperdrive → Supabase | `new Client()` por request; Pool e singletons vazam socket entre requests |
| GraphQL | Yoga | mesmo motor do servidor atual, roda em Workers |
| Arquivos | R2 | presigned PUT direto do browser |
| Cache de metadata | KV | versionado por `workspace.metadataVersion` |
| Sessão | Postgres | `core."userSession"."tokenHash"` — **por isso não precisamos de Redis** |
| Senha | PBKDF2/WebCrypto | bcrypt é addon nativo, não carrega num isolate |
| Validação | zod | substitui os 353 arquivos de `class-validator` |

## Estado

No ar em `https://crm.campuzz.com.br`, servindo o `twenty-front` sem modificação.

**Funciona:**
- Auth completa — senha em PBKDF2, sessão no Postgres, cookie `__Host-`, CSRF por
  `Origin`, throttle no Redis. Uma ida ao banco por request.
- Metadata dinâmica: objetos e campos criados pela tela, com DDL real.
- Records: CRUD, compostos, relações, relações morph, paginação por cursor,
  soft delete, restore, destroy, upsert.
- Views salvas: colunas, filtros, ordenações, grupos — as 20 mutations do front.
- Anexos no R2, com token de upload que só escreve o próprio arquivo.
- Timeline com diff de verdade em toda criação, alteração, exclusão e restauração.
- Busca global em Postgres, com acento dobrado dos dois lados.
- Kanban e agrupamento, com granularidade de data e fuso.
- Papéis e permissões, aplicados na API — `/graphql`, `/rest/*` e a busca.
- Duplicados e merge, com `dryRun` e as relações reapontadas antes do delete.
- Convites: criar, listar, reenviar, revogar e aceitar. O e-mail sai por HTTP
  (Resend) quando a key existe; sem ela o link volta para quem convidou.
- REST e um subconjunto do OpenAPI derivados do mesmo metadata.
- Erros mascarados: só os deliberados chegam ao navegador com mensagem; um erro
  do Postgres vira `Unexpected error.`

**A única credencial que falta** é a do provedor de e-mail: `SENDGRID_API_KEY`
e `EMAIL_FROM`, por `wrangler secret put`. Sem elas tudo funciona, menos a
entrega da mensagem — o link do convite volta na resposta para quem convidou.

A key é a do SendGrid, a que começa com `SG.`. Se o que você tem é o bloco SMTP
deles, é o mesmo segredo: o usuário é literalmente `apikey` e a senha é a key.
SMTP em si não serve — não existe socket na 587 dentro de um Worker.
`EMAIL_FROM` precisa ser um remetente ou domínio verificado no SendGrid, senão
a API recusa com 403.

**Fora do plano, e por quê:** sincronização de e-mail e agenda, workflows,
webhooks, billing, SSO, 2FA, atualização ao vivo por SSE. Cada um é um projeto
próprio, e os primeiros não cabem num isolate sem peça nova (fila, Durable
Object, ou um serviço fora do Worker).

Sobre o SSE em particular: o stream **existe** — as três operações que o front
usa respondem — mas nada é emitido depois do primeiro evento. São três, não uma:
a subscription abre o stream, e `addQueryToEventStream` /
`removeQueryFromEventStream` registram as queries que querem atualização.
Faltar qualquer uma é 400 em toda tabela que o app abre.

O primeiro evento não é decoração: é nele que o front liga
`sseEventStreamReadyState`, e os efeitos que registram query esperam por essa
flag. Um stream que abre e fica calado deixa o app inteiro no esqueleto de
carregamento — foi exatamente o que aconteceu aqui antes de o handshake existir.

Cada pessoa vê as próprias mudanças, pelos eventos que o front dispara
localmente; o que falta é a mudança de outra pessoa aparecer sem recarregar.

## Rodar

```bash
# 1. aplicar o baseline no Postgres, em ordem
for f in sql/*.sql; do psql "$PG_DATABASE_URL" -f "$f"; done

# 2. criar o Hyperdrive e preencher o id no wrangler.jsonc
npx wrangler hyperdrive create twenty --connection-string="$PG_DATABASE_URL"

# 3. subir
npx wrangler dev
curl localhost:8787/healthz
curl localhost:8787/client-config
```

## Pegadinhas já mapeadas

| Detalhe | Origem |
|---|---|
| `eq: ''` também casa NULL — `findPostgresDefaultNullEquivalentValue` trata `''`, `'{}'` como equivalentes a NULL | `compute-where-condition-parts.ts:49` |
| O nome do cookie muda com HTTPS; o logout limpa os dois | `user-session-cookie.service.ts:65-75` |
| ADDRESS tem prefixo duplo: campo `address` vira coluna `addressAddressCity` | `prefill-companies.util.ts` |
| `/graphql` rejeita operações que misturem campos core e de workspace | `use-direct-execution.hook.ts:63-69` |
| DDL não aceita bind params — `escapeIdentifier` é obrigatório | `remove-sql-injection.util.ts` |
| `isUnique` e `isSearchable` não são colunas, são derivados | `field-metadata.entity.ts:184-186` |
| Só o lado MANY_TO_ONE de uma relação gera coluna | `generate-column-definitions.util.ts:123` |
| `twenty-shared/utils` é barrel e arrasta `handlebars` (usa eval) — importar por subcaminho | `twenty-shared/src/utils/index.ts` |
| Uma coluna gerada só chama função imutável — `unaccent` não é uma, daí `public.unaccent_immutable()` | `setup-db.ts` |
| O Postgres recusa derrubar uma coluna de que uma coluna gerada depende: reconstruir o `searchVector` antes | — |
| `ON CONFLICT` contra índice único parcial precisa repetir o `WHERE` do índice | — |
| `client.end()` do pg destrói o socket se houver query em voo — nada de `waitUntil` com o client da request | — |
