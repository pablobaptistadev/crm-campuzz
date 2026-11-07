-- Uploaded files. The bytes live in R2 under "<workspaceId>/<folder>/<fileId>";
-- this table is the metadata the front reads back after an upload, and the
-- record that a file was ever meant to exist — a row with "uploadedAt" still
-- null is an upload that was started and never finished.
CREATE TABLE IF NOT EXISTS core."file" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"     uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "name"            text NOT NULL,
  "folder"          text NOT NULL,
  "size"            bigint NOT NULL DEFAULT 0,
  "type"            text,
  "fieldMetadataId" uuid,
  "createdByUserId" uuid REFERENCES core."user"("id") ON DELETE SET NULL,
  "uploadedAt"      timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "deletedAt"       timestamptz
);

CREATE INDEX IF NOT EXISTS "IDX_FILE_WORKSPACE"
  ON core."file" ("workspaceId") WHERE "deletedAt" IS NULL;
