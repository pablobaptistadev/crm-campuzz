import { type Client, type QueryResultRow } from 'pg';

import {
  type ViewFieldRow,
  type ViewFilterGroupRow,
  type ViewFilterRow,
  type ViewGroupRow,
  type ViewRow,
} from 'src/db/core/view-repository';

// Twenty exposes three ways to remove one of these: delete marks deletedAt,
// destroy removes the row, and a view's children go with it either way. The
// front calls both, so both exist here rather than one pretending to be two.
type ViewChildTable =
  | 'viewField'
  | 'viewFilter'
  | 'viewSort'
  | 'viewGroup'
  | 'viewFilterGroup'
  | 'viewFieldGroup';

const RETURNING_BY_TABLE: Record<ViewChildTable, string> = {
  viewField: `"id","viewId","fieldMetadataId","isVisible","position","size","aggregateOperation","viewFieldGroupId","isActive","createdAt","updatedAt","deletedAt"`,
  viewFilter: `"id","viewId","fieldMetadataId","operand","value","viewFilterGroupId","positionInViewFilterGroup","subFieldName","relationTargetFieldMetadataId","createdAt","updatedAt","deletedAt"`,
  viewSort: `"id","viewId","fieldMetadataId","direction","subFieldName","createdAt","updatedAt","deletedAt"`,
  viewGroup: `"id","viewId","fieldValue","isVisible","position","createdAt","updatedAt","deletedAt"`,
  viewFilterGroup: `"id","viewId","parentViewFilterGroupId","logicalOperator","positionInViewFilterGroup"`,
  viewFieldGroup: `"id","viewId","name","position","isVisible","isActive","createdAt","updatedAt","deletedAt"`,
};

const requireOwnedRow = <TRow>(row: TRow | undefined, table: string): TRow => {
  if (row === undefined) {
    throw new Error(`${table.toUpperCase()}_NOT_FOUND`);
  }

  return row;
};

export const softDeleteViewChild = async <TRow extends QueryResultRow>({
  client,
  workspaceId,
  table,
  id,
}: {
  client: Client;
  workspaceId: string;
  table: ViewChildTable;
  id: string;
}): Promise<TRow> => {
  const { rows } = await client.query<TRow>(
    `UPDATE core."${table}" SET "deletedAt" = now(), "updatedAt" = now()
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
     RETURNING ${RETURNING_BY_TABLE[table]}`,
    [id, workspaceId],
  );

  return requireOwnedRow(rows[0], table);
};

export const destroyViewChild = async <TRow extends QueryResultRow>({
  client,
  workspaceId,
  table,
  id,
}: {
  client: Client;
  workspaceId: string;
  table: ViewChildTable;
  id: string;
}): Promise<TRow> => {
  const { rows } = await client.query<TRow>(
    `DELETE FROM core."${table}"
     WHERE "id" = $1 AND "workspaceId" = $2
     RETURNING ${RETURNING_BY_TABLE[table]}`,
    [id, workspaceId],
  );

  return requireOwnedRow(rows[0], table);
};

export type CreateViewFieldInput = {
  id?: string | null;
  viewId: string;
  fieldMetadataId: string;
  isVisible?: boolean | null;
  position?: number | null;
  size?: number | null;
  aggregateOperation?: string | null;
  viewFieldGroupId?: string | null;
};

export const createViewFields = async ({
  client,
  workspaceId,
  inputs,
}: {
  client: Client;
  workspaceId: string;
  inputs: CreateViewFieldInput[];
}): Promise<ViewFieldRow[]> => {
  const created: ViewFieldRow[] = [];

  for (const input of inputs) {
    const { rows } = await client.query<ViewFieldRow>(
      `INSERT INTO core."viewField"
         ("id","workspaceId","viewId","fieldMetadataId","isVisible","position","size","aggregateOperation","viewFieldGroupId")
       VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,COALESCE($5,true),COALESCE($6,0),COALESCE($7,150),$8,$9)
       ON CONFLICT ("viewId","fieldMetadataId") WHERE "deletedAt" IS NULL
       DO UPDATE SET "isVisible" = EXCLUDED."isVisible",
                     "position" = EXCLUDED."position",
                     "size" = EXCLUDED."size",
                     "updatedAt" = now()
       RETURNING ${RETURNING_BY_TABLE.viewField}`,
      [
        input.id ?? null,
        workspaceId,
        input.viewId,
        input.fieldMetadataId,
        input.isVisible ?? null,
        input.position ?? null,
        input.size ?? null,
        input.aggregateOperation ?? null,
        input.viewFieldGroupId ?? null,
      ],
    );

    created.push(rows[0]);
  }

  return created;
};

