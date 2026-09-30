# O que falta — plano

Estado em 13/09/2026. O núcleo está no ar e testado ponta a ponta (Redis, API,
navegador desktop e iPhone). Este documento é a lista do que falta para o CRM
ser usável no dia a dia, na ordem em que pretendo fazer.

**Feitos:** 0 (sync do metadata padrão), 1 (upload), 4 (views salvas),
2 (notas e tarefas no registro), 6 (timeline), 7 (CSV), 3 (busca global),
5 (kanban e agrupamento), 8 (papéis e permissões), 10 (duplicados e merge),
9 (convites). **Falta:** nada do plano — só a key de e-mail, que é do usuário.

## Decisões tomadas antes de começar

**Busca é Postgres, não Redis.** O contrato do front pede `tsRank` e `tsRankCD`
— as funções de ranking do Postgres. O Upstash não tem RediSearch, então usá-lo
significaria manter um índice invertido à mão, desincronizado do banco por
definição, a ~120ms por comando. O baseline já cria `unaccent_immutable()` para
isso. O Redis fica com throttle de login, lock e cache.

**Upload passa pelo Worker antes de ser presignado.** O Twenty mesmo faz assim
quando o presign não está configurado (`file-upload-target.service.ts:109`).
Sem key nova, funciona hoje, e o teto de 100 MB por corpo no plano Free/Pro é
maior que qualquer anexo de CRM. O presign S3v4 no R2 (HMAC por WebCrypto, com
as chaves que já existem) entra depois, para arquivo grande.

**Permissão vem antes de convite.** Não faz sentido convidar alguém para um
workspace onde todo mundo é administrador.

---

## 0. Sincronizar metadata padrão em workspace existente — FEITO

Hoje o seed só roda na criação do workspace. Quando eu acrescento um objeto ou
campo padrão (item 2 precisa disso), o workspace que já existe fica para trás —
foi o que aconteceu com `authoredAttachments` e virou a migration `sql/0003`.

Um serviço `syncStandardMetadata` que compara o seed com o banco, insere o que
falta e roda o DDL correspondente. Idempotente, os ids já são determinísticos.

**Tamanho:** pequeno. **Destrava:** 2, 3, 6.

## 1. Upload de arquivo — FEITO

O front já tem o fluxo pronto (`useDirectFileUpload.ts`): `createFileUpload`
devolve `{ fileId, uploadUrl, contentType, expiresAt }`, o browser dá PUT
direto, e `completeFileUpload` confirma. Nenhuma das duas mutations existe.

- Tabela `core.file` (id, workspaceId, name, fullPath, size, type,
  fieldMetadataId, createdAt).
- As duas mutations, mais os tipos `File` / `FileWithSignedUrl`.
- `uploadUrl` aponta para o nosso `/files/:folder/:fileId?token=<jwt>`, que já
  grava no R2 — falta só validar o token de upload.
- Teste: subir um PNG de verdade pela API e ler de volta; no navegador, trocar a
  foto de perfil.

**Tamanho:** médio. **Key nova:** nenhuma.

## 2. Notas e tarefas dentro do registro — FEITO

Faltam os objetos de ligação `noteTarget` e `taskTarget` (note/task ↔ company,
person, opportunity). São o que faz a aba Notas e Tarefas do registro existir.

- Acrescentar os dois ao seed padrão e sincronizar (item 0).
- Widgets `NOTES` e `TASKS` no layout de registro, ao lado do de campos.
- Teste: criar nota ligada a uma empresa pela API e vê-la na página da empresa.

**Tamanho:** médio. **Depende de:** 0.

**Como ficou:** `noteTarget` e `taskTarget` como objetos de sistema, cada um com
um campo `target` do tipo MORPH_RELATION (uma coluna por alvo,
`target${Alvo}Id`). O front exige exatamente esse formato — ele infere a junção
procurando um único MORPH_RELATION. `attachment` e `timelineActivity` foram
para o mesmo formato: é assim que o front filtra, por `target<Objeto>Id`.

## 3. Busca global — FEITO

- Coluna `searchVector tsvector` gerada por objeto, com índice GIN, alimentada
  pelos campos textuais (TEXT, EMAILS, FULL_NAME, LINKS). O gerador de DDL passa
  a criá-la ao criar objeto e ao acrescentar campo pesquisável.
- `ALTER TABLE` de backfill para as tabelas que já existem.
- Resolver `search(searchInput, limit, after, includedObjectNameSingulars,
  excludedObjectNameSingulars, filter)`: UNION ALL entre as tabelas com
  `ts_rank_cd`, ordenado por relevância.
- Teste: buscar o nome de uma empresa semeada; ⌘K no navegador.

