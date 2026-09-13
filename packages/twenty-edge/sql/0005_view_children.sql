-- Everything a saved view is made of. Until now getViews synthesised the field
-- list from the object's metadata and answered empty for filters and sorts, so
-- what a user built on screen died with the tab.
--
-- All five share the same shape: a row belongs to a workspace and to a view,
-- and dies with the view.
CREATE TABLE IF NOT EXISTS core."viewField" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"       uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "viewId"            uuid NOT NULL REFERENCES core."view"("id") ON DELETE CASCADE,
  "fieldMetadataId"   uuid NOT NULL REFERENCES core."fieldMetadata"("id") ON DELETE CASCADE,
  "isVisible"         boolean NOT NULL DEFAULT true,
  "position"          double precision NOT NULL DEFAULT 0,
  "size"              double precision NOT NULL DEFAULT 150,
  "aggregateOperation" text,
  "viewFieldGroupId"  uuid,
  "isActive"          boolean NOT NULL DEFAULT true,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  "deletedAt"         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_VIEW_FIELD_UNIQUE"
  ON core."viewField" ("viewId", "fieldMetadataId") WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS core."viewFilterGroup" (
  "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"               uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "viewId"                    uuid NOT NULL REFERENCES core."view"("id") ON DELETE CASCADE,
  "parentViewFilterGroupId"   uuid,
  "logicalOperator"           text NOT NULL DEFAULT 'AND',
  "positionInViewFilterGroup" double precision,
  "createdAt"                 timestamptz NOT NULL DEFAULT now(),
  "updatedAt"                 timestamptz NOT NULL DEFAULT now(),
  "deletedAt"                 timestamptz
);

CREATE TABLE IF NOT EXISTS core."viewFilter" (
  "id"                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"                   uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "viewId"                        uuid NOT NULL REFERENCES core."view"("id") ON DELETE CASCADE,
  "fieldMetadataId"               uuid NOT NULL REFERENCES core."fieldMetadata"("id") ON DELETE CASCADE,
  "operand"                       text NOT NULL DEFAULT 'is',
  -- jsonb, because a filter value is a string, a number, a date or a list of
  -- record ids depending on the field it filters.
  "value"                         jsonb,
  "viewFilterGroupId"             uuid REFERENCES core."viewFilterGroup"("id") ON DELETE CASCADE,
  "positionInViewFilterGroup"     double precision,
  "subFieldName"                  text,
  "relationTargetFieldMetadataId" uuid,
  "createdAt"                     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"                     timestamptz NOT NULL DEFAULT now(),
  "deletedAt"                     timestamptz
);

CREATE TABLE IF NOT EXISTS core."viewSort" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"     uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "viewId"          uuid NOT NULL REFERENCES core."view"("id") ON DELETE CASCADE,
  "fieldMetadataId" uuid NOT NULL REFERENCES core."fieldMetadata"("id") ON DELETE CASCADE,
  "direction"       text NOT NULL DEFAULT 'asc',
  "subFieldName"    text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "deletedAt"       timestamptz
);

CREATE TABLE IF NOT EXISTS core."viewGroup" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "viewId"      uuid NOT NULL REFERENCES core."view"("id") ON DELETE CASCADE,
  "fieldValue"  text NOT NULL DEFAULT '',
  "isVisible"   boolean NOT NULL DEFAULT true,
  "position"    double precision NOT NULL DEFAULT 0,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "deletedAt"   timestamptz
);

CREATE TABLE IF NOT EXISTS core."viewFieldGroup" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "viewId"      uuid NOT NULL REFERENCES core."view"("id") ON DELETE CASCADE,
  "name"        text NOT NULL DEFAULT '',
  "position"    double precision NOT NULL DEFAULT 0,
  "isVisible"   boolean NOT NULL DEFAULT true,
  "isActive"    boolean NOT NULL DEFAULT true,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "deletedAt"   timestamptz
);

CREATE INDEX IF NOT EXISTS "IDX_VIEW_FILTER_VIEW" ON core."viewFilter" ("viewId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_VIEW_SORT_VIEW" ON core."viewSort" ("viewId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_VIEW_GROUP_VIEW" ON core."viewGroup" ("viewId") WHERE "deletedAt" IS NULL;

-- The view itself gained the settings the kanban and calendar layouts need, and
-- the visibility a shared view carries.
ALTER TABLE core."view"
  ADD COLUMN IF NOT EXISTS "kanbanAggregateOperation" text,
  ADD COLUMN IF NOT EXISTS "kanbanAggregateOperationFieldMetadataId" uuid,
  ADD COLUMN IF NOT EXISTS "mainGroupByFieldMetadataId" uuid,
  ADD COLUMN IF NOT EXISTS "shouldHideEmptyGroups" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "kanbanColumnWidth" double precision,
  ADD COLUMN IF NOT EXISTS "anyFieldFilterValue" text,
  ADD COLUMN IF NOT EXISTS "calendarFieldMetadataId" uuid,
  ADD COLUMN IF NOT EXISTS "calendarEndFieldMetadataId" uuid,
  ADD COLUMN IF NOT EXISTS "calendarLayout" text,
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'WORKSPACE';
