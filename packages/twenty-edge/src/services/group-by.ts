import { type Client } from 'pg';

import { escapeIdentifier, escapeLiteral } from 'src/ddl/escape';
import { createParameterBag } from 'src/orm/params';
import { buildWhereClause, filterMentionsDeletedAt } from 'src/orm/select';
import { type WorkspaceTableShape } from 'src/orm/table-shape';
import { buildColumnExpression, type RecordFilter } from 'src/orm/where';

export type DateGranularity =
  | 'DAY'
  | 'MONTH'
  | 'QUARTER'
  | 'YEAR'
  | 'WEEK'
  | 'DAY_OF_THE_WEEK'
  | 'MONTH_OF_THE_YEAR'
  | 'QUARTER_OF_THE_YEAR'
  | 'NONE';

export type GroupByInput = Record<
  string,
  boolean | { granularity?: DateGranularity | null; timeZone?: string | null } | null
>;

export type GroupBucket = {
  dimensionValues: (string | null)[];
  totalCount: number;
};

// date_trunc for the ranges, extract for the cyclical ones — "every Monday"
// is a different question from "the week of the 3rd".
const DATE_EXPRESSION_BY_GRANULARITY: Record<DateGranularity, string | null> = {
  DAY: `date_trunc('day', %s)`,
  WEEK: `date_trunc('week', %s)`,
  MONTH: `date_trunc('month', %s)`,
  QUARTER: `date_trunc('quarter', %s)`,
  YEAR: `date_trunc('year', %s)`,
  DAY_OF_THE_WEEK: `extract(dow from %s)`,
  MONTH_OF_THE_YEAR: `extract(month from %s)`,
  QUARTER_OF_THE_YEAR: `extract(quarter from %s)`,
  NONE: null,
};

// Time zone matters for every bucket that has a boundary: midnight in São Paulo
// is 03:00 UTC, so grouping by day without it puts the evening on the next day.
const buildDateExpression = ({
  columnExpression,
  granularity,
  timeZone,
}: {
  columnExpression: string;
  granularity: DateGranularity;
  timeZone: string | null;
}): string => {
  const template = DATE_EXPRESSION_BY_GRANULARITY[granularity];

  if (template === null) {
    return columnExpression;
  }

  const shifted =
    timeZone === null
      ? columnExpression
      : `(${columnExpression} AT TIME ZONE ${escapeLiteral(timeZone)})`;

  return template.replace('%s', shifted);
};

export type GroupByDimension = {
  fieldName: string;
  expression: string;
};

// The input arrives as [{stage: true}, {createdAt: {granularity: MONTH}}]:
// one entry per dimension, in the order the columns should nest.
export const buildGroupByDimensions = ({
  shape,
  alias,
  groupBy,
}: {
  shape: WorkspaceTableShape;
  alias: string;
  groupBy: GroupByInput[];
}): GroupByDimension[] => {
  const dimensions: GroupByDimension[] = [];

  for (const entry of groupBy) {
    for (const [fieldName, value] of Object.entries(entry)) {
      if (value === false || value === null || value === undefined) {
        continue;
      }

      const column = shape.columnShapeByColumnName.get(fieldName);

      if (column === undefined) {
        continue;
      }

      const columnExpression = buildColumnExpression({
        alias,
        columnName: fieldName,
      });

      const granularity =
        typeof value === 'object' ? (value.granularity ?? 'NONE') : 'NONE';
      const timeZone =
        typeof value === 'object' ? (value.timeZone ?? null) : null;

      dimensions.push({
        fieldName,
        expression: buildDateExpression({
          columnExpression,
          granularity,
          timeZone,
        }),
      });
    }
  }

  return dimensions;
};

export const buildGroupByQuery = ({
  shape,
  alias = shape.nameSingular,
  dimensions,
  filter,
  limit,
}: {
  shape: WorkspaceTableShape;
  alias?: string;
  dimensions: GroupByDimension[];
  filter?: RecordFilter;
  limit?: number;
}): { text: string; values: unknown[] } => {
  const parameters = createParameterBag();
  const whereParts: string[] = [];

  if (shape.hasDeletedAtColumn && !filterMentionsDeletedAt(filter)) {
    whereParts.push(
      `${buildColumnExpression({ alias, columnName: 'deletedAt' })} IS NULL`,
    );
  }

  const filterClause = buildWhereClause({ shape, alias, filter, parameters });

  if (filterClause !== null) {
    whereParts.push(filterClause);
  }

  const projection = dimensions
    .map(
      (dimension, index) =>
        `${dimension.expression} AS ${escapeIdentifier(`dimension_${index}`)}`,
    )
    .join(', ');

  const grouping = dimensions
    .map((_dimension, index) => `${index + 1}`)
    .join(', ');

  const sql = [
    `SELECT ${projection}, count(*)::int AS "totalCount"`,
    `FROM ${escapeIdentifier(shape.schemaName)}.${escapeIdentifier(shape.tableName)} AS ${escapeIdentifier(alias)}`,
    whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : null,
    `GROUP BY ${grouping}`,
    // Nulls last so an unset column reads as the trailing "no value" column the
    // kanban draws, rather than the first one.
    `ORDER BY ${dimensions
      .map((_dimension, index) => `${index + 1} ASC NULLS LAST`)
      .join(', ')}`,
    limit === undefined ? null : `LIMIT ${parameters.add(limit)}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  return parameters.compile(sql);
};

// Every dimension value reaches the front as a string: the column holds enums,
// dates and numbers, and the front compares them as text.
const toDimensionValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
};

export const runGroupBy = async ({
  client,
  shape,
  groupBy,
  filter,
  limit,
}: {
  client: Client;
  shape: WorkspaceTableShape;
  groupBy: GroupByInput[];
  filter?: RecordFilter;
  limit?: number;
}): Promise<{ dimensions: GroupByDimension[]; buckets: GroupBucket[] }> => {
  const alias = shape.nameSingular;
  const dimensions = buildGroupByDimensions({ shape, alias, groupBy });

  if (dimensions.length === 0) {
    return { dimensions, buckets: [] };
  }

  const { text, values } = buildGroupByQuery({
    shape,
    alias,
    dimensions,
    filter,
    limit,
  });

  const { rows } = await client.query<Record<string, unknown>>(text, values);

  return {
    dimensions,
    buckets: rows.map((row) => ({
      dimensionValues: dimensions.map((_dimension, index) =>
        toDimensionValue(row[`dimension_${index}`]),
      ),
      totalCount: Number(row.totalCount ?? 0),
    })),
  };
};
