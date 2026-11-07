import { type Client } from 'pg';

// O app original guarda chave, deduplicação de evento e reivindicação de
// webhook no `kv` do Twenty. No Worker o equivalente seria o KV do Cloudflare,
// que é eventualmente consistente: ler logo depois de escrever pode voltar
// vazio por até um minuto. Isso quebraria os dois pontos em que a consistência
// é a funcionalidade — salvar a BU e puxar um contrato no clique seguinte, e a
// trava de idempotência do webhook, que só vale se for forte. Vão para o
// Postgres, no schema core: fora do schema do workspace, ou seja, inalcançável
// pela API de records, que era a garantia que o cofre existia para dar.
const TABELAS = [
  `CREATE TABLE IF NOT EXISTS core."gatewayCredential" (
     "businessUnitId" uuid PRIMARY KEY,
     "workspaceId" uuid NOT NULL,
     "cifra" text NOT NULL,
     "createdAt" timestamptz NOT NULL DEFAULT now(),
     "updatedAt" timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS "gatewayCredential_workspace_idx"
     ON core."gatewayCredential" ("workspaceId")`,

  // A idempotência do webhook é este índice, não uma checagem no código: duas
  // entregas do mesmo evento chegando ao mesmo tempo são dois INSERT, e o
  // segundo tem de esbarrar no banco, não numa leitura que ainda não enxergou
  // a primeira.
  `CREATE TABLE IF NOT EXISTS core."gatewayEvent" (
     "workspaceId" uuid NOT NULL,
     "eventId" text NOT NULL,
     "appliedAt" timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY ("workspaceId", "eventId")
   )`,

  // O registrationId é o que separa um bus do outro: é ele que vai na URL que
  // o gateway chama, e é por ele que descobrimos de qual workspace e de qual BU
  // o evento é. Evento com registrationId de outra BU não tem como ser aceito.
  `CREATE TABLE IF NOT EXISTS core."gatewayWebhookClaim" (
     "registrationId" uuid PRIMARY KEY,
     "workspaceId" uuid NOT NULL,
     "businessUnitId" uuid NOT NULL,
     "createdAt" timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS "gatewayWebhookClaim_bu_idx"
     ON core."gatewayWebhookClaim" ("businessUnitId")`,
];

export const garantirTabelasDoFinanceiro = async (
  client: Client,
): Promise<string[]> => {
  for (const ddl of TABELAS) {
    await client.query(ddl);
  }

  const { rows } = await client.query<{ tablename: string }>(
    `SELECT "tablename" FROM pg_tables
     WHERE "schemaname" = 'core' AND "tablename" LIKE 'gateway%'
     ORDER BY "tablename"`,
  );

  return rows.map((linha) => linha.tablename);
};
