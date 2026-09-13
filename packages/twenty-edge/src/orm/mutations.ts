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

// The pre-update row travels back on the same statement under this column.
export const BEFORE_SNAPSHOT_COLUMN = '__before';
// True when an upsert inserted rather than updated.
export const INSERTED_FLAG_COLUMN = '__inserted';
const BEFORE_SNAPSHOT_CTE = '__beforeUpdate';

const buildReturningClause = (
  shape: WorkspaceTableShape,
  alias: string,
  qualifier?: string,
): string =>
  [...shape.columnShapeByColumnName.values()]
    .map(
      (column) =>
        `${qualifier === undefined ? '' : `${qualifier}.`}${escapeIdentifier(
          column.columnName,
        )} AS ${escapeIdentifier(
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

// Upsert matches on the primary key only: no other column carries a unique
// index yet, so id is the single conflict target Postgres can arbitrate.
// xmax rides along because the caller has to know which branch ran — an insert
// leaves it at 0, an update does not.
export const buildUpsertQuery = ({
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

  if (!columnNames.includes('id')) {
    return buildInsertQuery({ shape, input, alias });
  }

  const assignments = columnNames
    .filter((columnName) => columnName !== 'id')
    .map(
      (columnName) =>
        `${escapeIdentifier(columnName)} = EXCLUDED.${escapeIdentifier(columnName)}`,
    );

  if (
    shape.columnShapeByColumnName.has('updatedAt') &&
    !columnNames.includes('updatedAt')
  ) {
    assignments.push(`${escapeIdentifier('updatedAt')} = now()`);
  }

  // Nothing but the id was supplied, so there is nothing to overwrite. DO
  // NOTHING would return no row at all, which the caller reads as a failure.
  const conflictAction =
    assignments.length === 0
      ? `DO UPDATE SET ${escapeIdentifier('id')} = EXCLUDED.${escapeIdentifier('id')}`
      : `DO UPDATE SET ${assignments.join(', ')}`;

  const sql = `INSERT INTO ${qualifiedTableName(shape)} (${columnNames
    .map(escapeIdentifier)
    .join(', ')}) VALUES (${columnNames
    .map((name) => parameters.add(columns[name]))
    .join(', ')})
    ON CONFLICT (${escapeIdentifier('id')}) ${conflictAction}
    RETURNING ${buildReturningClause(shape, alias)},
      (xmax = 0) AS ${escapeIdentifier(INSERTED_FLAG_COLUMN)}`;

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

  const idParameter = parameters.add(id);

  // The timeline needs the row as it was, and a separate SELECT would read it
  // after somebody else's concurrent write. The CTE snapshots it inside the
  // same statement, so before and after always describe the same transition.
  const sql = `WITH ${escapeIdentifier(BEFORE_SNAPSHOT_CTE)} AS (
      SELECT * FROM ${qualifiedTableName(shape)} WHERE ${escapeIdentifier('id')} = ${idParameter}
    )
    UPDATE ${qualifiedTableName(shape)} SET ${assignments.join(', ')}
    FROM ${escapeIdentifier(BEFORE_SNAPSHOT_CTE)}
    WHERE ${qualifiedTableName(shape)}.${escapeIdentifier('id')} = ${idParameter}
    RETURNING ${buildReturningClause(shape, alias, qualifiedTableName(shape))},
      to_jsonb(${escapeIdentifier(BEFORE_SNAPSHOT_CTE)}.*) AS ${escapeIdentifier(BEFORE_SNAPSHOT_COLUMN)}`;

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
