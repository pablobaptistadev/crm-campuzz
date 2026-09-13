import { describe, expect, it } from 'vitest';

import { type RoleRow } from 'src/db/core/role-repository';
import {
  buildWorkspacePermissions,
  canPerform,
  PermissionDeniedError,
  assertCanPerform,
} from 'src/services/permissions';

const COMPANY = 'object-company';
const PERSON = 'object-person';

const buildRole = (overrides: Partial<RoleRow> = {}): RoleRow => ({
  id: 'role-1',
  workspaceId: 'workspace-1',
  label: 'Membro',
  description: null,
  icon: null,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  isEditable: true,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  isDefaultRole: true,
  standardId: null,
  ...overrides,
});

const build = ({
  role,
  objectPermissions = [],
  fieldPermissions = [],
}: {
  role: RoleRow | null;
  objectPermissions?: Parameters<
    typeof buildWorkspacePermissions
  >[0]['objectPermissions'];
  fieldPermissions?: Parameters<
    typeof buildWorkspacePermissions
  >[0]['fieldPermissions'];
}) =>
  buildWorkspacePermissions({
    role,
    objectPermissions,
    fieldPermissions,
    permissionFlags: [],
    objectMetadataIds: [COMPANY, PERSON],
  });

describe('buildWorkspacePermissions', () => {
  // A workspace that predates roles has none, and its only member is whoever
  // created it. Refusing everything there would lock them out of their own data.
  it('gives full access when the member has no role', () => {
    const permissions = build({ role: null });

    expect(
      canPerform({ permissions, objectMetadataId: COMPANY, action: 'destroy' }),
    ).toBe(true);
    expect(permissions.canUpdateAllSettings).toBe(true);
  });

  it("falls back to the role's own switches", () => {
    const permissions = build({ role: buildRole() });

    expect(
      canPerform({ permissions, objectMetadataId: COMPANY, action: 'read' }),
    ).toBe(true);
    expect(
      canPerform({ permissions, objectMetadataId: COMPANY, action: 'destroy' }),
    ).toBe(false);
  });

  it('lets an object permission override one object at a time', () => {
    const permissions = build({
      role: buildRole(),
      objectPermissions: [
        {
          id: 'op-1',
          roleId: 'role-1',
          objectMetadataId: PERSON,
          canReadObjectRecords: false,
          canUpdateObjectRecords: null,
          canSoftDeleteObjectRecords: null,
          canDestroyObjectRecords: null,
        },
      ],
    });

    expect(
      canPerform({ permissions, objectMetadataId: PERSON, action: 'read' }),
    ).toBe(false);
    // Company is untouched, and the nulls on person still follow the role.
    expect(
      canPerform({ permissions, objectMetadataId: COMPANY, action: 'read' }),
    ).toBe(true);
    expect(
      canPerform({ permissions, objectMetadataId: PERSON, action: 'update' }),
    ).toBe(true);
  });

  // NULL means "inherit", which is a third state the front renders — not false.
  it('treats a null override as inherit, not deny', () => {
    const permissions = build({
      role: buildRole({ canReadAllObjectRecords: true }),
      objectPermissions: [
        {
          id: 'op-1',
          roleId: 'role-1',
          objectMetadataId: COMPANY,
          canReadObjectRecords: null,
          canUpdateObjectRecords: null,
          canSoftDeleteObjectRecords: null,
          canDestroyObjectRecords: null,
        },
      ],
    });

    expect(
      canPerform({ permissions, objectMetadataId: COMPANY, action: 'read' }),
    ).toBe(true);
  });

  // The front treats every entry in restrictedFields as something taken away,
  // so an unrestricted field listed there renders as restricted.
  it('lists only the fields that are actually restricted', () => {
    const permissions = build({
      role: buildRole(),
      fieldPermissions: [
        {
          id: 'fp-1',
          roleId: 'role-1',
          objectMetadataId: COMPANY,
          fieldMetadataId: 'field-arr',
          canReadFieldValue: false,
          canUpdateFieldValue: false,
        },
        {
          id: 'fp-2',
          roleId: 'role-1',
          objectMetadataId: COMPANY,
          fieldMetadataId: 'field-name',
          canReadFieldValue: true,
          canUpdateFieldValue: true,
        },
      ],
    });

    expect(
      permissions.byObjectMetadataId.get(COMPANY)?.restrictedFields,
    ).toEqual({ 'field-arr': { canRead: false, canUpdate: false } });
  });

  // An object created after the role was read has no entry. Denying is the safe
  // answer for a real role; a roleless workspace still gets through.
  it('denies an object it has no entry for', () => {
    const permissions = build({ role: buildRole() });

    expect(
      canPerform({
        permissions,
        objectMetadataId: 'object-created-later',
        action: 'read',
      }),
    ).toBe(false);
  });
});

describe('assertCanPerform', () => {
  it('throws with the object name and the action', () => {
    const permissions = build({ role: buildRole() });

    expect(() =>
      assertCanPerform({
        permissions,
        objectMetadataId: COMPANY,
        objectNameSingular: 'company',
        action: 'destroy',
      }),
    ).toThrow(PermissionDeniedError);
  });

  it('stays out of the way when the action is allowed', () => {
    const permissions = build({ role: buildRole() });

    expect(() =>
      assertCanPerform({
        permissions,
        objectMetadataId: COMPANY,
        objectNameSingular: 'company',
        action: 'read',
      }),
    ).not.toThrow();
  });
});
