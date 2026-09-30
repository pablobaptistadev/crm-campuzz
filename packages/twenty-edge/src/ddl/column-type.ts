import { type FieldMetadataType } from 'src/metadata/field-metadata-type';

// Composite types never reach here: they are flattened into one column per
// property before column types are resolved.
const COLUMN_TYPE_BY_FIELD_METADATA_TYPE: Record<string, string> = {
  UUID: 'uuid',
  TEXT: 'text',
  RICH_TEXT: 'text',
  ARRAY: 'text',
  NUMERIC: 'numeric',
  NUMBER: 'float',
  POSITION: 'float',
  BOOLEAN: 'boolean',
  DATE_TIME: 'timestamptz',
  DATE: 'date',
  FILES: 'jsonb',
  RAW_JSON: 'jsonb',
  TS_VECTOR: 'tsvector',
  RELATION: 'uuid',
  MORPH_RELATION: 'uuid',
};

export const ENUM_FIELD_METADATA_TYPES = new Set<FieldMetadataType>([
  'RATING',
  'SELECT',
  'MULTI_SELECT',
]);

export const ARRAY_FIELD_METADATA_TYPES = new Set<FieldMetadataType>([
  'ARRAY',
  'MULTI_SELECT',
]);

export const isEnumFieldMetadataType = (type: FieldMetadataType): boolean =>
  ENUM_FIELD_METADATA_TYPES.has(type);

export const isArrayFieldMetadataType = (type: FieldMetadataType): boolean =>
  ARRAY_FIELD_METADATA_TYPES.has(type);

export const fieldMetadataTypeToColumnType = (
  type: FieldMetadataType,
): string => {
  const columnType = COLUMN_TYPE_BY_FIELD_METADATA_TYPE[type];

  if (columnType === undefined) {
    throw new Error(`No column type mapped for field metadata type ${type}`);
  }

  return columnType;
};
