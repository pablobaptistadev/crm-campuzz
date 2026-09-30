# Módulos — o que existe, o que falta

Estado em 13/09/2026. Este documento é o inventário: cada módulo do Twenty, as
funções que ele tem no original, e o que a nossa reimplementação em Worker
entrega hoje. O `ROADMAP.md` ao lado conta o *plano*; aqui é a *régua*.

Legenda: ✅ feito · ⚠️ parcial · ❌ não existe · 🚫 não cabe num isolate sem
peça nova (fila, Durable Object, ou serviço fora do Worker)

---

## 1. Autenticação e sessão — ✅

| Função | Estado |
|---|---|
| Cadastro com senha | ✅ |
| Login com senha (PBKDF2, comparação em tempo constante) | ✅ |
| Sessão no Postgres, cookie `__Host-` | ✅ |
| CSRF por validação de `Origin` | ✅ |
| Throttle de login (10 tentativas / 10 min por endereço) | ✅ |
| Logout, limpando os dois nomes de cookie | ✅ |
| Listar sessões ativas (`currentUserSessions`) | ✅ |
| Login social (Google / Microsoft) | ❌ |
| Magic link | ❌ |
| Recuperação de senha | ❌ — mesmo canal do convite, caminho pronto |
| Verificação de e-mail | ❌ — idem |

## 2. Metadata dinâmica — ✅

| Função | Estado |
|---|---|
| Criar objeto pela tela, com `CREATE TABLE` real | ✅ |
| Criar campo, com `ALTER TABLE` e `CREATE TYPE` para enum | ✅ |
| Apagar campo (e a coluna) | ✅ |
| Apagar objeto custom; recusar objeto padrão | ✅ |
| Os 8 tipos compostos (FULL_NAME, CURRENCY, LINKS, EMAILS, PHONES, ADDRESS, ACTOR, RICH_TEXT) | ✅ |
| Relação 1-N e N-1 | ✅ |
| Relação morph (um campo, N alvos) | ✅ |
| `syncStandardMetadata` — põe workspace antigo em dia, idempotente | ✅ |
| Cache de metadata por versão | ✅ isolate · ⚠️ KV desligado (Upstash a 300ms não compensa) |
| Índices custom pela tela | ❌ |

## 3. Records — ✅

| Função | Estado |
|---|---|
| Listar, com filtro, ordenação e paginação por cursor | ✅ |
| Ler um | ✅ |
| Criar, criar em lote | ✅ |
| Upsert (casa por `id`) | ✅ |
| Atualizar | ✅ |
| Soft delete, restore, destroy | ✅ |
| `eq: ''` casando NULL, como no original | ✅ |
| Agrupar (`groupBy`) com granularidade de data e fuso | ✅ |
| Duplicados por `duplicateCriteria` | ✅ |
| Merge, com `dryRun` e relações reapontadas | ✅ |
| Agregações na listagem (sum, avg, min, max) | ❌ |

## 4. Views salvas — ✅

| Função | Estado |
|---|---|
| Colunas: ordem, visibilidade, largura | ✅ |
| Filtros salvos, inclusive grupos de filtro | ✅ |
| Ordenações salvas | ✅ |
| Grupos (colunas do kanban) | ✅ |
| Tipos TABLE e KANBAN | ✅ |
| As 20 mutations de view do front | ✅ |
| Calendário | ❌ |

## 5. Busca — ✅

| Função | Estado |
|---|---|
| Busca global (⌘K) com ranking | ✅ |
| Acento dobrado dos dois lados (`joao` acha `João`) | ✅ |
| Prefixo (`pada` acha `Padaria`) | ✅ |
| Escopo por objeto, filtro, paginação por cursor | ✅ |
| Índice GIN reconstruído quando os campos mudam | ✅ |

## 6. Anexos — ✅

| Função | Estado |
|---|---|
| Upload pelo fluxo do front (`createFileUpload` → PUT → `completeFileUpload`) | ✅ |
| Armazenamento no R2 | ✅ |
| Token de upload que só escreve o próprio arquivo | ✅ |
| Leitura por URL assinada | ✅ |
| Presign S3v4 direto do browser (arquivo grande) | ❌ — hoje passa pelo Worker, teto de 100 MB |

## 7. Timeline — ✅

| Função | Estado |
|---|---|
| Linha em criação, alteração, exclusão e restauração | ✅ |
| Diff de verdade no update (antes/depois por campo) | ✅ |
| Autor resolvido | ✅ |
| Filtro por tipo de evento | ✅ |
| Eventos de terceiros (e-mail, agenda, workflow) | ❌ — dependem dos módulos que não existem |

