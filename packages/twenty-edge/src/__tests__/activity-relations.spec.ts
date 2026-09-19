import { describe, expect, it, vi } from 'vitest';

import { type Client } from 'pg';

import {
  type FlatFieldMetadata,
  type FlatObjectMetadata,
} from 'src/metadata/types';
import { attachActivityRelations } from 'src/services/metadata-mutations';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const buildField = (
  overrides: Partial<FlatFieldMetadata> & { name: string },
): FlatFieldMetadata => ({
  id: `field-${overrides.name}`,
  objectMetadataId: 'object',
  workspaceId: WORKSPACE_ID,
  label: overrides.name,
  type: 'TEXT',
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

const buildActivityObject = (nameSingular: string): FlatObjectMetadata => ({
  id: `object-${nameSingular}`,
  workspaceId: WORKSPACE_ID,
  nameSingular,
  namePlural: `${nameSingular}s`,
  labelSingular: nameSingular,
  labelPlural: `${nameSingular}s`,
  description: null,
  icon: null,
  isActive: true,
  isSystem: true,
  isCustom: false,
  isSearchable: false,
  labelIdentifierFieldMetadataId: null,
  duplicateCriteria: null,
  imageIdentifierFieldMetadataId: null,
  fields: [
    buildField({
      name: 'target',
      objectMetadataId: `object-${nameSingular}`,
      id: `field-${nameSingular}-target`,
      type: 'MORPH_RELATION',
      settings: {
        relationType: 'MANY_TO_ONE',
        morphTargets: [
          {
            objectMetadataId: 'object-person',
            targetFieldMetadataId: 'field-person-inverse',
            nameSingular: 'person',
            namePlural: 'people',
          },
        ],
      },
    }),
  ],
});

const buildCustomObject = (nameSingular: string): FlatObjectMetadata => ({
  ...buildActivityObject(nameSingular),
  isSystem: false,
  isCustom: true,
  fields: [],
});

const buildClient = () =>
  ({ query: vi.fn().mockResolvedValue({ rows: [] }) }) as unknown as Client;

describe('attachActivityRelations', () => {
  it('adds the object to every activity morph field', async () => {
    const activityObjects = [
      buildActivityObject('noteTarget'),
      buildActivityObject('taskTarget'),
      buildActivityObject('attachment'),
      buildActivityObject('timelineActivity'),
    ];
    const clube = buildCustomObject('clube');

    await attachActivityRelations({
      client: buildClient(),
      workspaceId: WORKSPACE_ID,
      object: clube,
      objects: [...activityObjects, clube],
    });

    for (const activityObject of activityObjects) {
      const morphField = activityObject.fields[0];

      expect(
        morphField?.settings?.morphTargets?.map(
          (target) => target.nameSingular,
        ),
      ).toEqual(['person', 'clube']);
    }

    expect(clube.fields.map((field) => field.name)).toEqual([
      'noteTargets',
      'taskTargets',
      'attachments',
      'timelineActivities',
    ]);
  });

  // The backfill loops every custom object against one metadata snapshot; a
  // copied morph field would make each object erase the previous one's target.
  it('keeps every object when several are attached in a row', async () => {
    const noteTarget = buildActivityObject('noteTarget');
    const clube = buildCustomObject('clube');
    const membro = buildCustomObject('membro');
    const objects = [noteTarget, clube, membro];

    for (const object of [clube, membro]) {
      await attachActivityRelations({
        client: buildClient(),
        workspaceId: WORKSPACE_ID,
        object,
        objects,
      });
    }

    expect(
      noteTarget.fields[0]?.settings?.morphTargets?.map(
        (target) => target.nameSingular,
      ),
    ).toEqual(['person', 'clube', 'membro']);
  });

  it('is idempotent for an object already attached', async () => {
    const noteTarget = buildActivityObject('noteTarget');
    const clube = buildCustomObject('clube');
    const objects = [noteTarget, clube];

    await attachActivityRelations({
      client: buildClient(),
      workspaceId: WORKSPACE_ID,
      object: clube,
      objects,
    });
    await attachActivityRelations({
      client: buildClient(),
      workspaceId: WORKSPACE_ID,
      object: clube,
      objects,
    });

    expect(noteTarget.fields[0]?.settings?.morphTargets).toHaveLength(2);
    expect(clube.fields).toHaveLength(1);
  });

  it('adds one join column per activity object', async () => {
    const client = buildClient();
    const noteTarget = buildActivityObject('noteTarget');
    const clube = buildCustomObject('clube');

    await attachActivityRelations({
      client,
      workspaceId: WORKSPACE_ID,
      object: clube,
      objects: [noteTarget, clube],
    });

    const statements = vi
      .mocked(client.query)
      .mock.calls.map((call) => String(call[0]));

    expect(
      statements.some((statement) => statement.includes('"targetClubeId"')),
    ).toBe(true);
  });
});

describe('attachActivityRelations repair', () => {
  // The first attempt wrote the inverse field but lost the morph target;
  // (objectMetadataId, name) is unique, so the repair must reuse that field.
  it('reuses an inverse field left behind by a half-applied run', async () => {
    const noteTarget = buildActivityObject('noteTarget');
    const clube = buildCustomObject('clube');
    const leftover = buildField({
      name: 'noteTargets',
      id: 'field-left-behind',
      objectMetadataId: clube.id,
      type: 'RELATION',
      settings: { relationType: 'ONE_TO_MANY' },
    });

    clube.fields.push(leftover);

    await attachActivityRelations({
      client: buildClient(),
      workspaceId: WORKSPACE_ID,
      object: clube,
      objects: [noteTarget, clube],
    });

    expect(clube.fields.filter((field) => field.name === 'noteTargets')).toHaveLength(1);
    expect(
      noteTarget.fields[0]?.settings?.morphTargets?.at(-1)
        ?.targetFieldMetadataId,
    ).toBe('field-left-behind');
  });
});