**Tamanho:** grande. **Depende de:** 0.

**Como ficou:** coluna `searchVector` gerada (`GENERATED ALWAYS AS ... STORED`)
com índice GIN, uma por objeto pesquisável, reconstruída sempre que os campos
mudam — inclusive antes de derrubar uma coluna, que o Postgres recusa enquanto
uma coluna gerada depender dela. Acento é dobrado dos dois lados por
`public.unaccent_immutable()`: "joao" acha "João" e vice-versa. O texto digitado
vira prefixo (`termo:*`) em vez de ir cru para o `to_tsquery`.

## 4. Filtros, ordenações e colunas salvos na view — FEITO

Hoje `getViews` sintetiza os `viewFields` a partir dos campos do objeto e
devolve `viewFilters`/`viewSorts`/`viewGroups` vazios — o filtro que o usuário
monta vive só na sessão.

- Tabelas `core.viewField`, `viewFilter`, `viewSort`, `viewGroup`,
  `viewFilterGroup`, `viewFieldGroup`.
- Semear `viewField` na criação da view (onde hoje é sintetizado).
- As 20 mutations que o front já tem prontas em
  `twenty-front/src/modules/views/graphql/mutations/`: create/update/delete/
  destroy de cada uma.
- Teste: montar um filtro na tela, recarregar, continuar lá.

**Tamanho:** grande (é volume, não dificuldade). **Depende de:** nada.

## 5. Kanban e agrupamento — FEITO

- `${plural}GroupBy` com as operações de agregação (count, sum, min, max, avg).
- Colunas do kanban saem dos `viewGroups` (item 4).
- Arrastar cartão mexe em `position` — indexação fracionária, como o Twenty.

**Tamanho:** médio. **Depende de:** 4.

**Como ficou:** `${plural}GroupBy` devolve uma connection por grupo. A contagem
sai de um `GROUP BY` só; os cards de cada coluna saem do mesmo caminho de leitura
de sempre, com o balde reexpresso como filtro — cursor, soft delete e compostos
de graça. Data agrupa por granularidade, com fuso: meia-noite em São Paulo é
03:00 UTC, e sem isso a noite cai no dia seguinte.

## 6. Timeline / histórico — FEITO

O objeto `timelineActivity` já existe e ninguém escreve nele.

- Gravar a entrada no create/update/delete dos records, com o diff, via
  `ctx.waitUntil` — sem custo na resposta.
- Widget `TIMELINE` no layout de registro.
- Teste: alterar uma empresa e ver a entrada aparecer.

**Tamanho:** médio. **Depende de:** 0.

**Como ficou:** a entrada é gravada na mesma requisição, não em `waitUntil` — o
client do Hyperdrive é fechado quando o handler retorna, e o pg derruba o socket
com uma query em voo. O diff do update sai de um CTE que fotografa a linha antes
do UPDATE, na mesma instrução: um SELECT separado leria o que outra escrita
concorrente deixou.

## 7. Importar e exportar CSV — FEITO

A exportação do front é do lado do cliente (pagina a lista e monta o arquivo), e
a importação usa `createMany`, que já existe. Provavelmente já funciona: o
trabalho aqui é medir no navegador e consertar o que aparecer.

**Tamanho:** pequeno, incerto até medir.

**Como ficou:** a exportação já funcionava (é do lado do cliente). A importação
não: ela manda `create<Objetos>(data, upsert: true)`, e sem o argumento `upsert`
no schema o documento inteiro era recusado. Upsert casa por `id` — nenhuma outra
coluna tem índice único hoje — e devolve `xmax = 0` para o timeline saber se
inseriu ou atualizou.

## 8. Papéis e permissões — FEITO

Hoje `objectsPermissions` é `true` fixo no código: qualquer pessoa autenticada
faz tudo. É o item com peso de segurança de verdade.

- Tabelas `role`, `roleTarget`, `objectPermission`, `fieldPermission`,
  `permissionFlag`.
- `currentUser.currentUserWorkspace.objectsPermissions` passa a ler do banco.
- Aplicar de fato na API de records: esconder objeto sem leitura, recusar
  mutação sem escrita, e nunca confiar só no front.
- Teste: um segundo usuário com papel restrito não enxerga o que não deve.

**Tamanho:** grande.

**Como ficou:** dois papéis embutidos, Admin e Membro, semeados pelo mesmo
`syncStandardMetadata` e nenhum dos dois editável — perder o Admin tranca todo
mundo para fora das configurações sem volta. Quem criou o workspace vira Admin,
quem entra depois vira Membro.

