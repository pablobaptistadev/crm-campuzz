import { type Client } from 'pg';

import { pascalCase } from 'src/metadata/naming';
import { type WorkspaceMetadata } from 'src/metadata/types';
import { buildCursorFilter, decodeCursor, encodeCursor } from 'src/orm/cursor';
import {
  buildDestroyQuery,
  buildInsertQuery,
  buildRestoreQuery,
  buildSoftDeleteQuery,
  buildUpdateQuery,
} from 'src/orm/mutations';
import {
  buildCountQuery,
  buildSelectQuery,
  hydrateRecord,
  type OrderByClause,
  type OrderByDirection,
} from 'src/orm/select';
import {
  buildWorkspaceTableShape,
  type WorkspaceTableShape,
} from 'src/orm/table-shape';
import { type RecordFilter } from 'src/orm/where';

export type RecordResolverContext = {
  client: Client;
  metadata: WorkspaceMetadata;
};

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 1000;

type FindManyArguments = {
  filter?: RecordFilter;
  orderBy?: Record<string, unknown>[];
  first?: number;
  last?: number;
  after?: string;
  before?: string;
  offset?: number;
};

// The front sends orderBy as [{field: Direction}] and composites as
// [{name: {firstName: Direction}}]; flatten both into a single ordered list.
const normalizeOrderBy = (
  orderBy: Record<string, unknown>[] | undefined,
): OrderByClause[] => {
  const clauses: OrderByClause[] = [];

  for (const entry of orderBy ?? []) {
    for (const [fieldName, value] of Object.entries(entry)) {
      if (typeof value === 'string') {
        clauses.push({ fieldName, direction: value as OrderByDirection });
        continue;
      }

      if (value !== null && typeof value === 'object') {
        for (const direction of Object.values(value as Record<string, unknown>)) {
          if (typeof direction === 'string') {
            clauses.push({ fieldName, direction: direction as OrderByDirection });
          }
        }
      }
    }
  }

  // id is always the tie-breaker, otherwise the keyset cursor is ambiguous
  // whenever the ordered column has duplicates.
  if (!clauses.some((clause) => clause.fieldName === 'id')) {
    clauses.push({ fieldName: 'id', direction: 'AscNullsFirst' });
  }

  return clauses;
};

const mergeCursorIntoFilter = ({
  filter,
  cursor,
  orderBy,
  isBackward,
}: {
  filter: RecordFilter | undefined;
  cursor: string | undefined;
  orderBy: OrderByClause[];
  isBackward: boolean;
}): RecordFilter | undefined => {
  if (cursor === undefined) {
    return filter;
  }

  const groups = buildCursorFilter({
    cursorPayload: decodeCursor(cursor),
    orderBy,
    isBackward,
  });

  const cursorFilter: RecordFilter = {
    or: groups.map((group) => {
      const conditions: RecordFilter = {};

      for (const { fieldName, operator, value } of group) {
        conditions[fieldName] = { [operator]: value };
      }

      return conditions;
    }),
  };

  return filter === undefined ? cursorFilter : { and: [filter, cursorFilter] };
};

const buildCursorPayload = (
  record: Record<string, unknown>,
  orderBy: OrderByClause[],
): Record<string, unknown> =>
  Object.fromEntries(
    orderBy.map((clause) => [clause.fieldName, record[clause.fieldName] ?? null]),
  );

