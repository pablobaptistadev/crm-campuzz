# Deploy — Campuzz Financeiro

Instruções para instalar o app `campuzz-financeiro` num servidor Twenty.

Escrito para ser executado por um agente de deploy. Cada comando é copiável e cada
afirmação sobre o comportamento do Twenty foi verificada no código deste repositório —
os caminhos estão citados para você conferir.

---

## 1. O que é este app

Um **Twenty App** que traz contratos de gateway de pagamento e o financeiro deles para
dentro do CRM, ligados a **Clubes** (objeto padrão `Company`) e **Membros** (objeto padrão
`Person`). O primeiro gateway suportado é a **Routerfy**.

Vive inteiramente em `packages/twenty-apps/internal/campuzz-financeiro/`.
**Nenhum arquivo do core do Twenty foi modificado.**

### O que ele cria no workspace

| Tipo | Quantidade | Detalhe |
|---|---|---|
| Objetos | 3 | `businessUnit` (BU), `gatewayContract` (Contrato), `gatewayInvoice` (Fatura) |
| Campos | 13 | inclui 2 relações em `Person`/`Company` e `billingEmails` em `Company` |
| Índices únicos | 3 | sobre `externalSubscriptionId`, `externalTransactionId`, `externalInvoiceId` |
| Logic functions | 8 | 5 rotas autenticadas, 1 resolver público de webhook, 1 alvo, 1 cron |
| Front components | 4 | 2 popups de "Adicionar contrato", 2 painéis de Financeiro |
| Views | 8 | 4 de listagem, 4 usadas dentro de widgets |
| Abas de página | 2 | "Financeiro" em `Company` e em `Person` |
| Ações de menu | 2 | "Adicionar contrato" em `Company` e em `Person` |
| Papel | 1 | papel com que as logic functions rodam |

**As abas são acrescentadas ao layout padrão de `Company` e `Person`, não o substituem.**
São `definePageLayoutTab` com `pageLayoutUniversalIdentifier` apontando para o layout padrão —
Tarefas, Notas, Arquivos e Timeline continuam onde estavam.

---

## 2. Pré-requisitos

- Node conforme o `.nvmrc` do app (**24.5.0**)
- Yarn 4 (via corepack)
- Um servidor Twenty **rodando**, versão **≥ 2.41.0** (`engines.twenty` no `package.json`)
- Uma **API key** do workspace alvo, para autenticar o CLI sem navegador
- Rede de saída do servidor até a API da Routerfy
- **Rede de entrada** da Routerfy até o servidor: ela precisa alcançar
  `POST {SERVER_URL}/webhooks/server/...`

### `SERVER_URL` precisa estar correto no servidor

Não é uma variável do app: é a config do próprio Twenty. O servidor a expõe para as logic
functions como `TWENTY_API_URL`
(`packages/twenty-server/src/engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service.ts:398`),
e é a partir dela que o app monta a URL de webhook que registra na Routerfy.

**Se `SERVER_URL` estiver vazio ou apontando para um endereço que a Routerfy não alcança,
o cadastro de BU falha com erro explícito** — preferimos falhar na hora a registrar um
webhook que nunca entrega.

---

## 3. Instalação

> **`plan` e `apply` NÃO são o caminho de produção.** Eles são o loop de desenvolvimento:
> registram o app com `sourceType: LOCAL`, e o servidor pula a instalação de apps LOCAL.
> Para um servidor de verdade, o caminho é **publicar o tarball e instalar**, que é
> exatamente o que a CI faz em `.github/actions/deploy-twenty-app` e `install-twenty-app`.

### 3.1 Subir a versão

```bash
cd packages/twenty-apps/internal/campuzz-financeiro
# editar "version" no package.json — tem de ser ESTRITAMENTE MAIOR que a instalada
```

O servidor recusa reinstalar a mesma versão e recusa downgrade:

- `This version of the application is already installed in this workspace.`
- `A higher version of this application is already installed. Downgrading is not allowed.`

(`application.exception.ts:75-77`, `application-version-validation.service.ts:148`)

**Cada deploy precisa de um bump.** A versão atual é `0.1.0`.

