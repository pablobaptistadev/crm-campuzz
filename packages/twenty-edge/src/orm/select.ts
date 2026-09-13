import { escapeIdentifier, qualifiedTableName } from 'src/ddl/escape';
import { type ParameterBag, createParameterBag } from 'src/orm/params';
import {
  buildColumnResultAlias,
  type WorkspaceTableShape,
} from 'src/orm/table-shape';
import {
  buildColumnExpression,
  computeWhereConditionParts,
  type FilterOperator,
  type RecordFilter,
} from 'src/orm/where';

export type OrderByDirection =
  | 'AscNullsFirst'
  | 'AscNullsLast'
  | 'DescNullsFirst'
  | 'DescNullsLast';

export type OrderByClause = { fieldName: string; direction: OrderByDirection };

export type SelectQuery = { text: string; values: unknown[] };

const ORDER_BY_SQL: Record<OrderByDirection, string> = {
  AscNullsFirst: 'ASC NULLS FIRST',
  AscNullsLast: 'ASC NULLS LAST',
  DescNullsFirst: 'DESC NULLS FIRST',
  DescNullsLast: 'DESC NULLS LAST',
};

const FILTER_COMBINATORS = new Set(['and', 'or', 'not']);

const resolveColumnNamesForField = (
  shape: WorkspaceTableShape,
  fieldName: string,
): string[] =>
  [...shape.columnShapeByColumnName.values()]
    .filter((column) => column.fieldName === fieldName)
    .map((column) => column.columnName);

const buildFieldCondition = ({
  shape,
  alias,
  fieldName,
  condition,
  parameters,
}: {
  shape: WorkspaceTableShape;
  alias: string;
  fieldName: string;
  condition: unknown;
  parameters: ParameterBag;
}): string | null => {
  if (condition === null || typeof condition !== 'object') {
    return null;
  }

  const directColumn = shape.columnShapeByColumnName.get(fieldName);
  const entries = Object.entries(condition as Record<string, unknown>);
  const parts: string[] = [];

  for (const [key, value] of entries) {
    // A composite field is filtered per subproperty: { name: { firstName: { eq } } }
    const compositeColumn = [...shape.columnShapeByColumnName.values()].find(
      (column) =>
        column.compositeParentFieldName === fieldName &&
        column.compositePropertyName === key,
    );

    if (compositeColumn !== undefined) {
      const nested = buildFieldCondition({
        shape,
        alias,
        fieldName: compositeColumn.columnName,
        condition: value,
        parameters,
      });

      if (nested !== null) {
        parts.push(nested);
      }

      continue;
    }

    const column =
      directColumn ??
      shape.columnShapeByColumnName.get(
        resolveColumnNamesForField(shape, fieldName)[0] ?? fieldName,
      );

    if (column === undefined) {
      continue;
    }

    parts.push(
      computeWhereConditionParts({
        columnExpression: buildColumnExpression({
          alias,
          columnName: column.columnName,
        }),
        operator: key as FilterOperator,
        value,
        fieldType: column.fieldType,
        parameters,
      }),
    );
  }

  return parts.length === 0 ? null : `(${parts.join(' AND ')})`;
};

export const buildWhereClause = ({
  shape,
  alias,
  filter,
  parameters,
}: {
  shape: WorkspaceTableShape;
  alias: string;
  filter: RecordFilter | undefined;
  parameters: ParameterBag;
}): string | null => {
  if (filter === undefined) {
    return null;
  }

  const parts: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) {
      continue;
    }

    if (key === 'and' || key === 'or') {
      const subFilters = (value as RecordFilter[])
        .map((subFilter) =>
          buildWhereClause({ shape, alias, filter: subFilter, parameters }),
        )
        .filter((part): part is string => part !== null);

      if (subFilters.length > 0) {
        parts.push(`(${subFilters.join(key === 'and' ? ' AND ' : ' OR ')})`);
      }

      continue;
    }

    if (key === 'not') {
      const negated = buildWhereClause({
        shape,
        alias,
        filter: value as RecordFilter,
        parameters,
      });

      if (negated !== null) {
        parts.push(`NOT ${negated}`);
      }

      continue;
    }

    if (FILTER_COMBINATORS.has(key)) {
      continue;
    }

    const condition = buildFieldCondition({
      shape,
      alias,
      fieldName: key,
      condition: value,
      parameters,
    });

    if (condition !== null) {
      parts.push(condition);
    }
  }

  return parts.length === 0 ? null : `(${parts.join(' AND ')})`;
};

