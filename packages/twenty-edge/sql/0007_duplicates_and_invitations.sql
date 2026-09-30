-- Two things that arrived together and have nothing to do with each other:
-- what makes two records the same record, and the tokens an invitation is made
-- of.

-- Which columns make two records the same record. An inner array is a
-- conjunction, the outer one a disjunction: a person matches on first+last name
-- OR on their primary email. NULL means the object has no duplicate detection,
-- which is what every custom object gets.
ALTER TABLE core."objectMetadata"
  ADD COLUMN IF NOT EXISTS "duplicateCriteria" jsonb;

-- Invitations, password resets and e-mail verification all live here: they are
-- the same shape — a token with a type, a context and an expiry — and Twenty
-- keeps them in one table for the same reason.
CREATE TABLE IF NOT EXISTS core."appToken" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId"   uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "userId"        uuid REFERENCES core."user"("id") ON DELETE CASCADE,
  "type"          text NOT NULL,
  -- The token itself is never stored: only its hash, like a session token.
  "valueHash"     text NOT NULL,
  "context"       jsonb,
  "expiresAt"     timestamptz NOT NULL,
  "revokedAt"     timestamptz,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_APP_TOKEN_VALUE" ON core."appToken" ("valueHash");
CREATE INDEX IF NOT EXISTS "IDX_APP_TOKEN_WORKSPACE_TYPE"
  ON core."appToken" ("workspaceId", "type") WHERE "revokedAt" IS NULL;

-- One live invitation per address per workspace: inviting the same person twice
-- should resend, not pile up rows the settings page then lists twice.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_WORKSPACE_INVITATION_EMAIL"
  ON core."appToken" ("workspaceId", (lower("context" ->> 'email')))
  WHERE "type" = 'INVITATION' AND "revokedAt" IS NULL;