const findMany = async ({
  context,
  shape,
  args,
}: {
  context: RecordResolverContext;
  shape: WorkspaceTableShape;
  args: FindManyArguments;
}) => {
  const isBackward = args.last !== undefined || args.before !== undefined;
  const orderBy = normalizeOrderBy(args.orderBy);
  const pageSize = Math.min(
    args.first ?? args.last ?? DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );

  const filter = mergeCursorIntoFilter({
    filter: args.filter,
    cursor: args.after ?? args.before,
    orderBy,
    isBackward,
  });

  // Fetch one extra row to know whether another page exists without a second query.
  const query = buildSelectQuery({
    shape,
    filter,
    orderBy: isBackward
      ? orderBy.map((clause) => ({
          ...clause,
          direction: invertDirection(clause.direction),
        }))
      : orderBy,
    limit: pageSize + 1,
    offset: args.offset,
  });

  const { rows } = await context.client.query(query.text, query.values);
  const hasExtraRow = rows.length > pageSize;
  const pageRows = hasExtraRow ? rows.slice(0, pageSize) : rows;
  const records = pageRows.map((row) =>
    hydrateRecord({ shape, alias: shape.nameSingular, row }),
  );

  const ordered = isBackward ? [...records].reverse() : records;

  const edges = ordered.map((record) => ({
    node: record,
    cursor: encodeCursor(buildCursorPayload(record, orderBy)),
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage: isBackward ? false : hasExtraRow,
      hasPreviousPage: isBackward ? hasExtraRow : args.after !== undefined,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
    __countQuery: { shape, filter: args.filter },
  };
};

const invertDirection = (direction: OrderByDirection): OrderByDirection => {
  switch (direction) {
    case 'AscNullsFirst':
      return 'DescNullsLast';
    case 'AscNullsLast':
      return 'DescNullsFirst';
    case 'DescNullsFirst':
      return 'AscNullsLast';
    case 'DescNullsLast':
      return 'AscNullsFirst';
  }
};

export const buildRecordResolvers = (
  metadata: WorkspaceMetadata,
): Record<string, Record<string, unknown>> => {
  const query: Record<string, unknown> = {};
  const mutation: Record<string, unknown> = {};
  const connectionResolvers: Record<string, Record<string, unknown>> = {};

  for (const object of metadata.objects.filter((entry) => entry.isActive)) {
    const shape = buildWorkspaceTableShape({
      object,
      workspaceId: metadata.workspaceId,
    });
    const singular = pascalCase(object.nameSingular);

    query[object.namePlural] = (
      _parent: unknown,
      args: FindManyArguments,
      context: RecordResolverContext,
    ) => findMany({ context, shape, args });

    query[object.nameSingular] = async (
      _parent: unknown,
      args: { filter?: RecordFilter },
      context: RecordResolverContext,
    ) => {
      const result = await findMany({
        context,
        shape,
        args: { filter: args.filter, first: 1 },
      });

      return result.edges[0]?.node ?? null;
    };

    // totalCount is resolved lazily: the count query only runs when the client
    // actually selects the field.
    connectionResolvers[`${singular}Connection`] = {
      totalCount: async (
        parent: { __countQuery: { shape: WorkspaceTableShape; filter?: RecordFilter } },
        _args: unknown,
        context: RecordResolverContext,
      ) => {
        const countQuery = buildCountQuery({
          shape: parent.__countQuery.shape,
          filter: parent.__countQuery.filter,
        });
        const { rows } = await context.client.query(
          countQuery.text,
          countQuery.values,
        );

        return Number(rows[0]?.count ?? 0);
      },
    };

    const runMutation = async (
      context: RecordResolverContext,
      query: { text: string; values: unknown[] },
    ) => {
      const { rows } = await context.client.query(query.text, query.values);

      return rows[0] === undefined
        ? null
        : hydrateRecord({ shape, alias: shape.nameSingular, row: rows[0] });
    };

    mutation[`create${singular}`] = (
      _parent: unknown,
      args: { data: Record<string, unknown> },
      context: RecordResolverContext,
    ) => runMutation(context, buildInsertQuery({ shape, input: args.data }));

    mutation[`create${pascalCase(object.namePlural)}`] = async (
      _parent: unknown,
      args: { data: Record<string, unknown>[] },
      context: RecordResolverContext,
    ) => {
      const created = [];

      for (const data of args.data) {
        created.push(
          await runMutation(context, buildInsertQuery({ shape, input: data })),
        );
      }

      return created.filter((record) => record !== null);
    };

    mutation[`update${singular}`] = (
      _parent: unknown,
      args: { id: string; data: Record<string, unknown> },
      context: RecordResolverContext,
    ) =>
      runMutation(
        context,
        buildUpdateQuery({ shape, id: args.id, input: args.data }),
      );

    mutation[`delete${singular}`] = (
      _parent: unknown,
      args: { id: string },
      context: RecordResolverContext,
    ) => runMutation(context, buildSoftDeleteQuery({ shape, id: args.id }));

    mutation[`restore${singular}`] = (
      _parent: unknown,
      args: { id: string },
      context: RecordResolverContext,
    ) => runMutation(context, buildRestoreQuery({ shape, id: args.id }));

    mutation[`destroy${singular}`] = (
      _parent: unknown,
      args: { id: string },
      context: RecordResolverContext,
    ) => runMutation(context, buildDestroyQuery({ shape, id: args.id }));
  }

  return { Query: query, Mutation: mutation, ...connectionResolvers };
};
