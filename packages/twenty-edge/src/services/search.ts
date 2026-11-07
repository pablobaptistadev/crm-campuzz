import { type Client } from 'pg';

import { escapeIdentifier } from 'src/ddl/escape';
import { SEARCH_VECTOR_COLUMN_NAME } from 'src/ddl/search-vector';
import { type WorkspaceMetadata } from 'src/metadata/types';
import { createParameterBag } from 'src/orm/params';
import { buildWhereClause } from 'src/orm/select';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import { type RecordFilter } from 'src/orm/where';
import { canPerform, type WorkspacePermissions } from 'src/services/permissions';

export type SearchRecord = {
  recordId: string;
  objectNameSingular: string;
  objectLabelSingular: string;
  label: string;
  imageUrl: string | null;
  tsRank: number;
  tsRankCD: number;
};

export type SearchArguments = {
  searchInput: string;
  limit: number;
  after?: string | null;
  includedObjectNameSingulars?: string[] | null;
  excludedObjectNameSingulars?: string[] | null;
  filter?: RecordFilter | null;
};

const MAX_SEARCH_LIMIT = 100;

// Postgres' tsquery syntax is an expression language, so a raw search box would
// be a parse error waiting to happen (and `&` or `!` would mean something the
// person did not intend). Every token becomes a prefix match instead, which is
// what "search as you type" needs.
export const buildTsQuery = (searchInput: string): string | null => {
  const tokens = searchInput
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .map((token) => `${token}:*`);

  return tokens.length === 0 ? null : tokens.join(' & ');
};

// The cursor carries the rank it left off at plus the record id, so paging is
// keyset here too: an offset would re-read everything on every keystroke.
const decodeAfter = (
  after: string | null | undefined,
): { tsRank: number; recordId: string } | null => {
  if (after === null || after === undefined || after.length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(atob(after));

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { tsRank?: unknown }).tsRank !== 'number' ||
      typeof (parsed as { recordId?: unknown }).recordId !== 'string'
    ) {
      return null;
    }

    return parsed as { tsRank: number; recordId: string };
  } catch {
    return null;
  }
};

export const encodeSearchCursor = (record: {
  tsRank: number;
  recordId: string;
}): string => btoa(JSON.stringify({ tsRank: record.tsRank, recordId: record.recordId }));

type SearchRow = {
  recordId: string;
  objectNameSingular: string;
  label: string | null;
  imageUrl: string | null;
  tsRank: string | number;
  tsRankCD: string | number;
};

