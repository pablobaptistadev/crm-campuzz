import { type Client } from 'pg';

import { escapeIdentifier, qualifiedTableName } from 'src/ddl/escape';
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
  assertCanPerform,
  canPerform,
  type WorkspacePermissions,
} from 'src/services/permissions';
import {
  buildDuplicateConditions,
  buildDuplicatesQuery,
  findReferencingColumns,
  mergeRecordValues,
} from 'src/services/duplicates';
import {
  arquivarEmCascata,
  montarGrafoDePosse,
  restaurarEmCascata,
  type GrafoDePosse,
} from 'src/services/cascata';
import { runGroupBy, type GroupByInput } from 'src/services/group-by';
import {
  resolveRecordPosition,
  resolveRecordPositions,
} from 'src/services/record-position';
import {
  encodeSearchCursor,
  searchRecords,
  type SearchArguments,
} from 'src/services/search';
import {
  computeFieldDiff,
  recordTimelineActivity,
  type TimelineAction,
} from 'src/services/timeline';
import { UserFacingError } from 'src/graphql/user-facing-error';

// Several mutations are more than one statement — a bulk create is one INSERT
// per row, a merge repoints relations before soft-deleting the losers. Without
// a transaction a dropped connection leaves the half that already ran: a club
// with some of its steps and no contract, or relations pointing at a record
// that never went away.
const emTransacao = async <TResultado>(
  client: Client,
  executar: () => Promise<TResultado>,
): Promise<TResultado> => {
  await client.query('BEGIN');

  try {
    const resultado = await executar();

    await client.query('COMMIT');

    return resultado;
  } catch (causa) {
    // The rollback can fail on its own (the socket is already gone); losing the
    // original error to that would hide what actually broke.
    await client.query('ROLLBACK').catch(() => undefined);

    throw causa;
  }
};

