import { describe, expect, it } from 'vitest';

import {
  buildSearchVectorExpression,
  buildSearchVectorStatements,
} from 'src/ddl/search-vector';
import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import { buildTsQuery, encodeSearchCursor } from 'src/services/search';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const buildObject = (
  fields: readonly (readonly [string, string])[],
  labelFieldName: string,
): FlatObjectMetadata => {
  const built = fields.map(([name, type]) => ({
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
  })) as FlatObjectMetadata['fields'];

  return {
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
    labelIdentifierFieldMetadataId: `field-${labelFieldName}`,
    imageIdentifierFieldMetadataId: null,
    fields: built,
  };
};

describe('buildSearchVectorExpression', () => {
  it('weights the label identifier above the rest', () => {
    const object = buildObject(
      [
        ['id', 'UUID'],
        ['name', 'TEXT'],
        ['city', 'TEXT'],
      ],
      'name',
    );

    const expression = buildSearchVectorExpression({
      object,
      shape: buildWorkspaceTableShape({ object, workspaceId: WORKSPACE_ID }),
    });

    expect(expression).toContain(`coalesce("name"::text, '')`);
    expect(expression).toContain(`'A'`);
    expect(expression).toContain(`coalesce("city"::text, '')`);
    expect(expression).toContain(`'B'`);
  });

  // A composite spreads over several columns and every one of them is text a
  // person might type.
  it('covers every column of a composite', () => {
    const object = buildObject(
      [
        ['id', 'UUID'],
        ['name', 'FULL_NAME'],
      ],
      'name',
    );

    const expression = buildSearchVectorExpression({
      object,
      shape: buildWorkspaceTableShape({ object, workspaceId: WORKSPACE_ID }),
    });

    expect(expression).toContain(`coalesce("nameFirstName"::text, '')`);
    expect(expression).toContain(`coalesce("nameLastName"::text, '')`);
  });

  // An address carries latitude and longitude, and concatenating a numeric
  // column into the vector is a type error rather than merely useless.
  it('leaves the non-text properties of a composite out', () => {
    const object = buildObject(
      [
        ['id', 'UUID'],
        ['address', 'ADDRESS'],
      ],
      'id',
    );

    const expression = buildSearchVectorExpression({
      object,
      shape: buildWorkspaceTableShape({ object, workspaceId: WORKSPACE_ID }),
    });

    // The double prefix is real: an `address` field's city column is
    // addressAddressCity, because the property name already starts with
    // `address`.
    expect(expression).toContain(`coalesce("addressAddressCity"::text, '')`);
    expect(expression).not.toContain('addressLat');
    expect(expression).not.toContain('addressLng');
  });

  it('returns nothing for an object with no text at all', () => {
    const object = buildObject(
      [
        ['id', 'UUID'],
        ['amount', 'NUMBER'],
      ],
      'id',
    );

    expect(
      buildSearchVectorExpression({
        object,
        shape: buildWorkspaceTableShape({ object, workspaceId: WORKSPACE_ID }),
      }),
    ).toBeNull();
  });
});

describe('buildSearchVectorStatements', () => {
  const object = buildObject(
    [
      ['id', 'UUID'],
      ['name', 'TEXT'],
    ],
    'name',
  );

  const statements = buildSearchVectorStatements({
    object,
    shape: buildWorkspaceTableShape({ object, workspaceId: WORKSPACE_ID }),
  });

  // The expression of a generated column cannot be altered in place, so the
  // column is dropped first every time the fields change.
  it('drops before it adds', () => {
    expect(statements[0]).toContain('DROP COLUMN IF EXISTS "searchVector"');
    expect(statements[1]).toContain('GENERATED ALWAYS AS');
    expect(statements[1]).toContain('STORED');
  });

  it('indexes the column with GIN', () => {
    expect(statements[2]).toContain('USING GIN ("searchVector")');
  });
});

describe('buildTsQuery', () => {
  // Raw input is an expression language to Postgres: "a & b" or a lone "!"
  // would either mean something unintended or fail to parse.
  it('turns every token into a prefix match', () => {
    expect(buildTsQuery('ana paula')).toBe('ana:* & paula:*');
  });

  it('drops punctuation instead of passing it to tsquery', () => {
    expect(buildTsQuery('acme & co!')).toBe('acme:* & co:*');
  });

  it('keeps accents, which unaccent_immutable folds on both sides', () => {
    expect(buildTsQuery('João')).toBe('João:*');
  });

  it('answers null when there is nothing to search for', () => {
    expect(buildTsQuery('   ')).toBeNull();
    expect(buildTsQuery('!!!')).toBeNull();
  });
});

describe('encodeSearchCursor', () => {
  it('round-trips through base64', () => {
    const cursor = encodeSearchCursor({ tsRank: 0.25, recordId: 'abc' });

    expect(JSON.parse(atob(cursor))).toEqual({
      tsRank: 0.25,
      recordId: 'abc',
    });
  });
});
