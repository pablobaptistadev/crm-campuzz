import {
  type FieldMetadataType,
  type RelationOnDeleteAction,
  type RelationType,
} from 'src/metadata/field-metadata-type';

export type FieldMetadataOption = {
  id?: string;
  value: string;
  label: string;
  color?: string;
  position?: number;
};

export type MorphTarget = {
  objectMetadataId: string;
  targetFieldMetadataId: string;
  nameSingular: string;
  namePlural: string;
};

export type FieldMetadataSettings = {
  relationType?: RelationType;
  onDelete?: RelationOnDeleteAction;
  joinColumnName?: string;
  // A morph relation points at several objects at once: one join column per
  // target, named after the target rather than after the field alone.
  morphTargets?: MorphTarget[];
};

// The in-memory metadata model. Deliberately flat — no ORM entities, no lazy
// relations — so the whole workspace schema can be cached as plain JSON.
export type FlatFieldMetadata = {
  id: string;
  objectMetadataId: string;
  workspaceId: string;
  name: string;
  label: string;
  type: FieldMetadataType;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  isSystem: boolean;
  isNullable: boolean;
  isUnique: boolean;
  defaultValue: unknown;
  options: FieldMetadataOption[] | null;
  settings: FieldMetadataSettings | null;
  relationTargetFieldMetadataId: string | null;
  relationTargetObjectMetadataId: string | null;
};

export type FlatObjectMetadata = {
  id: string;
  workspaceId: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  isSystem: boolean;
  isCustom: boolean;
  isSearchable: boolean;
  labelIdentifierFieldMetadataId: string | null;
  // Column names, not field names: an inner array is a conjunction, the outer
  // one a disjunction. null means the object has no duplicate detection.
  duplicateCriteria: string[][] | null;
  imageIdentifierFieldMetadataId: string | null;
  fields: FlatFieldMetadata[];
};

export type WorkspaceMetadata = {
  workspaceId: string;
  schemaName: string;
  metadataVersion: number;
  objects: FlatObjectMetadata[];
};

export const findFieldByName = (
  object: FlatObjectMetadata,
  name: string,
): FlatFieldMetadata | undefined =>
  object.fields.find((field) => field.name === name);

export const findObjectByNameSingular = (
  metadata: WorkspaceMetadata,
  nameSingular: string,
): FlatObjectMetadata | undefined =>
  metadata.objects.find((object) => object.nameSingular === nameSingular);
