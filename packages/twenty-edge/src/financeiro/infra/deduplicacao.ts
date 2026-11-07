import { type Client } from 'pg';

import { type EventDeduplicationPort } from 'src/financeiro/core/ports/event-deduplication.port';

// A porta é checar-depois-marcar, então duas entregas simultâneas do mesmo
// evento podem passar as duas pela checagem. Não apertamos isso reservando o id
// antes de aplicar: uma falha no meio deixaria o evento marcado e nunca mais
// reprocessado, e perder a baixa de uma fatura é pior que aplicá-la duas vezes.
// A corrida é inofensiva porque aplicar é idempotente no dado — fatura entra por
// upsert sobre índice único do id externo — e o INSERT abaixo não reclama do
// segundo a chegar.
export const deduplicacaoEmPostgres = ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): EventDeduplicationPort => ({
  hasBeenApplied: async (eventId) => {
    const { rows } = await client.query(
      `SELECT 1 FROM core."gatewayEvent"
       WHERE "workspaceId" = $1 AND "eventId" = $2`,
      [workspaceId, eventId],
    );

    return rows.length > 0;
  },

  markAsApplied: async (eventId) => {
    await client.query(
      `INSERT INTO core."gatewayEvent" ("workspaceId","eventId")
       VALUES ($1, $2)
       ON CONFLICT ("workspaceId","eventId") DO NOTHING`,
      [workspaceId, eventId],
    );
  },
});
