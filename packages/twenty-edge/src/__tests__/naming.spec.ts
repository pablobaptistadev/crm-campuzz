import { describe, expect, it } from 'vitest';

import {
  COMPOSITE_TYPE_DEFINITIONS,
  getCompositeTypeDefinitionOrThrow,
} from 'src/metadata/composite-types';
import {
  computeColumnName,
  computeCompositeColumnName,
  computeFieldColumnNames,
  computePostgresEnumName,
  computeTableName,
  getWorkspaceSchemaName,
  uuidToBase36,
} from 'src/metadata/naming';

describe('workspace schema naming', () => {
  it('derives the schema name from the workspace uuid in base36', () => {
    expect(uuidToBase36('20202020-1c25-4d02-bf25-6aeccf7ea419')).toBe(
      uuidToBase36('20202020-1c25-4d02-bf25-6aeccf7ea419'),
    );
    expect(
      getWorkspaceSchemaName('20202020-1c25-4d02-bf25-6aeccf7ea419'),
    ).toMatch(/^workspace_[0-9a-z]+$/);
  });

  it('keeps the schema name within the 63 byte identifier limit', () => {
    expect(
      getWorkspaceSchemaName('ffffffff-ffff-ffff-ffff-ffffffffffff').length,
    ).toBeLessThanOrEqual(63);
  });

  it('prefixes custom objects so they cannot collide with standard ones', () => {
    expect(computeTableName('person', false)).toBe('person');
    expect(computeTableName('deal', true)).toBe('_deal');
  });
});

describe('column naming', () => {
  it('appends Id only for foreign keys', () => {
    expect(computeColumnName('company')).toBe('company');
    expect(computeColumnName('company', { isForeignKey: true })).toBe(
      'companyId',
    );
  });

  it('produces the double-prefixed address columns Twenty actually stores', () => {
    const addressCity = getCompositeTypeDefinitionOrThrow(
      'ADDRESS',
    ).properties.find((property) => property.name === 'addressCity');

    expect(addressCity).toBeDefined();
    expect(computeCompositeColumnName('address', addressCity!)).toBe(
      'addressAddressCity',
    );
  });

  it('names enums after table and column', () => {
    expect(
      computePostgresEnumName({ tableName: 'person', columnName: 'status' }),
    ).toBe('person_status_enum');
  });
});

describe('computeFieldColumnNames', () => {
  it('flattens a composite into one column per property', () => {
    expect(computeFieldColumnNames({ name: 'name', type: 'FULL_NAME' })).toEqual(
      ['nameFirstName', 'nameLastName'],
    );
  });

  it('gives the owning side of a relation a column and the other side none', () => {
    expect(
      computeFieldColumnNames({
        name: 'company',
        type: 'RELATION',
        relationType: 'MANY_TO_ONE',
      }),
    ).toEqual(['companyId']);

    expect(
      computeFieldColumnNames({
        name: 'people',
        type: 'RELATION',
        relationType: 'ONE_TO_MANY',
      }),
    ).toEqual([]);
  });

  it('covers every declared composite type', () => {
    for (const type of Object.keys(COMPOSITE_TYPE_DEFINITIONS)) {
      const columns = computeFieldColumnNames({
        name: 'field',
        type: type as never,
      });

      expect(columns.length).toBeGreaterThan(0);
    }
  });
});
