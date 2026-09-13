import { type Client } from 'pg';

import {
  buildColumnSql,
  collectEnumDefinitions,
  generateColumnDefinitions,
} from 'src/ddl/generate-column-definitions';
import { buildCreateTableStatements } from 'src/ddl/create-workspace-schema';
import { escapeIdentifier, escapeLiteral } from 'src/ddl/escape';
import {
  bumpMetadataVersion,
  persistFieldMetadata,
  persistObjectMetadata,
} from 'src/db/core/metadata-repository';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';
import {
  computeTableName,
  getWorkspaceSchemaName,
} from 'src/metadata/naming';
import {
  type FlatFieldMetadata,
  type FlatObjectMetadata,
} from 'src/metadata/types';
import { SYSTEM_FIELDS } from 'src/standard/build';

// Object and field names become Postgres identifiers, so they are constrained
// here rather than relying on escaping alone.
const NAME_PATTERN = /^[a-z][a-zA-Z0-9]{0,58}$/;

export const assertValidMetadataName = (name: string): void => {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid name "${name}": must start with a lowercase letter and contain only letters and digits`,
    );
  }
};

const buildFieldFromInput = ({
  input,
  objectMetadataId,
  workspaceId,
}: {
  input: {
    name: string;
    label: string;
    type: FieldMetadataType;
    isNullable?: boolean;
    icon?: string;
    options?: { value: string; label: string; color?: string }[];
  };
  objectMetadataId: string;
  workspaceId: string;
}): FlatFieldMetadata => ({
  id: crypto.randomUUID(),
  objectMetadataId,
  workspaceId,
  name: input.name,
  label: input.label,
  type: input.type,
  description: null,
  icon: input.icon ?? null,
  isActive: true,
  isSystem: false,
  isNullable: input.isNullable ?? true,
  isUnique: false,
  defaultValue: null,
  options: input.options ?? null,
  settings: null,
  relationTargetFieldMetadataId: null,
  relationTargetObjectMetadataId: null,
});

export const createObjectMetadata = async ({
  client,
  workspaceId,
  input,
}: {
  client: Client;
  workspaceId: string;
  input: {
    nameSingular: string;
    namePlural: string;
    labelSingular: string;
    labelPlural: string;
    icon?: string;
    description?: string;
  };
}): Promise<FlatObjectMetadata> => {
  assertValidMetadataName(input.nameSingular);
  assertValidMetadataName(input.namePlural);

  const objectMetadataId = crypto.randomUUID();

  const fields: FlatFieldMetadata[] = [
    ...SYSTEM_FIELDS,
    { name: 'name', label: 'Name', type: 'TEXT' as FieldMetadataType },
  ].map((field) => ({
    id: crypto.randomUUID(),
    objectMetadataId,
    workspaceId,
    name: field.name,
    label: field.label,
    type: field.type,
    description: null,
    icon: null,
    isActive: true,
    isSystem: 'isSystem' in field ? (field.isSystem ?? false) : false,
    isNullable: 'isNullable' in field ? (field.isNullable ?? true) : true,
    isUnique: false,
    defaultValue: 'defaultValue' in field ? (field.defaultValue ?? null) : null,
    options: null,
    settings: null,
    relationTargetFieldMetadataId: null,
    relationTargetObjectMetadataId: null,
  }));

  const object: FlatObjectMetadata = {
    id: objectMetadataId,
    workspaceId,
    nameSingular: input.nameSingular,
    namePlural: input.namePlural,
    labelSingular: input.labelSingular,
    labelPlural: input.labelPlural,
    description: input.description ?? null,
    icon: input.icon ?? null,
    isActive: true,
    isSystem: false,
    // User-created objects carry the `_` table prefix so a standard object
    // added later can never collide with them.
    isCustom: true,
    isSearchable: true,
    labelIdentifierFieldMetadataId:
      fields.find((field) => field.name === 'name')?.id ?? null,
    imageIdentifierFieldMetadataId: null,
    fields,
  };

  const schemaName = getWorkspaceSchemaName(workspaceId);

  await persistObjectMetadata({ client, object });

  for (const statement of buildCreateTableStatements({ object, schemaName })) {
    await client.query(statement);
  }

  await bumpMetadataVersion({ client, workspaceId });

  return object;
};

export const createFieldMetadata = async ({
  client,
  workspaceId,
  object,
  input,
}: {
  client: Client;
  workspaceId: string;
  object: FlatObjectMetadata;
  input: {
    name: string;
    label: string;
    type: FieldMetadataType;
    isNullable?: boolean;
    icon?: string;
    options?: { value: string; label: string; color?: string }[];
  };
}): Promise<FlatFieldMetadata> => {
  assertValidMetadataName(input.name);

  if (object.fields.some((field) => field.name === input.name)) {
    throw new Error(`Field "${input.name}" already exists on this object`);
  }

  const schemaName = getWorkspaceSchemaName(workspaceId);
  const tableName = computeTableName(object.nameSingular, object.isCustom);

  const field = buildFieldFromInput({
    input,
    objectMetadataId: object.id,
    workspaceId,
  });

  // Enum types must exist before the column that references them.
  for (const enumDefinition of collectEnumDefinitions({
    fields: [field],
    tableName,
  })) {
    if (enumDefinition.values.length === 0) {
      continue;
    }

    await client.query(
      `DO $$ BEGIN
  CREATE TYPE ${escapeIdentifier(schemaName)}.${escapeIdentifier(enumDefinition.enumName)} AS ENUM (${enumDefinition.values.map(escapeLiteral).join(', ')});
EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
  }

  // A composite field adds one column per property, so this is a loop, not a
  // single ALTER.
  for (const definition of generateColumnDefinitions({
    field,
    tableName,
    schemaName,
  })) {
    await client.query(
      `ALTER TABLE ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}
       ADD COLUMN IF NOT EXISTS ${buildColumnSql(definition)}`,
    );
  }

  await persistFieldMetadata({ client, field });
  await bumpMetadataVersion({ client, workspaceId });

  return field;
};

