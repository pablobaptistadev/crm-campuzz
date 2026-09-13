import { describe, expect, it } from 'vitest';

import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import { computeFieldDiff } from 'src/services/timeline';

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
  imageIdentifierFieldMetadataId: null,
  fields: (
    [
      ['id', 'UUID'],
      ['name', 'FULL_NAME'],
      ['jobTitle', 'TEXT'],
      ['city', 'TEXT'],
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

describe('computeFieldDiff', () => {
  it('reports a changed field by its GraphQL name', () => {
    expect(
      computeFieldDiff({
        shape,
        input: { jobTitle: 'CTO' },
        before: { jobTitle: 'CEO' },
        after: { jobTitle: 'CTO' },
      }),
    ).toEqual({ jobTitle: { before: 'CEO', after: 'CTO' } });
  });

  // The front looks the diff key up against field metadata, so a composite has
  // to appear whole under its field name rather than as one entry per column.
  it('keeps a composite whole', () => {
    expect(
      computeFieldDiff({
        shape,
        input: { name: { firstName: 'Ana Paula', lastName: 'Souza' } },
        before: { name: { firstName: 'Ana', lastName: 'Souza' } },
        after: { name: { firstName: 'Ana Paula', lastName: 'Souza' } },
      }),
    ).toEqual({
      name: {
        before: { firstName: 'Ana', lastName: 'Souza' },
        after: { firstName: 'Ana Paula', lastName: 'Souza' },
      },
    });
  });

  it('ignores a write that did not change the value', () => {
    expect(
      computeFieldDiff({
        shape,
        input: { city: 'Recife' },
        before: { city: 'Recife' },
        after: { city: 'Recife' },
      }),
    ).toEqual({});
  });

  it('ignores keys that are not fields of the object', () => {
    expect(
      computeFieldDiff({
        shape,
        input: { notAField: 'x' },
        before: {},
        after: { notAField: 'x' },
      }),
    ).toEqual({});
  });
});
