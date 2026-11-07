import { type Client } from 'pg';

import { escapeIdentifier } from 'src/ddl/escape';
import { getWorkspaceSchemaName } from 'src/metadata/naming';

export type WorkspaceMemberRow = {
  id: string;
  nameFirstName: string | null;
  nameLastName: string | null;
  colorScheme: string | null;
  locale: string | null;
  avatarUrl: string | null;
  userEmail: string | null;
  userId: string | null;
};

// The workspaceMember lives in the tenant schema, not in core: the front reads
// it off currentUser to know who is looking at the app.
export const findWorkspaceMemberByUserId = async ({
  client,
  workspaceId,
  userId,
}: {
  client: Client;
  workspaceId: string;
  userId: string;
}): Promise<WorkspaceMemberRow | null> => {
  const schemaName = getWorkspaceSchemaName(workspaceId);

  const { rows } = await client.query<WorkspaceMemberRow>(
    `SELECT "id","nameFirstName","nameLastName","colorScheme","locale","avatarUrl","userEmail","userId"
     FROM ${escapeIdentifier(schemaName)}."workspaceMember"
     WHERE "userId" = $1 AND "deletedAt" IS NULL
     LIMIT 1`,
    [userId],
  );

  return rows[0] ?? null;
};

export const findWorkspaceMembers = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<WorkspaceMemberRow[]> => {
  const schemaName = getWorkspaceSchemaName(workspaceId);

  const { rows } = await client.query<WorkspaceMemberRow>(
    `SELECT "id","nameFirstName","nameLastName","colorScheme","locale","avatarUrl","userEmail","userId"
     FROM ${escapeIdentifier(schemaName)}."workspaceMember"
     WHERE "deletedAt" IS NULL
     ORDER BY "createdAt" ASC`,
    [],
  );

  return rows;
};