export const searchRecords = async ({
  client,
  metadata,
  permissions,
  args,
}: {
  client: Client;
  metadata: WorkspaceMetadata;
  permissions: WorkspacePermissions;
  args: SearchArguments;
}): Promise<{ records: SearchRecord[]; hasNextPage: boolean }> => {
  const tsQuery = buildTsQuery(args.searchInput);

  if (tsQuery === null) {
    return { records: [], hasNextPage: false };
  }

  const included = new Set(args.includedObjectNameSingulars ?? []);
  const excluded = new Set(args.excludedObjectNameSingulars ?? []);

  const objects = metadata.objects.filter((object) => {
    if (!object.isActive || object.isSystem) {
      return false;
    }

    if (excluded.has(object.nameSingular)) {
      return false;
    }

    // Search reaches every table at once, which makes it the easiest way to
    // read rows a role cannot see. An object without read permission is simply
    // not one of the tables the UNION covers.
    if (
      !canPerform({
        permissions,
        objectMetadataId: object.id,
        action: 'read',
      })
    ) {
      return false;
    }

    return included.size === 0 || included.has(object.nameSingular);
  });

  if (objects.length === 0) {
    return { records: [], hasNextPage: false };
  }

  const limit = Math.min(Math.max(args.limit, 1), MAX_SEARCH_LIMIT);
  const cursor = decodeAfter(args.after);
  const parameters = createParameterBag();
  // The index stores unaccented text, so the query has to be folded the same
  // way — otherwise typing the accent finds nothing while omitting it works.
  const queryParameter = `public.unaccent_immutable(${parameters.add(tsQuery)})`;
  const selects: string[] = [];
  const labelByObjectNameSingular = new Map<string, string>();

  for (const object of objects) {
    const shape = buildWorkspaceTableShape({
      object,
      workspaceId: metadata.workspaceId,
    });

    if (!shape.columnShapeByColumnName.has('id')) {
      continue;
    }

    const labelField = object.fields.find(
      (field) => field.id === object.labelIdentifierFieldMetadataId,
    );

    // Composites flatten into several columns, so the display label is
    // assembled the same way the front would render it.
    const labelColumnNames =
      labelField === undefined
        ? []
        : [...shape.columnShapeByColumnName.values()]
            .filter(
              (column) =>
                (column.compositeParentFieldName ?? column.fieldName) ===
                labelField.name,
            )
            .map((column) => column.columnName);

    const labelExpression =
      labelColumnNames.length === 0
        ? `''`
        : `btrim(${labelColumnNames
            .map((name) => `coalesce(${escapeIdentifier(name)}::text, '')`)
            .join(` || ' ' || `)})`;

    const imageExpression = shape.columnShapeByColumnName.has('avatarUrl')
      ? escapeIdentifier('avatarUrl')
      : `NULL::text`;

    const vector = escapeIdentifier(SEARCH_VECTOR_COLUMN_NAME);
    const conditions = [
      `${vector} @@ to_tsquery('simple', ${queryParameter})`,
    ];

    if (shape.hasDeletedAtColumn) {
      conditions.push(`${escapeIdentifier('deletedAt')} IS NULL`);
    }

    // The front passes the same filter it would send to the record list, so the
    // command menu can be scoped to what the current view is showing.
    const extraCondition =
      args.filter === null || args.filter === undefined
        ? null
        : buildWhereClause({
            shape,
            alias: shape.tableName,
            filter: args.filter,
            parameters,
          });

    if (extraCondition !== null) {
      conditions.push(extraCondition);
    }

    labelByObjectNameSingular.set(object.nameSingular, object.labelSingular);

    selects.push(
      `SELECT ${escapeIdentifier('id')} AS "recordId",
              ${parameters.add(object.nameSingular)} AS "objectNameSingular",
              ${labelExpression} AS "label",
              ${imageExpression} AS "imageUrl",
              ts_rank(${vector}, to_tsquery('simple', ${queryParameter})) AS "tsRank",
              ts_rank_cd(${vector}, to_tsquery('simple', ${queryParameter})) AS "tsRankCD"
       FROM ${escapeIdentifier(shape.schemaName)}.${escapeIdentifier(shape.tableName)} AS ${escapeIdentifier(shape.tableName)}
       WHERE ${conditions.join(' AND ')}`,
    );
  }

  if (selects.length === 0) {
    return { records: [], hasNextPage: false };
  }

  const cursorCondition =
    cursor === null
      ? ''
      : `WHERE ("tsRank", "recordId") < (${parameters.add(cursor.tsRank)}::real, ${parameters.add(cursor.recordId)}::uuid)`;

  // One row more than asked for: that extra row is the only honest answer to
  // hasNextPage without a second count.
  const { text, values } = parameters.compile(
    `SELECT * FROM (${selects.join(' UNION ALL ')}) AS "results"
     ${cursorCondition}
     ORDER BY "tsRank" DESC, "recordId" DESC
     LIMIT ${parameters.add(limit + 1)}`,
  );

  const { rows } = await client.query<SearchRow>(text, values);
  const hasNextPage = rows.length > limit;

  return {
    hasNextPage,
    records: rows.slice(0, limit).map((row) => ({
      recordId: row.recordId,
      objectNameSingular: row.objectNameSingular,
      objectLabelSingular:
        labelByObjectNameSingular.get(row.objectNameSingular) ??
        row.objectNameSingular,
      label:
        row.label === null || row.label.length === 0 ? 'Untitled' : row.label,
      imageUrl: row.imageUrl,
      tsRank: Number(row.tsRank),
      tsRankCD: Number(row.tsRankCD),
    })),
  };
};