export const updateViewField = async ({
  client,
  workspaceId,
  id,
  update,
}: {
  client: Client;
  workspaceId: string;
  id: string;
  update: {
    isVisible?: boolean | null;
    position?: number | null;
    size?: number | null;
    aggregateOperation?: string | null;
    viewFieldGroupId?: string | null;
  };
}): Promise<ViewFieldRow> => {
  const { rows } = await client.query<ViewFieldRow>(
    `UPDATE core."viewField"
     SET "isVisible" = COALESCE($3, "isVisible"),
         "position" = COALESCE($4, "position"),
         "size" = COALESCE($5, "size"),
         "aggregateOperation" = COALESCE($6, "aggregateOperation"),
         "viewFieldGroupId" = COALESCE($7, "viewFieldGroupId"),
         "updatedAt" = now()
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
     RETURNING ${RETURNING_BY_TABLE.viewField}`,
    [
      id,
      workspaceId,
      update.isVisible ?? null,
      update.position ?? null,
      update.size ?? null,
      update.aggregateOperation ?? null,
      update.viewFieldGroupId ?? null,
    ],
  );

  return requireOwnedRow(rows[0], 'viewField');
};

export type CreateViewFilterInput = {
  id?: string | null;
  viewId: string;
  fieldMetadataId: string;
  operand?: string | null;
  value: unknown;
  viewFilterGroupId?: string | null;
  positionInViewFilterGroup?: number | null;
  subFieldName?: string | null;
  relationTargetFieldMetadataId?: string | null;
};

export const createViewFilter = async ({
  client,
  workspaceId,
  input,
}: {
  client: Client;
  workspaceId: string;
  input: CreateViewFilterInput;
}): Promise<ViewFilterRow> => {
  const { rows } = await client.query<ViewFilterRow>(
    `INSERT INTO core."viewFilter"
       ("id","workspaceId","viewId","fieldMetadataId","operand","value","viewFilterGroupId","positionInViewFilterGroup","subFieldName","relationTargetFieldMetadataId")
     VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,COALESCE($5,'is'),$6,$7,$8,$9,$10)
     RETURNING ${RETURNING_BY_TABLE.viewFilter}`,
    [
      input.id ?? null,
      workspaceId,
      input.viewId,
      input.fieldMetadataId,
      input.operand ?? null,
      JSON.stringify(input.value ?? null),
      input.viewFilterGroupId ?? null,
      input.positionInViewFilterGroup ?? null,
      input.subFieldName ?? null,
      input.relationTargetFieldMetadataId ?? null,
    ],
  );

  return rows[0];
};

