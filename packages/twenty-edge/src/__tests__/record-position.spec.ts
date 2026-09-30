import { describe, expect, it, vi } from 'vitest';

import { type Client } from 'pg';

import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import {
  hasPositionColumn,
  resolveRecordPositions,
} from 'src/services/record-position';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const buildObject = (
  fields: readonly (readonly [string, string])[],
): FlatObjectMetadata => ({
  id: 'object-note',
  workspaceId: WORKSPACE_ID,
  nameSingular: 'note',
  namePlural: 'notes',
  labelSingular: 'Note',
  labelPlural: 'Notes',
  description: null,
  icon: null,
  isActive: true,
  isSystem: false,
  isCustom: false,
  isSearchable: true,
  labelIdentifierFieldMetadataId: null,
  duplicateCriteria: null,
  imageIdentifierFieldMetadataId: null,
  fields: fields.map(([name, type]) => ({
    id: `field-${name}`,
    objectMetadataId: 'object-note',
    workspaceId: WORKSPACE_ID,
    name,
    label: name,
    type: type as never,
    description: null,
    icon: null,
    isActive: true,
    isSystem: false,
    isNullable: true,
    isUnique: false,
    defaultValue: null,
    options: null,
    settings: null,
    relationTargetFieldMetadataId: null,
    relationTargetObjectMetadataId: null,
  })),
});

const shape = buildWorkspaceTableShape({
  object: buildObject([
    ['id', 'UUID'],
    ['title', 'TEXT'],
    ['position', 'POSITION'],
    ['deletedAt', 'DATE_TIME'],
  ]),
  workspaceId: WORKSPACE_ID,
});

const shapeWithoutPosition = buildWorkspaceTableShape({
  object: buildObject([
    ['id', 'UUID'],
    ['title', 'TEXT'],
  ]),
  workspaceId: WORKSPACE_ID,
});

const buildClient = (boundary: number | null) =>
  ({
    query: vi.fn().mockResolvedValue({ rows: [{ boundary }] }),
  }) as unknown as Client;

describe('hasPositionColumn', () => {
  it('is false for an object without a position field', () => {
    expect(hasPositionColumn(shapeWithoutPosition)).toBe(false);
    expect(hasPositionColumn(shape)).toBe(true);
  });
});

describe('resolveRecordPositions', () => {
  it("turns 'last' into one past the current maximum", async () => {
    const [record] = await resolveRecordPositions({
      client: buildClient(7),
      shape,
      inputs: [{ position: 'last', title: 'nota' }],
      backfillUndefined: true,
    });

    expect(record).toEqual({ position: 8, title: 'nota' });
  });

  it("turns 'first' into one before the current minimum", async () => {
    const [record] = await resolveRecordPositions({
      client: buildClient(3),
      shape,
      inputs: [{ position: 'first' }],
      backfillUndefined: false,
    });

    expect(record).toEqual({ position: 2 });
  });

  it('starts at 1 on an empty table', async () => {
    const [last] = await resolveRecordPositions({
      client: buildClient(null),
      shape,
      inputs: [{ position: 'last' }],
      backfillUndefined: false,
    });
    const [first] = await resolveRecordPositions({
      client: buildClient(null),
      shape,
      inputs: [{ position: 'first' }],
      backfillUndefined: false,
    });

    expect(last).toEqual({ position: 2 });
    expect(first).toEqual({ position: 0 });
  });

  it('spreads a batch instead of giving every row the same slot', async () => {
    const records = await resolveRecordPositions({
      client: buildClient(10),
      shape,
      inputs: [{ title: 'a' }, { title: 'b' }, { title: 'c' }].map((input) => ({
        ...input,
        position: 'last',
      })),
      backfillUndefined: false,
    });

    expect(records.map((record) => record.position)).toEqual([11, 12, 13]);
  });

  it('counts numeric positions in the same batch towards the boundary', async () => {
    const records = await resolveRecordPositions({
      client: buildClient(4),
      shape,
      inputs: [{ position: 42 }, { position: 'last' }],
      backfillUndefined: false,
    });

    expect(records.map((record) => record.position)).toEqual([42, 43]);
  });

  it('backfills an absent position only when asked to', async () => {
    const [backfilled] = await resolveRecordPositions({
      client: buildClient(5),
      shape,
      inputs: [{ title: 'nota' }],
      backfillUndefined: true,
    });
    const [untouched] = await resolveRecordPositions({
      client: buildClient(5),
      shape,
      inputs: [{ title: 'nota' }],
      backfillUndefined: false,
    });

    expect(backfilled).toEqual({ title: 'nota', position: 4 });
    expect(untouched).toEqual({ title: 'nota' });
  });

  it('drops a string the float column could never hold', async () => {
    const [record] = await resolveRecordPositions({
      client: buildClient(5),
      shape,
      inputs: [{ position: 'somewhere', title: 'nota' }],
      backfillUndefined: false,
    });

    expect(record).toEqual({ title: 'nota' });
  });

  it('leaves an explicit null alone so the column can be cleared', async () => {
    const [record] = await resolveRecordPositions({
      client: buildClient(5),
      shape,
      inputs: [{ position: null }],
      backfillUndefined: true,
    });

    expect(record).toEqual({ position: null });
  });

  it('never queries an object that has no position column', async () => {
    const client = buildClient(9);

    const [record] = await resolveRecordPositions({
      client,
      shape: shapeWithoutPosition,
      inputs: [{ position: 'last', title: 'nota' }],
      backfillUndefined: true,
    });

    expect(record).toEqual({ position: 'last', title: 'nota' });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('excludes soft-deleted rows from the boundary', async () => {
    const client = buildClient(2);

    await resolveRecordPositions({
      client,
      shape,
      inputs: [{ position: 'last' }],
      backfillUndefined: false,
    });

    expect(vi.mocked(client.query).mock.calls[0]?.[0]).toContain(
      '"deletedAt" IS NULL',
    );
  });
});
