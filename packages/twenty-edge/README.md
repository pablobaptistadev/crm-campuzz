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

**Pronto (fase 0–1 parcial):**
- Roteamento por `ApiPath` com match de primeiro segmento exato — resolve o prefixo
  de uma letra `s` sem capturar `/static/*`
- `GET /client-config` com o shape completo que o `useClientConfig` do front lê
- `GET /healthz` medindo latência real Worker→Postgres
- Cliente Hyperdrive por request, com `DATE` devolvido como string
- Hash de senha PBKDF2 com comparação em tempo constante
- Token de sessão + cookie `__Host-`, limpando os dois nomes no logout
- DDL baseline do `core` para auth (`sql/0001_core_baseline.sql`)

**Próximo:** resolvers de auth no `/metadata` (`checkUserExists`,
`getLoginTokenFromCredentials`, `getAuthTokensFromLoginToken`, `signIn`, `signUp`,
`signOut`, `currentUser`), depois metadata read, depois o motor de records.

## Rodar

```bash
# 1. aplicar o baseline no Postgres
psql "$PG_DATABASE_URL" -f sql/0001_core_baseline.sql

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
