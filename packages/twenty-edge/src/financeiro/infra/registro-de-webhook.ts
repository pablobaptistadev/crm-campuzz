import { type Client } from 'pg';

import {
  type WebhookClaim,
  type WebhookRegistryPort,
} from 'src/financeiro/core/ports/webhook-registry.port';

// Sem workspaceId no construtor de propósito: o resolver chega antes de haver
// contexto de workspace — só tem o registrationId que veio na URL. É esta
// tabela que diz de quem é o evento, e é por ela que um registrationId
// desconhecido morre sem tocar em dado nenhum.
// O registrationId vem cru da URL. Sem esta guarda, um valor que não é UUID
// estoura no cast do Postgres e a rota responde 500 — dizendo a quem sondou que
// ali existe alguma coisa. Não sendo UUID, não existe reivindicação, ponto.
const EH_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const registroDeWebhookEmPostgres = ({
  client,
}: {
  client: Client;
}): WebhookRegistryPort => ({
  claim: async (registrationId, claim) => {
    await client.query(
      `INSERT INTO core."gatewayWebhookClaim"
         ("registrationId","workspaceId","businessUnitId")
       VALUES ($1, $2, $3)
       ON CONFLICT ("registrationId") DO UPDATE
         SET "workspaceId" = EXCLUDED."workspaceId",
             "businessUnitId" = EXCLUDED."businessUnitId"`,
      [registrationId, claim.workspaceId, claim.businessUnitId],
    );
  },

  resolve: async (registrationId) => {
    if (!EH_UUID.test(registrationId)) {
      return null;
    }

    const { rows } = await client.query<WebhookClaim>(
      `SELECT "workspaceId", "businessUnitId"
       FROM core."gatewayWebhookClaim"
       WHERE "registrationId" = $1`,
      [registrationId],
    );

    return rows[0] ?? null;
  },

  release: async (registrationId) => {
    if (!EH_UUID.test(registrationId)) {
      return;
    }

    await client.query(
      `DELETE FROM core."gatewayWebhookClaim" WHERE "registrationId" = $1`,
      [registrationId],
    );
  },
});
