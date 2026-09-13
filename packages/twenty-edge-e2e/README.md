# twenty-edge-e2e

Suíte de ponta a ponta da API Hono (`twenty-edge`), rodando ela mesma dentro de
um Worker. Três frentes, uma execução:

| Suíte | O que cobre |
|---|---|
| `redis` | Upstash via REST: PING, SET/GET, JSON com acento, INCR + TTL, lock SET NX, os namespaces de cache que a API usa, DEL |
| `api` | `/healthz`, `/client-config`, login completo, metadata, DDL de objeto e campo, CRUD de records com todos os compostos, paginação por cursor, soft delete + restore + destroy, REST, signOut |
| `browser` | Cloudflare Browser Rendering: carrega o app real, faz login pela tela, confere que um registro criado pela API aparece na tabela e navega pelas seções, com screenshot de cada passo |

O teste vive num Worker separado de propósito: nada disso viaja dentro da API.

## Rodar

```bash
https://campuzz-e2e-prod.andre-51e.workers.dev/run                  # tudo, JSON
https://campuzz-e2e-prod.andre-51e.workers.dev/run?format=html      # relatório visual
https://campuzz-e2e-prod.andre-51e.workers.dev/run?suites=redis     # só uma frente
https://campuzz-e2e-prod.andre-51e.workers.dev/report               # último relatório
```

`/run` responde 500 quando algum passo falha, então dá para usar em CI sem
interpretar o corpo.

## Onde ficam as evidências

Cada execução grava em R2 (`campuzz-files-prod`):

- `e2e/<runId>/NN-<passo>.png` — screenshot de cada passo do navegador
- `e2e/<runId>/report.json` — relatório completo
- `e2e/latest.json` e `e2e/latest.html` — a última execução

As imagens saem por `/artifact/<chave>`.

## Deploy

```bash
cd packages/twenty-edge-e2e
npm install
npx wrangler deploy
npx wrangler secret put TEST_PASSWORD            # senha da conta de teste
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

Sem `TEST_PASSWORD` a suíte não falha: os passos que exigem sessão aparecem como
`skipped` com o motivo.

## Diagnóstico quando um passo do navegador quebra

O passo de login guarda um post-mortem: URL final, texto da página, os últimos
requests com status, os requests que a API rejeitou (com corpo da resposta) e os
erros de console já resolvidos — `console.error(new Error(...))` aparece como
`JSHandle@error` no Puppeteer, e a suíte abre o handle para ler a mensagem.