### 3.2 Apontar o CLI para o servidor

O CLI **não lê variáveis de ambiente** para descobrir o alvo: ele lê `~/.twenty/config.json`.

Para um agente de deploy (sem navegador), escreva o arquivo direto — é o que a CI faz:

```bash
mkdir -p ~/.twenty
node -e "
  const fs = require('fs'), path = require('path'), os = require('os');
  fs.writeFileSync(path.join(os.homedir(), '.twenty', 'config.json'), JSON.stringify({
    version: 1,
    remotes: { target: { apiUrl: process.env.API_URL, apiKey: process.env.API_KEY, accessToken: process.env.API_KEY } }
  }, null, 2));
"
```

com `API_URL` e `API_KEY` no ambiente. Alternativa equivalente, interativa:

```bash
npx twenty remote add --as target --url "$API_URL" --api-key "$API_KEY"
```

Esse arquivo guarda credencial. Trate como segredo e não o deixe num runner compartilhado.

### 3.3 Instalar dependências

```bash
corepack enable
yarn install --immutable
```

### 3.4 Publicar e instalar

```bash
npx twenty app:publish --private --remote target
npx twenty app:install --remote target
```

- `app:publish --private` faz build + typecheck + `npm pack` e sobe o `.tgz` para o registry
  **do servidor** (mutation `uploadAppTarball`). **Sem `--private` ele publica no npm público** —
  não é o que queremos.
- `app:install` lê o `.twenty/output/manifest.json` local e chama `installApplication` no
  servidor. Exige que o publish tenha rodado antes.

### 3.5 Conferir antes, se quiser (opcional)

```bash
npx twenty plan .
```

Mostra o diff de metadata sem gravar nada. Útil para revisar, mas **não substitui** o
publish+install: ele opera sobre a registration de desenvolvimento.

## 4. Configuração pós-instalação

### 4.1 Variável de servidor (opcional)

| Variável | Obrigatória | Default | Para quê |
|---|---|---|---|
| `ROUTERFY_API_URL` | não | `https://api.routerfy.com` | apontar para sandbox/homologação da Routerfy |

É declarada como `serverVariable` no `src/application.config.ts`. **Não vai no `.env` de
lugar nenhum.** O deploy cria a chave com valor **vazio**, e alguém a preenche pela interface:

- **Settings → Applications → (a registration)**, para quem é dono da registration, ou
- **Admin Panel → Apps**, para o admin do servidor

(`application-registration-variable.service.ts:119-176`, que cria as chaves vazias e apaga as
que sumiram do manifest.)

Valor vazio é **pulado** na injeção, então o app cai no default do código — que é o mesmo
default do Campuzz em produção (`api/src/settings.ts:50`). Ou seja: **para apontar para a
Routerfy de produção, não é preciso fazer nada.**

### 4.2 Cadastrar a primeira BU

Isto é feito **pela interface**, não por comando. Uma BU é um par de chaves da Routerfy, e
o app usa esse par para ler contratos e registrar o webhook.

1. Abrir um **Clube** (registro de `Company`) ou um **Membro** (`Person`)
2. Menu de ações → **Adicionar contrato**
3. Como ainda não há BU nenhuma, o popup abre direto no cadastro: **nome**, **api key**,
   **secret key**
4. **Salvar chaves**

O que acontece nesse clique, nesta ordem:

1. as chaves são validadas contra `GET /v1/customers` da Routerfy — se forem recusadas,
   **nada é gravado**
2. o par vai para o cofre (`kv`, escopo `WORKSPACE`) — **nunca para um campo de registro**
3. o webhook é registrado na Routerfy apontando para
   `{SERVER_URL}/webhooks/server/{id-do-resolver}?registrationId={uuid}`
4. a reivindicação `registrationId → (workspace, BU)` é gravada no `kv` em escopo `SERVER`
5. o registro da BU nasce `ACTIVE`, e a primeira BU nasce marcada como **padrão**

### 4.3 Escopo das BUs (opcional)

A resolução é em cascata e **não exige configuração nenhuma** para funcionar:

