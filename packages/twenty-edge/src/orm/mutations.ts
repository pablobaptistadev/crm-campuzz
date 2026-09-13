import { escapeIdentifier, qualifiedTableName } from 'src/ddl/escape';
import { createParameterBag } from 'src/orm/params';
import {
  buildColumnResultAlias,
  type WorkspaceTableShape,
} from 'src/orm/table-shape';
import { type SelectQuery } from 'src/orm/select';

// GraphQL input arrives nested for composites ({ name: { firstName } }); the
// table stores one column per property, so flatten before writing.
export const flattenRecordInput = ({
  shape,
  input,
}: {
  shape: WorkspaceTableShape;
  input: Record<string, unknown>;
}): Record<string, unknown> => {
  const columns: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    const directColumn = shape.columnShapeByColumnName.get(key);

    if (directColumn !== undefined && directColumn.compositeParentFieldName === null) {
      columns[key] = value;
      continue;
    }

    const compositeColumns = [...shape.columnShapeByColumnName.values()].filter(
      (column) => column.compositeParentFieldName === key,
    );

    if (compositeColumns.length > 0 && value !== null && typeof value === 'object') {
      for (const column of compositeColumns) {
        const propertyValue = (value as Record<string, unknown>)[
          column.compositePropertyName as string
        ];

        if (propertyValue !== undefined) {
          columns[column.columnName] = propertyValue;
        }
      }
    }
  }

  return columns;
};

const buildReturningClause = (shape: WorkspaceTableShape, alias: string): string =>
  [...shape.columnShapeByColumnName.values()]
    .map(
      (column) =>
        `${escapeIdentifier(column.columnName)} AS ${escapeIdentifier(
          buildColumnResultAlias({ alias, columnName: column.columnName }),
        )}`,
    )
    .join(', ');

export const buildInsertQuery = ({
  shape,
  input,
  alias = shape.nameSingular,
}: {
  shape: WorkspaceTableShape;
  input: Record<string, unknown>;
  alias?: string;
}): SelectQuery => {
  const parameters = createParameterBag();
  const columns = flattenRecordInput({ shape, input });
  const columnNames = Object.keys(columns);

  if (columnNames.length === 0) {
    return parameters.compile(
      `INSERT INTO ${qualifiedTableName(shape)} DEFAULT VALUES RETURNING ${buildReturningClause(shape, alias)}`,
    );
  }

  const sql = `INSERT INTO ${qualifiedTableName(shape)} (${columnNames
    .map(escapeIdentifier)
    .join(', ')}) VALUES (${columnNames
    .map((name) => parameters.add(columns[name]))
    .join(', ')}) RETURNING ${buildReturningClause(shape, alias)}`;

  return parameters.compile(sql);
};

export const buildUpdateQuery = ({
  shape,
  id,
  input,
  alias = shape.nameSingular,
}: {
  shape: WorkspaceTableShape;
  id: string;
  input: Record<string, unknown>;
  alias?: string;
}): SelectQuery => {
  const parameters = createParameterBag();
  const columns = flattenRecordInput({ shape, input });

  const assignments = Object.entries(columns).map(
    ([columnName, value]) =>
      `${escapeIdentifier(columnName)} = ${parameters.add(value)}`,
  );

  // updatedAt is maintained for the caller unless they set it explicitly.
  if (
    shape.columnShapeByColumnName.has('updatedAt') &&
    !('updatedAt' in columns)
  ) {
    assignments.push(`${escapeIdentifier('updatedAt')} = now()`);
  }

  const sql = `UPDATE ${qualifiedTableName(shape)} SET ${assignments.join(
    ', ',
  )} WHERE ${escapeIdentifier('id')} = ${parameters.add(id)} RETURNING ${buildReturningClause(shape, alias)}`;

  return parameters.compile(sql);
};

export const buildSoftDeleteQuery = ({
  shape,
  id,
  alias = shape.nameSingular,
}: {
  shape: WorkspaceTableShape;
  id: string;
  alias?: string;
}): SelectQuery => {
  const parameters = createParameterBag();

  return parameters.compile(
    `UPDATE ${qualifiedTableName(shape)} SET ${escapeIdentifier('deletedAt')} = now(), ${escapeIdentifier('updatedAt')} = now() WHERE ${escapeIdentifier('id')} = ${parameters.add(id)} AND ${escapeIdentifier('deletedAt')} IS NULL RETURNING ${buildReturningClause(shape, alias)}`,
  );
};

export const buildRestoreQuery = ({
  shape,
  id,
  alias = shape.nameSingular,
}: {
  shape: WorkspaceTableShape;
  id: string;
  alias?: string;
}): SelectQuery => {
  const parameters = createParameterBag();

  return parameters.compile(
    `UPDATE ${qualifiedTableName(shape)} SET ${escapeIdentifier('deletedAt')} = NULL, ${escapeIdentifier('updatedAt')} = now() WHERE ${escapeIdentifier('id')} = ${parameters.add(id)} RETURNING ${buildReturningClause(shape, alias)}`,
  );
};

export const buildDestroyQuery = ({
  shape,
  id,
  alias = shape.nameSingular,
}: {
  shape: WorkspaceTableShape;
  id: string;
  alias?: string;
}): SelectQuery => {
  const parameters = createParameterBag();

  return parameters.compile(
    `DELETE FROM ${qualifiedTableName(shape)} WHERE ${escapeIdentifier('id')} = ${parameters.add(id)} RETURNING ${buildReturningClause(shape, alias)}`,
  );
};