export type BuildSelectInput = {
  shape: WorkspaceTableShape;
  alias?: string;
  filter?: RecordFilter;
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
  withDeleted?: boolean;
};

export const buildSelectQuery = ({
  shape,
  alias = shape.nameSingular,
  filter,
  orderBy = [],
  limit,
  offset,
  withDeleted = false,
}: BuildSelectInput): SelectQuery => {
  const parameters = createParameterBag();
  const columns = [...shape.columnShapeByColumnName.values()];

  const projection = columns
    .map(
      (column) =>
        `${buildColumnExpression({ alias, columnName: column.columnName })} AS ${escapeIdentifier(
          buildColumnResultAlias({ alias, columnName: column.columnName }),
        )}`,
    )
    .join(', ');

  const whereParts: string[] = [];

  // Soft delete is implicit on every read. Twenty only lifts it when the caller
  // filters on deletedAt explicitly.
  if (shape.hasDeletedAtColumn && !withDeleted) {
    whereParts.push(
      `${buildColumnExpression({ alias, columnName: 'deletedAt' })} IS NULL`,
    );
  }

  const filterClause = buildWhereClause({ shape, alias, filter, parameters });

  if (filterClause !== null) {
    whereParts.push(filterClause);
  }

  const orderByClause = orderBy
    .flatMap((clause) =>
      resolveColumnNamesForField(shape, clause.fieldName).map(
        (columnName) =>
          `${buildColumnExpression({ alias, columnName })} ${ORDER_BY_SQL[clause.direction]}`,
      ),
    )
    .join(', ');

  const sql = [
    `SELECT ${projection}`,
    `FROM ${qualifiedTableName(shape)} AS ${escapeIdentifier(alias)}`,
    whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : null,
    orderByClause.length > 0 ? `ORDER BY ${orderByClause}` : null,
    limit !== undefined ? `LIMIT ${parameters.add(limit)}` : null,
    offset !== undefined && offset > 0 ? `OFFSET ${parameters.add(offset)}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  return parameters.compile(sql);
};

export const buildCountQuery = ({
  shape,
  alias = shape.nameSingular,
  filter,
  withDeleted = false,
}: Omit<BuildSelectInput, 'orderBy' | 'limit' | 'offset'>): SelectQuery => {
  const parameters = createParameterBag();
  const whereParts: string[] = [];

  if (shape.hasDeletedAtColumn && !withDeleted) {
    whereParts.push(
      `${buildColumnExpression({ alias, columnName: 'deletedAt' })} IS NULL`,
    );
  }

  const filterClause = buildWhereClause({ shape, alias, filter, parameters });

  if (filterClause !== null) {
    whereParts.push(filterClause);
  }

  const sql = [
    `SELECT COUNT(1) AS "count"`,
    `FROM ${qualifiedTableName(shape)} AS ${escapeIdentifier(alias)}`,
    whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  return parameters.compile(sql);
};

// Result rows come back with flattened `alias_column` keys; composites are
// rebuilt into nested objects here.
export const hydrateRecord = ({
  shape,
  alias,
  row,
}: {
  shape: WorkspaceTableShape;
  alias: string;
  row: Record<string, unknown>;
}): Record<string, unknown> => {
  const record: Record<string, unknown> = {};

  for (const column of shape.columnShapeByColumnName.values()) {
    const value = row[buildColumnResultAlias({ alias, columnName: column.columnName })];

    if (column.compositeParentFieldName !== null) {
      const parent = (record[column.compositeParentFieldName] ??= {}) as Record<
        string,
        unknown
      >;

      parent[column.compositePropertyName as string] = value ?? null;

      continue;
    }

    record[column.columnName] = value ?? null;
  }

  return record;
};
