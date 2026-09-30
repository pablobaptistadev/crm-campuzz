import { describe, expect, it } from 'vitest';

import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import {
  buildDuplicateConditions,
  buildDuplicatesQuery,
  mergeRecordValues,
} from 'src/services/duplicates';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const object: FlatObjectMetadata = {
  id: 'object-person',
  workspaceId: WORKSPACE_ID,
  nameSingular: 'person',
  namePlural: 'people',
  labelSingular: 'Person',
  labelPlural: 'People',
  description: null,
  icon: null,
  isActive: true,
  isSystem: false,
  isCustom: false,
  isSearchable: true,
  labelIdentifierFieldMetadataId: null,
  duplicateCriteria: [['nameFirstName', 'nameLastName'], ['emailsPrimaryEmail']],
  imageIdentifierFieldMetadataId: null,
  fields: (
    [
      ['id', 'UUID'],
      ['name', 'FULL_NAME'],
      ['emails', 'EMAILS'],
      ['city', 'TEXT'],
      ['deletedAt', 'DATE_TIME'],
    ] as const
  ).map(([name, type]) => ({
    id: `field-${name}`,
    objectMetadataId: 'object-person',
    workspaceId: WORKSPACE_ID,
    name,
    label: name,
    type,
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
};

const shape = buildWorkspaceTableShape({ object, workspaceId: WORKSPACE_ID });

describe('buildDuplicateConditions', () => {
  it('turns each criterion into its own group of columns', () => {
    const { groups } = buildDuplicateConditions({
      object,
      shape,
      records: [
        {
          nameFirstName: 'Ana',
          nameLastName: 'Souza',
          emailsPrimaryEmail: 'ana@example.com',
        },
      ],
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].map((entry) => entry.columnName)).toEqual([
      'nameFirstName',
      'nameLastName',
    ]);
    expect(groups[1][0]).toEqual({
      columnName: 'emailsPrimaryEmail',
      value: 'ana@example.com',
    });
  });

  // Two companies with no domain are not the same company, and a group of empty
  // columns would match every record whose columns are also empty.
  it('skips a group where any column is empty', () => {
    const { groups } = buildDuplicateConditions({
      object,
      shape,
      records: [
        {
          nameFirstName: 'Ana',
          nameLastName: '',
          emailsPrimaryEmail: null,
        },
      ],
    });

    expect(groups).toEqual([]);
  });

  it('has nothing to say about an object with no criteria', () => {
    const { groups } = buildDuplicateConditions({
      object: { ...object, duplicateCriteria: null },
      shape,
      records: [{ nameFirstName: 'Ana', nameLastName: 'Souza' }],
    });

    expect(groups).toEqual([]);
  });
});

describe('buildDuplicatesQuery', () => {
  const groups = buildDuplicateConditions({
    object,
    shape,
    records: [{ nameFirstName: 'Ana', nameLastName: 'Souza' }],
  }).groups;

  it('excludes the records the caller asked about', () => {
    const query = buildDuplicatesQuery({
      shape,
      groups,
      excludedIds: ['abc'],
      limit: 60,
    });

    expect(query?.text).toContain('NOT (');
    expect(query?.values).toContainEqual(['abc']);
  });

  it('leaves soft-deleted rows out', () => {
    expect(
      buildDuplicatesQuery({ shape, groups, excludedIds: [], limit: 60 })?.text,
    ).toContain('"deletedAt" IS NULL');
  });

  it('answers null when there is nothing to match on', () => {
    expect(
      buildDuplicatesQuery({ shape, groups: [], excludedIds: [], limit: 60 }),
    ).toBeNull();
  });
});

describe('mergeRecordValues', () => {
  it('gives the priority record the conflicts', () => {
    expect(
      mergeRecordValues({
        shape,
        records: [
          { nameFirstName: 'Ana', city: 'Recife' },
          { nameFirstName: 'Ana Paula', city: 'Olinda' },
        ],
        conflictPriorityIndex: 1,
      }),
    ).toMatchObject({ nameFirstName: 'Ana Paula', city: 'Olinda' });
  });

  // The point of merging: what one record is missing, another one supplies.
  it('fills a gap from the other records', () => {
    expect(
      mergeRecordValues({
        shape,
        records: [
          { nameFirstName: 'Ana', city: null },
          { nameFirstName: 'Ana Paula', city: 'Olinda' },
        ],
        conflictPriorityIndex: 0,
      }),
    ).toMatchObject({ nameFirstName: 'Ana', city: 'Olinda' });
  });

  // Identity and bookkeeping belong to the survivor: taking the loser's id
  // would move the merged record out from under everything pointing at it.
  it('never merges identity or bookkeeping columns', () => {
    const merged = mergeRecordValues({
      shape,
      records: [
        { id: 'survivor', city: 'Recife' },
        { id: 'loser', city: 'Olinda' },
      ],
      conflictPriorityIndex: 1,
    });

    expect(merged).not.toHaveProperty('id');
    expect(merged).not.toHaveProperty('createdAt');
    expect(merged).not.toHaveProperty('deletedAt');
  });

  it('falls back to the first record when the index is out of range', () => {
    expect(
      mergeRecordValues({
        shape,
        records: [{ city: 'Recife' }, { city: 'Olinda' }],
        conflictPriorityIndex: 9,
      }),
    ).toMatchObject({ city: 'Recife' });
  });
});
