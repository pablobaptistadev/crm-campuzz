import {
  type FieldMetadataOption,
  type FieldMetadataSettings,
  type FlatFieldMetadata,
  type FlatObjectMetadata,
} from 'src/metadata/types';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';

export type StandardFieldInput = {
  name: string;
  label: string;
  type: FieldMetadataType;
  isNullable?: boolean;
  isSystem?: boolean;
  isUnique?: boolean;
  icon?: string;
  defaultValue?: unknown;
  options?: FieldMetadataOption[];
  settings?: FieldMetadataSettings;
  relationTargetObjectNameSingular?: string;
  relationTargetFieldName?: string;
  // A morph relation names several targets, each with its own inverse field.
  morphTargets?: { nameSingular: string; namePlural: string; fieldName: string }[];
};

export type StandardObjectInput = {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  icon: string;
  labelIdentifierFieldName?: string;
  isSystem?: boolean;
  fields: StandardFieldInput[];
};

// Every object carries the same audit columns, so they are declared once here
// rather than repeated 10 times.
export const SYSTEM_FIELDS: StandardFieldInput[] = [
  {
    name: 'id',
    label: 'Id',
    type: 'UUID',
    isNullable: false,
    isSystem: true,
    defaultValue: 'uuid',
  },
  {
    name: 'createdAt',
    label: 'Creation date',
    type: 'DATE_TIME',
    isNullable: false,
    isSystem: true,
    defaultValue: 'now',
  },
  {
    name: 'updatedAt',
    label: 'Last update',
    type: 'DATE_TIME',
    isNullable: false,
    isSystem: true,
    defaultValue: 'now',
  },
  { name: 'deletedAt', label: 'Deleted at', type: 'DATE_TIME', isSystem: true },
  { name: 'createdBy', label: 'Created by', type: 'ACTOR', isSystem: true },
  { name: 'position', label: 'Position', type: 'POSITION', isSystem: true },
];

// Deterministic ids keep a workspace's metadata reproducible across seeds, which
// is what lets the front cache it by collection hash.
const buildDeterministicId = (workspaceId: string, path: string): string => {
  let hash = 0n;

  for (const character of `${workspaceId}:${path}`) {
    hash = (hash * 31n + BigInt(character.codePointAt(0) ?? 0)) % (1n << 128n);
  }

  const hex = hash.toString(16).padStart(32, '0').slice(0, 32);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
};

export const buildStandardObject = ({
  input,
  workspaceId,
}: {
  input: StandardObjectInput;
  workspaceId: string;
}): FlatObjectMetadata => {
  const objectId = buildDeterministicId(workspaceId, `object:${input.nameSingular}`);
  const allFields = [...SYSTEM_FIELDS, ...input.fields];

  const fields: FlatFieldMetadata[] = allFields.map((field) => ({
    id: buildDeterministicId(
      workspaceId,
      `field:${input.nameSingular}.${field.name}`,
    ),
    objectMetadataId: objectId,
    workspaceId,
    name: field.name,
    label: field.label,
    type: field.type,
    description: null,
    icon: field.icon ?? null,
    isActive: true,
    isSystem: field.isSystem ?? false,
    isNullable: field.isNullable ?? true,
    isUnique: field.isUnique ?? false,
    defaultValue: field.defaultValue ?? null,
    options: field.options ?? null,
    settings:
      field.morphTargets === undefined
        ? (field.settings ?? null)
        : {
            ...field.settings,
            morphTargets: field.morphTargets.map((target) => ({
              objectMetadataId: buildDeterministicId(
                workspaceId,
                `object:${target.nameSingular}`,
              ),
              targetFieldMetadataId: buildDeterministicId(
                workspaceId,
                `field:${target.nameSingular}.${target.fieldName}`,
              ),
              nameSingular: target.nameSingular,
              namePlural: target.namePlural,
            })),
          },
    relationTargetFieldMetadataId:
      field.relationTargetObjectNameSingular !== undefined &&
      field.relationTargetFieldName !== undefined
        ? buildDeterministicId(
            workspaceId,
            `field:${field.relationTargetObjectNameSingular}.${field.relationTargetFieldName}`,
          )
        : null,
    relationTargetObjectMetadataId:
      field.relationTargetObjectNameSingular !== undefined
        ? buildDeterministicId(
            workspaceId,
            `object:${field.relationTargetObjectNameSingular}`,
          )
        : null,
  }));

  const labelIdentifier = fields.find(
    (field) => field.name === (input.labelIdentifierFieldName ?? 'name'),
  );

  return {
    id: objectId,
    workspaceId,
    nameSingular: input.nameSingular,
    namePlural: input.namePlural,
    labelSingular: input.labelSingular,
    labelPlural: input.labelPlural,
    description: null,
    icon: input.icon,
    isActive: true,
    isSystem: input.isSystem ?? false,
    isCustom: false,
    isSearchable: true,
    // twenty-front parses this with z.uuid(), so an object with no name-like
    // field — a junction such as noteTarget — still needs one. Its id is the
    // honest answer: that is what identifies the row.
    labelIdentifierFieldMetadataId:
      labelIdentifier?.id ??
      fields.find((field) => field.name === 'id')?.id ??
      null,
    imageIdentifierFieldMetadataId: null,
    fields,
  };
};
