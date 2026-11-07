import { Client, types } from 'pg';

import { type Bindings } from 'src/env';

const DATE_TYPE_OID = 1082;

// node-postgres parses `date` into a JS Date, which serializes with a time
// component. Workspace DATE fields are date-only, so keep the raw 'YYYY-MM-DD'
// string Postgres returns.
const DATE_ONLY_TYPE_PARSERS = {
  getTypeParser: ((oid: number, format?: unknown) =>
    oid === DATE_TYPE_OID
      ? (value: string) => value
      : types.getTypeParser(oid, format as never)) as typeof types.getTypeParser,
};

// Hyperdrive pools on its own, so a Worker opens a plain Client per invocation.
// A Pool, or any client built in module scope, would leak sockets across
// requests: the runtime forbids sockets created outside a handler.
export const createDatabaseClient = async (
  bindings: Bindings,
): Promise<Client> => {
  const client = new Client({
    connectionString: bindings.HYPERDRIVE.connectionString,
    types: DATE_ONLY_TYPE_PARSERS,
  });

  await client.connect();

  return client;
};

// Typed by what it actually needs, not by ExecutionContext: Hono and
// workers-types each declare their own, and they are not assignable.
export type WaitUntilCapable = { waitUntil: (promise: Promise<unknown>) => void };

export const withDatabaseClient = async <TResult>(
  bindings: Bindings,
  executionContext: WaitUntilCapable,
  run: (client: Client) => Promise<TResult>,
): Promise<TResult> => {
  const client = await createDatabaseClient(bindings);

  try {
    return await run(client);
  } finally {
    // Closing must outlive the response, otherwise the socket is torn down
    // mid-flight when the handler returns.
    executionContext.waitUntil(client.end());
  }
};
