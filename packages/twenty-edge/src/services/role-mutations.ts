import { type Client } from 'pg';

import {
  findRoles,
  type FieldPermissionRow,
  type ObjectPermissionRow,
  type RolePermissionFlagRow,
  type RoleRow,
} from 'src/db/core/role-repository';
import { UserFacingError } from 'src/graphql/user-facing-error';

export type RoleInput = {
  label?: string | null;
  description?: string | null;
  icon?: string | null;
  canReadAllObjectRecords?: boolean | null;
  canUpdateAllObjectRecords?: boolean | null;
  canSoftDeleteAllObjectRecords?: boolean | null;
  canDestroyAllObjectRecords?: boolean | null;
  canUpdateAllSettings?: boolean | null;
  canAccessAllTools?: boolean | null;
  canBeAssignedToUsers?: boolean | null;
  canBeAssignedToAgents?: boolean | null;
  canBeAssignedToApiKeys?: boolean | null;
};

const EDITABLE_COLUMNS: (keyof RoleInput)[] = [
  'label',
  'description',
  'icon',
  'canReadAllObjectRecords',
  'canUpdateAllObjectRecords',
  'canSoftDeleteAllObjectRecords',
  'canDestroyAllObjectRecords',
  'canUpdateAllSettings',
  'canAccessAllTools',
  'canBeAssignedToUsers',
  'canBeAssignedToAgents',
  'canBeAssignedToApiKeys',
];

const findRoleById = async ({
  client,
  workspaceId,
  roleId,
}: {
  client: Client;
  workspaceId: string;
  roleId: string;
}): Promise<RoleRow | null> => {
  const roles = await findRoles({ client, workspaceId });

  return roles.find((role) => role.id === roleId) ?? null;
};

