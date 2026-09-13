# Como testar — fase a fase

Estado em 13/09/2026. 120 testes de unidade passando, typecheck limpo, e a suíte
de ponta a ponta (`packages/twenty-edge-e2e`) verde — Redis, API, navegador de
verdade e iPhone.

## 0. Local, sem infraestrutura nenhuma

```bash
cd packages/twenty-edge
npm install
npm test          # 120 testes
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


## Permissões — como conferir sem trancar ninguém para fora

A checagem só vale se for medida de verdade, e medir significa assumir um papel
restrito. O caminho seguro:

```sql
-- 1. anote o papel atual antes de qualquer coisa
select rt."id", r."label", u."email"
from core."roleTarget" rt
join core."role" r on r."id" = rt."roleId"
join core."userWorkspace" uw on uw."id" = rt."userWorkspaceId"
join core."user" u on u."id" = uw."userId";
```

Crie um papel restrito pela API, aponte seu `roleTarget` para ele, meça, e volte
pelo SQL — **não pela API**: um papel sem `canUpdateAllSettings` não consegue
mudar o próprio papel de volta, que é exatamente o ponto.

O que deve acontecer, e aconteceu:

| Tentativa | Resposta |
|---|---|
| Ler um objeto sem leitura no papel | `FORBIDDEN — Not allowed to read records of company with your role` |
| Ler um objeto que o papel libera | Passa |
| Criar registro sem escrita | `FORBIDDEN — Not allowed to update records of person` |
| Apagar de vez sem `canDestroy` | `FORBIDDEN — Not allowed to destroy records of person` |
| `GET /rest/companies` | `403` |
| Busca global | Não devolve linha nenhuma do objeto escondido |
| Criar papel sem permissão de configuração | `Not allowed to change settings with your role` |

## Convite — como conferir o caminho inteiro

Sem provedor de e-mail configurado, `sendInvitations` devolve o link junto do
erro. É com ele que dá para medir a aceitação de ponta a ponta:

```bash
# 1. convidar, e pegar o link da mensagem de erro
sendInvitations(emails: ["alguem@example.com"]) { success errors result { ... } }

# 2. aceitar, com o token que está no fim do link
signUpInWorkspace(email: "qualquer@coisa.com", password: "...",
                  workspacePersonalInviteToken: "<token>")
```

O que deve acontecer, e aconteceu:

| Tentativa | Resposta |
|---|---|
| Aceitar com um e-mail diferente do convite | Entra com o e-mail **do convite** — um link vazado não serve para entrar no lugar de outra pessoa |
| Papel de quem entrou | O do convite, ou o padrão do workspace (`Membro`) |
| Usar o mesmo link de novo | `INVITATION_NOT_FOUND_OR_EXPIRED` |
| Convidar o mesmo endereço duas vezes | Um convite só na lista |

Depois de medir, apague o usuário de teste: ele fica no workspace de verdade.

## Suíte de ponta a ponta — `packages/twenty-edge-e2e`

Um Worker separado que testa este aqui: Upstash por REST, a API inteira por HTTP
e o app real dentro do Cloudflare Browser Rendering, com screenshot de cada
passo gravado no R2.

```bash
curl https://campuzz-e2e-prod.andre-51e.workers.dev/run            # tudo
open https://campuzz-e2e-prod.andre-51e.workers.dev/report         # relatório visual
```

Ela existe porque os testes de unidade não pegam a classe de defeito que mais
apareceu aqui: o front manda um documento GraphQL inteiro e uma única propriedade
faltando derruba tudo. Os defeitos que ela encontrou e que já estão corrigidos:

| Achado | Sintoma |
|---|---|
| Cache de query do Hyperdrive ligado | Objeto criado não aparecia na leitura seguinte; `createOneField` logo depois de `createOneObject` dizia `OBJECT_NOT_FOUND` |
| `withDeleted` nunca ligava | Filtrar por `deletedAt` não trazia os registros apagados |
| `clearSessionCookie` sem `Secure` | Sair da conta lançava erro em vez de limpar o cookie `__Host-` |
| `UserQueryFragment` incompleto | Login passava e o app não abria |
| `restrictedFields` nulo | O front roda `Object.entries` nele sem guarda e quebrava depois do login |
| Relação sem o lado inverso | `attachment.author` e `task.assignee` apontavam para campos que não existiam em `workspaceMember`; toda página de registro caía no error boundary |
| `collectionHashes { collection }` | O front lê `collectionName` |
| `getViews(viewTypes: [String!])` | O front declara a variável como `[ViewType!]` |
| `after: Cursor` | O front declara `$lastCursor: String` |
| `secondaryLinks` / `additionalPhones` como JSON | O front seleciona subcampos dentro deles |
| `trackAnalytics` e `currentUserSessions` ausentes | 400 a cada navegação e na tela de configurações |
| `navigationMenuItems` vazio | Sem menu lateral: no celular o app entrava e mostrava uma tela quase em branco |
| `getPageLayouts` vazio | A página de um registro ficava no esqueleto para sempre — sem layout não há abas nem widgets |
| `UUIDFilter` sem `lt`/`gt` | A navegação anterior/próximo do registro manda `id: { lt: ... }` e tomava 400 |
| Campo sem ícone | Toda coluna e todo campo aparecia com o ícone de número |
| Junção de nota/tarefa como relação simples | `Cannot resolve morph junction metadata for note` — a página do registro nunca saía do esqueleto |
| `attachment` e `timelineActivity` sem `target` | O front filtra por `targetCompanyId`; a resposta era `Field "targetCompanyId" is not defined` |
| `myConnectedAccounts`, `myMessageChannels`, `myCalendarChannels` ausentes | 400 na tela de configurações |
| `timelineActivityTypes` ausente | 400 em toda página de registro |
| `create<Objetos>` sem o argumento `upsert` | A importação de CSV era recusada inteira |
| `ON CONFLICT` contra um índice único parcial | O seed dos papéis morria com "no unique or exclusion constraint matching" — a inferência precisa repetir o `WHERE` do índice |

E dois defeitos do próprio arnês, que o faziam mentir:

| Achado | Sintoma |
|---|---|
| O texto da página era lido antes da espera de 1,5s | O passo falhava dizendo que o registro não renderizou, e o screenshot tirado logo depois mostrava a página inteira |
| Os screenshots do navegador substituíam os do iPhone | Rodar as duas suítes juntas perdia as evidências da primeira |
