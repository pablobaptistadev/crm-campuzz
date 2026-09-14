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
  computeMorphFieldName,
  computeTableName,
  getWorkspaceSchemaName,
  pascalCase,
  toCamelCase,
} from 'src/metadata/naming';
import {
  type FlatFieldMetadata,
  type FlatObjectMetadata,
  type MorphTarget,
} from 'src/metadata/types';
import { syncSearchVector } from 'src/services/sync-search-vectors';
import { SYSTEM_FIELDS } from 'src/standard/build';
import { UserFacingError } from 'src/graphql/user-facing-error';

// Object and field names become Postgres identifiers, so they are constrained
// here rather than relying on escaping alone.
const NAME_PATTERN = /^[a-z][a-zA-Z0-9]{0,58}$/;

export const assertValidMetadataName = (name: string): void => {
  if (!NAME_PATTERN.test(name)) {
    throw new UserFacingError(
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
    // z.uuid() on the front's side: every object needs one, so an object
    // without a name field falls back to its id.
    labelIdentifierFieldMetadataId:
      fields.find((field) => field.name === 'name')?.id ??
      fields.find((field) => field.name === 'id')?.id ??
      null,
    imageIdentifierFieldMetadataId: null,
    // No duplicate detection on a custom object: Twenty only ships criteria for
    // the standard ones, and guessing them here would flag unrelated rows.
    duplicateCriteria: null,
    fields,
  };

  const schemaName = getWorkspaceSchemaName(workspaceId);

  await persistObjectMetadata({ client, object });

  for (const statement of buildCreateTableStatements({ object, schemaName })) {
    await client.query(statement);
  }

  await syncSearchVector({ client, workspaceId, object });
  await bumpMetadataVersion({ client, workspaceId });

  return object;
};

// Notes, tasks, files and the timeline all hang off one MORPH_RELATION whose
// targets are fixed when the standard objects are seeded. A custom object
// created afterwards is not in that list, so its record page would show none of
// those tabs and createNoteTarget would have no column to write. Adding the
// object to each morph field, and the matching inverse on the object itself, is
// what Twenty does when you create an object through the UI.
const ACTIVITY_RELATIONS = [
  { objectNameSingular: 'noteTarget', inverseName: 'noteTargets', inverseLabel: 'Notes', icon: 'IconNotes' },
  { objectNameSingular: 'taskTarget', inverseName: 'taskTargets', inverseLabel: 'Tasks', icon: 'IconCheckbox' },
  { objectNameSingular: 'attachment', inverseName: 'attachments', inverseLabel: 'Attachments', icon: 'IconFileImport' },
  { objectNameSingular: 'timelineActivity', inverseName: 'timelineActivities', inverseLabel: 'Timeline Activities', icon: 'IconTimeline' },
] as const;

const MORPH_FIELD_NAME = 'target';

export const attachActivityRelations = async ({
  client,
  workspaceId,
  object,
  objects,
}: {
  client: Client;
  workspaceId: string;
  object: FlatObjectMetadata;
  objects: FlatObjectMetadata[];
}): Promise<void> => {
  const schemaName = getWorkspaceSchemaName(workspaceId);

  for (const relation of ACTIVITY_RELATIONS) {
    const activityObject = objects.find(
      (candidate) => candidate.nameSingular === relation.objectNameSingular,
    );

    if (activityObject === undefined) {
      continue;
    }

    const morphField = activityObject.fields.find(
      (field) =>
        field.name === MORPH_FIELD_NAME && field.type === 'MORPH_RELATION',
    );

    if (morphField === undefined) {
      continue;
    }

    const existingTargets = morphField.settings?.morphTargets ?? [];

    if (
      existingTargets.some(
        (target) => target.objectMetadataId === object.id,
      )
    ) {
      continue;
    }

    // A repair run reaches an object whose inverse field was written before the
    // morph target was lost; (objectMetadataId, name) is unique, so reuse it
    // rather than trying to insert a second one under a new id.
    const existingInverse = object.fields.find(
      (field) => field.name === relation.inverseName,
    );
    const inverseFieldId = existingInverse?.id ?? crypto.randomUUID();

    const inverseField: FlatFieldMetadata = {
      id: inverseFieldId,
      objectMetadataId: object.id,
      workspaceId,
      name: relation.inverseName,
      label: relation.inverseLabel,
      type: 'RELATION',
      description: null,
      icon: relation.icon,
      isActive: true,
      isSystem: false,
      isNullable: true,
      isUnique: false,
      defaultValue: null,
      options: null,
      settings: { relationType: 'ONE_TO_MANY' },
      relationTargetFieldMetadataId: morphField.id,
      relationTargetObjectMetadataId: activityObject.id,
    };

    const newTarget: MorphTarget = {
      objectMetadataId: object.id,
      targetFieldMetadataId: inverseFieldId,
      nameSingular: object.nameSingular,
      namePlural: object.namePlural,
    };

    // Written back onto the field the caller handed us, not onto a copy: a
    // backfill loops over every custom object against the same metadata, and a
    // copy would make each object overwrite the previous one's target.
    morphField.settings = {
      ...morphField.settings,
      morphTargets: [...existingTargets, newTarget],
    };

    await persistFieldMetadata({ client, field: inverseField });
    await persistFieldMetadata({ client, field: morphField });

    const activityTable = computeTableName(
      activityObject.nameSingular,
      activityObject.isCustom,
    );
    const objectTable = computeTableName(object.nameSingular, object.isCustom);
    const joinColumn = `${computeMorphFieldName({
      fieldName: MORPH_FIELD_NAME,
      relationType: 'MANY_TO_ONE',
      nameSingular: object.nameSingular,
      namePlural: object.namePlural,
    })}Id`;

    await client.query(
      `ALTER TABLE ${escapeIdentifier(schemaName)}.${escapeIdentifier(activityTable)}
       ADD COLUMN IF NOT EXISTS ${escapeIdentifier(joinColumn)} uuid`,
    );

    const constraintName = escapeIdentifier(
      `FK_${activityTable}_${pascalCase(object.nameSingular)}`,
    );

    // Postgres has no ADD CONSTRAINT IF NOT EXISTS, and a repair run reaches a
    // table whose column was added but whose morph target was lost, so the
    // constraint may already be there.
    await client.query(
      `ALTER TABLE ${escapeIdentifier(schemaName)}.${escapeIdentifier(activityTable)}
       DROP CONSTRAINT IF EXISTS ${constraintName},
       ADD CONSTRAINT ${constraintName}
       FOREIGN KEY (${escapeIdentifier(joinColumn)})
       REFERENCES ${escapeIdentifier(schemaName)}.${escapeIdentifier(objectTable)}("id")
       ON DELETE CASCADE`,
    );

    if (existingInverse === undefined) {
      object.fields.push(inverseField);
    }
  }
};

export type RelationCreationPayload = {
  type: 'ONE_TO_MANY' | 'MANY_TO_ONE';
  targetObjectMetadataId: string;
  targetFieldLabel: string;
  targetFieldIcon?: string | null;
};

// A relation is never one field. Creating it writes the far side too, pointing
// back — the front dereferences relation.targetFieldMetadata.id without a
// guard, so a one-sided relation crashes every page that renders the object.
const createRelationFieldPair = async ({
  client,
  workspaceId,
  object,
  targetObject,
  field,
  payload,
}: {
  client: Client;
  workspaceId: string;
  object: FlatObjectMetadata;
  targetObject: FlatObjectMetadata;
  field: FlatFieldMetadata;
  payload: RelationCreationPayload;
}): Promise<FlatFieldMetadata> => {
  const inverseName = toCamelCase(payload.targetFieldLabel);

  assertValidMetadataName(inverseName);

  if (targetObject.fields.some((entry) => entry.name === inverseName)) {
    throw new UserFacingError(
      `Field "${inverseName}" already exists on ${targetObject.nameSingular}`,
    );
  }

  const inverseRelationType =
    payload.type === 'MANY_TO_ONE' ? 'ONE_TO_MANY' : 'MANY_TO_ONE';

  const inverse: FlatFieldMetadata = {
    id: crypto.randomUUID(),
    objectMetadataId: targetObject.id,
    workspaceId,
    name: inverseName,
    label: payload.targetFieldLabel,
    type: 'RELATION',
    description: null,
    icon: payload.targetFieldIcon ?? null,
    isActive: true,
    isSystem: false,
    isNullable: true,
    isUnique: false,
    defaultValue: null,
    options: null,
    settings: { relationType: inverseRelationType, onDelete: 'SET_NULL' },
    relationTargetObjectMetadataId: object.id,
    relationTargetFieldMetadataId: field.id,
  };

  const owning: FlatFieldMetadata = {
    ...field,
    settings: { relationType: payload.type, onDelete: 'SET_NULL' },
    relationTargetObjectMetadataId: targetObject.id,
    relationTargetFieldMetadataId: inverse.id,
  };

  await persistFieldMetadata({ client, field: owning });
  await persistFieldMetadata({ client, field: inverse });

  // Only the MANY_TO_ONE side owns a column, so exactly one of the two reaches
  // the table — and the foreign key follows it.
  const owningSide = payload.type === 'MANY_TO_ONE' ? owning : inverse;
  const owningObject =
    payload.type === 'MANY_TO_ONE' ? object : targetObject;
  const referencedObject =
    payload.type === 'MANY_TO_ONE' ? targetObject : object;

  const owningTable = computeTableName(
    owningObject.nameSingular,
    owningObject.isCustom,
  );
  const referencedTable = computeTableName(
    referencedObject.nameSingular,
    referencedObject.isCustom,
  );
  const schemaName = getWorkspaceSchemaName(workspaceId);

  await client.query(
    `ALTER TABLE ${escapeIdentifier(schemaName)}.${escapeIdentifier(owningTable)}
     ADD COLUMN IF NOT EXISTS ${escapeIdentifier(`${owningSide.name}Id`)} uuid`,
  );

  await client.query(
    `ALTER TABLE ${escapeIdentifier(schemaName)}.${escapeIdentifier(owningTable)}
     ADD CONSTRAINT ${escapeIdentifier(`FK_${owningTable}_${owningSide.name}`)}
     FOREIGN KEY (${escapeIdentifier(`${owningSide.name}Id`)})
     REFERENCES ${escapeIdentifier(schemaName)}.${escapeIdentifier(referencedTable)}("id")
     ON DELETE SET NULL`,
  );

  return owning;
};

export const createFieldMetadata = async ({
  client,
  workspaceId,
  object,
  objects,
  input,
}: {
  client: Client;
  workspaceId: string;
  object: FlatObjectMetadata;
  objects: FlatObjectMetadata[];
  input: {
    name: string;
    label: string;
    type: FieldMetadataType;
    isNullable?: boolean;
    icon?: string;
    options?: { value: string; label: string; color?: string }[];
    relationCreationPayload?: RelationCreationPayload | null;
  };
}): Promise<FlatFieldMetadata> => {
  assertValidMetadataName(input.name);

  if (object.fields.some((field) => field.name === input.name)) {
    throw new UserFacingError(`Field "${input.name}" already exists on this object`);
  }

  const schemaName = getWorkspaceSchemaName(workspaceId);
  const tableName = computeTableName(object.nameSingular, object.isCustom);

  const field = buildFieldFromInput({
    input,
    objectMetadataId: object.id,
    workspaceId,
  });

  const payload = input.relationCreationPayload ?? null;

  if (payload !== null) {
    const targetObject = objects.find(
      (entry) => entry.id === payload.targetObjectMetadataId,
    );

    if (targetObject === undefined) {
      throw new UserFacingError('TARGET_OBJECT_NOT_FOUND');
    }

    const owning = await createRelationFieldPair({
      client,
      workspaceId,
      object,
      targetObject,
      field: { ...field, type: 'RELATION' },
      payload,
    });

    await bumpMetadataVersion({ client, workspaceId });

    return owning;
  }

  await applyFieldColumns({ client, schemaName, tableName, field });

  await persistFieldMetadata({ client, field });

  await syncSearchVector({
    client,
    workspaceId,
    object: { ...object, fields: [...object.fields, field] },
  });

  await bumpMetadataVersion({ client, workspaceId });

  return field;
};

// Shared by field creation and by the standard-metadata sync: both need the
// enum type to exist before the column that references it, and a composite
// field adds one column per property rather than a single ALTER.
export const applyFieldColumns = async ({
  client,
  schemaName,
  tableName,
  field,
}: {
  client: Client;
  schemaName: string;
  tableName: string;
  field: FlatFieldMetadata;
}): Promise<void> => {
  for (const enumDefinition of collectEnumDefinitions({
    fields: [field],
    tableName,
  })) {
    if (enumDefinition.values.length === 0) {
      continue;
    }

    const enumType = `${escapeIdentifier(schemaName)}.${escapeIdentifier(enumDefinition.enumName)}`;

    await client.query(
      `DO $$ BEGIN
  CREATE TYPE ${enumType} AS ENUM (${enumDefinition.values.map(escapeLiteral).join(', ')});
EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    // The type name is derived from the column, so editing a SELECT's options
    // finds the old type and keeps its old values — the new option would pass
    // GraphQL validation and then be rejected by Postgres on every write.
    for (const value of enumDefinition.values) {
      await client.query(
        `ALTER TYPE ${enumType} ADD VALUE IF NOT EXISTS ${escapeLiteral(value)}`,
      );
    }
  }

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
    throw new UserFacingError(`Object "${object.nameSingular}" is standard and cannot be deleted`);
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
    throw new UserFacingError(`Field "${field.name}" is a system field and cannot be deleted`);
  }

  const schemaName = getWorkspaceSchemaName(workspaceId);
  const tableName = computeTableName(object.nameSingular, object.isCustom);

  const remaining = {
    ...object,
    fields: object.fields.filter((entry) => entry.id !== field.id),
  };

  // The search column is generated from these columns, and Postgres refuses to
  // drop a column something generated depends on. Rebuilding it without the
  // field is what clears the way.
  await syncSearchVector({ client, workspaceId, object: remaining });

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

  // Dropped after the column: the type belongs to this field alone, and leaving
  // it behind means recreating the field inherits the options it used to have.
  for (const enumDefinition of collectEnumDefinitions({ fields: [field], tableName })) {
    await client.query(
      `DROP TYPE IF EXISTS ${escapeIdentifier(schemaName)}.${escapeIdentifier(enumDefinition.enumName)}`,
    );
  }

  await client.query(
    `DELETE FROM core."fieldMetadata" WHERE "id" = $1 OR "relationTargetFieldMetadataId" = $1`,
    [field.id],
  );

  await bumpMetadataVersion({ client, workspaceId });

  return field;
};
