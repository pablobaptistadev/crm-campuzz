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

          if (target === undefined) {
            return true;
          }

          // A morph field answers for several objects at once, so the inverse
          // is listed among its targets rather than in a single column.
          if (target.type === 'MORPH_RELATION') {
            return !(target.settings?.morphTargets ?? []).some(
              (morphTarget) => morphTarget.targetFieldMetadataId === field.id,
            );
          }

          return target.relationTargetFieldMetadataId !== field.id;
        })
        .map((field) => `${object.nameSingular}.${field.name}`),
    );

    expect(mismatched).toEqual([]);
  });

  it('gives every morph target a field that points back', () => {
    const objects = buildStandardObjects(WORKSPACE_ID);
    const objectById = new Map(objects.map((object) => [object.id, object]));
    const fieldById = new Map(
      objects.flatMap((object) => object.fields.map((field) => [field.id, field])),
    );

    const broken = objects.flatMap((object) =>
      object.fields
        .filter((field) => field.type === 'MORPH_RELATION')
        .flatMap((field) =>
          (field.settings?.morphTargets ?? [])
            .filter((target) => {
              const targetObject = objectById.get(target.objectMetadataId);
              const inverse = fieldById.get(target.targetFieldMetadataId);

              return (
                targetObject === undefined ||
                inverse === undefined ||
                inverse.relationTargetFieldMetadataId !== field.id
              );
            })
            .map(
              (target) =>
                `${object.nameSingular}.${field.name} → ${target.nameSingular}`,
            ),
        ),
    );

    expect(broken).toEqual([]);
  });

  it('keeps the workspace schema name derived from the workspace id', () => {
    expect(getWorkspaceSchemaName(WORKSPACE_ID)).toMatch(/^workspace_[a-z0-9]+$/);
  });
});
