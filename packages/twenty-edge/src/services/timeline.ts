import { type Client } from 'pg';

import { escapeIdentifier } from 'src/ddl/escape';
import { getWorkspaceSchemaName } from 'src/metadata/naming';
import {
  type FlatObjectMetadata,
  type WorkspaceMetadata,
} from 'src/metadata/types';
import { type WorkspaceTableShape } from 'src/orm/table-shape';

export type TimelineAction = 'created' | 'updated' | 'deleted' | 'restored';

// Mirrors TIMELINE_ACTIVITY_TYPES in the metadata schema. The front matches a
// row to its type by universalIdentifier, so the two lists have to agree.
const TIMELINE_TYPE_BY_ACTION: Record<
  TimelineAction,
  { id: string; label: string; icon: string }
> = {
  created: {
    id: '00000000-0000-4000-8000-0000000000c1',
    label: 'Criado',
    icon: 'IconPlus',
  },
  updated: {
    id: '00000000-0000-4000-8000-0000000000c2',
    label: 'Atualizado',
    icon: 'IconPencil',
  },
  deleted: {
    id: '00000000-0000-4000-8000-0000000000c3',
    label: 'Excluído',
    icon: 'IconTrash',
  },
  restored: {
    id: '00000000-0000-4000-8000-0000000000c4',
    label: 'Restaurado',
    icon: 'IconRestore',
  },
};

export type FieldDiff = Record<string, { before: unknown; after: unknown }>;

const isSameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

// Only the fields the caller actually wrote can have changed, and the front
// keys the diff by GraphQL field name — so composites compare whole, not
// column by column.
export const computeFieldDiff = ({
  shape,
  input,
  before,
  after,
}: {
  shape: WorkspaceTableShape;
  input: Record<string, unknown>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): FieldDiff => {
  const diff: FieldDiff = {};

  for (const key of Object.keys(input)) {
    const isKnownField =
      shape.columnShapeByColumnName.has(key) ||
      [...shape.columnShapeByColumnName.values()].some(
        (column) => column.compositeParentFieldName === key,
      );

    if (!isKnownField) {
      continue;
    }

    if (isSameValue(before[key], after[key])) {
      continue;
    }

    diff[key] = { before: before[key] ?? null, after: after[key] ?? null };
  }

  return diff;
};

// Which join column on timelineActivity points at the record this event is
// about. A record with no morph target of its own gets no timeline row rather
// than an orphan one nothing can ever read back.
const findTargetColumnName = ({
  metadata,
  object,
}: {
  metadata: WorkspaceMetadata;
  object: FlatObjectMetadata;
}): string | null => {
  const timelineObject = metadata.objects.find(
    (entry) => entry.nameSingular === 'timelineActivity',
  );

  if (timelineObject === undefined) {
    return null;
  }

  const targetField = timelineObject.fields.find(
    (field) => field.type === 'MORPH_RELATION' && field.name === 'target',
  );

  const morphTargets = targetField?.settings?.morphTargets ?? [];

  const target = morphTargets.find(
    (entry) => entry.nameSingular === object.nameSingular,
  );

  return target === undefined
    ? null
    : `target${object.nameSingular
        .charAt(0)
        .toUpperCase()}${object.nameSingular.slice(1)}Id`;
};

// One statement: the author is resolved by sub-select rather than by a second
// round trip, and a workspace with no member row for this user still records
// the event with a null author instead of losing it.
export const recordTimelineActivity = async ({
  client,
  metadata,
  object,
  action,
  recordId,
  userId,
  diff,
}: {
  client: Client;
  metadata: WorkspaceMetadata;
  object: FlatObjectMetadata;
  action: TimelineAction;
  recordId: string;
  userId: string | null;
  diff?: FieldDiff;
}): Promise<void> => {
  const targetColumnName = findTargetColumnName({ metadata, object });

  if (targetColumnName === null) {
    return;
  }

  const schemaName = escapeIdentifier(
    getWorkspaceSchemaName(metadata.workspaceId),
  );
  const activityType = TIMELINE_TYPE_BY_ACTION[action];

  const snapshot = {
    id: activityType.id,
    universalIdentifier: activityType.id,
    name: action,
    label: activityType.label,
    action,
    icon: activityType.icon,
    objectUniversalIdentifier: null,
    frontComponentUniversalIdentifier: null,
  };

  await client.query(
    `INSERT INTO ${schemaName}."timelineActivity"
       ("name","properties","happensAt","timelineActivityTypeId",
        "timelineActivityTypeSnapshot","workspaceMemberId",${escapeIdentifier(targetColumnName)})
     VALUES ($1, $2, now(), $3, $4,
       (SELECT "id" FROM ${schemaName}."workspaceMember"
        WHERE "userId" = $5 AND "deletedAt" IS NULL LIMIT 1),
       $6)`,
    [
      action,
      JSON.stringify(diff === undefined ? {} : { diff }),
      activityType.id,
      JSON.stringify(snapshot),
      userId,
      recordId,
    ],
  );
};
