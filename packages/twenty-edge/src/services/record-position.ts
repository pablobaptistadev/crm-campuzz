import { type Client } from 'pg';

import { escapeIdentifier, qualifiedTableName } from 'src/ddl/escape';
import { type WorkspaceTableShape } from 'src/orm/table-shape';

const POSITION_COLUMN = 'position';

// The front sends `position: "last"` (or "first") on every record it creates
// from a "+" button — the column is a float, so the string has to be resolved
// to a number before it reaches the INSERT or Postgres rejects the statement.
export type PositionInput = number | 'first' | 'last' | null | undefined;

export const hasPositionColumn = (shape: WorkspaceTableShape): boolean =>
  shape.columnShapeByColumnName.get(POSITION_COLUMN)?.fieldType === 'POSITION';

const readBoundary = async ({
  client,
  shape,
  aggregate,
}: {
  client: Client;
  shape: WorkspaceTableShape;
  aggregate: 'min' | 'max';
}): Promise<number | null> => {
  // Soft-deleted rows are invisible to the list the user is ordering, so they
  // must not push the next position past the end of it either.
  const deletedFilter = shape.hasDeletedAtColumn
    ? ` WHERE ${escapeIdentifier('deletedAt')} IS NULL`
    : '';

  const { rows } = await client.query(
    `SELECT ${aggregate}(${escapeIdentifier(POSITION_COLUMN)}) AS "boundary" FROM ${qualifiedTableName(
      shape,
    )}${deletedFilter}`,
  );

  const boundary = rows[0]?.boundary;

  if (boundary === null || boundary === undefined) {
    return null;
  }

  const parsed = Number(boundary);

  return Number.isNaN(parsed) ? null : parsed;
};

// Mirrors RecordPositionService.overridePositionOnRecords: a batch resolves
// against a single boundary read, and the numeric positions already present in
// the same batch count towards it.
export const resolveRecordPositions = async ({
  client,
  shape,
  inputs,
  backfillUndefined,
}: {
  client: Client;
  shape: WorkspaceTableShape;
  inputs: Record<string, unknown>[];
  backfillUndefined: boolean;
}): Promise<Record<string, unknown>[]> => {
  if (!hasPositionColumn(shape)) {
    return inputs;
  }

  const resolved = inputs.map((input) => ({ ...input }));

  const needsFirst: Record<string, unknown>[] = [];
  const needsLast: Record<string, unknown>[] = [];
  const numericPositions: number[] = [];

  for (const input of resolved) {
    const position = input[POSITION_COLUMN] as PositionInput;

    if (position === 'last') {
      needsLast.push(input);
    } else if (typeof position === 'number' && !Number.isNaN(position)) {
      numericPositions.push(position);
    } else if (position === 'first') {
      needsFirst.push(input);
    } else if (position === undefined && backfillUndefined) {
      needsFirst.push(input);
    } else if (typeof position === 'string') {
      // Any other string would reach the float column verbatim; dropping it
      // lets the row be written with whatever the column defaults to.
      delete input[POSITION_COLUMN];
    }
  }

  if (needsFirst.length > 0) {
    const existingMin = await readBoundary({ client, shape, aggregate: 'min' });
    const fallback = existingMin ?? 1;
    const minPosition =
      numericPositions.length > 0
        ? Math.min(...numericPositions, fallback)
        : fallback;

    needsFirst.forEach((input, index) => {
      input[POSITION_COLUMN] = minPosition - index - 1;
    });
  }

  if (needsLast.length > 0) {
    const existingMax = await readBoundary({ client, shape, aggregate: 'max' });
    const fallback = existingMax ?? 1;
    const maxPosition =
      numericPositions.length > 0
        ? Math.max(...numericPositions, fallback)
        : fallback;

    needsLast.forEach((input, index) => {
      input[POSITION_COLUMN] = maxPosition + index + 1;
    });
  }

  return resolved;
};

export const resolveRecordPosition = async ({
  client,
  shape,
  input,
  backfillUndefined,
}: {
  client: Client;
  shape: WorkspaceTableShape;
  input: Record<string, unknown>;
  backfillUndefined: boolean;
}): Promise<Record<string, unknown>> => {
  const [resolved] = await resolveRecordPositions({
    client,
    shape,
    inputs: [input],
    backfillUndefined,
  });

  return resolved ?? input;
};
