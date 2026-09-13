import { type Client } from 'pg';

export type ViewRow = {
  id: string;
  name: string;
  type: string;
  key: string | null;
  icon: string | null;
  position: number;
  objectMetadataId: string;
  isCompact: boolean;
  kanbanAggregateOperation: string | null;
  kanbanAggregateOperationFieldMetadataId: string | null;
  mainGroupByFieldMetadataId: string | null;
  shouldHideEmptyGroups: boolean;
  kanbanColumnWidth: number | null;
  anyFieldFilterValue: string | null;
  calendarFieldMetadataId: string | null;
  calendarEndFieldMetadataId: string | null;
  calendarLayout: string | null;
  visibility: string;
};

export type ViewFieldRow = {
  id: string;
  viewId: string;
  fieldMetadataId: string;
  isVisible: boolean;
  position: number;
  size: number;
  aggregateOperation: string | null;
  viewFieldGroupId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ViewFilterRow = {
  id: string;
  viewId: string;
  fieldMetadataId: string;
  operand: string;
  value: unknown;
  viewFilterGroupId: string | null;
  positionInViewFilterGroup: number | null;
  subFieldName: string | null;
  relationTargetFieldMetadataId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ViewSortRow = {
  id: string;
  viewId: string;
  fieldMetadataId: string;
  direction: string;
  subFieldName: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ViewGroupRow = {
  id: string;
  viewId: string;
  fieldValue: string;
  isVisible: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ViewFilterGroupRow = {
  id: string;
  viewId: string;
  parentViewFilterGroupId: string | null;
  logicalOperator: string;
  positionInViewFilterGroup: number | null;
};

export type ViewFieldGroupRow = {
  id: string;
  viewId: string;
  name: string;
  position: number;
  isVisible: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ViewChildren = {
  fieldsByViewId: Map<string, ViewFieldRow[]>;
  filtersByViewId: Map<string, ViewFilterRow[]>;
  sortsByViewId: Map<string, ViewSortRow[]>;
  groupsByViewId: Map<string, ViewGroupRow[]>;
  filterGroupsByViewId: Map<string, ViewFilterGroupRow[]>;
  fieldGroupsByViewId: Map<string, ViewFieldGroupRow[]>;
};

const VIEW_COLUMNS = `"id","name","type","key","icon","position","objectMetadataId",
  "isCompact","kanbanAggregateOperation","kanbanAggregateOperationFieldMetadataId",
  "mainGroupByFieldMetadataId","shouldHideEmptyGroups","kanbanColumnWidth",
  "anyFieldFilterValue","calendarFieldMetadataId","calendarEndFieldMetadataId",
  "calendarLayout","visibility"`;

export const findViews = async ({
  client,
  workspaceId,
  viewTypes,
}: {
  client: Client;
  workspaceId: string;
  viewTypes?: string[] | null;
}): Promise<ViewRow[]> => {
  const { rows } = await client.query<ViewRow>(
    `SELECT ${VIEW_COLUMNS}
     FROM core."view"
     WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
       AND ($2::text[] IS NULL OR "type" = ANY($2))
     ORDER BY "position" ASC`,
    [workspaceId, viewTypes ?? null],
  );

  return rows;
};

const groupByViewId = <TRow extends { viewId: string }>(
  rows: TRow[],
): Map<string, TRow[]> => {
  const byViewId = new Map<string, TRow[]>();

  for (const row of rows) {
    const existing = byViewId.get(row.viewId);

    if (existing === undefined) {
      byViewId.set(row.viewId, [row]);
      continue;
    }

    existing.push(row);
  }

  return byViewId;
};

// Six statements in parallel rather than six per view: the front asks for every
// view at boot, and each statement crosses to the database region.
export const loadViewChildren = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<ViewChildren> => {
  const [fields, filters, sorts, groups, filterGroups, fieldGroups] =
    await Promise.all([
      client.query<ViewFieldRow>(
        `SELECT "id","viewId","fieldMetadataId","isVisible","position","size",
                "aggregateOperation","viewFieldGroupId","isActive","createdAt","updatedAt","deletedAt"
         FROM core."viewField"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
         ORDER BY "position" ASC`,
        [workspaceId],
      ),
      client.query<ViewFilterRow>(
        `SELECT "id","viewId","fieldMetadataId","operand","value","viewFilterGroupId",
                "positionInViewFilterGroup","subFieldName","relationTargetFieldMetadataId",
                "createdAt","updatedAt","deletedAt"
         FROM core."viewFilter"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
        [workspaceId],
      ),
      client.query<ViewSortRow>(
        `SELECT "id","viewId","fieldMetadataId","direction","subFieldName",
                "createdAt","updatedAt","deletedAt"
         FROM core."viewSort"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
        [workspaceId],
      ),
      client.query<ViewGroupRow>(
        `SELECT "id","viewId","fieldValue","isVisible","position",
                "createdAt","updatedAt","deletedAt"
         FROM core."viewGroup"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
         ORDER BY "position" ASC`,
        [workspaceId],
      ),
      client.query<ViewFilterGroupRow>(
        `SELECT "id","viewId","parentViewFilterGroupId","logicalOperator","positionInViewFilterGroup"
         FROM core."viewFilterGroup"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
        [workspaceId],
      ),
      client.query<ViewFieldGroupRow>(
        `SELECT "id","viewId","name","position","isVisible","isActive",
                "createdAt","updatedAt","deletedAt"
         FROM core."viewFieldGroup"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
         ORDER BY "position" ASC`,
        [workspaceId],
      ),
    ]);

  return {
    fieldsByViewId: groupByViewId(fields.rows),
    filtersByViewId: groupByViewId(filters.rows),
    sortsByViewId: groupByViewId(sorts.rows),
    groupsByViewId: groupByViewId(groups.rows),
    filterGroupsByViewId: groupByViewId(filterGroups.rows),
    fieldGroupsByViewId: groupByViewId(fieldGroups.rows),
  };
};

// Every view starts with one row per field of its object. Twenty seeds these at
// view creation too: a view with no viewFields renders a table with no columns.
export const seedViewFields = async ({
  client,
  workspaceId,
  viewId,
  fields,
  visibleCount,
}: {
  client: Client;
  workspaceId: string;
  viewId: string;
  fields: { id: string }[];
  visibleCount: number;
}): Promise<void> => {
  if (fields.length === 0) {
    return;
  }

  const values: unknown[] = [workspaceId, viewId];
  const tuples: string[] = [];

  for (const [index, field] of fields.entries()) {
    const base = values.length;

    values.push(field.id, index < visibleCount, index);
    tuples.push(`($1,$2,$${base + 1},$${base + 2},$${base + 3})`);
  }

  await client.query(
    `INSERT INTO core."viewField" ("workspaceId","viewId","fieldMetadataId","isVisible","position")
     VALUES ${tuples.join(',')}
     ON CONFLICT DO NOTHING`,
    values,
  );
};
