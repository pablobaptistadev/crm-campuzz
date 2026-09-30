-- Roles and permissions. Until now objectsPermissions answered a hardcoded true
-- for every object, so any authenticated person could do anything — which is
-- fine for a workspace of one and wrong the moment a second person joins.
--
-- Deliberately not here: row-level predicates (the front marks those Enterprise
-- and ships them behind their own licence header), agents and API keys.

CREATE TABLE IF NOT EXISTS core."role" (
  "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"                 uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "label"                       text NOT NULL,
  "description"                 text,
  "icon"                        text,
  -- The four "all records" switches are the role's default; an objectPermission
  -- row overrides one object at a time.
  "canReadAllObjectRecords"     boolean NOT NULL DEFAULT false,
  "canUpdateAllObjectRecords"   boolean NOT NULL DEFAULT false,
  "canSoftDeleteAllObjectRecords" boolean NOT NULL DEFAULT false,
  "canDestroyAllObjectRecords"  boolean NOT NULL DEFAULT false,
  "canUpdateAllSettings"        boolean NOT NULL DEFAULT false,
  "canAccessAllTools"           boolean NOT NULL DEFAULT false,
  -- A built-in role cannot be edited or deleted: losing the admin role would
  -- lock everyone out of the workspace with no way back in.
  "isEditable"                  boolean NOT NULL DEFAULT true,
  "canBeAssignedToUsers"        boolean NOT NULL DEFAULT true,
  "canBeAssignedToAgents"       boolean NOT NULL DEFAULT false,
  "canBeAssignedToApiKeys"      boolean NOT NULL DEFAULT false,
  -- Set on exactly one role per workspace: who a new member becomes.
  "isDefaultRole"               boolean NOT NULL DEFAULT false,
  "standardId"                  text,
  "createdAt"                   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"                   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ROLE_STANDARD_ID"
  ON core."role" ("workspaceId", "standardId") WHERE "standardId" IS NOT NULL;

-- Who holds the role. userWorkspaceId is the only target we assign today;
-- the column stays nullable so agents and API keys can join later without a
-- migration that rewrites existing rows.
CREATE TABLE IF NOT EXISTS core."roleTarget" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"       uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "roleId"            uuid NOT NULL REFERENCES core."role"("id") ON DELETE CASCADE,
  "userWorkspaceId"   uuid REFERENCES core."userWorkspace"("id") ON DELETE CASCADE,
  "agentId"           uuid,
  "apiKeyId"          uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

-- One role per member: the front's role picker is a single select, and two
-- roles would need a rule for which one wins.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ROLE_TARGET_USER_WORKSPACE"
  ON core."roleTarget" ("userWorkspaceId") WHERE "userWorkspaceId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_ROLE_TARGET_ROLE"
  ON core."roleTarget" ("roleId");

-- NULL means "inherit the role's switch", which is why these are nullable
-- rather than defaulted: the front renders the three states.
CREATE TABLE IF NOT EXISTS core."objectPermission" (
  "id"                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"                   uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "roleId"                        uuid NOT NULL REFERENCES core."role"("id") ON DELETE CASCADE,
  "objectMetadataId"              uuid NOT NULL REFERENCES core."objectMetadata"("id") ON DELETE CASCADE,
  "canReadObjectRecords"          boolean,
  "canUpdateObjectRecords"        boolean,
  "canSoftDeleteObjectRecords"    boolean,
  "canDestroyObjectRecords"       boolean,
  "createdAt"                     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"                     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_OBJECT_PERMISSION"
  ON core."objectPermission" ("roleId", "objectMetadataId");

CREATE TABLE IF NOT EXISTS core."fieldPermission" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"           uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "roleId"                uuid NOT NULL REFERENCES core."role"("id") ON DELETE CASCADE,
  "objectMetadataId"      uuid NOT NULL REFERENCES core."objectMetadata"("id") ON DELETE CASCADE,
  "fieldMetadataId"       uuid NOT NULL REFERENCES core."fieldMetadata"("id") ON DELETE CASCADE,
  "canReadFieldValue"     boolean,
  "canUpdateFieldValue"   boolean,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_FIELD_PERMISSION"
  ON core."fieldPermission" ("roleId", "fieldMetadataId");

CREATE TABLE IF NOT EXISTS core."rolePermissionFlag" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"   uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "roleId"        uuid NOT NULL REFERENCES core."role"("id") ON DELETE CASCADE,
  "flag"          text NOT NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ROLE_PERMISSION_FLAG"
  ON core."rolePermissionFlag" ("roleId", "flag");
