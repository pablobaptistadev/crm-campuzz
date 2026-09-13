# O que falta — plano

Estado em 13/09/2026. O núcleo está no ar e testado ponta a ponta (50 passos:
Redis, API, navegador desktop e iPhone). Este documento é a lista do que falta
para o CRM ser usável no dia a dia, na ordem em que pretendo fazer.

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

## 0. Sincronizar metadata padrão em workspace existente — pré-requisito

Hoje o seed só roda na criação do workspace. Quando eu acrescento um objeto ou
campo padrão (item 2 precisa disso), o workspace que já existe fica para trás —
foi o que aconteceu com `authoredAttachments` e virou a migration `sql/0003`.

Um serviço `syncStandardMetadata` que compara o seed com o banco, insere o que
falta e roda o DDL correspondente. Idempotente, os ids já são determinísticos.

**Tamanho:** pequeno. **Destrava:** 2, 3, 6.

## 1. Upload de arquivo

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

## 2. Notas e tarefas dentro do registro

Faltam os objetos de ligação `noteTarget` e `taskTarget` (note/task ↔ company,
person, opportunity). São o que faz a aba Notas e Tarefas do registro existir.

- Acrescentar os dois ao seed padrão e sincronizar (item 0).
- Widgets `NOTES` e `TASKS` no layout de registro, ao lado do de campos.
- Teste: criar nota ligada a uma empresa pela API e vê-la na página da empresa.

**Tamanho:** médio. **Depende de:** 0.

## 3. Busca global

- Coluna `searchVector tsvector` gerada por objeto, com índice GIN, alimentada
  pelos campos textuais (TEXT, EMAILS, FULL_NAME, LINKS). O gerador de DDL passa
  a criá-la ao criar objeto e ao acrescentar campo pesquisável.
- `ALTER TABLE` de backfill para as tabelas que já existem.
- Resolver `search(searchInput, limit, after, includedObjectNameSingulars,
  excludedObjectNameSingulars, filter)`: UNION ALL entre as tabelas com
  `ts_rank_cd`, ordenado por relevância.
- Teste: buscar o nome de uma empresa semeada; ⌘K no navegador.

**Tamanho:** grande. **Depende de:** 0.

## 4. Filtros, ordenações e colunas salvos na view

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

## 5. Kanban e agrupamento

- `${plural}GroupBy` com as operações de agregação (count, sum, min, max, avg).
- Colunas do kanban saem dos `viewGroups` (item 4).
- Arrastar cartão mexe em `position` — indexação fracionária, como o Twenty.

**Tamanho:** médio. **Depende de:** 4.

## 6. Timeline / histórico

O objeto `timelineActivity` já existe e ninguém escreve nele.

- Gravar a entrada no create/update/delete dos records, com o diff, via
  `ctx.waitUntil` — sem custo na resposta.
- Widget `TIMELINE` no layout de registro.
- Teste: alterar uma empresa e ver a entrada aparecer.

**Tamanho:** médio. **Depende de:** 0.

## 7. Importar e exportar CSV

A exportação do front é do lado do cliente (pagina a lista e monta o arquivo), e
a importação usa `createMany`, que já existe. Provavelmente já funciona: o
trabalho aqui é medir no navegador e consertar o que aparecer.

**Tamanho:** pequeno, incerto até medir.

## 8. Papéis e permissões

Hoje `objectsPermissions` é `true` fixo no código: qualquer pessoa autenticada
faz tudo. É o item com peso de segurança de verdade.

- Tabelas `role`, `roleTarget`, `objectPermission`, `fieldPermission`,
  `permissionFlag`.
- `currentUser.currentUserWorkspace.objectsPermissions` passa a ler do banco.
- Aplicar de fato na API de records: esconder objeto sem leitura, recusar
  mutação sem escrita, e nunca confiar só no front.
- Teste: um segundo usuário com papel restrito não enxerga o que não deve.

**Tamanho:** grande.

## 9. Convidar usuário (e-mail)

- Provedor com API HTTP — SMTP não existe dentro de um Worker. Resend ou
  Postmark. **Key nova:** `RESEND_API_KEY` (ou equivalente) e um domínio
  verificado.
- Tabelas `appToken` / `workspaceInvitation`.
- Mutations de convite, reenvio e aceite; e, de quebra, recuperação de senha e
  verificação de e-mail, que dependem do mesmo canal.

**Tamanho:** médio. **Depende de:** 8. **Key nova:** sim.

## 10. Duplicados e merge

- `${singular}Duplicates` usando o `duplicateCriteria` do objeto (nome, e-mail,
  domínio).
- `merge${Plural}`: escolher o sobrevivente, reapontar as relações, apagar o
  resto — numa transação só.

**Tamanho:** médio. **Depende de:** 3 (usa o mesmo índice de texto).

---

## Ordem

```
0 → 1 → 4 → 2 → 6 → 7 → 3 → 5 → 8 → 9 → 10
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
