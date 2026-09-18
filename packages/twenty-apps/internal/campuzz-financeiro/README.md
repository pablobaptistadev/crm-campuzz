# Campuzz Financeiro

Contratos e faturas de gateway de pagamento dentro do CRM, vinculados a **Clubes**
(Company) e **Membros** (Person). A Routerfy e o primeiro gateway; outros entram
como adaptadores, sem tocar na regra de negocio.

## O que ele faz

- **Adicionar contrato** pelo numero do painel, a partir da ficha de um Clube ou
  de um Membro. Confere o titular no gateway antes de gravar.
- **Aba Financeiro** na ficha dos dois, com as faturas a pagar e as pagas. O
  resumo do topo rele o gateway toda vez que a aba abre, e tem botao
  "Sincronizar" para quem acabou de mexer la.
- **BUs**: pares de chaves cadastrados uma vez e reaproveitados. Uma BU pode
  valer para o CRM inteiro, para um clube, ou para um membro so.
- **Webhook por BU**, com releitura obrigatoria na API antes de aplicar qualquer
  evento.

## Estrutura

```
src/
├── core/             regra de negocio. Nao importa SDK, HTTP, Twenty, nada.
│   ├── domain/       entidades, value objects, erros
│   ├── ports/        as interfaces que o core exige do mundo
│   └── use-cases/    a regra, escrita em cima so das portas
├── infrastructure/   implementa as portas
│   ├── gateways/routerfy/    o adaptador do gateway
│   ├── persistence/          CoreApiClient -> repositorios
│   ├── vault/                kv -> cofre, registro de bus, dedup
│   └── container.ts          composition root
└── twenty/           a casca do SDK: objetos, campos, rotas, telas
```

A dependencia aponta sempre para dentro: `twenty/` → `infrastructure/` → `core/`.
O `.oxlintrc.json` reprova o contrario, entao a regra nao depende de disciplina.

O `core/` roda em teste sem subir banco, servidor nem rede:

```bash
yarn test
```

## Como um segundo gateway entra

1. `src/core/ports/payment-gateway.port.ts` ja define o contrato minimo.
2. Crie `src/infrastructure/gateways/<nome>/` implementando `PaymentGatewayPort`.
3. Registre em `gatewaysByProvider` no `container.ts`.
4. Acrescente o valor em `gatewayProvider` no objeto `businessUnit`.

Nenhum caso de uso, nenhuma tela e nenhum objeto mudam.

## Decisoes que vale conhecer antes de mexer

- **As chaves nao ficam no registro.** Vao para o `kv`, atras do
  `CredentialVaultPort`. Campo de objeto sai pela API GraphQL para qualquer
  pessoa com leitura.
- **O corpo do webhook nao e fonte de verdade.** A Routerfy nao assina as
  entregas, entao o evento e so um aviso: o que vai para o banco vem de uma
  releitura na API, feita com as chaves da propria BU.
- **A aba sincroniza ao abrir** porque entrega de webhook nao e garantida, e uma
  tela de financeiro velha nao avisa que esta velha.
- **Cada BU e um bus.** O `registrationId` na URL do webhook e por BU, entao
  evento de uma nunca chega pelo caminho de outra.
- **A aba Financeiro e avulsa**, presa ao layout padrao de Company e Person.
  Redefinir o layout substituiria as abas nativas deles.

## Comandos

```bash
yarn test          # o core, sem dependencia externa
yarn typecheck
yarn lint          # inclui a regra de fronteira entre camadas
npx twenty plan    # previa das mudancas de metadata (exige remote)
npx twenty apply   # aplica
```