export const createRole = async ({
  client,
  workspaceId,
  input,
}: {
  client: Client;
  workspaceId: string;
  input: RoleInput;
}): Promise<RoleRow> => {
  const columns = EDITABLE_COLUMNS.filter(
    (column) => input[column] !== undefined && input[column] !== null,
  );

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO core."role" ("workspaceId"${columns
      .map((column) => `,"${column}"`)
      .join('')})
     VALUES ($1${columns.map((_column, index) => `,$${index + 2}`).join('')})
     RETURNING "id"`,
    [workspaceId, ...columns.map((column) => input[column])],
  );

  const role = await findRoleById({
    client,
    workspaceId,
    roleId: rows[0].id,
  });

  if (role === null) {
    throw new UserFacingError('Role was created but could not be read back');
  }

  return role;
};

export const updateRole = async ({
  client,
  workspaceId,
  roleId,
  input,
}: {
  client: Client;
  workspaceId: string;
  roleId: string;
  input: RoleInput;
}): Promise<RoleRow> => {
  const existing = await findRoleById({ client, workspaceId, roleId });

  if (existing === null) {
    throw new UserFacingError('Role not found');
  }

  // A built-in role is what everyone falls back to. Editing Admin to drop its
  // own settings permission would lock the workspace out of its own settings.
  if (!existing.isEditable) {
    throw new UserFacingError(`"${existing.label}" is a built-in role and cannot be edited`);
  }

  const columns = EDITABLE_COLUMNS.filter(
    (column) => input[column] !== undefined,
  );

  if (columns.length === 0) {
    return existing;
  }

  await client.query(
    `UPDATE core."role"
     SET ${columns
       .map((column, index) => `"${column}" = $${index + 3}`)
       .join(', ')}, "updatedAt" = now()
     WHERE "workspaceId" = $1 AND "id" = $2`,
    [workspaceId, roleId, ...columns.map((column) => input[column])],
  );

  const updated = await findRoleById({ client, workspaceId, roleId });

  if (updated === null) {
    throw new UserFacingError('Role not found');
  }

  return updated;
};

export const deleteRole = async ({
  client,
  workspaceId,
  roleId,
}: {
  client: Client;
  workspaceId: string;
  roleId: string;
}): Promise<string> => {
  const existing = await findRoleById({ client, workspaceId, roleId });

  if (existing === null) {
    throw new UserFacingError('Role not found');
  }

  if (!existing.isEditable) {
    throw new UserFacingError(
      `"${existing.label}" is a built-in role and cannot be deleted`,
    );
  }

  // Members of the deleted role move to the default one rather than losing
  // their role: a member with no role is treated as an administrator.
  await client.query(
    `UPDATE core."roleTarget"
     SET "roleId" = (
       SELECT "id" FROM core."role"
       WHERE "workspaceId" = $1 AND "isDefaultRole" = true LIMIT 1
     ), "updatedAt" = now()
     WHERE "workspaceId" = $1 AND "roleId" = $2`,
    [workspaceId, roleId],
  );

  await client.query(
    `DELETE FROM core."role" WHERE "workspaceId" = $1 AND "id" = $2`,
    [workspaceId, roleId],
  );

  return roleId;
};

export const assignRoleToWorkspaceMember = async ({
  client,
  workspaceId,
  userWorkspaceId,
  roleId,
}: {
  client: Client;
  workspaceId: string;
  userWorkspaceId: string;
  roleId: string;
}): Promise<void> => {
  await client.query(
    `INSERT INTO core."roleTarget" ("workspaceId","roleId","userWorkspaceId")
     VALUES ($1,$2,$3)
     ON CONFLICT ("userWorkspaceId") WHERE "userWorkspaceId" IS NOT NULL
     DO UPDATE SET "roleId" = EXCLUDED."roleId", "updatedAt" = now()`,
    [workspaceId, roleId, userWorkspaceId],
  );
};

export const upsertObjectPermissions = async ({
  client,
  workspaceId,
  roleId,
  objectPermissions,
}: {
  client: Client;
  workspaceId: string;
  roleId: string;
  objectPermissions: {
    objectMetadataId: string;
    canReadObjectRecords?: boolean | null;
    canUpdateObjectRecords?: boolean | null;
    canSoftDeleteObjectRecords?: boolean | null;
    canDestroyObjectRecords?: boolean | null;
  }[];
}): Promise<ObjectPermissionRow[]> => {
  const written: ObjectPermissionRow[] = [];

  for (const permission of objectPermissions) {
    const { rows } = await client.query<ObjectPermissionRow>(
      `INSERT INTO core."objectPermission"
         ("workspaceId","roleId","objectMetadataId","canReadObjectRecords",
          "canUpdateObjectRecords","canSoftDeleteObjectRecords","canDestroyObjectRecords")
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("roleId","objectMetadataId") DO UPDATE SET
         "canReadObjectRecords" = EXCLUDED."canReadObjectRecords",
         "canUpdateObjectRecords" = EXCLUDED."canUpdateObjectRecords",
         "canSoftDeleteObjectRecords" = EXCLUDED."canSoftDeleteObjectRecords",
         "canDestroyObjectRecords" = EXCLUDED."canDestroyObjectRecords",
         "updatedAt" = now()
       RETURNING "id","roleId","objectMetadataId","canReadObjectRecords",
                 "canUpdateObjectRecords","canSoftDeleteObjectRecords","canDestroyObjectRecords"`,
      [
        workspaceId,
        roleId,
        permission.objectMetadataId,
        permission.canReadObjectRecords ?? null,
        permission.canUpdateObjectRecords ?? null,
        permission.canSoftDeleteObjectRecords ?? null,
        permission.canDestroyObjectRecords ?? null,
      ],
    );

    written.push(rows[0]);
  }

  return written;
};

export const upsertFieldPermissions = async ({
  client,
  workspaceId,
  roleId,
  fieldPermissions,
}: {
  client: Client;
  workspaceId: string;
  roleId: string;
  fieldPermissions: {
    objectMetadataId: string;
    fieldMetadataId: string;
    canReadFieldValue?: boolean | null;
    canUpdateFieldValue?: boolean | null;
  }[];
}): Promise<FieldPermissionRow[]> => {
  const written: FieldPermissionRow[] = [];

  for (const permission of fieldPermissions) {
    const { rows } = await client.query<FieldPermissionRow>(
      `INSERT INTO core."fieldPermission"
         ("workspaceId","roleId","objectMetadataId","fieldMetadataId",
          "canReadFieldValue","canUpdateFieldValue")
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("roleId","fieldMetadataId") DO UPDATE SET
         "canReadFieldValue" = EXCLUDED."canReadFieldValue",
         "canUpdateFieldValue" = EXCLUDED."canUpdateFieldValue",
         "updatedAt" = now()
       RETURNING "id","roleId","objectMetadataId","fieldMetadataId",
                 "canReadFieldValue","canUpdateFieldValue"`,
      [
        workspaceId,
        roleId,
        permission.objectMetadataId,
        permission.fieldMetadataId,
        permission.canReadFieldValue ?? null,
        permission.canUpdateFieldValue ?? null,
      ],
    );

    written.push(rows[0]);
  }

  return written;
};

// The input is the complete list, so a flag the caller left out is one the role
// no longer has.
export const upsertPermissionFlags = async ({
  client,
  workspaceId,
  roleId,
  flags,
}: {
  client: Client;
  workspaceId: string;
  roleId: string;
  flags: string[];
}): Promise<RolePermissionFlagRow[]> => {
  await client.query(
    `DELETE FROM core."rolePermissionFlag"
     WHERE "workspaceId" = $1 AND "roleId" = $2 AND NOT ("flag" = ANY($3::text[]))`,
    [workspaceId, roleId, flags],
  );

  if (flags.length === 0) {
    return [];
  }

  const { rows } = await client.query<RolePermissionFlagRow>(
    `INSERT INTO core."rolePermissionFlag" ("workspaceId","roleId","flag")
     SELECT $1, $2, unnest($3::text[])
     ON CONFLICT ("roleId","flag") DO NOTHING
     RETURNING "id","roleId","flag"`,
    [workspaceId, roleId, flags],
  );

  if (rows.length === flags.length) {
    return rows;
  }

  const { rows: allRows } = await client.query<RolePermissionFlagRow>(
    `SELECT "id","roleId","flag" FROM core."rolePermissionFlag"
     WHERE "workspaceId" = $1 AND "roleId" = $2`,
    [workspaceId, roleId],
  );

  return allRows;
};
