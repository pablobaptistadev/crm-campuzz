import {
  type CompositeProperty,
  getCompositeTypeDefinitionOrThrow,
  isCompositeFieldMetadataType,
} from 'src/metadata/composite-types';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';

export const pascalCase = (value: string): string =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);

// Base36 of the uuid read as one big integer. Shortens 32 hex chars to ~25,
// which matters because Postgres identifiers cap at 63 bytes.
export const uuidToBase36 = (uuid: string): string =>
  BigInt(`0x${uuid.replace(/-/g, '')}`).toString(36);

export const getWorkspaceSchemaName = (workspaceId: string): string =>
  `workspace_${uuidToBase36(workspaceId)}`;

export const CUSTOM_NAME_PREFIX = '_';

// Objects created by users get an underscore prefix so they can never collide
// with a standard object added later by an upgrade.
export const computeTableName = (
  nameSingular: string,
  isCustom: boolean,
): string => (isCustom ? `${CUSTOM_NAME_PREFIX}${nameSingular}` : nameSingular);

export const computeColumnName = (
  fieldName: string,
  options?: { isForeignKey?: boolean },
): string => (options?.isForeignKey === true ? `${fieldName}Id` : fieldName);

export const computeCompositeColumnName = (
  fieldName: string,
  compositeProperty: CompositeProperty,
): string => `${fieldName}${pascalCase(compositeProperty.name)}`;

export const computePostgresEnumName = ({
  tableName,
  columnName,
}: {
  tableName: string;
  columnName: string;
}): string => `${tableName}_${columnName}_enum`;

// Every column a field owns. A ONE_TO_MANY relation owns none: the foreign key
// lives on the MANY_TO_ONE side.
export const computeFieldColumnNames = ({
  name,
  type,
  relationType,
}: {
  name: string;
  type: FieldMetadataType;
  relationType?: 'MANY_TO_ONE' | 'ONE_TO_MANY';
}): string[] => {
  if (type === 'RELATION' || type === 'MORPH_RELATION') {
    return relationType === 'MANY_TO_ONE'
      ? [computeColumnName(name, { isForeignKey: true })]
      : [];
  }

  if (isCompositeFieldMetadataType(type)) {
    return getCompositeTypeDefinitionOrThrow(type).properties.map((property) =>
      computeCompositeColumnName(name, property),
    );
  }

  return [computeColumnName(name)];
};
