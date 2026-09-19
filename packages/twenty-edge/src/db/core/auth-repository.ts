import { type Client } from 'pg';

export type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isEmailVerified: boolean;
  passwordHash: string | null;
  disabled: boolean;
  locale: string;
};

export type WorkspaceRow = {
  id: string;
  displayName: string | null;
  subdomain: string;
  customDomain: string | null;
  activationStatus: string;
  databaseSchema: string | null;
  metadataVersion: number;
};

export const findUserByEmail = async ({
  client,
  email,
}: {
  client: Client;
  email: string;
}): Promise<UserRow | null> => {
  const { rows } = await client.query<UserRow>(
    `SELECT "id","firstName","lastName","email","isEmailVerified","passwordHash","disabled","locale"
     FROM core."user" WHERE "email" = $1 AND "deletedAt" IS NULL`,
    [email],
  );

  return rows[0] ?? null;
};

export const findUserById = async ({
  client,
  userId,
}: {
  client: Client;
  userId: string;
}): Promise<UserRow | null> => {
  const { rows } = await client.query<UserRow>(
    `SELECT "id","firstName","lastName","email","isEmailVerified","passwordHash","disabled","locale"
     FROM core."user" WHERE "id" = $1 AND "deletedAt" IS NULL`,
    [userId],
  );

  return rows[0] ?? null;
};

export const insertUser = async ({
  client,
  email,
  firstName,
  lastName,
  passwordHash,
}: {
  client: Client;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
}): Promise<UserRow> => {
  const { rows } = await client.query<UserRow>(
    `INSERT INTO core."user" ("email","firstName","lastName","passwordHash")
     VALUES ($1,$2,$3,$4)
     RETURNING "id","firstName","lastName","email","isEmailVerified","passwordHash","disabled","locale"`,
    [email, firstName, lastName, passwordHash],
  );

  return rows[0];
};

export const findWorkspaceById = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<WorkspaceRow | null> => {
  const { rows } = await client.query<WorkspaceRow>(
    `SELECT "id","displayName","subdomain","customDomain","activationStatus","databaseSchema","metadataVersion"
     FROM core."workspace" WHERE "id" = $1 AND "deletedAt" IS NULL`,
    [workspaceId],
  );

  return rows[0] ?? null;
};

export const findWorkspaceBySubdomain = async ({
  client,
  subdomain,
}: {
  client: Client;
  subdomain: string;
}): Promise<WorkspaceRow | null> => {
  const { rows } = await client.query<WorkspaceRow>(
    `SELECT "id","displayName","subdomain","customDomain","activationStatus","databaseSchema","metadataVersion"
     FROM core."workspace" WHERE "subdomain" = $1 AND "deletedAt" IS NULL`,
    [subdomain],
  );

  return rows[0] ?? null;
};

export const findFirstWorkspaceForUser = async ({
  client,
  userId,
}: {
  client: Client;
  userId: string;
}): Promise<{ workspace: WorkspaceRow; userWorkspaceId: string } | null> => {
  const { rows } = await client.query<WorkspaceRow & { userWorkspaceId: string }>(
    `SELECT w."id", w."displayName", w."subdomain", w."customDomain",
            w."activationStatus", w."databaseSchema", w."metadataVersion",
            uw."id" AS "userWorkspaceId"
     FROM core."userWorkspace" uw
     JOIN core."workspace" w ON w."id" = uw."workspaceId"
     WHERE uw."userId" = $1 AND uw."deletedAt" IS NULL AND w."deletedAt" IS NULL
     ORDER BY uw."createdAt" ASC LIMIT 1`,
    [userId],
  );

  const row = rows[0];

  if (row === undefined) {
    return null;
  }

  const { userWorkspaceId, ...workspace } = row;

  return { workspace, userWorkspaceId };
};

