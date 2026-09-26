-- Metadata tables (phase 2). Objects and fields are normalized, matching the
-- shape the /metadata GraphQL API exposes CRUD over.

CREATE TABLE IF NOT EXISTS core."objectMetadata" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"   uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "nameSingular"  text NOT NULL,
  "namePlural"    text NOT NULL,
  "labelSingular" text NOT NULL,
  "labelPlural"   text NOT NULL,
  "description"   text,
  "icon"          text,
  "isActive"      boolean NOT NULL DEFAULT true,
  "isSystem"      boolean NOT NULL DEFAULT false,
  -- Custom objects get the `_` table prefix so a later standard object of the
  -- same name cannot collide with them.
  "isCustom"      boolean NOT NULL DEFAULT false,
  "isSearchable"  boolean NOT NULL DEFAULT true,
  "labelIdentifierFieldMetadataId" uuid,
  "imageIdentifierFieldMetadataId" uuid,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_OBJECT_METADATA_NAME_SINGULAR"
  ON core."objectMetadata" ("workspaceId", "nameSingular");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_OBJECT_METADATA_NAME_PLURAL"
  ON core."objectMetadata" ("workspaceId", "namePlural");

CREATE TABLE IF NOT EXISTS core."fieldMetadata" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"      uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "objectMetadataId" uuid NOT NULL REFERENCES core."objectMetadata"("id") ON DELETE CASCADE,
  "name"             text NOT NULL,
  "label"            text NOT NULL,
  "type"             text NOT NULL,
  "description"      text,
  "icon"             text,
  "isActive"         boolean NOT NULL DEFAULT true,
  "isSystem"         boolean NOT NULL DEFAULT false,
  "isNullable"       boolean NOT NULL DEFAULT true,
  -- Not a column in Twenty (it derives from a unique index), but a plain flag is
  -- enough until index metadata exists.
  "isUnique"         boolean NOT NULL DEFAULT false,
  "defaultValue"     jsonb,
  "options"          jsonb,
  "settings"         jsonb,
  "relationTargetFieldMetadataId"  uuid,
  "relationTargetObjectMetadataId" uuid,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_FIELD_METADATA_NAME"
  ON core."fieldMetadata" ("workspaceId", "objectMetadataId", "name");
CREATE INDEX IF NOT EXISTS "IDX_FIELD_METADATA_OBJECT"
  ON core."fieldMetadata" ("objectMetadataId");

-- Saved views. Enough for the front's navigation to work; view filters and
-- sorts follow in a later phase.
CREATE TABLE IF NOT EXISTS core."view" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"      uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "objectMetadataId" uuid NOT NULL REFERENCES core."objectMetadata"("id") ON DELETE CASCADE,
  "name"             text NOT NULL,
  "type"             text NOT NULL DEFAULT 'TABLE',
  "key"              text,
  "icon"             text,
  "position"         double precision NOT NULL DEFAULT 0,
  "isCompact"        boolean NOT NULL DEFAULT false,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  "deletedAt"        timestamptz
);

CREATE INDEX IF NOT EXISTS "IDX_VIEW_OBJECT"
  ON core."view" ("objectMetadataId") WHERE "deletedAt" IS NULL;
