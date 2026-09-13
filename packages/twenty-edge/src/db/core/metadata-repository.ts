import { type Client } from 'pg';

import { getWorkspaceSchemaName } from 'src/metadata/naming';
import {
  type FlatFieldMetadata,
  type FlatObjectMetadata,
  type WorkspaceMetadata,
} from 'src/metadata/types';

type ObjectRow = {
  id: string;
  workspaceId: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  isSystem: boolean;
  isCustom: boolean;
  isSearchable: boolean;
  labelIdentifierFieldMetadataId: string | null;
  duplicateCriteria: string[][] | null;
  imageIdentifierFieldMetadataId: string | null;
};

type FieldRow = Omit<FlatFieldMetadata, 'options' | 'settings' | 'defaultValue'> & {
  options: FlatFieldMetadata['options'];
  settings: FlatFieldMetadata['settings'];
  defaultValue: unknown;
};

// Keyed by workspace AND metadata version, so a DDL change invalidates the
// entry rather than serving a stale schema for the life of the isolate. Nothing
// tenant-scoped may live in module scope without that version in the key.
const isolateMetadataCache = new Map<string, WorkspaceMetadata>();
const ISOLATE_METADATA_CACHE_LIMIT = 8;

const readIsolateCache = (key: string): WorkspaceMetadata | null =>
  isolateMetadataCache.get(key) ?? null;

const writeIsolateCache = (key: string, metadata: WorkspaceMetadata): void => {
  if (isolateMetadataCache.size >= ISOLATE_METADATA_CACHE_LIMIT) {
    const oldestKey = isolateMetadataCache.keys().next().value;

    if (oldestKey !== undefined) {
      isolateMetadataCache.delete(oldestKey);
    }
  }

  isolateMetadataCache.set(key, metadata);
};

export const loadWorkspaceMetadata = async ({
  client,
  workspaceId,
  metadataVersion,
}: {
  client: Client;
  workspaceId: string;
  metadataVersion: number;
}): Promise<WorkspaceMetadata> => {
  const cacheKey = `${workspaceId}:${metadataVersion}`;
  const cached = readIsolateCache(cacheKey);

  if (cached !== null) {
    return cached;
  }

  const [objectResult, fieldResult] = await Promise.all([
    client.query<ObjectRow>(
      `SELECT * FROM core."objectMetadata" WHERE "workspaceId" = $1 ORDER BY "nameSingular"`,
      [workspaceId],
    ),
    client.query<FieldRow>(
      `SELECT * FROM core."fieldMetadata" WHERE "workspaceId" = $1 ORDER BY "name"`,
      [workspaceId],
    ),
  ]);

  const fieldsByObjectId = new Map<string, FlatFieldMetadata[]>();

  for (const field of fieldResult.rows) {
    const fields = fieldsByObjectId.get(field.objectMetadataId) ?? [];

    fields.push(field);
    fieldsByObjectId.set(field.objectMetadataId, fields);
  }

  const metadata: WorkspaceMetadata = {
    workspaceId,
    schemaName: getWorkspaceSchemaName(workspaceId),
    metadataVersion,
    objects: objectResult.rows.map((row) => ({
      ...row,
      fields: fieldsByObjectId.get(row.id) ?? [],
    })),
  };

  writeIsolateCache(cacheKey, metadata);

  return metadata;
};

export const persistObjectMetadata = async ({
  client,
  object,
}: {
  client: Client;
  object: FlatObjectMetadata;
}): Promise<void> => {
  await client.query(
    `INSERT INTO core."objectMetadata"
       ("id","workspaceId","nameSingular","namePlural","labelSingular","labelPlural",
        "description","icon","isActive","isSystem","isCustom","isSearchable",
        "labelIdentifierFieldMetadataId","imageIdentifierFieldMetadataId",
        "duplicateCriteria")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT ("id") DO UPDATE SET
       "labelSingular" = EXCLUDED."labelSingular",
       "labelPlural" = EXCLUDED."labelPlural",
       "icon" = EXCLUDED."icon",
       "isActive" = EXCLUDED."isActive",
       "labelIdentifierFieldMetadataId" = EXCLUDED."labelIdentifierFieldMetadataId",
       "duplicateCriteria" = EXCLUDED."duplicateCriteria",
       "updatedAt" = now()`,
    [
      object.id,
      object.workspaceId,
      object.nameSingular,
      object.namePlural,
      object.labelSingular,
      object.labelPlural,
      object.description,
      object.icon,
      object.isActive,
      object.isSystem,
      object.isCustom,
      object.isSearchable,
      object.labelIdentifierFieldMetadataId,
      object.imageIdentifierFieldMetadataId,
      object.duplicateCriteria === null
        ? null
        : JSON.stringify(object.duplicateCriteria),
    ],
  );

  for (const field of object.fields) {
    await persistFieldMetadata({ client, field });
  }
};

export const persistFieldMetadata = async ({
  client,
  field,
}: {
  client: Client;
  field: FlatFieldMetadata;
}): Promise<void> => {
  await client.query(
    `INSERT INTO core."fieldMetadata"
       ("id","workspaceId","objectMetadataId","name","label","type","description","icon",
        "isActive","isSystem","isNullable","isUnique","defaultValue","options","settings",
        "relationTargetFieldMetadataId","relationTargetObjectMetadataId")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT ("id") DO UPDATE SET
       "label" = EXCLUDED."label",
       "isActive" = EXCLUDED."isActive",
       "options" = EXCLUDED."options",
       "settings" = EXCLUDED."settings",
       "updatedAt" = now()`,
    [
      field.id,
      field.workspaceId,
      field.objectMetadataId,
      field.name,
      field.label,
      field.type,
      field.description,
      field.icon,
      field.isActive,
      field.isSystem,
      field.isNullable,
      field.isUnique,
      field.defaultValue === null ? null : JSON.stringify(field.defaultValue),
      field.options === null ? null : JSON.stringify(field.options),
      field.settings === null ? null : JSON.stringify(field.settings),
      field.relationTargetFieldMetadataId,
      field.relationTargetObjectMetadataId,
    ],
  );
};

// Bumping the version is what invalidates the front's metadata cache and our
// KV entry; every schema change must go through here.
export const bumpMetadataVersion = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<number> => {
  const { rows } = await client.query<{ metadataVersion: number }>(
    `UPDATE core."workspace" SET "metadataVersion" = "metadataVersion" + 1, "updatedAt" = now()
     WHERE "id" = $1 RETURNING "metadataVersion"`,
    [workspaceId],
  );

  return rows[0]?.metadataVersion ?? 1;
};