export type SessionRow = {
  id: string;
  userId: string;
  workspaceId: string | null;
  userWorkspaceId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

export const insertSession = async ({
  client,
  tokenHash,
  userId,
  workspaceId,
  userWorkspaceId,
  expiresAt,
  ipAddress,
  userAgent,
}: {
  client: Client;
  tokenHash: string;
  userId: string;
  workspaceId: string | null;
  userWorkspaceId: string | null;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> => {
  await client.query(
    `INSERT INTO core."userSession"
       ("tokenHash","userId","workspaceId","userWorkspaceId","expiresAt","ipAddress","userAgent")
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [tokenHash, userId, workspaceId, userWorkspaceId, expiresAt, ipAddress, userAgent],
  );
};

export const findActiveSession = async ({
  client,
  tokenHash,
}: {
  client: Client;
  tokenHash: string;
}): Promise<SessionRow | null> => {
  const { rows } = await client.query<SessionRow>(
    `SELECT "id","userId","workspaceId","userWorkspaceId","expiresAt","revokedAt"
     FROM core."userSession"
     WHERE "tokenHash" = $1 AND "revokedAt" IS NULL AND "expiresAt" > now()`,
    [tokenHash],
  );

  return rows[0] ?? null;
};

export type SessionContext = {
  session: { id: string; userId: string };
  user: UserRow;
  membership: { workspace: WorkspaceRow; userWorkspaceId: string } | null;
};

type SessionContextRow = {
  sessionId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  isEmailVerified: boolean;
  passwordHash: string | null;
  disabled: boolean;
  locale: string;
  userWorkspaceId: string | null;
  workspaceId: string | null;
  displayName: string | null;
  subdomain: string | null;
  customDomain: string | null;
  activationStatus: string | null;
  databaseSchema: string | null;
  metadataVersion: number | null;
};

// One round trip instead of three. Every query the Worker sends crosses the
// ocean to sa-east-1, so the boot burst the front fires is dominated by the
// number of statements per request, not by how much each one reads.
export const findSessionContext = async ({
  client,
  tokenHash,
}: {
  client: Client;
  tokenHash: string;
}): Promise<SessionContext | null> => {
  const { rows } = await client.query<SessionContextRow>(
    `SELECT s."id" AS "sessionId",
            u."id" AS "userId", u."firstName", u."lastName", u."email",
            u."isEmailVerified", u."passwordHash", u."disabled", u."locale",
            uw."id" AS "userWorkspaceId",
            w."id" AS "workspaceId", w."displayName", w."subdomain",
            w."customDomain", w."activationStatus", w."databaseSchema",
            w."metadataVersion"
     FROM core."userSession" s
     JOIN core."user" u ON u."id" = s."userId" AND u."deletedAt" IS NULL
     LEFT JOIN core."userWorkspace" uw
       ON uw."userId" = u."id" AND uw."deletedAt" IS NULL
     LEFT JOIN core."workspace" w
       ON w."id" = uw."workspaceId" AND w."deletedAt" IS NULL
     WHERE s."tokenHash" = $1 AND s."revokedAt" IS NULL AND s."expiresAt" > now()
     ORDER BY uw."createdAt" ASC
     LIMIT 1`,
    [tokenHash],
  );

  const row = rows[0];

  if (row === undefined) {
    return null;
  }

  return {
    session: { id: row.sessionId, userId: row.userId },
    user: {
      id: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      isEmailVerified: row.isEmailVerified,
      passwordHash: row.passwordHash,
      disabled: row.disabled,
      locale: row.locale,
    },
    membership:
      row.workspaceId === null ||
      row.userWorkspaceId === null ||
      row.subdomain === null
        ? null
        : {
            userWorkspaceId: row.userWorkspaceId,
            workspace: {
              id: row.workspaceId,
              displayName: row.displayName,
              subdomain: row.subdomain,
              customDomain: row.customDomain,
              activationStatus: row.activationStatus ?? 'ACTIVE',
              databaseSchema: row.databaseSchema,
              metadataVersion: row.metadataVersion ?? 1,
            },
          },
  };
};

export const revokeSession = async ({
  client,
  tokenHash,
  reason,
}: {
  client: Client;
  tokenHash: string;
  reason: string;
}): Promise<void> => {
  await client.query(
    `UPDATE core."userSession" SET "revokedAt" = now(), "revokedReason" = $2
     WHERE "tokenHash" = $1 AND "revokedAt" IS NULL`,
    [tokenHash, reason],
  );
};

export const touchSession = async ({
  client,
  tokenHash,
}: {
  client: Client;
  tokenHash: string;
}): Promise<void> => {
  await client.query(
    `UPDATE core."userSession" SET "lastActiveAt" = now() WHERE "tokenHash" = $1`,
    [tokenHash],
  );
};
