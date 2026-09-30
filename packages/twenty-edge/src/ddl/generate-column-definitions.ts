import {
  ARRAY_FIELD_METADATA_TYPES,
  fieldMetadataTypeToColumnType,
  isEnumFieldMetadataType,
} from 'src/ddl/column-type';
import { escapeIdentifier, escapeLiteral } from 'src/ddl/escape';
import {
  getCompositeTypeDefinitionOrThrow,
  isCompositeFieldMetadataType,
} from 'src/metadata/composite-types';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';
import {
  computeColumnName,
  computeCompositeColumnName,
  computeMorphFieldName,
  computePostgresEnumName,
} from 'src/metadata/naming';
import { type FlatFieldMetadata } from 'src/metadata/types';

export type ColumnDefinition = {
  columnName: string;
  columnType: string;
  isArray: boolean;
  isNullable: boolean;
  isPrimary: boolean;
  defaultValue: string | null;
  enumValues: string[] | null;
};

export type EnumDefinition = { enumName: string; values: string[] };

const buildEnumColumnType = ({
  tableName,
  columnName,
  schemaName,
}: {
  tableName: string;
  columnName: string;
  schemaName: string;
}): string =>
  `${escapeIdentifier(schemaName)}.${escapeIdentifier(
    computePostgresEnumName({ tableName, columnName }),
  )}`;

export const generateColumnDefinitions = ({
  field,
  tableName,
  schemaName,
}: {
  field: FlatFieldMetadata;
  tableName: string;
  schemaName: string;
}): ColumnDefinition[] => {
  // A ONE_TO_MANY relation owns no column: the foreign key lives on the other side.
  if (field.type === 'RELATION' || field.type === 'MORPH_RELATION') {
    if (field.settings?.relationType !== 'MANY_TO_ONE') {
      return [];
    }

    const morphTargets = field.settings.morphTargets ?? [];

    if (field.type === 'MORPH_RELATION' && morphTargets.length > 0) {
      return morphTargets.map((target) => ({
        columnName: computeColumnName(
          computeMorphFieldName({
            fieldName: field.name,
            relationType: 'MANY_TO_ONE',
            nameSingular: target.nameSingular,
            namePlural: target.namePlural,
          }),
          { isForeignKey: true },
        ),
        columnType: 'uuid',
        isArray: false,
        // Exactly one target is set on any given row, so each column has to
        // tolerate being empty regardless of the field's own nullability.
        isNullable: true,
        isPrimary: false,
        defaultValue: null,
        enumValues: null,
      }));
    }

    return [
      {
        columnName: computeColumnName(field.name, { isForeignKey: true }),
        columnType: 'uuid',
        isArray: false,
        isNullable: field.isNullable,
        isPrimary: false,
        defaultValue: null,
        enumValues: null,
      },
    ];
  }

  if (isCompositeFieldMetadataType(field.type)) {
    return getCompositeTypeDefinitionOrThrow(field.type).properties.map(
      (property) => {
        const columnName = computeCompositeColumnName(field.name, property);

        return {
          columnName,
          columnType: isEnumFieldMetadataType(property.type)
            ? buildEnumColumnType({ tableName, columnName, schemaName })
            : fieldMetadataTypeToColumnType(property.type),
          isArray:
            property.isArray === true ||
            ARRAY_FIELD_METADATA_TYPES.has(property.type),
          // A composite subcolumn is nullable unless both the parent field and
          // the property itself are required.
          isNullable: field.isNullable || property.isRequired !== true,
          isPrimary: false,
          defaultValue: null,
          enumValues: isEnumFieldMetadataType(property.type)
            ? (property.options ?? []).map((option) => option.value)
            : null,
        };
      },
    );
  }

  const columnName = computeColumnName(field.name);
  const isEnum = isEnumFieldMetadataType(field.type);

  return [
    {
      columnName,
      columnType: isEnum
        ? buildEnumColumnType({ tableName, columnName, schemaName })
        : fieldMetadataTypeToColumnType(field.type),
      isArray: ARRAY_FIELD_METADATA_TYPES.has(field.type),
      isNullable: field.name === 'id' ? false : field.isNullable,
      isPrimary: field.name === 'id',
      defaultValue: resolveDefaultValue(field.type, field.defaultValue),
      enumValues: isEnum ? (field.options ?? []).map((o) => o.value) : null,
    },
  ];
};

const resolveDefaultValue = (
  type: FieldMetadataType,
  defaultValue: unknown,
): string | null => {
  if (type === 'UUID' && defaultValue === undefined) {
    return null;
  }

  if (defaultValue === null || defaultValue === undefined) {
    return null;
  }

  if (typeof defaultValue === 'string') {
    // Twenty stores function defaults as bare identifiers like `now` or
    // `uuid`; anything else is a literal.
    return defaultValue === 'now'
      ? 'now()'
      : defaultValue === 'uuid'
        ? 'gen_random_uuid()'
        : escapeLiteral(defaultValue);
  }

  if (typeof defaultValue === 'number' || typeof defaultValue === 'boolean') {
    return String(defaultValue);
  }

  return escapeLiteral(JSON.stringify(defaultValue));
};

export const buildColumnSql = (definition: ColumnDefinition): string => {
  const parts = [
    escapeIdentifier(definition.columnName),
    `${definition.columnType}${definition.isArray ? '[]' : ''}`,
  ];

  if (definition.isPrimary) {
    parts.push('PRIMARY KEY');
  }

  if (!definition.isNullable) {
    parts.push('NOT NULL');
  }

  if (definition.defaultValue !== null) {
    parts.push(`DEFAULT ${definition.defaultValue}`);
  }

  return parts.join(' ');
};

export const collectEnumDefinitions = ({
  fields,
  tableName,
}: {
  fields: FlatFieldMetadata[];
  tableName: string;
}): EnumDefinition[] => {
  const enums: EnumDefinition[] = [];

  for (const field of fields) {
    if (isEnumFieldMetadataType(field.type)) {
      enums.push({
        enumName: computePostgresEnumName({
          tableName,
          columnName: computeColumnName(field.name),
        }),
        values: (field.options ?? []).map((option) => option.value),
      });
    }

    if (isCompositeFieldMetadataType(field.type)) {
      for (const property of getCompositeTypeDefinitionOrThrow(field.type)
        .properties) {
        if (isEnumFieldMetadataType(property.type)) {
          enums.push({
            enumName: computePostgresEnumName({
              tableName,
              columnName: computeCompositeColumnName(field.name, property),
            }),
            values: (property.options ?? []).map((option) => option.value),
          });
        }
      }
    }
  }

  return enums;
};