```
1. a BU do próprio registro   (campo BU em Person ou Company)
2. a BU do clube do membro    (para um Person sem BU própria)
3. a BU marcada como padrão
```

- **Uma conta Routerfy para tudo** → só a BU padrão, nada mais a fazer
- **Um clube com conta própria** → preencher o campo BU no registro do Clube; os membros
  dele herdam
- **Um membro que destoa** → preencher o campo BU no registro do Membro

Clube e alunos usarem a mesma chave é simplesmente os dois apontando para a mesma BU.
Cada BU tem o seu `registrationId`, então **cada BU é um canal de webhook isolado**: evento
de uma nunca chega pelo caminho de outra.

### 4.4 E-mail de cobrança do Clube

`Company`, no Twenty, não tem campo de e-mail. O app adiciona **`billingEmails`**.

**Preencher esse campo é obrigatório para vincular contrato a um Clube**: o app confere o
e-mail do registro contra o e-mail do cliente no gateway antes de gravar, e sem ele não há
o que comparar. Para `Person`, o `emails.primaryEmail` padrão já serve.

---

## 5. Verificação pós-deploy

Rode nesta ordem. Os três primeiros são pré-deploy e não precisam de servidor.

```bash
cd packages/twenty-apps/internal/campuzz-financeiro

yarn install --immutable
yarn lint          # 0 avisos, 0 erros
yarn typecheck
yarn test:unit     # 67 testes
```

Depois do `apply`, na interface:

| # | Passo | Esperado |
|---|---|---|
| 1 | Abrir um Clube → **Adicionar contrato** | popup abre; sem BU, pede as chaves |
| 2 | Salvar um par de chaves válido | BU nasce `ACTIVE` e `padrão`; webhook aparece no painel da Routerfy |
| 3 | Informar um número de contrato real daquele workspace | passo 2 mostra cliente, valor e parcelas |
| 4 | Confirmar | Contrato e Faturas aparecem |
| 5 | Aba **Financeiro** do Clube | skeleton, depois totais a pagar / pagas e as duas tabelas |
| 6 | Botão **Sincronizar** | recarrega os números |
| 7 | Repetir num Membro | reaproveita a BU padrão **sem pedir chave** |

### Os três testes que nenhum teste automatizado cobre

Valem o esforço porque são as garantias de segurança do webhook:

1. **Isolamento entre BUs** — postar um evento no resolver com o `registrationId` de outra
   BU. Deve ser **recusado**, e o contrato não pode ser tocado.
2. **Idempotência** — postar o mesmo evento duas vezes. A segunda **não pode** duplicar
   fatura.
3. **O corpo não é fonte de verdade** — postar um evento com um valor mentiroso no corpo.
   O que for gravado tem de ser **o valor que a API da Routerfy devolve**, não o do corpo.

---

## 6. O que saber antes de mexer

### A CI deste repositório não roda

`GitHub Actions está desabilitado neste fork` — zero workflows registrados, zero runs no
repositório inteiro. Então:

- **nenhum teste roda automaticamente** em PR ou push
- **`cd-deploy-main.yaml` não dispara** — mergear na `main` não deploya nada sozinho
- a única validação deste código até aqui foi local: 67 testes, lint, typecheck e build do
  manifest

Habilitar o Actions em *Settings → Actions* liga o `ci-twenty-apps.yaml`, que já existe e
faz lint, typecheck, testes **e instala o app num Twenty de verdade** — que é a validação
que falta.

### Uma armadilha do ambiente: dev mente sobre as variáveis

Vale saber, porque já custou um bug aqui. O ambiente que uma logic function enxerga é
**diferente entre dev e produção**:

| Driver | Como o env é montado | Efeito |
|---|---|---|
| **local** (dev) | o processo filho herda o `process.env` **inteiro** do twenty-server | enxerga variáveis do servidor, como `SERVER_URL` |
| **lambda** (produção) | `{ ...process.env do container Lambda, ...env injetado }` | **não** enxerga `SERVER_URL` |

