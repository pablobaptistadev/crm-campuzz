-- Baseline for the auth slice (phase 1). Metadata tables (objectMetadata,
-- fieldMetadata, role, view*) land in 0002; workspace record tables are created
-- at runtime, one Postgres schema per workspace.
--
-- Derived from packages/twenty-server/src/engine/core-modules/**/*.entity.ts.
-- We start from an empty database, so the 185 legacy TypeORM migrations and the
-- 598 upgrade commands are deliberately not reproduced.

CREATE SCHEMA IF NOT EXISTS core;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Search indexes need an IMMUTABLE wrapper; unaccent() itself is only STABLE.
CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

CREATE TABLE IF NOT EXISTS core."workspace" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "displayName"         text,
  "logo"                text,
  "subdomain"           varchar NOT NULL,
  "customDomain"        varchar,
  "activationStatus"    text NOT NULL DEFAULT 'PENDING_CREATION',
  -- Name of this tenant's Postgres schema: workspace_<uuidToBase36(id)>.
  "databaseSchema"      varchar,
  -- Bumped by every workspace migration; the metadata cache key derives from it.
  "metadataVersion"     integer NOT NULL DEFAULT 1,
  "defaultRoleId"       uuid,
  "trashRetentionDays"  integer NOT NULL DEFAULT 14,
  "eventLogRetentionDays" integer NOT NULL DEFAULT 90,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "deletedAt"           timestamptz,
  CONSTRAINT "CHK_WORKSPACE_ACTIVE_HAS_SCHEMA"
    CHECK ("activationStatus" <> 'ACTIVE' OR COALESCE("databaseSchema", '') <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_WORKSPACE_SUBDOMAIN"
  ON core."workspace" ("subdomain") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_WORKSPACE_CUSTOM_DOMAIN"
  ON core."workspace" ("customDomain") WHERE "customDomain" IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_WORKSPACE_ACTIVATION_STATUS"
  ON core."workspace" ("activationStatus");

-- user is global, not workspace-scoped: one person, many workspaces.
CREATE TABLE IF NOT EXISTS core."user" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firstName"              text NOT NULL DEFAULT '',
  "lastName"               text NOT NULL DEFAULT '',
  "email"                  citext NOT NULL,
  "isEmailVerified"        boolean NOT NULL DEFAULT false,
  -- PBKDF2 via WebCrypto, not bcrypt: there is no native addon in a Worker and
  -- we carry no legacy $2a$/$2b$ hashes.
  "passwordHash"           text,
  "disabled"               boolean NOT NULL DEFAULT false,
  "canImpersonate"         boolean NOT NULL DEFAULT false,
  "canAccessFullAdminPanel" boolean NOT NULL DEFAULT false,
  "locale"                 text NOT NULL DEFAULT 'en',
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedAt"              timestamptz NOT NULL DEFAULT now(),
  "deletedAt"              timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_USER_EMAIL"
  ON core."user" ("email") WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS core."userWorkspace" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"           uuid NOT NULL REFERENCES core."user"("id") ON DELETE CASCADE,
  "workspaceId"      uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "defaultAvatarUrl" text,
  "locale"           text NOT NULL DEFAULT 'en',
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  "deletedAt"        timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_USER_WORKSPACE_USER_WORKSPACE"
  ON core."userWorkspace" ("userId", "workspaceId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_USER_WORKSPACE_USER_ID"
  ON core."userWorkspace" ("userId");
CREATE INDEX IF NOT EXISTS "IDX_USER_WORKSPACE_WORKSPACE_ID"
  ON core."userWorkspace" ("workspaceId");

-- Sessions live here, not in Redis: the cookie carries an opaque token whose
-- SHA-256 is the lookup key. This is why the Worker needs no Redis at all.
CREATE TABLE IF NOT EXISTS core."userSession" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenHash"         text NOT NULL,
  "userId"            uuid NOT NULL REFERENCES core."user"("id") ON DELETE CASCADE,
  "workspaceId"       uuid REFERENCES core."workspace"("id") ON DELETE CASCADE,
  "userWorkspaceId"   uuid REFERENCES core."userWorkspace"("id") ON DELETE CASCADE,
  "authProvider"      text NOT NULL DEFAULT 'password',
  "isImpersonating"   boolean NOT NULL DEFAULT false,
  "impersonatorUserWorkspaceId" uuid,
  "impersonatedUserWorkspaceId" uuid,
  "userAgent"         text,
  "ipAddress"         text,
  "expiresAt"         timestamptz NOT NULL,
  "lastActiveAt"      timestamptz NOT NULL DEFAULT now(),
  "revokedAt"         timestamptz,
  "revokedReason"     text,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_USER_SESSION_TOKEN_HASH"
  ON core."userSession" ("tokenHash");
CREATE INDEX IF NOT EXISTS "IDX_USER_SESSION_EXPIRES_AT"
  ON core."userSession" ("expiresAt");
CREATE INDEX IF NOT EXISTS "IDX_USER_SESSION_REVOKED_AT"
  ON core."userSession" ("revokedAt");
