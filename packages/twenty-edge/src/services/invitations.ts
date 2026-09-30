import { type Client } from 'pg';

import { hashSessionToken } from 'src/auth/session';

export type WorkspaceInvitation = {
  id: string;
  email: string;
  roleId: string | null;
  expiresAt: Date;
};

const INVITATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const INVITATION_TOKEN_BYTE_LENGTH = 32;

type AppTokenRow = {
  id: string;
  context: { email?: string; roleId?: string | null } | null;
  expiresAt: Date;
};

const toInvitation = (row: AppTokenRow): WorkspaceInvitation => ({
  id: row.id,
  email: row.context?.email ?? '',
  roleId: row.context?.roleId ?? null,
  expiresAt: row.expiresAt,
});

const issueInvitationToken = async (): Promise<{
  token: string;
  tokenHash: string;
}> => {
  const bytes = crypto.getRandomValues(
    new Uint8Array(INVITATION_TOKEN_BYTE_LENGTH),
  );
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return { token, tokenHash: await hashSessionToken(token) };
};

export const findWorkspaceInvitations = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<WorkspaceInvitation[]> => {
  const { rows } = await client.query<AppTokenRow>(
    `SELECT "id","context","expiresAt"
     FROM core."appToken"
     WHERE "workspaceId" = $1 AND "type" = 'INVITATION'
       AND "revokedAt" IS NULL AND "expiresAt" > now()
     ORDER BY "createdAt" DESC`,
    [workspaceId],
  );

  return rows.map(toInvitation);
};

// Inviting the same address twice replaces the live invitation rather than
// adding a second one: the settings page lists them, and two rows for one
// person is a bug the person can see.
export const createInvitation = async ({
  client,
  workspaceId,
  email,
  roleId,
}: {
  client: Client;
  workspaceId: string;
  email: string;
  roleId: string | null;
}): Promise<{ invitation: WorkspaceInvitation; token: string }> => {
  const { token, tokenHash } = await issueInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

  await client.query(
    `UPDATE core."appToken" SET "revokedAt" = now()
     WHERE "workspaceId" = $1 AND "type" = 'INVITATION'
       AND "revokedAt" IS NULL AND lower("context" ->> 'email') = lower($2)`,
    [workspaceId, email],
  );

  const { rows } = await client.query<AppTokenRow>(
    `INSERT INTO core."appToken"
       ("workspaceId","type","valueHash","context","expiresAt")
     VALUES ($1,'INVITATION',$2,$3,$4)
     RETURNING "id","context","expiresAt"`,
    [workspaceId, tokenHash, JSON.stringify({ email, roleId }), expiresAt],
  );

  return { invitation: toInvitation(rows[0]), token };
};

export const rotateInvitationToken = async ({
  client,
  workspaceId,
  appTokenId,
}: {
  client: Client;
  workspaceId: string;
  appTokenId: string;
}): Promise<{ invitation: WorkspaceInvitation; token: string } | null> => {
  const { rows } = await client.query<AppTokenRow>(
    `SELECT "id","context","expiresAt" FROM core."appToken"
     WHERE "workspaceId" = $1 AND "id" = $2 AND "type" = 'INVITATION'
       AND "revokedAt" IS NULL`,
    [workspaceId, appTokenId],
  );

  if (rows[0] === undefined) {
    return null;
  }

  // A resend issues a new token and extends the expiry: the old link was
  // already sent somewhere, and leaving it live means two ways in.
  const { token, tokenHash } = await issueInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

  const { rows: updated } = await client.query<AppTokenRow>(
    `UPDATE core."appToken"
     SET "valueHash" = $3, "expiresAt" = $4, "updatedAt" = now()
     WHERE "workspaceId" = $1 AND "id" = $2
     RETURNING "id","context","expiresAt"`,
    [workspaceId, appTokenId, tokenHash, expiresAt],
  );

  return { invitation: toInvitation(updated[0]), token };
};

export const revokeInvitation = async ({
  client,
  workspaceId,
  appTokenId,
}: {
  client: Client;
  workspaceId: string;
  appTokenId: string;
}): Promise<boolean> => {
  const { rowCount } = await client.query(
    `UPDATE core."appToken" SET "revokedAt" = now(), "updatedAt" = now()
     WHERE "workspaceId" = $1 AND "id" = $2 AND "type" = 'INVITATION'
       AND "revokedAt" IS NULL`,
    [workspaceId, appTokenId],
  );

  return (rowCount ?? 0) > 0;
};

export type RedeemedInvitation = {
  appTokenId: string;
  workspaceId: string;
  email: string;
  roleId: string | null;
};

// Looked up by the hash of the token the link carries, never by the token: the
// table holds no value that could be replayed if it leaked.
export const findInvitationByToken = async ({
  client,
  token,
}: {
  client: Client;
  token: string;
}): Promise<RedeemedInvitation | null> => {
  const { rows } = await client.query<{
    id: string;
    workspaceId: string;
    context: { email?: string; roleId?: string | null } | null;
  }>(
    `SELECT "id","workspaceId","context" FROM core."appToken"
     WHERE "valueHash" = $1 AND "type" = 'INVITATION'
       AND "revokedAt" IS NULL AND "expiresAt" > now()
     LIMIT 1`,
    [await hashSessionToken(token)],
  );

  const row = rows[0];

  if (row === undefined || row.context?.email === undefined) {
    return null;
  }

  return {
    appTokenId: row.id,
    workspaceId: row.workspaceId,
    email: row.context.email,
    roleId: row.context.roleId ?? null,
  };
};

export const consumeInvitation = async ({
  client,
  appTokenId,
}: {
  client: Client;
  appTokenId: string;
}): Promise<void> => {
  await client.query(
    `UPDATE core."appToken" SET "revokedAt" = now(), "updatedAt" = now()
     WHERE "id" = $1`,
    [appTokenId],
  );
};