## 8. Importar e exportar — ✅

| Função | Estado |
|---|---|
| Exportar CSV (montado no cliente) | ✅ |
| Importar CSV, com upsert | ✅ |
| Exportar um registro | ✅ |

## 9. Papéis e permissões — ✅

| Função | Estado |
|---|---|
| Papéis embutidos (Admin, Membro), não editáveis | ✅ |
| Criar, editar, apagar papel | ✅ |
| Permissão por objeto: ler, escrever, apagar, destruir | ✅ |
| Três estados por permissão (sim / não / herda do papel) | ✅ |
| Permissão por campo (`restrictedFields`) | ✅ |
| Atribuir papel a membro | ✅ |
| Aplicado em `/graphql`, `/rest/*` e na busca | ✅ |
| Permission flags | ✅ |
| Predicados de linha (row-level) | ❌ — o front marca Enterprise |

## 10. Convites — ✅

| Função | Estado |
|---|---|
| Convidar por e-mail, com papel | ✅ |
| Listar pendentes | ✅ |
| Reenviar (troca o token, estende o prazo) | ✅ |
| Revogar | ✅ |
| Aceitar — entra com o e-mail **do convite**, link de uso único | ✅ |
| Entrega da mensagem | ⚠️ pronta, esperando `SENDGRID_API_KEY` |

## 11. API REST — ✅

| Função | Estado |
|---|---|
| CRUD por objeto, derivado do mesmo metadata | ✅ |
| Filtro e ordenação por query string | ✅ |
| Respeita papel e permissão | ✅ |
| OpenAPI | ⚠️ subconjunto |

---

# O que falta — e quanto custa

## Cabe no Worker hoje, em ordem de esforço

### API keys — ❌ (o mais barato, e o de maior valor para integrar)
Criar com validade · revogar · renomear · atribuir papel · listar.
Mecânica idêntica ao `appToken` + `roleTarget` que já existem.

### 2FA (TOTP) — ❌
Provisionar no login ou já logado · verificar código · apagar método.
HMAC-SHA1 sobre o tempo, WebCrypto faz. O campo
`twoFactorAuthenticationMethodSummary` **já existe no nosso schema, vazio**.

### Painel admin enxuto — ❌
Busca de usuário e workspace · usuários recentes e top workspaces · server
admins · ligar/desligar feature flag · config variables · impersonation ·
versão · saúde de Postgres e Redis.
Tudo SQL e um UPDATE. *Fora:* fila, créditos, chats de IA, marketplace.

### SSO — ❌
OIDC e SAML (criar, editar, apagar provedor) · domínios de acesso aprovado
(criar, validar, apagar).
JWT e redirect, que já fazemos com `jose`. Grande, mas sem peça nova.

### Billing — ❌
Checkout · portal · trocar plano e intervalo · cancelar troca agendada ·
encerrar trial · método de pagamento · créditos · cotas e entitlements.
Tecnicamente cabe (API da Stripe + webhooks dela). Só faz sentido se for cobrar.

## Não cabe sem peça nova

### Sincronização de e-mail e agenda — 🚫
**E-mail:** importar lista e corpo · pastas · casar participantes com contatos ·
criar contato automático · blocklist com reimportação · e-mail de entrada ·
monitorar canal travado e relançar · limpeza ao apagar conta · envio e rascunho.
**Agenda:** importar eventos · criar evento · casar participantes · limpeza ·
blocklist.
**Provedores:** Google, Microsoft, IMAP/SMTP/CalDAV.
*Por quê:* ~15 jobs de fundo com cron, retry e estado. E IMAP precisa de socket
TCP, que não existe no isolate.

### Workflows — 🚫
**Gatilhos:** evento de banco · cron · webhook de entrada · manual.
**Ações:** criar/atualizar/apagar/upsert registro · achar registros · lote ·
código em sandbox · agente de IA · HTTP · enviar e-mail · criar evento ·
filtro · delay · round-robin · iterador.
**Execução:** versões, histórico com estados, diagrama, variáveis entre passos.
*Por quê:* delay e cron precisam de agendador durável; sandbox precisa de
isolate próprio.

### Webhooks de saída — ⚠️🚫
CRUD · filtro por operação e objeto · segredo de assinatura · entrega · log.
*Metade cabe:* disparar é `fetch`. O **retry durável** é que precisa de fila.

---

## Resumo

Dos oito que eu havia posto como "fora do plano", só **três** realmente não
cabem sem fila: e-mail/agenda, workflows e o retry de webhook. Os outros cinco
cabem — API keys, 2FA, painel admin, SSO e billing.
