import { type Client } from 'pg';

import { buildMorphFieldNames } from 'src/graphql/build-sdl';
import { pascalCase } from 'src/metadata/naming';
import { type WorkspaceMetadata } from 'src/metadata/types';
import { buildCursorFilter, decodeCursor, encodeCursor } from 'src/orm/cursor';
import {
  BEFORE_SNAPSHOT_COLUMN,
  INSERTED_FLAG_COLUMN,
  buildDestroyQuery,
  buildInsertQuery,
  buildRestoreQuery,
  buildSoftDeleteQuery,
  buildUpdateQuery,
  buildUpsertQuery,
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
import {
  computeFieldDiff,
  recordTimelineActivity,
  type TimelineAction,
} from 'src/services/timeline';

export type RecordResolverContext = {
  client: Client;
  metadata: WorkspaceMetadata;
  userId: string | null;
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
  const typeResolvers: Record<string, Record<string, unknown>> = {};

  const objectById = new Map(
    metadata.objects.map((entry) => [entry.id, entry]),
  );
  const fieldById = new Map(
    metadata.objects.flatMap((entry) =>
      entry.fields.map((field) => [field.id, field] as const),
    ),
  );
  const shapeByObjectId = new Map(
    metadata.objects.map((entry) => [
      entry.id,
      buildWorkspaceTableShape({ object: entry, workspaceId: metadata.workspaceId }),
    ]),
  );

  for (const object of metadata.objects.filter((entry) => entry.isActive)) {
    const shape = shapeByObjectId.get(object.id) as WorkspaceTableShape;
    const singular = pascalCase(object.nameSingular);

    // Relations are resolved per parent row rather than joined. Twenty does the
    // same for to-many; the to-one case is a candidate for batching later.
    const relationFields: Record<string, unknown> = {};

    for (const field of object.fields) {
      if (field.type !== 'RELATION' && field.type !== 'MORPH_RELATION') {
        continue;
      }

      // A morph relation resolves once per target, each off its own join
      // column, so it never reaches the single-target path below.
      const morphFields = buildMorphFieldNames({ field, objectById });

      if (morphFields !== null) {
        for (const { fieldName, target } of morphFields) {
          const morphShape = shapeByObjectId.get(target.id);

          if (morphShape === undefined) {
            continue;
          }

          const joinColumnName = `${fieldName}Id`;

          relationFields[fieldName] = async (
            parent: Record<string, unknown>,
            _args: unknown,
            context: RecordResolverContext,
          ) => {
            const targetId = parent[joinColumnName];

            if (typeof targetId !== 'string') {
              return null;
            }

            const result = await findMany({
              context,
              shape: morphShape,
              args: { filter: { id: { eq: targetId } }, first: 1 },
            });

            return result.edges[0]?.node ?? null;
          };
        }

        continue;
      }

      if (field.relationTargetObjectMetadataId === null) {
        continue;
      }

      const targetObject = objectById.get(field.relationTargetObjectMetadataId);
      const targetShape = shapeByObjectId.get(
        field.relationTargetObjectMetadataId,
      );

      if (targetObject === undefined || targetShape === undefined) {
        continue;
      }

      if (field.settings?.relationType === 'MANY_TO_ONE') {
        const joinColumnName = `${field.name}Id`;

        relationFields[field.name] = async (
          parent: Record<string, unknown>,
          _args: unknown,
          context: RecordResolverContext,
        ) => {
          const targetId = parent[joinColumnName];

          if (typeof targetId !== 'string') {
            return null;
          }

          const result = await findMany({
            context,
            shape: targetShape,
            args: { filter: { id: { eq: targetId } }, first: 1 },
          });

          return result.edges[0]?.node ?? null;
        };

        continue;
      }

      // The inverse side owns the foreign key, so the column name comes from the
      // field this one points back to.
      const inverseField =
        field.relationTargetFieldMetadataId === null
          ? undefined
          : fieldById.get(field.relationTargetFieldMetadataId);

      if (inverseField === undefined) {
        continue;
      }

      // When the other side is a morph field, the column that points back here
      // is the one named after this object, not after the field.
      const inverseMorphFields = buildMorphFieldNames({
        field: inverseField,
        objectById,
      });

      const inverseJoinColumnName =
        inverseMorphFields === null
          ? `${inverseField.name}Id`
          : `${
              inverseMorphFields.find((entry) => entry.target.id === object.id)
                ?.fieldName ?? inverseField.name
            }Id`;

      relationFields[field.name] = (
        parent: Record<string, unknown>,
        args: FindManyArguments,
        context: RecordResolverContext,
      ) => {
        const parentId = parent.id;

        if (typeof parentId !== 'string') {
          return null;
        }

        const relationFilter = { [inverseJoinColumnName]: { eq: parentId } };

        return findMany({
          context,
          shape: targetShape,
          args: {
            ...args,
            filter:
              args.filter === undefined
                ? relationFilter
                : { and: [args.filter, relationFilter] },
          },
        });
      };
    }

    if (Object.keys(relationFields).length > 0) {
      typeResolvers[singular] = relationFields;
    }

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
        : {
            record: hydrateRecord({
              shape,
              alias: shape.nameSingular,
              row: rows[0],
            }),
            row: rows[0] as Record<string, unknown>,
          };
    };

    // The event is awaited rather than fired into waitUntil: the request's
    // client is closed as soon as the handler returns, and pg tears the socket
    // down under a query still in flight.
    const writeTimelineActivity = async (
      context: RecordResolverContext,
      action: TimelineAction,
      recordId: unknown,
      diff?: Record<string, { before: unknown; after: unknown }>,
    ) => {
      if (typeof recordId !== 'string') {
        return;
      }

      await recordTimelineActivity({
        client: context.client,
        metadata: context.metadata,
        object,
        action,
        recordId,
        userId: context.userId,
        diff,
      });
    };

    // upsert is what the CSV import sends: re-importing the same file has to
    // land on the same rows rather than duplicate them.
    const createRecord = async (
      context: RecordResolverContext,
      data: Record<string, unknown>,
      upsert: boolean,
    ) => {
      const result = await runMutation(
        context,
        upsert
          ? buildUpsertQuery({ shape, input: data })
          : buildInsertQuery({ shape, input: data }),
      );

      if (result === null) {
        return null;
      }

      const wasUpdated = result.row[INSERTED_FLAG_COLUMN] === false;

      await writeTimelineActivity(
        context,
        wasUpdated ? 'updated' : 'created',
        result.record.id,
      );

      return result.record;
    };

    mutation[`create${singular}`] = (
      _parent: unknown,
      args: { data: Record<string, unknown>; upsert?: boolean },
      context: RecordResolverContext,
    ) => createRecord(context, args.data, args.upsert === true);

    mutation[`create${pascalCase(object.namePlural)}`] = async (
      _parent: unknown,
      args: { data: Record<string, unknown>[]; upsert?: boolean },
      context: RecordResolverContext,
    ) => {
      const created = [];

      for (const data of args.data) {
        created.push(await createRecord(context, data, args.upsert === true));
      }

      return created.filter((record) => record !== null);
    };

    mutation[`update${singular}`] = async (
      _parent: unknown,
      args: { id: string; data: Record<string, unknown> },
      context: RecordResolverContext,
    ) => {
      const result = await runMutation(
        context,
        buildUpdateQuery({ shape, id: args.id, input: args.data }),
      );

      if (result === null) {
        return null;
      }

      const beforeRow = result.row[BEFORE_SNAPSHOT_COLUMN];
      const before =
        beforeRow === null || typeof beforeRow !== 'object'
          ? {}
          : hydrateRecord({
              shape,
              alias: shape.nameSingular,
              row: Object.fromEntries(
                Object.entries(beforeRow as Record<string, unknown>).map(
                  ([columnName, value]) => [
                    `${shape.nameSingular}_${columnName}`,
                    value,
                  ],
                ),
              ),
            });

      const diff = computeFieldDiff({
        shape,
        input: args.data,
        before,
        after: result.record,
      });

      // An update that changed nothing readable is not an event: the front
      // drops an `updated` row whose diff is empty anyway.
      if (Object.keys(diff).length > 0) {
        await writeTimelineActivity(context, 'updated', args.id, diff);
      }

      return result.record;
    };

    mutation[`delete${singular}`] = async (
      _parent: unknown,
      args: { id: string },
      context: RecordResolverContext,
    ) => {
      const result = await runMutation(
        context,
        buildSoftDeleteQuery({ shape, id: args.id }),
      );

      if (result === null) {
        return null;
      }

      await writeTimelineActivity(context, 'deleted', args.id);

      return result.record;
    };

    mutation[`restore${singular}`] = async (
      _parent: unknown,
      args: { id: string },
      context: RecordResolverContext,
    ) => {
      const result = await runMutation(
        context,
        buildRestoreQuery({ shape, id: args.id }),
      );

      if (result === null) {
        return null;
      }

      await writeTimelineActivity(context, 'restored', args.id);

      return result.record;
    };

    // No timeline row for a destroy: the record is gone, so the event would
    // point at nothing and its own cascade would take it with the record.
    mutation[`destroy${singular}`] = async (
      _parent: unknown,
      args: { id: string },
      context: RecordResolverContext,
    ) => {
      const result = await runMutation(
        context,
        buildDestroyQuery({ shape, id: args.id }),
      );

      return result === null ? null : result.record;
    };
  }

  return {
    Query: query,
    Mutation: mutation,
    ...connectionResolvers,
    ...typeResolvers,
  };
};
