import { describe, expect, it } from 'vitest';

import { buildStandardObjects } from 'src/standard/objects';
import { getWorkspaceSchemaName } from 'src/metadata/naming';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

describe('standard metadata relations', () => {
  it('gives every relation field a resolvable target object and target field', () => {
    const objects = buildStandardObjects(WORKSPACE_ID);
    const objectById = new Map(objects.map((object) => [object.id, object]));
    const fieldById = new Map(
      objects.flatMap((object) => object.fields.map((field) => [field.id, field])),
    );

    const broken = objects.flatMap((object) =>
      object.fields
        .filter((field) => field.type === 'RELATION')
        .filter(
          (field) =>
            field.relationTargetObjectMetadataId === null ||
            !objectById.has(field.relationTargetObjectMetadataId) ||
            field.relationTargetFieldMetadataId === null ||
            !fieldById.has(field.relationTargetFieldMetadataId),
        )
        .map((field) => `${object.nameSingular}.${field.name}`),
    );

    // twenty-front reads relation.targetObjectMetadata.nameSingular and
    // relation.targetFieldMetadata.id with no null guard.
    expect(broken).toEqual([]);
  });

  it('points both sides of a relation at each other', () => {
    const objects = buildStandardObjects(WORKSPACE_ID);
    const fieldById = new Map(
      objects.flatMap((object) => object.fields.map((field) => [field.id, field])),
    );

    const mismatched = objects.flatMap((object) =>
      object.fields
        .filter((field) => field.type === 'RELATION')
        .filter((field) => {
          const target =
            field.relationTargetFieldMetadataId === null
              ? undefined
              : fieldById.get(field.relationTargetFieldMetadataId);

          return target?.relationTargetFieldMetadataId !== field.id;
        })
        .map((field) => `${object.nameSingular}.${field.name}`),
    );

    expect(mismatched).toEqual([]);
  });

  it('keeps the workspace schema name derived from the workspace id', () => {
    expect(getWorkspaceSchemaName(WORKSPACE_ID)).toMatch(/^workspace_[a-z0-9]+$/);
  });
});
