import { type Client } from 'pg';

import { UserFacingError } from 'src/graphql/user-facing-error';
import {
  findRoleForUserWorkspace,
  type FieldPermissionRow,
  type ObjectPermissionRow,
  type RoleRow,
} from 'src/db/core/role-repository';

export type ObjectAction =
  | 'read'
  | 'update'
  | 'softDelete'
  | 'destroy';

export type ObjectPermissionSet = {
  canReadObjectRecords: boolean;
  canUpdateObjectRecords: boolean;
  canSoftDeleteObjectRecords: boolean;
  canDestroyObjectRecords: boolean;
  // Keyed by field metadata id, the way the front reads it.
  restrictedFields: Record<
    string,
    { canRead: boolean; canUpdate: boolean }
  >;
};

export type WorkspacePermissions = {
  role: RoleRow | null;
  permissionFlags: string[];
  canUpdateAllSettings: boolean;
  byObjectMetadataId: Map<string, ObjectPermissionSet>;
};

// A workspace with no roles yet is a workspace of one, and that one person is
// its creator. Refusing everything there would lock them out of their own data
// between the migration and the seed.
export const FULL_ACCESS: ObjectPermissionSet = {
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: true,
  restrictedFields: {},
};

const resolve = (
  override: boolean | null | undefined,
  fallback: boolean,
): boolean => (override === null || override === undefined ? fallback : override);

const buildObjectPermissionSet = ({
  role,
  objectPermission,
  fieldPermissions,
}: {
  role: RoleRow;
  objectPermission: ObjectPermissionRow | undefined;
  fieldPermissions: FieldPermissionRow[];
}): ObjectPermissionSet => {
  const restrictedFields: ObjectPermissionSet['restrictedFields'] = {};

  for (const fieldPermission of fieldPermissions) {
    const canRead = resolve(fieldPermission.canReadFieldValue, true);
    const canUpdate = resolve(fieldPermission.canUpdateFieldValue, true);

    // Only a restriction belongs in the map — the front treats every entry as
    // something taken away, so an unrestricted field listed here would render
    // as restricted.
    if (canRead && canUpdate) {
      continue;
    }

    restrictedFields[fieldPermission.fieldMetadataId] = { canRead, canUpdate };
  }

  return {
    canReadObjectRecords: resolve(
      objectPermission?.canReadObjectRecords,
      role.canReadAllObjectRecords,
    ),
    canUpdateObjectRecords: resolve(
      objectPermission?.canUpdateObjectRecords,
      role.canUpdateAllObjectRecords,
    ),
    canSoftDeleteObjectRecords: resolve(
      objectPermission?.canSoftDeleteObjectRecords,
      role.canSoftDeleteAllObjectRecords,
    ),
    canDestroyObjectRecords: resolve(
      objectPermission?.canDestroyObjectRecords,
      role.canDestroyAllObjectRecords,
    ),
    restrictedFields,
  };
};

export const buildWorkspacePermissions = ({
  role,
  objectPermissions,
  fieldPermissions,
  permissionFlags,
  objectMetadataIds,
}: {
  role: RoleRow | null;
  objectPermissions: ObjectPermissionRow[];
  fieldPermissions: FieldPermissionRow[];
  permissionFlags: string[];
  objectMetadataIds: string[];
}): WorkspacePermissions => {
  const byObjectMetadataId = new Map<string, ObjectPermissionSet>();

  if (role === null) {
    for (const objectMetadataId of objectMetadataIds) {
      byObjectMetadataId.set(objectMetadataId, FULL_ACCESS);
    }

    return {
      role: null,
      permissionFlags: [],
      canUpdateAllSettings: true,
      byObjectMetadataId,
    };
  }

  const objectPermissionByObjectId = new Map(
    objectPermissions.map((entry) => [entry.objectMetadataId, entry]),
  );

  const fieldPermissionsByObjectId = new Map<string, FieldPermissionRow[]>();

  for (const fieldPermission of fieldPermissions) {
    const existing =
      fieldPermissionsByObjectId.get(fieldPermission.objectMetadataId) ?? [];

    existing.push(fieldPermission);
    fieldPermissionsByObjectId.set(fieldPermission.objectMetadataId, existing);
  }

  for (const objectMetadataId of objectMetadataIds) {
    byObjectMetadataId.set(
      objectMetadataId,
      buildObjectPermissionSet({
        role,
        objectPermission: objectPermissionByObjectId.get(objectMetadataId),
        fieldPermissions: fieldPermissionsByObjectId.get(objectMetadataId) ?? [],
      }),
    );
  }

  return {
    role,
    permissionFlags,
    canUpdateAllSettings: role.canUpdateAllSettings,
    byObjectMetadataId,
  };
};

export const loadWorkspacePermissions = async ({
  client,
  workspaceId,
  userWorkspaceId,
  objectMetadataIds,
}: {
  client: Client;
  workspaceId: string;
  userWorkspaceId: string;
  objectMetadataIds: string[];
}): Promise<WorkspacePermissions> => {
  const memberRole = await findRoleForUserWorkspace({
    client,
    workspaceId,
    userWorkspaceId,
  });

  return buildWorkspacePermissions({
    role: memberRole?.role ?? null,
    objectPermissions: memberRole?.objectPermissions ?? [],
    fieldPermissions: memberRole?.fieldPermissions ?? [],
    permissionFlags: memberRole?.permissionFlags ?? [],
    objectMetadataIds,
  });
};

const ACTION_KEY: Record<ObjectAction, keyof ObjectPermissionSet> = {
  read: 'canReadObjectRecords',
  update: 'canUpdateObjectRecords',
  softDelete: 'canSoftDeleteObjectRecords',
  destroy: 'canDestroyObjectRecords',
};

export const canPerform = ({
  permissions,
  objectMetadataId,
  action,
}: {
  permissions: WorkspacePermissions;
  objectMetadataId: string;
  action: ObjectAction;
}): boolean => {
  const permission = permissions.byObjectMetadataId.get(objectMetadataId);

  // An object the role has no entry for is an object created after the role was
  // read. Denying is the safe answer; the role's own switch decides.
  if (permission === undefined) {
    return permissions.role === null;
  }

  return permission[ACTION_KEY[action]] === true;
};

// A refused permission is something the person should see, not an internal
// failure: without this it would be masked to "Unexpected error." like a SQL
// error, and the app would give no reason for the refusal.
export class PermissionDeniedError extends UserFacingError {
  constructor(action: ObjectAction, objectNameSingular: string) {
    super(
      `Not allowed to ${action} records of ${objectNameSingular} with your role`,
      'FORBIDDEN',
    );
    this.name = 'PermissionDeniedError';
  }
}

export const assertCanPerform = ({
  permissions,
  objectMetadataId,
  objectNameSingular,
  action,
}: {
  permissions: WorkspacePermissions;
  objectMetadataId: string;
  objectNameSingular: string;
  action: ObjectAction;
}): void => {
  if (!canPerform({ permissions, objectMetadataId, action })) {
    throw new PermissionDeniedError(action, objectNameSingular);
  }
};
