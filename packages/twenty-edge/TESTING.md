# Como testar — fase a fase

Estado em 13/09/2026. 49 testes passando, typecheck limpo, Worker empacota em
1.19 MB (234 KB gzip) contra o teto de 64 MiB.

## 0. Local, sem infraestrutura nenhuma

```bash
cd packages/twenty-edge
npm install
npm test          # 49 testes
npm run typecheck
npx wrangler deploy --dry-run --env=""   # prova que empacota para o Worker
```

O dry-run exige que `packages/twenty-front/build` exista. Se ainda não construiu
o front: `mkdir -p ../twenty-front/build && echo '<!doctype html>' > ../twenty-front/build/index.html`.

## 1. Banco — JÁ APLICADO no projeto `CRM beta` (`wtliyetotdrrzkcmtiyp`)

Migrations `core_baseline_auth` e `core_metadata_tables` estão no ar. Conferir:

```sql
select table_schema, table_name from information_schema.tables
where table_schema in ('core','workspace_10dgnsy3z9iusugm9nn175rh1')
order by 1,2;
```

Esperado: `core.workspace`, `core.user`, `core.userWorkspace`, `core.userSession`,
`core.objectMetadata`, `core.fieldMetadata`, `core.view`.

## 2. DDL gerado — JÁ VALIDADO contra o banco real

O schema `workspace_10dgnsy3z9iusugm9nn175rh1` foi criado pelo gerador e tem
dados de teste. Ele existe de propósito, para você inspecionar. Conferir os dois
pontos que costumam quebrar numa reimplementação:

```sql
-- Composite ADDRESS tem prefixo duplo: um campo `address` vira addressAddressCity
select column_name from information_schema.columns
where table_schema='workspace_10dgnsy3z9iusugm9nn175rh1' and table_name='company'
  and column_name like 'address%';

-- Só o lado MANY_TO_ONE ganha coluna; ONE_TO_MANY não tem nenhuma
select column_name from information_schema.columns
where table_schema='workspace_10dgnsy3z9iusugm9nn175rh1' and table_name='person'
  and column_name='companyId';
```

E a regra que muda resultado se for esquecida — `eq: ''` também casa `NULL`:

```sql
select "nameFirstName", "jobTitle"
from "workspace_10dgnsy3z9iusugm9nn175rh1"."person"
where "deletedAt" is null and ("jobTitle" = '' or "jobTitle" is null);
```

Deve voltar **Bruno** (string vazia) e **Carla** (NULL). Se voltar só um, a
tradução de filtros está errada.

Para limpar: `DROP SCHEMA "workspace_10dgnsy3z9iusugm9nn175rh1" CASCADE;`

## 3. Worker contra o banco

Falta criar o Hyperdrive e preencher o id no `wrangler.jsonc`:

```bash
npx wrangler hyperdrive create campuzz-pg-stg \
  --connection-string="postgres://postgres.wtliyetotdrrzkcmtiyp:<senha>@<pooler-host>:5432/postgres"

cp .dev.vars.example .dev.vars   # preencher APP_SECRET
npx wrangler dev
```

| Endpoint | Esperado |
|---|---|
| `GET /healthz` | `{"status":"ok","databaseLatencyMs":N}` — mede o RTT real até São Paulo |
| `GET /client-config` | JSON completo; é o que destrava o render do front |
| `POST /metadata` | GraphQL |
| `POST /graphql` | 401 sem cookie, schema do workspace com cookie |

## 4. Auth ponta a ponta

```bash
# signUp cria usuário, workspace, schema Postgres, metadata e as tabelas reais
curl -s localhost:8787/metadata -H 'content-type: application/json' \
  -H 'Origin: http://localhost:8787' -c /tmp/cookies.txt \
  -d '{"query":"mutation{signUp(email:\"a@b.com\",password:\"s3nh4-forte\",firstName:\"Ana\",workspaceName:\"Campuzz\"){workspace{id subdomain}}}"}'

curl -s localhost:8787/metadata -H 'content-type: application/json' \
  -b /tmp/cookies.txt -d '{"query":"{currentUser{email currentWorkspace{displayName}}}"}'

curl -s localhost:8787/metadata -H 'content-type: application/json' \
  -b /tmp/cookies.txt -d '{"query":"{minimalMetadata{objectMetadataItems{nameSingular} collectionHashes{collection hash}}}"}'
```

O cookie é `httpOnly`. Sem `Origin` correto, toda mutation responde 403
`CSRF_ORIGIN_MISMATCH` — isso é proposital.

## 5. Records

```bash
curl -s localhost:8787/graphql -H 'content-type: application/json' \
  -H 'Origin: http://localhost:8787' -b /tmp/cookies.txt \
  -d '{"query":"mutation{createCompany(data:{name:\"Acme\"}){id name}}"}'

curl -s localhost:8787/graphql -H 'content-type: application/json' \
  -b /tmp/cookies.txt \
  -d '{"query":"{companies(first:10,orderBy:[{name:AscNullsLast}]){edges{node{id name} cursor} pageInfo{hasNextPage endCursor} totalCount}}"}'
```

Passe o `endCursor` como `after` para conferir a paginação keyset.

## 6. Front

`npx nx build twenty-front` e depois `wrangler dev`. O front deve sair do
skeleton e chegar na tela de login.

---

## O que NÃO foi testado

- **Nada rodou dentro de um Worker de verdade.** Falta o Hyperdrive; tudo foi
  verificado por teste unitário, por dry-run de bundle e por SQL direto no banco.
- **O `twenty-front` nunca foi apontado para esta API.** É o teste que importa e
  é o próximo passo.
- Upload no R2 — o bucket ainda precisa ser recriado sem o typo (`cr-ampuzz`).
- Permissões, roles e row-level security: o schema não foi criado ainda.