export const updateViewFilter = async ({
  client,
  workspaceId,
  id,
  update,
}: {
  client: Client;
  workspaceId: string;
  id: string;
  update: {
    fieldMetadataId?: string | null;
    operand?: string | null;
    value?: unknown;
    viewFilterGroupId?: string | null;
    positionInViewFilterGroup?: number | null;
    subFieldName?: string | null;
    relationTargetFieldMetadataId?: string | null;
  };
}): Promise<ViewFilterRow> => {
  const { rows } = await client.query<ViewFilterRow>(
    `UPDATE core."viewFilter"
     SET "fieldMetadataId" = COALESCE($3, "fieldMetadataId"),
         "operand" = COALESCE($4, "operand"),
         "value" = COALESCE($5::jsonb, "value"),
         "viewFilterGroupId" = COALESCE($6, "viewFilterGroupId"),
         "positionInViewFilterGroup" = COALESCE($7, "positionInViewFilterGroup"),
         "subFieldName" = COALESCE($8, "subFieldName"),
         "relationTargetFieldMetadataId" = COALESCE($9, "relationTargetFieldMetadataId"),
         "updatedAt" = now()
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
     RETURNING ${RETURNING_BY_TABLE.viewFilter}`,
    [
      id,
      workspaceId,
      update.fieldMetadataId ?? null,
      update.operand ?? null,
      update.value === undefined ? null : JSON.stringify(update.value),
      update.viewFilterGroupId ?? null,
      update.positionInViewFilterGroup ?? null,
      update.subFieldName ?? null,
      update.relationTargetFieldMetadataId ?? null,
    ],
  );

  return requireOwnedRow(rows[0], 'viewFilter');
};

export const createViewSort = async ({
  client,
  workspaceId,
  input,
}: {
  client: Client;
  workspaceId: string;
  input: {
    id?: string | null;
    viewId: string;
    fieldMetadataId: string;
    direction?: string | null;
    subFieldName?: string | null;
  };
}) => {
  const { rows } = await client.query(
    `INSERT INTO core."viewSort" ("id","workspaceId","viewId","fieldMetadataId","direction","subFieldName")
     VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,COALESCE($5,'asc'),$6)
     RETURNING ${RETURNING_BY_TABLE.viewSort}`,
    [
      input.id ?? null,
      workspaceId,
      input.viewId,
      input.fieldMetadataId,
      input.direction ?? null,
      input.subFieldName ?? null,
    ],
  );

  return rows[0];
};

export const updateViewSort = async ({
  client,
  workspaceId,
  id,
  update,
}: {
  client: Client;
  workspaceId: string;
  id: string;
  update: { direction?: string | null; subFieldName?: string | null };
}) => {
  const { rows } = await client.query(
    `UPDATE core."viewSort"
     SET "direction" = COALESCE($3, "direction"),
         "subFieldName" = COALESCE($4, "subFieldName"),
         "updatedAt" = now()
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
     RETURNING ${RETURNING_BY_TABLE.viewSort}`,
    [id, workspaceId, update.direction ?? null, update.subFieldName ?? null],
  );

  return requireOwnedRow(rows[0], 'viewSort');
};

export const createViewGroups = async ({
  client,
  workspaceId,
  inputs,
}: {
  client: Client;
  workspaceId: string;
  inputs: {
    id?: string | null;
    viewId: string;
    fieldValue: string;
    isVisible?: boolean | null;
    position?: number | null;
  }[];
}): Promise<ViewGroupRow[]> => {
  const created: ViewGroupRow[] = [];

  for (const input of inputs) {
    const { rows } = await client.query<ViewGroupRow>(
      `INSERT INTO core."viewGroup" ("id","workspaceId","viewId","fieldValue","isVisible","position")
       VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,COALESCE($5,true),COALESCE($6,0))
       RETURNING ${RETURNING_BY_TABLE.viewGroup}`,
      [
        input.id ?? null,
        workspaceId,
        input.viewId,
        input.fieldValue,
        input.isVisible ?? null,
        input.position ?? null,
      ],
    );

    created.push(rows[0]);
  }

  return created;
};

export const updateViewGroups = async ({
  client,
  workspaceId,
  inputs,
}: {
  client: Client;
  workspaceId: string;
  inputs: {
    id: string;
    update: {
      fieldValue?: string | null;
      isVisible?: boolean | null;
      position?: number | null;
    };
  }[];
}): Promise<ViewGroupRow[]> => {
  const updated: ViewGroupRow[] = [];

  for (const input of inputs) {
    const { rows } = await client.query<ViewGroupRow>(
      `UPDATE core."viewGroup"
       SET "fieldValue" = COALESCE($3, "fieldValue"),
           "isVisible" = COALESCE($4, "isVisible"),
           "position" = COALESCE($5, "position"),
           "updatedAt" = now()
       WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
       RETURNING ${RETURNING_BY_TABLE.viewGroup}`,
      [
        input.id,
        workspaceId,
        input.update.fieldValue ?? null,
        input.update.isVisible ?? null,
        input.update.position ?? null,
      ],
    );

    updated.push(requireOwnedRow(rows[0], 'viewGroup'));
  }

  return updated;
};

