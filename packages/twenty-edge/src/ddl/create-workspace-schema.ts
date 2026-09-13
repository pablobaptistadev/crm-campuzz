import { type Client } from 'pg';

import {
  buildColumnSql,
  collectEnumDefinitions,
  generateColumnDefinitions,
} from 'src/ddl/generate-column-definitions';
import { escapeIdentifier, escapeLiteral } from 'src/ddl/escape';
import { computeColumnName, computeTableName } from 'src/metadata/naming';
import { type RelationOnDeleteAction } from 'src/metadata/field-metadata-type';
import { type FlatObjectMetadata } from 'src/metadata/types';

// The metadata values are underscored identifiers; Postgres wants the words
// separated by a space, so they cannot be interpolated raw.
const ON_DELETE_SQL: Record<RelationOnDeleteAction, string> = {
  CASCADE: 'CASCADE',
  RESTRICT: 'RESTRICT',
  SET_NULL: 'SET NULL',
  NO_ACTION: 'NO ACTION',
};

export const createWorkspaceSchema = async ({
  client,
  schemaName,
}: {
  client: Client;
  schemaName: string;
}): Promise<void> => {
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS ${escapeIdentifier(schemaName)}`,
  );
};

export const dropWorkspaceSchema = async ({
  client,
  schemaName,
}: {
  client: Client;
  schemaName: string;
}): Promise<void> => {
  await client.query(
    `DROP SCHEMA IF EXISTS ${escapeIdentifier(schemaName)} CASCADE`,
  );
};

export const buildCreateTableStatements = ({
  object,
  schemaName,
}: {
  object: FlatObjectMetadata;
  schemaName: string;
}): string[] => {
  const tableName = computeTableName(object.nameSingular, object.isCustom);
  const statements: string[] = [];

  // Enum types must exist before the table that references them.
  for (const enumDefinition of collectEnumDefinitions({
    fields: object.fields,
    tableName,
  })) {
    if (enumDefinition.values.length === 0) {
      continue;
    }

    const values = enumDefinition.values.map(escapeLiteral).join(', ');

    statements.push(
      `DO $$ BEGIN
  CREATE TYPE ${escapeIdentifier(schemaName)}.${escapeIdentifier(enumDefinition.enumName)} AS ENUM (${values});
EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
  }

  const columnDefinitions = object.fields.flatMap((field) =>
    generateColumnDefinitions({ field, tableName, schemaName }),
  );

  const columnsSql = columnDefinitions.map(buildColumnSql).join(', ');

  statements.push(
    `CREATE TABLE IF NOT EXISTS ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)} (${columnsSql})`,
  );

  return statements;
};

export const buildForeignKeyStatements = ({
  objects,
  schemaName,
}: {
  objects: FlatObjectMetadata[];
  schemaName: string;
}): string[] => {
  const tableNameByObjectId = new Map(
    objects.map((object) => [
      object.id,
      computeTableName(object.nameSingular, object.isCustom),
    ]),
  );

  const statements: string[] = [];

  for (const object of objects) {
    const tableName = computeTableName(object.nameSingular, object.isCustom);

    for (const field of object.fields) {
      if (
        (field.type !== 'RELATION' && field.type !== 'MORPH_RELATION') ||
        field.settings?.relationType !== 'MANY_TO_ONE' ||
        field.relationTargetObjectMetadataId === null
      ) {
        continue;
      }

      const targetTableName = tableNameByObjectId.get(
        field.relationTargetObjectMetadataId,
      );

      if (targetTableName === undefined) {
        continue;
      }

      const columnName = computeColumnName(field.name, { isForeignKey: true });
      const constraintName = `FK_${tableName}_${columnName}`;
      const onDelete = ON_DELETE_SQL[field.settings.onDelete ?? 'CASCADE'];

      statements.push(
        `DO $$ BEGIN
  ALTER TABLE ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}
    ADD CONSTRAINT ${escapeIdentifier(constraintName)}
    FOREIGN KEY (${escapeIdentifier(columnName)})
    REFERENCES ${escapeIdentifier(schemaName)}.${escapeIdentifier(targetTableName)}("id")
    ON DELETE ${onDelete};
EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      );
    }
  }

  return statements;
};

export const applyWorkspaceObjects = async ({
  client,
  schemaName,
  objects,
}: {
  client: Client;
  schemaName: string;
  objects: FlatObjectMetadata[];
}): Promise<void> => {
  await createWorkspaceSchema({ client, schemaName });

  for (const object of objects) {
    for (const statement of buildCreateTableStatements({ object, schemaName })) {
      await client.query(statement);
    }
  }

  // Foreign keys run in a second pass so table creation order does not matter.
  for (const statement of buildForeignKeyStatements({ objects, schemaName })) {
    await client.query(statement);
  }
};
