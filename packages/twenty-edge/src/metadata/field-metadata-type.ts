// Mirrors FieldMetadataType in twenty-shared. String literals, not an enum, so
// the values survive JSON round-trips through the database unchanged.
export const FIELD_METADATA_TYPES = [
  'ACTOR',
  'ADDRESS',
  'ARRAY',
  'BOOLEAN',
  'CURRENCY',
  'DATE',
  'DATE_TIME',
  'EMAILS',
  'FILES',
  'FULL_NAME',
  'LINKS',
  'MORPH_RELATION',
  'MULTI_SELECT',
  'NUMBER',
  'NUMERIC',
  'PHONES',
  'POSITION',
  'RATING',
  'RAW_JSON',
  'RELATION',
  'RICH_TEXT',
  'SELECT',
  'TEXT',
  'TS_VECTOR',
  'UUID',
] as const;

export type FieldMetadataType = (typeof FIELD_METADATA_TYPES)[number];

export const isFieldMetadataType = (value: string): value is FieldMetadataType =>
  (FIELD_METADATA_TYPES as readonly string[]).includes(value);

export type RelationType = 'MANY_TO_ONE' | 'ONE_TO_MANY';

export type RelationOnDeleteAction =
  | 'CASCADE'
  | 'RESTRICT'
  | 'SET_NULL'
  | 'NO_ACTION';
