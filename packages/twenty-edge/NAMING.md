# Nomenclatura dos recursos Cloudflare — CR-Campuzz

## Regra

```
campuzz-<recurso>[-<qualificador>]-<ambiente>
```

- **Minúsculo, só `[a-z0-9-]`.** R2 e Queues rejeitam `_`.
- **Sem prefixo `cr-`.** A conta já é CR-Campuzz; repetir isso em cada nome só
  gasta caracteres, e os nomes de fila ficam longos (serão ~22).
- **Ambiente sempre no fim**, nunca no meio: facilita `ls | grep -- -prod`.
- **Bindings em SCREAMING_SNAKE_CASE**, e o binding descreve a função, não o
  produto — `FILES`, não `R2`. Trocar de provedor não deve renomear o binding.

Conta: `51eb880ef71493c1e995c9fb5906e367` (não é segredo, fica no `wrangler.jsonc`).

## Recursos

| Serviço | prod | staging | Binding |
|---|---|---|---|
| Worker (API + SPA) | `campuzz-edge-prod` | `campuzz-edge-stg` | — |
| R2 (anexos) | `campuzz-files-prod` | `campuzz-files-stg` | `FILES` |
| KV (cache de metadata) | `campuzz-metadata-cache-prod` | `campuzz-metadata-cache-stg` | `METADATA_CACHE` |
| Hyperdrive (→ Supabase) | `campuzz-pg-prod` | `campuzz-pg-stg` | `HYPERDRIVE` |
| Worker consumidor de filas *(fase 8)* | `campuzz-queue-consumer-prod` | `campuzz-queue-consumer-stg` | — |
| Durable Object p/ SSE *(fase 8)* | classe `WorkspaceEventHub` | idem | `EVENT_HUB` |

### Filas *(fase 8)*

`campuzz-q-<fila-lógica>-<lane>-prod`, com `<lane>` omitido quando há lane única.
Só `logicFunction` precisa de lanes, porque é a única fila com override de
prioridade nos dois sentidos (`SERVER_ROUTE_DISPATCH_JOB_PRIORITY = 1` e
`ENQUEUE_JOB_PRIORITY = 10`).

```
campuzz-q-messaging-prod            campuzz-q-workflow-prod
campuzz-q-webhook-prod              campuzz-q-delayed-jobs-prod
campuzz-q-cron-prod                 campuzz-q-delete-cascade-prod
campuzz-q-email-prod                campuzz-q-logic-function-high-prod
campuzz-q-campaign-prod             campuzz-q-logic-function-prod
campuzz-q-campaign-send-prod        campuzz-q-logic-function-low-prod
campuzz-q-calendar-prod             campuzz-q-trigger-prod
campuzz-q-connected-account-sync-webhook-prod
campuzz-q-contact-creation-prod     campuzz-q-ai-prod
campuzz-q-billing-prod              campuzz-q-ai-stream-prod
campuzz-q-workspace-prod            campuzz-q-dlq-prod
campuzz-q-entity-events-to-db-prod
```

21 filas + 1 DLQ. `taskAssignedQueue` não entra: é fila morta no código atual,
sem produtor e sem `@Processor`.

## Domínios

| Domínio | Aponta para |
|---|---|
| `crm.<dominio>` | Worker `campuzz-edge-prod` |
| `stg.crm.<dominio>` | Worker `campuzz-edge-stg` |
| `files.<dominio>` | Custom domain do bucket `campuzz-files-prod` |

Front e API **no mesmo host**. O cookie de sessão usa o prefixo `__Host-`, que
proíbe o atributo `Domain` — separar os hosts obrigaria `SameSite=None` e CORS
credenciado, e o middleware CSRF passaria a rejeitar tudo sem `Origin`.

## Segredos

Nunca no `wrangler.jsonc`, nunca no git. `npx wrangler secret put <NOME>` grava
na Cloudflare; em dev vão para `.dev.vars`, que precisa estar no `.gitignore`.

```
APP_SECRET                      # assinatura e criptografia
STORAGE_S3_ACCESS_KEY_ID        # R2
STORAGE_S3_SECRET_ACCESS_KEY    # R2
INTERNAL_API_TOKEN              # consumer/cron → endpoints internos (fase 8)
CF_QUEUES_PRODUCER_TOKEN        # publicar nas filas (fase 8)
RESEND_API_KEY                  # e-mail transacional
```

A connection string do Supabase **não vira segredo**: ela fica dentro do
Hyperdrive, que a expõe ao Worker pelo binding.

## Supabase

| | |
|---|---|
| Projeto | `CRM beta` — ref `wtliyetotdrrzkcmtiyp` |
| Região | `sa-east-1` ✔ (mesma região dos usuários) |
| Postgres | 17 |

⚠️ **Extensões.** O Supabase instala extensões no schema `extensions` e já traz
`uuid-ossp` lá. `citext` e `unaccent` ainda não estão instalados, e precisam ir
para `public` — `core."user"."email"` é declarado como `citext` sem qualificar, e
`public.unaccent_immutable()` chama `public.unaccent()`. O baseline já faz isso
com `WITH SCHEMA public`.

## Divergências a corrigir

| Recurso atual | Problema |
|---|---|
| Bucket `cr-ampuzz` | **Typo** — falta o `c` de *campuzz*. Nome e localização de bucket não mudam depois de criados; como está vazio e foi criado ontem, recriar agora é grátis |
| Projeto Supabase `CRM beta` | Nome fora do padrão. Renomear é cosmético e seguro (o `ref` não muda) |

O R2 **não tem região na América do Sul** — só `wnam`, `enam`, `weur`, `eeur`,
`apac`, `oc`. `enam` é a opção mais próxima e é o que o bucket atual já usa;
mantenha na recriação. Consequência a medir: a finalização de upload faz HEAD +
sniff + Copy + Delete, e esses saltos cruzam para a América do Norte enquanto o
Postgres fica em São Paulo.

## Comandos

```bash
export CLOUDFLARE_ACCOUNT_ID=51eb880ef71493c1e995c9fb5906e367

npx wrangler r2 bucket create campuzz-files-prod --location enam
npx wrangler kv namespace create METADATA_CACHE --preview false
npx wrangler hyperdrive create campuzz-pg-prod \
  --connection-string="postgres://postgres.wtliyetotdrrzkcmtiyp:<senha>@<pooler-host>:5432/postgres"

# CORS do bucket: sem isso o PUT presignado falha no preflight
npx wrangler r2 bucket cors put campuzz-files-prod --rules '[{
  "allowed": {
    "origins": ["https://crm.<dominio>"],
    "methods": ["PUT","GET","HEAD"],
    "headers": ["content-type","content-length"]
  },
  "exposeHeaders": ["etag"],
  "maxAgeSeconds": 3600
}]'
```