export const createViewFilterGroup = async ({
  client,
  workspaceId,
  input,
}: {
  client: Client;
  workspaceId: string;
  input: {
    id?: string | null;
    viewId: string;
    parentViewFilterGroupId?: string | null;
    logicalOperator?: string | null;
    positionInViewFilterGroup?: number | null;
  };
}): Promise<ViewFilterGroupRow> => {
  const { rows } = await client.query<ViewFilterGroupRow>(
    `INSERT INTO core."viewFilterGroup"
       ("id","workspaceId","viewId","parentViewFilterGroupId","logicalOperator","positionInViewFilterGroup")
     VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,COALESCE($5,'AND'),$6)
     RETURNING ${RETURNING_BY_TABLE.viewFilterGroup}`,
    [
      input.id ?? null,
      workspaceId,
      input.viewId,
      input.parentViewFilterGroupId ?? null,
      input.logicalOperator ?? null,
      input.positionInViewFilterGroup ?? null,
    ],
  );

  return rows[0];
};

export const updateViewFilterGroup = async ({
  client,
  workspaceId,
  input,
}: {
  client: Client;
  workspaceId: string;
  input: {
    id: string;
    parentViewFilterGroupId?: string | null;
    logicalOperator?: string | null;
    positionInViewFilterGroup?: number | null;
  };
}): Promise<ViewFilterGroupRow> => {
  const { rows } = await client.query<ViewFilterGroupRow>(
    `UPDATE core."viewFilterGroup"
     SET "parentViewFilterGroupId" = COALESCE($3, "parentViewFilterGroupId"),
         "logicalOperator" = COALESCE($4, "logicalOperator"),
         "positionInViewFilterGroup" = COALESCE($5, "positionInViewFilterGroup"),
         "updatedAt" = now()
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
     RETURNING ${RETURNING_BY_TABLE.viewFilterGroup}`,
    [
      input.id,
      workspaceId,
      input.parentViewFilterGroupId ?? null,
      input.logicalOperator ?? null,
      input.positionInViewFilterGroup ?? null,
    ],
  );

  return requireOwnedRow(rows[0], 'viewFilterGroup');
};

export type ViewSettingsInput = {
  name?: string | null;
  icon?: string | null;
  type?: string | null;
  key?: string | null;
  position?: number | null;
  isCompact?: boolean | null;
  kanbanAggregateOperation?: string | null;
  kanbanAggregateOperationFieldMetadataId?: string | null;
  mainGroupByFieldMetadataId?: string | null;
  shouldHideEmptyGroups?: boolean | null;
  kanbanColumnWidth?: number | null;
  anyFieldFilterValue?: string | null;
  calendarFieldMetadataId?: string | null;
  calendarEndFieldMetadataId?: string | null;
  calendarLayout?: string | null;
  visibility?: string | null;
};

const VIEW_RETURNING = `"id","name","type","key","icon","position","objectMetadataId",
  "isCompact","kanbanAggregateOperation","kanbanAggregateOperationFieldMetadataId",
  "mainGroupByFieldMetadataId","shouldHideEmptyGroups","kanbanColumnWidth",
  "anyFieldFilterValue","calendarFieldMetadataId","calendarEndFieldMetadataId",
  "calendarLayout","visibility"`;

