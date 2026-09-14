import { type Client } from 'pg';

export type RoleRow = {
  id: string;
  workspaceId: string;
  label: string;
  description: string | null;
  icon: string | null;
  canReadAllObjectRecords: boolean;
  canUpdateAllObjectRecords: boolean;
  canSoftDeleteAllObjectRecords: boolean;
  canDestroyAllObjectRecords: boolean;
  canUpdateAllSettings: boolean;
  canAccessAllTools: boolean;
  isEditable: boolean;
  canBeAssignedToUsers: boolean;
  canBeAssignedToAgents: boolean;
  canBeAssignedToApiKeys: boolean;
  isDefaultRole: boolean;
  standardId: string | null;
};

export type ObjectPermissionRow = {
  id: string;
  roleId: string;
  objectMetadataId: string;
  canReadObjectRecords: boolean | null;
  canUpdateObjectRecords: boolean | null;
  canSoftDeleteObjectRecords: boolean | null;
  canDestroyObjectRecords: boolean | null;
};

export type FieldPermissionRow = {
  id: string;
  roleId: string;
  objectMetadataId: string;
  fieldMetadataId: string;
  canReadFieldValue: boolean | null;
  canUpdateFieldValue: boolean | null;
};

export type RolePermissionFlagRow = {
  id: string;
  roleId: string;
  flag: string;
};

export type RoleTargetRow = {
  id: string;
  roleId: string;
  userWorkspaceId: string | null;
};

const ROLE_COLUMNS = `"id","workspaceId","label","description","icon",
  "canReadAllObjectRecords","canUpdateAllObjectRecords",
  "canSoftDeleteAllObjectRecords","canDestroyAllObjectRecords",
  "canUpdateAllSettings","canAccessAllTools","isEditable",
  "canBeAssignedToUsers","canBeAssignedToAgents","canBeAssignedToApiKeys",
  "isDefaultRole","standardId"`;

// The same list qualified, for the statement that joins roleTarget to role.
const ROLE_COLUMNS_PREFIXED = ROLE_COLUMNS.replace(
  /"(\w+)"/g,
  'r."$1"',
);

export const findRoles = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<RoleRow[]> => {
  const { rows } = await client.query<RoleRow>(
    `SELECT ${ROLE_COLUMNS} FROM core."role"
     WHERE "workspaceId" = $1
     ORDER BY "createdAt" ASC`,
    [workspaceId],
  );

  return rows;
};

export type RolePermissionData = {
  objectPermissions: ObjectPermissionRow[];
  fieldPermissions: FieldPermissionRow[];
  permissionFlags: RolePermissionFlagRow[];
  roleTargets: RoleTargetRow[];
};

// Four statements in parallel rather than four per role: the settings page asks
// for every role at once, and each statement crosses to the database region.
export const loadRolePermissions = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<RolePermissionData> => {
  const [objectPermissions, fieldPermissions, permissionFlags, roleTargets] =
    await Promise.all([
      client.query<ObjectPermissionRow>(
        `SELECT "id","roleId","objectMetadataId","canReadObjectRecords",
                "canUpdateObjectRecords","canSoftDeleteObjectRecords","canDestroyObjectRecords"
         FROM core."objectPermission" WHERE "workspaceId" = $1`,
        [workspaceId],
      ),
      client.query<FieldPermissionRow>(
        `SELECT "id","roleId","objectMetadataId","fieldMetadataId",
                "canReadFieldValue","canUpdateFieldValue"
         FROM core."fieldPermission" WHERE "workspaceId" = $1`,
        [workspaceId],
      ),
      client.query<RolePermissionFlagRow>(
        `SELECT "id","roleId","flag"
         FROM core."rolePermissionFlag" WHERE "workspaceId" = $1`,
        [workspaceId],
      ),
      client.query<RoleTargetRow>(
        `SELECT "id","roleId","userWorkspaceId"
         FROM core."roleTarget" WHERE "workspaceId" = $1`,
        [workspaceId],
      ),
    ]);

  return {
    objectPermissions: objectPermissions.rows,
    fieldPermissions: fieldPermissions.rows,
    permissionFlags: permissionFlags.rows,
    roleTargets: roleTargets.rows,
  };
};

export type MemberRole = {
  role: RoleRow;
  objectPermissions: ObjectPermissionRow[];
  fieldPermissions: FieldPermissionRow[];
  permissionFlags: string[];
};

// The role a member actually holds, with only that role's permission rows. One
// round trip: the records API needs this on every request, and a second one
// would land on every read in the app.
export const findRoleForUserWorkspace = async ({
  client,
  workspaceId,
  userWorkspaceId,
}: {
  client: Client;
  workspaceId: string;
  userWorkspaceId: string;
}): Promise<MemberRole | null> => {
  const { rows } = await client.query<
    RoleRow & {
      objectPermissions: ObjectPermissionRow[] | null;
      fieldPermissions: FieldPermissionRow[] | null;
      permissionFlags: string[] | null;
    }
  >(
    `SELECT ${ROLE_COLUMNS_PREFIXED},
      COALESCE(
        (SELECT json_agg(json_build_object(
           'id', op."id", 'roleId', op."roleId", 'objectMetadataId', op."objectMetadataId",
           'canReadObjectRecords', op."canReadObjectRecords",
           'canUpdateObjectRecords', op."canUpdateObjectRecords",
           'canSoftDeleteObjectRecords', op."canSoftDeleteObjectRecords",
           'canDestroyObjectRecords', op."canDestroyObjectRecords"))
         FROM core."objectPermission" op WHERE op."roleId" = r."id"), '[]'::json
      ) AS "objectPermissions",
      COALESCE(
        (SELECT json_agg(json_build_object(
           'id', fp."id", 'roleId', fp."roleId", 'objectMetadataId', fp."objectMetadataId",
           'fieldMetadataId', fp."fieldMetadataId",
           'canReadFieldValue', fp."canReadFieldValue",
           'canUpdateFieldValue', fp."canUpdateFieldValue"))
         FROM core."fieldPermission" fp WHERE fp."roleId" = r."id"), '[]'::json
      ) AS "fieldPermissions",
      COALESCE(
        (SELECT json_agg(pf."flag")
         FROM core."rolePermissionFlag" pf WHERE pf."roleId" = r."id"), '[]'::json
      ) AS "permissionFlags"
     FROM core."roleTarget" rt
     JOIN core."role" r ON r."id" = rt."roleId"
     WHERE rt."workspaceId" = $1 AND rt."userWorkspaceId" = $2
     LIMIT 1`,
    [workspaceId, userWorkspaceId],
  );

  const row = rows[0];

  if (row === undefined) {
    return null;
  }

  const {
    objectPermissions,
    fieldPermissions,
    permissionFlags,
    ...role
  } = row;

  return {
    role,
    objectPermissions: objectPermissions ?? [],
    fieldPermissions: fieldPermissions ?? [],
    permissionFlags: permissionFlags ?? [],
  };
};