export type RecordResolverContext = {
  client: Client;
  metadata: WorkspaceMetadata;
  userId: string | null;
  permissions: WorkspacePermissions;
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
  shape?: WorkspaceTableShape,
): OrderByClause[] => {
  const clauses: OrderByClause[] = [];

  for (const entry of orderBy ?? []) {
    for (const [fieldName, value] of Object.entries(entry)) {
      if (typeof value === 'string') {
        clauses.push({ fieldName, direction: value as OrderByDirection });
        continue;
      }

      if (value !== null && typeof value === 'object') {
        for (const direction of Object.values(
          value as Record<string, unknown>,
        )) {
          if (typeof direction === 'string') {
            clauses.push({
              fieldName,
              direction: direction as OrderByDirection,
            });
          }
        }
      }
    }
  }

  // The front appends position to every sort it builds (turnSortsIntoOrderBy),
  // so a list it asks for without one — a relation table on a record page —
  // still has to come back in the order the user dragged the rows into.
  if (
    shape?.columnShapeByColumnName.get('position')?.fieldType === 'POSITION' &&
    !clauses.some((clause) => clause.fieldName === 'position')
  ) {
    clauses.push({ fieldName: 'position', direction: 'AscNullsFirst' });
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
    orderBy.map((clause) => [
      clause.fieldName,
      record[clause.fieldName] ?? null,
    ]),
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
  const orderBy = normalizeOrderBy(args.orderBy, shape);
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


// Arquivar um clube tira os membros junto, então quem não pode arquivar membro
// não pode arquivar o clube por tabela — senão a cascata vira um contorno da
// permissão em vez de uma conveniência.
const assertPodeArquivarOsFilhos = ({
  context,
  grafo,
  objetoId,
  objectById,
}: {
  context: RecordResolverContext;
  grafo: GrafoDePosse;
  objetoId: string;
  objectById: Map<string, { nameSingular: string }>;
}): void => {
  const vistos = new Set<string>([objetoId]);
  const fila = [objetoId];

  while (fila.length > 0) {
    for (const aresta of grafo.get(fila.shift() as string) ?? []) {
      if (vistos.has(aresta.objetoFilhoId)) {
        continue;
      }

      vistos.add(aresta.objetoFilhoId);
      fila.push(aresta.objetoFilhoId);

      assertCanPerform({
        permissions: context.permissions,
        objectMetadataId: aresta.objetoFilhoId,
        objectNameSingular:
          objectById.get(aresta.objetoFilhoId)?.nameSingular ?? aresta.nomeDoFilho,
        action: 'softDelete',
      });
    }
  }
};


// O driver devolve timestamptz como Date, não como texto, e a cascata precisa
// do instante exato para carimbar os filhos. Pular calado quando o tipo
// surpreende foi o que deixou a cascata não acontecer em produção enquanto o
// teste passava, então aqui é erro, não omissão.
const instanteDeArquivamento = (valor: unknown): string => {
  if (valor instanceof Date) {
    return valor.toISOString();
  }

  if (typeof valor === 'string' && valor !== '') {
    return valor;
  }

  throw new Error(
    `deletedAt voltou como ${valor === null ? 'null' : typeof valor}, e a cascata de arquivamento depende dele`,
  );
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
      buildWorkspaceTableShape({
        object: entry,
        workspaceId: metadata.workspaceId,
      }),
    ]),
  );

  const grafoDePosse = montarGrafoDePosse({ metadata, shapeByObjectId });

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

            // A relation reads the other object's rows, so it answers null
            // rather than throwing: one unreadable target must not fail the
            // whole document the way an error on a nullable field would.
            if (
              !canPerform({
                permissions: context.permissions,
                objectMetadataId: target.id,
                action: 'read',
              })
            ) {
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

          if (
            !canPerform({
              permissions: context.permissions,
              objectMetadataId: targetObject.id,
              action: 'read',
            })
          ) {
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

        if (
          !canPerform({
            permissions: context.permissions,
            objectMetadataId: targetObject.id,
            action: 'read',
          })
        ) {
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

    // Enforced here rather than only in the schema: the front hides what a role
    // cannot read, but the schema is the same for everyone, so a hand-written
    // query would otherwise reach the rows anyway.
    const assertAllowed = (
      context: RecordResolverContext,
      action: Parameters<typeof assertCanPerform>[0]['action'],
    ) =>
      assertCanPerform({
        permissions: context.permissions,
        objectMetadataId: object.id,
        objectNameSingular: object.nameSingular,
        action,
      });

    query[object.namePlural] = (
      _parent: unknown,
      args: FindManyArguments,
      context: RecordResolverContext,
    ) => {
      assertAllowed(context, 'read');

      return findMany({ context, shape, args });
    };

    query[object.nameSingular] = async (
      _parent: unknown,
      args: { filter?: RecordFilter },
      context: RecordResolverContext,
    ) => {
      assertAllowed(context, 'read');

      const result = await findMany({
        context,
        shape,
        args: { filter: args.filter, first: 1 },
      });

      return result.edges[0]?.node ?? null;
    };

    // One connection per group. The kanban draws a column from each, so the
    // records come from a second query per group rather than from a window
    // function: the front asks for at most a page of cards per column.
    query[`${object.namePlural}GroupBy`] = async (
      _parent: unknown,
      args: {
        groupBy: GroupByInput[];
        filter?: RecordFilter;
        orderByForRecords?: Record<string, unknown>[];
        limit?: number;
        offsetForRecords?: number;
      },
      context: RecordResolverContext,
    ) => {
      assertAllowed(context, 'read');

      const { dimensions, buckets } = await runGroupBy({
        client: context.client,
        shape,
        groupBy: args.groupBy,
        filter: args.filter,
      });

      if (dimensions.length === 0) {
        return [];
      }

      return Promise.all(
        buckets.map(async (bucket) => {
          // The bucket is re-expressed as a filter so the records come back
          // through the same path every other read uses — cursors, soft delete
          // and composites included.
          const bucketConditions = dimensions.map((dimension, index) => {
            const value = bucket.dimensionValues[index];

            return {
              [dimension.fieldName]:
                value === null ? { is: 'NULL' } : { eq: value },
            };
          });

          const bucketFilter: RecordFilter = {
            and:
              args.filter === undefined
                ? bucketConditions
                : [args.filter, ...bucketConditions],
          };

          const page = await findMany({
            context,
            shape,
            args: {
              filter: bucketFilter,
              orderBy: args.orderByForRecords,
              first: args.limit,
              offset: args.offsetForRecords,
            },
          });

          return {
            ...page,
            totalCount: bucket.totalCount,
            groupByDimensionValues: bucket.dimensionValues,
          };
        }),
      );
    };

    query[`${object.nameSingular}Duplicates`] = async (
      _parent: unknown,
      args: { ids: string[] },
      context: RecordResolverContext,
    ) => {
      assertAllowed(context, 'read');

      const empty = {
        edges: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        __countQuery: { shape, filter: { id: { in: [] } } },
      };

      if (object.duplicateCriteria === null || args.ids.length === 0) {
        return empty;
      }

      const sourceRows = await context.client.query<Record<string, unknown>>(
        ...(() => {
          const query = buildSelectQuery({
            shape,
            filter: { id: { in: args.ids } },
            limit: args.ids.length,
          });

          return [query.text, query.values] as const;
        })(),
      );

      const sources = sourceRows.rows.map((row) =>
        hydrateRecord({ shape, alias: shape.nameSingular, row }),
      );

      const { groups } = buildDuplicateConditions({
        object,
        shape,
        records: sourceRows.rows.map((row) =>
          Object.fromEntries(
            [...shape.columnShapeByColumnName.values()].map((column) => [
              column.columnName,
              row[`${shape.nameSingular}_${column.columnName}`],
            ]),
          ),
        ),
      });

      const query = buildDuplicatesQuery({
        shape,
        groups,
        excludedIds: sources.map((record) => String(record.id)),
        limit: DEFAULT_PAGE_SIZE,
      });

      if (query === null) {
        return empty;
      }

      const { rows } = await context.client.query(query.text, query.values);
      const records = rows.map((row) =>
        hydrateRecord({ shape, alias: shape.nameSingular, row }),
      );

      const edges = records.map((node) => ({
        node,
        cursor: encodeCursor({ id: node.id ?? null }),
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: edges[0]?.cursor ?? null,
          endCursor: edges.at(-1)?.cursor ?? null,
        },
        __countQuery: {
          shape,
          filter: { id: { in: records.map((record) => record.id) } },
        },
      };
    };

    // totalCount is resolved lazily: the count query only runs when the client
    // actually selects the field.
    connectionResolvers[`${singular}GroupByConnection`] = {
      totalCount: (parent: { totalCount: number }) => parent.totalCount,
    };

    connectionResolvers[`${singular}Connection`] = {
      totalCount: async (
        parent: {
          __countQuery: { shape: WorkspaceTableShape; filter?: RecordFilter };
        },
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
      assertAllowed(context, 'update');

      // An upsert may land on an existing row, so an absent position is left
      // absent rather than backfilled over whatever that row already holds.
      const input = await resolveRecordPosition({
        client: context.client,
        shape,
        input: data,
        backfillUndefined: !upsert,
      });

      const result = await runMutation(
        context,
        upsert
          ? buildUpsertQuery({ shape, input })
          : buildInsertQuery({ shape, input }),
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
      // Resolved as one batch so a bulk create keeps the order it was sent
      // in: row by row, every 'last' would read the same boundary back.
      const inputs = await resolveRecordPositions({
        client: context.client,
        shape,
        inputs: args.data,
        backfillUndefined: args.upsert !== true,
      });

      const created = await emTransacao(context.client, async () => {
        const linhas = [];

        for (const data of inputs) {
          linhas.push(await createRecord(context, data, args.upsert === true));
        }

        return linhas;
      });

      return created.filter((record) => record !== null);
    };

    mutation[`update${singular}`] = async (
      _parent: unknown,
      args: { id: string; data: Record<string, unknown> },
      context: RecordResolverContext,
    ) => {
      assertAllowed(context, 'update');

      // Dragging a card to the top or bottom of a kanban column sends the same
      // 'first'/'last' strings an insert does; an untouched position stays
      // untouched, so nothing is backfilled here.
      const input = await resolveRecordPosition({
        client: context.client,
        shape,
        input: args.data,
        backfillUndefined: false,
      });

      const result = await runMutation(
        context,
        buildUpdateQuery({ shape, id: args.id, input }),
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
      assertAllowed(context, 'softDelete');

      // Arquivar o pai e o que é dele é um ato só: pela metade, o painel fica
      // com membro de clube que não existe mais.
      return emTransacao(context.client, async () => {
        const result = await runMutation(
          context,
          buildSoftDeleteQuery({ shape, id: args.id }),
        );

        if (result === null) {
          return null;
        }

        assertPodeArquivarOsFilhos({
          context,
          grafo: grafoDePosse,
          objetoId: object.id,
          objectById,
        });

        await arquivarEmCascata({
          client: context.client,
          grafo: grafoDePosse,
          objetoId: object.id,
          ids: [args.id],
          arquivadoEm: instanteDeArquivamento(result.record['deletedAt']),
        });

        await writeTimelineActivity(context, 'deleted', args.id);

        return result.record;
      });
    };

    mutation[`restore${singular}`] = async (
      _parent: unknown,
      args: { id: string },
      context: RecordResolverContext,
    ) => {
      // Restoring puts a row back where everyone can see it, so it is the
      // delete permission that gates it, not the update one.
      assertAllowed(context, 'softDelete');

      return emTransacao(context.client, async () => {
        // O horário de arquivamento some no próprio restore, e é ele que diz
        // quem saiu junto — por isso é lido antes.
        const { rows } = await context.client.query<{ deletedAt: string | null }>(
          `SELECT ${escapeIdentifier('deletedAt')} FROM ${qualifiedTableName(shape)} WHERE ${escapeIdentifier('id')} = $1`,
          [args.id],
        );
        const arquivadoEm = rows[0]?.deletedAt ?? null;
        const carimbo =
          arquivadoEm === null ? null : instanteDeArquivamento(arquivadoEm);

        const result = await runMutation(
          context,
          buildRestoreQuery({ shape, id: args.id }),
        );

        if (result === null) {
          return null;
        }

        if (carimbo !== null) {
          assertPodeArquivarOsFilhos({
            context,
            grafo: grafoDePosse,
            objetoId: object.id,
            objectById,
          });

          await restaurarEmCascata({
            client: context.client,
            grafo: grafoDePosse,
            objetoId: object.id,
            ids: [args.id],
            arquivadoEm: carimbo,
          });
        }

        await writeTimelineActivity(context, 'restored', args.id);

        return result.record;
      });
    };

    // Merge keeps the first id as the survivor and soft-deletes the rest, after
    // carrying their relations over. dryRun stops before any write: the front
    // uses it to preview the result while the person is still choosing.
    mutation[`merge${pascalCase(object.namePlural)}`] = async (
      _parent: unknown,
      args: {
        ids: string[];
        conflictPriorityIndex: number;
        dryRun?: boolean;
      },
      context: RecordResolverContext,
    ) => {
      assertAllowed(context, 'update');

      if (!(args.dryRun === true)) {
        // Merging destroys information in the losing records, so it needs the
        // delete permission too, not only the write one.
        assertAllowed(context, 'softDelete');
      }

      if (args.ids.length < 2) {
        throw new UserFacingError('Merging needs at least two records');
      }

      const selectQuery = buildSelectQuery({
        shape,
        filter: { id: { in: args.ids } },
        limit: args.ids.length,
      });

      const { rows } = await context.client.query(
        selectQuery.text,
        selectQuery.values,
      );

      const byId = new Map(
        rows.map((row) => {
          const record = hydrateRecord({
            shape,
            alias: shape.nameSingular,
            row,
          });

          return [String(record.id), { record, row }];
        }),
      );

      // In the order the caller gave them: conflictPriorityIndex points into
      // that list, so reordering here would hand the wrong record priority.
      const ordered = args.ids
        .map((id) => byId.get(id))
        .filter(
          (entry): entry is NonNullable<typeof entry> => entry !== undefined,
        );

      if (ordered.length < 2) {
        throw new UserFacingError(
          'Merging needs at least two records that still exist',
        );
      }

      const columnRecords = ordered.map((entry) =>
        Object.fromEntries(
          [...shape.columnShapeByColumnName.values()].map((column) => [
            column.columnName,
            entry.row[`${shape.nameSingular}_${column.columnName}`],
          ]),
        ),
      );

      const merged = mergeRecordValues({
        shape,
        records: columnRecords,
        conflictPriorityIndex: args.conflictPriorityIndex,
      });

      const survivorId = String(ordered[0].record.id);
      const losingIds = ordered
        .slice(1)
        .map((entry) => String(entry.record.id));

      if (args.dryRun === true) {
        return hydrateRecord({
          shape,
          alias: shape.nameSingular,
          row: Object.fromEntries(
            Object.entries({
              ...columnRecords[0],
              ...merged,
              id: survivorId,
            }).map(([columnName, value]) => [
              `${shape.nameSingular}_${columnName}`,
              value,
            ]),
          ),
        });
      }

      // Relations first: a losing record's rows have to find the survivor
      // before the record they point at goes away.
      return emTransacao(context.client, async () => {
        for (const reference of findReferencingColumns({
          metadata: context.metadata,
          objectMetadataId: object.id,
          objectById,
        })) {
          const referenceShape = shapeByObjectId.get(
            context.metadata.objects.find(
              (entry) => entry.nameSingular === reference.tableName,
            )?.id ?? '',
          );

          if (referenceShape === undefined) {
            continue;
          }

          await context.client.query(
            `UPDATE ${escapeIdentifier(referenceShape.schemaName)}.${escapeIdentifier(referenceShape.tableName)}
           SET ${escapeIdentifier(reference.columnName)} = $1
           WHERE ${escapeIdentifier(reference.columnName)} = ANY($2::uuid[])`,
            [survivorId, losingIds],
          );
        }

        const updateResult = await runMutation(
          context,
          buildUpdateQuery({ shape, id: survivorId, input: merged }),
        );

        for (const id of losingIds) {
          await context.client.query(
            ...(() => {
              const query = buildSoftDeleteQuery({ shape, id });

              return [query.text, query.values] as const;
            })(),
          );
        }

        await writeTimelineActivity(context, 'updated', survivorId, {
          mergedFrom: { before: null, after: losingIds },
        });

        return updateResult?.record ?? null;
      });
    };

    // No timeline row for a destroy: the record is gone, so the event would
    // point at nothing and its own cascade would take it with the record.
    mutation[`destroy${singular}`] = async (
      _parent: unknown,
      args: { id: string },
      context: RecordResolverContext,
    ) => {
      assertAllowed(context, 'destroy');

      const result = await runMutation(
        context,
        buildDestroyQuery({ shape, id: args.id }),
      );

      return result === null ? null : result.record;
    };
  }

  query.search = async (
    _parent: unknown,
    args: SearchArguments,
    context: RecordResolverContext,
  ) => {
    const { records, hasNextPage } = await searchRecords({
      client: context.client,
      metadata: context.metadata,
      permissions: context.permissions,
      args,
    });

    const edges = records.map((record) => ({
      node: record,
      cursor: encodeSearchCursor(record),
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage,
        endCursor: edges.at(-1)?.cursor ?? null,
      },
    };
  };

  return {
    Query: query,
    Mutation: mutation,
    ...connectionResolvers,
    ...typeResolvers,
  };
};