O env injetado tem exatamente seis nomes fixos — `TWENTY_API_URL`, `TWENTY_APP_ACCESS_TOKEN`,
`TWENTY_APP_APPLICATION_ACCESS_TOKEN`, `TWENTY_API_KEY`, `TWENTY_FUNCTIONS_URL`,
`APPLICATION_ID` — mais os `serverVariables` e os `applicationVariables`.

Consequência prática: **ler uma variável do servidor funciona em dev local e devolve
`undefined` em produção, sem erro.** Foi assim que a URL de webhook deste app quase nasceu
relativa. Ao escrever código novo aqui, use `TWENTY_API_URL` para a base pública e nunca
`SERVER_URL`.

### O webhook da Routerfy não é assinado

A Routerfy não assina as entregas. O app trata isso assim, e vale saber ao operar:

- o corpo do evento é só um **aviso de que algo mudou** — dele saem apenas o id do evento e
  qual contrato mexeu
- o que vai para o banco vem de uma **releitura na API**, feita com as chaves da própria BU
- um POST forjado no máximo provoca uma releitura legítima; não consegue gravar dado falso
- o `registrationId` é um UUID não adivinhável e só existe enquanto a BU existe

### O cron é rede de segurança, não o caminho principal

`campuzz-financeiro-sincronizar` roda às **04:00** e relê os contratos ativos. Existe porque
entrega de webhook não é garantida — sem ele, uma fatura paga cujo evento se perdeu ficaria
"a pagar" para sempre, e a tela mentiria sem avisar.

A aba Financeiro também sincroniza sozinha ao abrir, pelo mesmo motivo.

### As chaves não ficam em campo de registro

Ficam no `kv`, alcançável só de dentro de uma logic function. O registro da BU guarda apenas
`apiKeyPreview` (o começo da chave) e `keyFingerprint` (um hash).

**Consequência operacional:** quem tiver permissão de leitura no objeto BU vê o preview e o
fingerprint — não as chaves. Mesmo assim, avalie restringir o objeto `businessUnit` a um
papel administrativo.

### Desinstalar apaga os dados

```bash
npx twenty app:uninstall . --remote target
```

**Isto não remove só o app: zera a metadata dele e, com ela, as tabelas e os registros.**
Contratos, faturas e BUs cadastradas somem. Não é uma operação reversível por `install`.

Antes de desinstalar:

1. exporte o que precisar guardar (contratos e faturas são registros normais do CRM)
2. remova os webhooks no painel da Routerfy — foram registrados por BU e, sem o resolver do
   lado de cá, passam a bater num 404 indefinidamente

O mesmo vale para **remover uma entidade do código**: o `sync` apaga do workspace o que sumiu
do fonte. Use `--no-delete` se quiser aplicar sem remover nada.

---

## 7. Diagnóstico

| Sintoma | Causa provável | Onde olhar |
|---|---|---|
| "Não conseguimos validar essas chaves na Routerfy" | chave errada, ou o servidor não alcança a API | testar `GET /v1/customers` do servidor |
| Erro sobre URL pública ao salvar a BU | `SERVER_URL` vazio ou errado no servidor | config do Twenty |
| Webhook registra mas nada chega | a Routerfy não alcança o servidor | firewall / DNS / TLS |
| Evento chega e é recusado | `registrationId` de outra BU, ou BU apagada | é o comportamento correto |
| Aba Financeiro vazia | nenhum contrato vinculado | vincular pelo popup |
| Fatura duplicada | não deveria acontecer — há índice único e dedup | abrir bug com o id do evento |
| Contrato "não localizado" | número certo, BU errada | trocar a BU no seletor do popup |

Logs das funções:

```bash
npx twenty dev:function:logs .
```

---

## 8. Referência rápida

```bash
cd packages/twenty-apps/internal/campuzz-financeiro

# apontar para o servidor (uma vez)
npx twenty remote add --as target --url "$API_URL" --api-key "$API_KEY"

# deploy (bump de versao no package.json ANTES)
yarn install --immutable
yarn lint && yarn typecheck && yarn test:unit
npx twenty app:publish --private --remote target
npx twenty app:install --remote target

# operacao
npx twenty dev:function:logs .

# CUIDADO: apaga metadata E registros (contratos, faturas, BUs)
npx twenty app:uninstall . --remote target
```