// Only a custom object can be dropped. A standard one is part of the product's
// own data model, and dropping it would leave the seed unable to describe the
// workspace it created.
export const deleteObjectMetadata = async ({
  client,
  workspaceId,
  object,
}: {
  client: Client;
  workspaceId: string;
  object: FlatObjectMetadata;
}): Promise<FlatObjectMetadata> => {
  if (!object.isCustom) {
    throw new Error(`Object "${object.nameSingular}" is standard and cannot be deleted`);
  }

  const schemaName = getWorkspaceSchemaName(workspaceId);
  const tableName = computeTableName(object.nameSingular, object.isCustom);

  // CASCADE takes the foreign keys other tables hold on this one; their own
  // metadata rows go next, or they would describe a column that no longer
  // exists.
  await client.query(
    `DROP TABLE IF EXISTS ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)} CASCADE`,
  );

  await client.query(
    `DELETE FROM core."fieldMetadata"
     WHERE "objectMetadataId" = $1 OR "relationTargetObjectMetadataId" = $1`,
    [object.id],
  );

  await client.query(`DELETE FROM core."view" WHERE "objectMetadataId" = $1`, [
    object.id,
  ]);

  await client.query(`DELETE FROM core."objectMetadata" WHERE "id" = $1`, [
    object.id,
  ]);

  await bumpMetadataVersion({ client, workspaceId });

  return object;
};

export const deleteFieldMetadata = async ({
  client,
  workspaceId,
  object,
  field,
}: {
  client: Client;
  workspaceId: string;
  object: FlatObjectMetadata;
  field: FlatFieldMetadata;
}): Promise<FlatFieldMetadata> => {
  if (field.isSystem) {
    throw new Error(`Field "${field.name}" is a system field and cannot be deleted`);
  }

  const schemaName = getWorkspaceSchemaName(workspaceId);
  const tableName = computeTableName(object.nameSingular, object.isCustom);

  // A composite field owns one column per property, so this is a loop for the
  // same reason creating it was.
  for (const definition of generateColumnDefinitions({
    field,
    tableName,
    schemaName,
  })) {
    await client.query(
      `ALTER TABLE ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}
       DROP COLUMN IF EXISTS ${escapeIdentifier(definition.columnName)}`,
    );
  }

  await client.query(
    `DELETE FROM core."fieldMetadata" WHERE "id" = $1 OR "relationTargetFieldMetadataId" = $1`,
    [field.id],
  );

  await bumpMetadataVersion({ client, workspaceId });

  return field;
};