Cada permissão tem três estados, não dois: a linha de `objectPermission` pode
dizer sim, não, ou `NULL` para herdar o interruptor do papel. O front desenha os
três, então tratar `NULL` como `false` mudaria o significado.

A checagem mora na API, não no schema: o schema é o mesmo para todo mundo, então
uma query escrita à mão chegaria nas linhas de qualquer jeito. Estão cobertos
`/graphql` (queries, mutations, relações e `groupBy`), `/rest/*` — que monta o
próprio SQL e por isso precisa do próprio portão — e a busca global, que é o
caminho mais fácil de ler tudo de uma vez. Relação responde `null` em vez de
erro: um alvo sem leitura não pode derrubar o documento inteiro.

Fora daqui, de propósito: predicados de linha (o front marca Enterprise e
entrega atrás da própria licença), agentes e API keys.

## 9. Convidar usuário (e-mail) — FEITO

- Provedor com API HTTP — SMTP não existe dentro de um Worker. Resend ou
  SendGrid. **Key nova:** `SENDGRID_API_KEY` e um remetente verificado.
- Tabelas `appToken` / `workspaceInvitation`.
- Mutations de convite, reenvio e aceite; e, de quebra, recuperação de senha e
  verificação de e-mail, que dependem do mesmo canal.

**Tamanho:** médio. **Depende de:** 8. **Key nova:** sim.

**Como ficou:** o convite existe com ou sem provedor de e-mail. Sem a key, a
mutation devolve o link junto do erro, para quem convidou mandar por onde
quiser — falhar a mutation inteira deixaria a função inútil até a key chegar.
Com `SENDGRID_API_KEY` e `EMAIL_FROM` o mesmo caminho passa a enviar de
verdade.
SMTP não existe dentro de um Worker (não há socket na 587), então o provedor
tem que falar HTTP.

Convidar o mesmo endereço duas vezes substitui o convite em pé em vez de criar
outro; reenviar troca o token e estende o prazo, porque o link antigo já foi
para algum lugar e deixá-lo vivo seria uma segunda porta.

Quem aceita entra com o e-mail **do convite**, não com o que digitou: um link
vazado não serve para entrar no lugar de outra pessoa. O papel vem do convite,
ou o padrão do workspace. O link vale uma vez só.

Criar, reenviar e revogar exigem a permissão de configuração; **listar não**, de
propósito: a tela de membros mostra os convites pendentes ao lado dos membros, e
quem já vê a lista de membros não aprende nada novo vendo quem foi convidado.

Ainda não: recuperação de senha e verificação de e-mail — mesmo canal, mesma
tabela `appToken`, e o caminho está pronto para eles.

## 10. Duplicados e merge — FEITO

- `${singular}Duplicates` usando o `duplicateCriteria` do objeto (nome, e-mail,
  domínio).
- `merge${Plural}`: escolher o sobrevivente, reapontar as relações, apagar o
  resto — numa transação só.

**Tamanho:** médio. **Depende de:** 3 (usa o mesmo índice de texto).

**Como ficou:** não usa o índice de texto — `duplicateCriteria` é igualdade
exata sobre colunas, não similaridade, então é uma coluna nova em
`objectMetadata` e um `WHERE` montado a partir dela. Um grupo em que qualquer
coluna está vazia é ignorado: duas empresas sem domínio não são a mesma empresa,
e sem essa regra o grupo casaria com toda linha igualmente vazia.

No merge, o primeiro id é o sobrevivente e `conflictPriorityIndex` aponta para
quem ganha os conflitos; o que falta em um, o outro preenche. Identidade e
carimbos de tempo não entram na fusão — levar o id do perdedor moveria o
registro de debaixo de tudo que aponta para ele. As relações são reapontadas
*antes* do soft delete, senão ficariam órfãs. `dryRun` para antes de qualquer
escrita, que é o que a tela mostra enquanto a pessoa ainda está escolhendo.

---

## Ordem

```
0 → 1 → 4 → 2 → 6 → 7 → 3 → 5 → 8 → 9 → 10   ✓ todos
```

Primeiro o que não precisa de infraestrutura nova e o usuário sente todo dia
(upload, filtro salvo, notas no registro, histórico). Depois o que é DDL pesado
(busca, kanban). Por último o que muda o modelo de acesso (permissão) e o que
exige provedor externo (e-mail).

## Fora desta lista, e por quê

Sincronização de e-mail e agenda (IMAP/SMTP/Google/Microsoft), workflows,
webhooks, billing, SSO, 2FA, atualização ao vivo por SSE, painel de admin e API
keys. Cada um é um projeto próprio; os quatro primeiros não cabem num isolate
sem peça nova (fila, Durable Object, ou um serviço fora do Worker).
