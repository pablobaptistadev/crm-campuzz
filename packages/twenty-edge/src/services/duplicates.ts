import { type Client } from 'pg';

import { escapeIdentifier } from 'src/ddl/escape';
import { type FlatObjectMetadata } from 'src/metadata/types';
import { createParameterBag } from 'src/orm/params';
import { type WorkspaceTableShape } from 'src/orm/table-shape';

// A value that is empty is not evidence of anything: two companies with no
// domain are not the same company. Twenty's own criteria rely on this, which is
// why an all-empty group is skipped rather than matched.
const isMeaningfulValue = (value: unknown): boolean =>
  value !== null && value !== undefined && String(value).trim().length > 0;

export const buildDuplicateConditions = ({
  object,
  shape,
  records,
}: {
  object: FlatObjectMetadata;
  shape: WorkspaceTableShape;
  records: Record<string, unknown>[];
}): { columnNames: string[]; groups: { columnName: string; value: unknown }[][] } => {
  const criteria = object.duplicateCriteria ?? [];
  const groups: { columnName: string; value: unknown }[][] = [];
  const columnNames = new Set<string>();

  for (const record of records) {
    for (const criterion of criteria) {
      const usableColumns = criterion.filter((columnName) =>
        shape.columnShapeByColumnName.has(columnName),
      );

      if (usableColumns.length !== criterion.length) {
        continue;
      }

      const values = usableColumns.map((columnName) => ({
        columnName,
        value: record[columnName],
      }));

      // Every column of the group has to carry something, or the group would
      // match every record whose corresponding columns are also empty.
      if (!values.every((entry) => isMeaningfulValue(entry.value))) {
        continue;
      }

      for (const entry of values) {
        columnNames.add(entry.columnName);
      }

      groups.push(values);
    }
  }

  return { columnNames: [...columnNames], groups };
};

export const buildDuplicatesQuery = ({
  shape,
  groups,
  excludedIds,
  limit,
}: {
  shape: WorkspaceTableShape;
  groups: { columnName: string; value: unknown }[][];
  excludedIds: string[];
  limit: number;
}): { text: string; values: unknown[] } | null => {
  if (groups.length === 0) {
    return null;
  }

  const parameters = createParameterBag();
  const alias = escapeIdentifier(shape.nameSingular);

  const projection = [...shape.columnShapeByColumnName.values()]
    .map(
      (column) =>
        `${alias}.${escapeIdentifier(column.columnName)} AS ${escapeIdentifier(
          `${shape.nameSingular}_${column.columnName}`,
        )}`,
    )
    .join(', ');

  const groupConditions = groups
    .map(
      (group) =>
        `(${group
          .map(
            (entry) =>
              `${alias}.${escapeIdentifier(entry.columnName)} = ${parameters.add(entry.value)}`,
          )
          .join(' AND ')})`,
    )
    .join(' OR ');

  const whereParts = [`(${groupConditions})`];

  if (shape.hasDeletedAtColumn) {
    whereParts.push(`${alias}.${escapeIdentifier('deletedAt')} IS NULL`);
  }

  // The records the caller asked about are not their own duplicates.
  whereParts.push(
    `NOT (${alias}.${escapeIdentifier('id')} = ANY(${parameters.add(excludedIds)}::uuid[]))`,
  );

  return parameters.compile(
    `SELECT ${projection}
     FROM ${escapeIdentifier(shape.schemaName)}.${escapeIdentifier(shape.tableName)} AS ${alias}
     WHERE ${whereParts.join(' AND ')}
     ORDER BY ${alias}.${escapeIdentifier('id')} ASC
     LIMIT ${parameters.add(limit)}`,
  );
};

// The surviving record takes the priority record's value for every column that
// has one, then fills the gaps from the others in the order they were given.
// A column nobody filled stays as the survivor had it.
export const mergeRecordValues = ({
  shape,
  records,
  conflictPriorityIndex,
}: {
  shape: WorkspaceTableShape;
  records: Record<string, unknown>[];
  conflictPriorityIndex: number;
}): Record<string, unknown> => {
  const priorityIndex =
    conflictPriorityIndex >= 0 && conflictPriorityIndex < records.length
      ? conflictPriorityIndex
      : 0;

  const ordered = [
    records[priorityIndex],
    ...records.filter((_record, index) => index !== priorityIndex),
  ];

  const merged: Record<string, unknown> = {};

  for (const column of shape.columnShapeByColumnName.values()) {
    // Identity and bookkeeping belong to the survivor, not to the merge.
    if (
      ['id', 'createdAt', 'updatedAt', 'deletedAt', 'position'].includes(
        column.columnName,
      )
    ) {
      continue;
    }

    const winner = ordered.find((record) =>
      isMeaningfulValue(record[column.columnName]),
    );

    if (winner !== undefined) {
      merged[column.columnName] = winner[column.columnName];
    }
  }

  return merged;
};

// Every column in the workspace schema that points at this object, so a merge
// can carry the losers' relations over to the survivor instead of orphaning
// them when the rows go.
export const findReferencingColumns = ({
  metadata,
  objectMetadataId,
  objectById,
}: {
  metadata: { objects: FlatObjectMetadata[] };
  objectMetadataId: string;
  objectById: Map<string, FlatObjectMetadata>;
}): { tableName: string; columnName: string }[] => {
  const references: { tableName: string; columnName: string }[] = [];

  for (const object of metadata.objects) {
    for (const field of object.fields) {
      if (field.settings?.relationType !== 'MANY_TO_ONE') {
        continue;
      }

      if (field.type === 'MORPH_RELATION') {
        for (const target of field.settings.morphTargets ?? []) {
          const targetObject = [...objectById.values()].find(
            (entry) => entry.nameSingular === target.nameSingular,
          );

          if (targetObject?.id !== objectMetadataId) {
            continue;
          }

          references.push({
            tableName: object.nameSingular,
            columnName: `${field.name}${target.nameSingular
              .charAt(0)
              .toUpperCase()}${target.nameSingular.slice(1)}Id`,
          });
        }

        continue;
      }

      if (field.relationTargetObjectMetadataId !== objectMetadataId) {
        continue;
      }

      references.push({
        tableName: object.nameSingular,
        columnName: `${field.name}Id`,
      });
    }
  }

  return references;
};
