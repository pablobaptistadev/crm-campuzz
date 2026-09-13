import { describe, expect, it } from 'vitest';

import { type FlatObjectMetadata } from 'src/metadata/types';
import {
  buildDestroyQuery,
  buildInsertQuery,
  buildRestoreQuery,
  buildSoftDeleteQuery,
  buildUpdateQuery,
  flattenRecordInput,
} from 'src/orm/mutations';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';

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
  duplicateCriteria: null,
  imageIdentifierFieldMetadataId: null,
  fields: (
    [
      ['id', 'UUID'],
      ['name', 'FULL_NAME'],
      ['jobTitle', 'TEXT'],
      ['updatedAt', 'DATE_TIME'],
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

describe('flattenRecordInput', () => {
  it('splits a composite input into its columns', () => {
    expect(
      flattenRecordInput({
        shape,
        input: { name: { firstName: 'Ana', lastName: 'Souza' }, jobTitle: 'CEO' },
      }),
    ).toEqual({
      nameFirstName: 'Ana',
      nameLastName: 'Souza',
      jobTitle: 'CEO',
    });
  });

  it('ignores keys that map to no column', () => {
    expect(flattenRecordInput({ shape, input: { unknownField: 'x' } })).toEqual({});
  });

  it('drops undefined but keeps an explicit null', () => {
    expect(
      flattenRecordInput({ shape, input: { jobTitle: null, name: undefined } }),
    ).toEqual({ jobTitle: null });
  });
});

describe('buildInsertQuery', () => {
  it('binds every value and returns the aliased row', () => {
    const { text, values } = buildInsertQuery({
      shape,
      input: { jobTitle: 'CEO' },
    });

    expect(text).toContain('INSERT INTO');
    expect(text).toContain('"jobTitle"');
    expect(text).toContain('VALUES ($1)');
    expect(text).toContain('AS "person_jobTitle"');
    expect(values).toEqual(['CEO']);
  });

  it('falls back to DEFAULT VALUES for an empty input', () => {
    expect(buildInsertQuery({ shape, input: {} }).text).toContain(
      'DEFAULT VALUES',
    );
  });
});

describe('buildUpdateQuery', () => {
  it('returns the pre-update row alongside the updated one', () => {
    const { text, values } = buildUpdateQuery({
      shape,
      id: 'abc',
      input: { jobTitle: 'CTO' },
    });

    expect(text).toContain('to_jsonb("__beforeUpdate".*) AS "__before"');
    // Placeholders are numbered by where they appear in the SQL, and the id
    // appears first in the CTE. It is bound once and referenced twice — by the
    // CTE and by the UPDATE — so the two always read the same row.
    expect(values).toEqual(['abc', 'CTO']);
    expect(text.match(/\$1\b/g)).toHaveLength(2);
  });

  it('maintains updatedAt for the caller', () => {
    const { text } = buildUpdateQuery({
      shape,
      id: 'abc',
      input: { jobTitle: 'CTO' },
    });

    expect(text).toContain('"updatedAt" = now()');
  });

  it('does not override an explicit updatedAt', () => {
    const { text } = buildUpdateQuery({
      shape,
      id: 'abc',
      input: { updatedAt: '2026-01-01T00:00:00Z' },
    });

    expect(text).not.toContain('"updatedAt" = now()');
  });
});

describe('delete semantics', () => {
  it('soft delete sets deletedAt and skips already-deleted rows', () => {
    const { text } = buildSoftDeleteQuery({ shape, id: 'abc' });

    expect(text).toContain('"deletedAt" = now()');
    expect(text).toContain('"deletedAt" IS NULL');
  });

  it('restore clears deletedAt', () => {
    expect(buildRestoreQuery({ shape, id: 'abc' }).text).toContain(
      '"deletedAt" = NULL',
    );
  });

  it('destroy is a real DELETE', () => {
    expect(buildDestroyQuery({ shape, id: 'abc' }).text).toContain(
      'DELETE FROM',
    );
  });
});
