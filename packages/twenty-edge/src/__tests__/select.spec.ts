import { describe, expect, it } from 'vitest';

import {
  type FlatFieldMetadata,
  type FlatObjectMetadata,
} from 'src/metadata/types';
import { buildCountQuery, buildSelectQuery, hydrateRecord } from 'src/orm/select';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const buildField = (
  overrides: Partial<FlatFieldMetadata> & Pick<FlatFieldMetadata, 'name' | 'type'>,
): FlatFieldMetadata => ({
  id: `field-${overrides.name}`,
  objectMetadataId: 'object-person',
  workspaceId: WORKSPACE_ID,
  label: overrides.name,
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
  ...overrides,
});

const personObject: FlatObjectMetadata = {
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
  fields: [
    buildField({ name: 'id', type: 'UUID', isNullable: false }),
    buildField({ name: 'name', type: 'FULL_NAME' }),
    buildField({ name: 'jobTitle', type: 'TEXT' }),
    buildField({ name: 'deletedAt', type: 'DATE_TIME' }),
    buildField({
      name: 'company',
      type: 'RELATION',
      settings: { relationType: 'MANY_TO_ONE' },
      relationTargetObjectMetadataId: 'object-company',
    }),
    buildField({
      name: 'notes',
      type: 'RELATION',
      settings: { relationType: 'ONE_TO_MANY' },
      relationTargetObjectMetadataId: 'object-note',
    }),
  ],
};

const shape = buildWorkspaceTableShape({
  object: personObject,
  workspaceId: WORKSPACE_ID,
});

describe('table shape', () => {
  it('flattens composites and keeps only the owning side of relations', () => {
    const columnNames = [...shape.columnShapeByColumnName.keys()];

    expect(columnNames).toContain('nameFirstName');
    expect(columnNames).toContain('nameLastName');
    expect(columnNames).toContain('companyId');
    expect(columnNames).not.toContain('notes');
    expect(columnNames).not.toContain('notesId');
  });

  it('targets the workspace schema and the unprefixed standard table', () => {
    expect(shape.schemaName).toMatch(/^workspace_/);
    expect(shape.tableName).toBe('person');
  });
});

describe('buildSelectQuery', () => {
  it('always excludes soft-deleted rows unless asked otherwise', () => {
    expect(buildSelectQuery({ shape }).text).toContain(
      '"person"."deletedAt" IS NULL',
    );
    expect(buildSelectQuery({ shape, withDeleted: true }).text).not.toContain(
      'IS NULL',
    );
  });

  it('lifts the soft-delete predicate when the filter mentions deletedAt', () => {
    expect(
      buildSelectQuery({ shape, filter: { deletedAt: { is: 'NOT_NULL' } } }).text,
    ).not.toContain('"person"."deletedAt" IS NULL AND');

    expect(
      buildSelectQuery({
        shape,
        filter: { and: [{ id: { eq: 'x' } }, { deletedAt: { is: 'NOT_NULL' } }] },
      }).text,
    ).not.toContain('"person"."deletedAt" IS NULL AND');

    expect(
      buildCountQuery({ shape, filter: { not: { deletedAt: { is: 'NULL' } } } })
        .text,
    ).not.toContain('"person"."deletedAt" IS NULL AND');

    // A filter that says nothing about deletedAt keeps the predicate.
    expect(buildSelectQuery({ shape, filter: { id: { eq: 'x' } } }).text).toContain(
      '"person"."deletedAt" IS NULL',
    );
  });

  it('aliases every projected column as alias_column', () => {
    const { text } = buildSelectQuery({ shape });

    expect(text).toContain('"person"."nameFirstName" AS "person_nameFirstName"');
  });

  it('binds filter values instead of inlining them', () => {
    const { text, values } = buildSelectQuery({
      shape,
      filter: { jobTitle: { eq: 'CEO' } },
    });

    expect(text).toContain('"person"."jobTitle" = $1');
    expect(values).toEqual(['CEO']);
  });

  it('treats an empty string as NULL-equivalent for text equality', () => {
    const { text } = buildSelectQuery({
      shape,
      filter: { jobTitle: { eq: '' } },
    });

    // Dropping this widening silently changes which rows match.
    expect(text).toContain('OR "person"."jobTitle" IS NULL');
  });

  it('does not widen a non-empty value', () => {
    const { text } = buildSelectQuery({
      shape,
      filter: { jobTitle: { eq: 'CEO' } },
    });

    expect(text).not.toContain('IS NULL)');
  });

  it('filters a composite through its subproperty column', () => {
    const { text, values } = buildSelectQuery({
      shape,
      filter: { name: { firstName: { ilike: '%ana%' } } },
    });

    expect(text).toContain('"person"."nameFirstName"::text ILIKE $1');
    expect(values).toEqual(['%ana%']);
  });

  it('combines and/or/not', () => {
    const { text } = buildSelectQuery({
      shape,
      filter: {
        or: [{ jobTitle: { eq: 'CEO' } }, { jobTitle: { eq: 'CTO' } }],
        not: { jobTitle: { is: 'NULL' } },
      },
    });

    expect(text).toContain(' OR ');
    expect(text).toContain('NOT ');
  });

  it('spans a millisecond for DATE_TIME equality', () => {
    const { text } = buildSelectQuery({
      shape,
      filter: { deletedAt: { eq: '2026-01-01T00:00:00.000Z' } },
      withDeleted: true,
    });

    expect(text).toContain("interval '1 millisecond'");
  });

  it('orders by every column of a composite field', () => {
    const { text } = buildSelectQuery({
      shape,
      orderBy: [{ fieldName: 'name', direction: 'AscNullsLast' }],
    });

    expect(text).toContain('"person"."nameFirstName" ASC NULLS LAST');
    expect(text).toContain('"person"."nameLastName" ASC NULLS LAST');
  });

  it('binds limit and offset', () => {
    const { text, values } = buildSelectQuery({ shape, limit: 21, offset: 40 });

    expect(text).toContain('LIMIT $1');
    expect(text).toContain('OFFSET $2');
    expect(values).toEqual([21, 40]);
  });
});

describe('buildCountQuery', () => {
  it('counts with the same soft-delete predicate', () => {
    const { text } = buildCountQuery({ shape });

    expect(text).toContain('COUNT(1)');
    expect(text).toContain('"person"."deletedAt" IS NULL');
  });
});

describe('hydrateRecord', () => {
  it('rebuilds composites into nested objects', () => {
    const record = hydrateRecord({
      shape,
      alias: 'person',
      row: {
        person_id: 'abc',
        person_nameFirstName: 'Ana',
        person_nameLastName: 'Souza',
        person_jobTitle: null,
        person_companyId: null,
        person_deletedAt: null,
      },
    });

    expect(record.id).toBe('abc');
    expect(record.name).toEqual({ firstName: 'Ana', lastName: 'Souza' });
    expect(record.jobTitle).toBeNull();
  });
});
