import { type Client } from 'pg';

export type StandardRole = {
  standardId: string;
  label: string;
  description: string;
  icon: string;
  canReadAllObjectRecords: boolean;
  canUpdateAllObjectRecords: boolean;
  canSoftDeleteAllObjectRecords: boolean;
  canDestroyAllObjectRecords: boolean;
  canUpdateAllSettings: boolean;
  isDefaultRole: boolean;
  permissionFlags: string[];
};

// The front hides a feature whose flag the member's role does not carry —
// without UPLOAD_FILE there is no "Add file" button to click at all — so only
// the flags whose feature this API actually serves are granted. AI, billing,
// marketplace, workflows, connected accounts and the agent tools are left out
// on purpose: granting them would open a settings page with nothing behind it.
const RECORD_PERMISSION_FLAGS = [
  'UPLOAD_FILE',
  'DOWNLOAD_FILE',
  'IMPORT_CSV',
  'EXPORT_CSV',
  'VIEWS',
  'PROFILE_INFORMATION',
];

const ADMIN_PERMISSION_FLAGS = [
  ...RECORD_PERMISSION_FLAGS,
  'LAYOUTS',
  'DATA_MODEL',
  'ROLES',
  'WORKSPACE',
  'WORKSPACE_MEMBERS',
];

// Two built-in roles, neither editable: losing Admin would lock everyone out of
// the workspace with no way back in, and the front needs a role to hand a new
// member before anybody has configured one.
export const STANDARD_ROLES: StandardRole[] = [
  {
    standardId: 'admin',
    label: 'Admin',
    description: 'Acesso total ao workspace e às configurações.',
    icon: 'IconUserShield',
    canReadAllObjectRecords: true,
    canUpdateAllObjectRecords: true,
    canSoftDeleteAllObjectRecords: true,
    canDestroyAllObjectRecords: true,
    canUpdateAllSettings: true,
    isDefaultRole: false,
    permissionFlags: ADMIN_PERMISSION_FLAGS,
  },
  {
    standardId: 'member',
    label: 'Membro',
    description:
      'Lê e edita registros, sem apagar de vez nem mexer nas configurações.',
    icon: 'IconUser',
    canReadAllObjectRecords: true,
    canUpdateAllObjectRecords: true,
    canSoftDeleteAllObjectRecords: true,
    canDestroyAllObjectRecords: false,
    canUpdateAllSettings: false,
    isDefaultRole: true,
    permissionFlags: RECORD_PERMISSION_FLAGS,
  },
];

export type SyncRolesResult = {
  createdRoles: string[];
  assignedMembers: number;
};

// Idempotent, like the metadata sync: the standardId is the key, so running it
// twice creates nothing and re-running it after a schema change is safe.
export const syncRoles = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<SyncRolesResult> => {
  const createdRoles: string[] = [];

  for (const role of STANDARD_ROLES) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO core."role"
         ("workspaceId","label","description","icon",
          "canReadAllObjectRecords","canUpdateAllObjectRecords",
          "canSoftDeleteAllObjectRecords","canDestroyAllObjectRecords",
          "canUpdateAllSettings","isEditable","isDefaultRole","standardId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11)
       -- The unique index is partial, so the inference has to repeat its
       -- predicate or Postgres cannot match it.
       ON CONFLICT ("workspaceId","standardId") WHERE "standardId" IS NOT NULL
       DO NOTHING
       RETURNING "id"`,
      [
        workspaceId,
        role.label,
        role.description,
        role.icon,
        role.canReadAllObjectRecords,
        role.canUpdateAllObjectRecords,
        role.canSoftDeleteAllObjectRecords,
        role.canDestroyAllObjectRecords,
        role.canUpdateAllSettings,
        role.isDefaultRole,
        role.standardId,
      ],
    );

    if (rows[0] !== undefined) {
      createdRoles.push(role.standardId);
    }

    // Seeded separately from the role so a workspace created before a flag
    // existed picks it up on the next sync instead of staying without it.
    await client.query(
      `INSERT INTO core."rolePermissionFlag" ("workspaceId","roleId","flag")
       SELECT $1, r."id", f."flag"
       FROM core."role" r
       CROSS JOIN unnest($3::text[]) AS f("flag")
       WHERE r."workspaceId" = $1 AND r."standardId" = $2
       ON CONFLICT ("roleId","flag") DO NOTHING`,
      [workspaceId, role.standardId, role.permissionFlags],
    );
  }

  // Every member without a role gets one. The first member of a workspace is
  // whoever created it, so they get Admin; everyone after that gets the default
  // — otherwise the person who set the workspace up could lock themselves out.
  const { rowCount } = await client.query(
    `INSERT INTO core."roleTarget" ("workspaceId","roleId","userWorkspaceId")
     SELECT $1,
            (SELECT "id" FROM core."role"
             WHERE "workspaceId" = $1
               AND "standardId" = CASE
                 WHEN uw."createdAt" = (
                   SELECT min("createdAt") FROM core."userWorkspace"
                   WHERE "workspaceId" = $1
                 ) THEN 'admin' ELSE 'member' END),
            uw."id"
     FROM core."userWorkspace" uw
     WHERE uw."workspaceId" = $1
       AND NOT EXISTS (
         SELECT 1 FROM core."roleTarget" rt WHERE rt."userWorkspaceId" = uw."id"
       )
     ON CONFLICT DO NOTHING`,
    [workspaceId],
  );

  return { createdRoles, assignedMembers: rowCount ?? 0 };
};