export const insertView = async ({
  client,
  workspaceId,
  input,
}: {
  client: Client;
  workspaceId: string;
  input: ViewSettingsInput & { id?: string | null; objectMetadataId: string };
}): Promise<ViewRow> => {
  const { rows } = await client.query<ViewRow>(
    `INSERT INTO core."view"
       ("id","workspaceId","objectMetadataId","name","type","key","icon","position","isCompact","visibility")
     VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,COALESCE($5,'TABLE'),$6,$7,COALESCE($8,0),COALESCE($9,false),COALESCE($10,'WORKSPACE'))
     RETURNING ${VIEW_RETURNING}`,
    [
      input.id ?? null,
      workspaceId,
      input.objectMetadataId,
      input.name ?? 'Untitled',
      input.type ?? null,
      input.key ?? null,
      input.icon ?? null,
      input.position ?? null,
      input.isCompact ?? null,
      input.visibility ?? null,
    ],
  );

  return rows[0];
};

export const updateViewSettings = async ({
  client,
  workspaceId,
  id,
  input,
}: {
  client: Client;
  workspaceId: string;
  id: string;
  input: ViewSettingsInput;
}): Promise<ViewRow> => {
  const { rows } = await client.query<ViewRow>(
    `UPDATE core."view"
     SET "name" = COALESCE($3, "name"),
         "icon" = COALESCE($4, "icon"),
         "type" = COALESCE($5, "type"),
         "position" = COALESCE($6, "position"),
         "isCompact" = COALESCE($7, "isCompact"),
         "kanbanAggregateOperation" = COALESCE($8, "kanbanAggregateOperation"),
         "kanbanAggregateOperationFieldMetadataId" = COALESCE($9, "kanbanAggregateOperationFieldMetadataId"),
         "mainGroupByFieldMetadataId" = COALESCE($10, "mainGroupByFieldMetadataId"),
         "shouldHideEmptyGroups" = COALESCE($11, "shouldHideEmptyGroups"),
         "kanbanColumnWidth" = COALESCE($12, "kanbanColumnWidth"),
         -- The "any field" search box clears itself, so an empty string has to
         -- overwrite rather than be treated as "leave it alone".
         "anyFieldFilterValue" = CASE WHEN $13::text IS NULL THEN "anyFieldFilterValue" ELSE NULLIF($13, '') END,
         "calendarFieldMetadataId" = COALESCE($14, "calendarFieldMetadataId"),
         "calendarEndFieldMetadataId" = COALESCE($15, "calendarEndFieldMetadataId"),
         "calendarLayout" = COALESCE($16, "calendarLayout"),
         "visibility" = COALESCE($17, "visibility"),
         "updatedAt" = now()
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
     RETURNING ${VIEW_RETURNING}`,
    [
      id,
      workspaceId,
      input.name ?? null,
      input.icon ?? null,
      input.type ?? null,
      input.position ?? null,
      input.isCompact ?? null,
      input.kanbanAggregateOperation ?? null,
      input.kanbanAggregateOperationFieldMetadataId ?? null,
      input.mainGroupByFieldMetadataId ?? null,
      input.shouldHideEmptyGroups ?? null,
      input.kanbanColumnWidth ?? null,
      input.anyFieldFilterValue ?? null,
      input.calendarFieldMetadataId ?? null,
      input.calendarEndFieldMetadataId ?? null,
      input.calendarLayout ?? null,
      input.visibility ?? null,
    ],
  );

  return requireOwnedRow(rows[0], 'view');
};

export const destroyView = async ({
  client,
  workspaceId,
  id,
}: {
  client: Client;
  workspaceId: string;
  id: string;
}): Promise<boolean> => {
  const { rowCount } = await client.query(
    `DELETE FROM core."view" WHERE "id" = $1 AND "workspaceId" = $2`,
    [id, workspaceId],
  );

  return (rowCount ?? 0) > 0;
};

export const softDeleteView = async ({
  client,
  workspaceId,
  id,
}: {
  client: Client;
  workspaceId: string;
  id: string;
}): Promise<ViewRow> => {
  const { rows } = await client.query<ViewRow>(
    `UPDATE core."view" SET "deletedAt" = now(), "updatedAt" = now()
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
     RETURNING ${VIEW_RETURNING}`,
    [id, workspaceId],
  );

  return requireOwnedRow(rows[0], 'view');
};
