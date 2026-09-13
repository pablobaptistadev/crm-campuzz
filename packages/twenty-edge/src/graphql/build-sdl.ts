import {
  getCompositeTypeDefinitionOrThrow,
  isCompositeFieldMetadataType,
} from 'src/metadata/composite-types';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';
import { pascalCase } from 'src/metadata/naming';
import {
  type FlatFieldMetadata,
  type FlatObjectMetadata,
  type WorkspaceMetadata,
} from 'src/metadata/types';
import { SCALAR_SDL } from 'src/graphql/scalars';

const SCALAR_BY_FIELD_TYPE: Partial<Record<FieldMetadataType, string>> = {
  UUID: 'UUID',
  TEXT: 'String',
  NUMBER: 'Float',
  NUMERIC: 'BigFloat',
  POSITION: 'Position',
  BOOLEAN: 'Boolean',
  DATE_TIME: 'DateTime',
  DATE: 'Date',
  RAW_JSON: 'RawJSON',
  FILES: '[FileValue!]',
  TS_VECTOR: 'String',
  ARRAY: '[String]',
};

// The few field types whose input shape differs from their output shape.
const INPUT_SCALAR_BY_FIELD_TYPE: Partial<Record<FieldMetadataType, string>> = {
  FILES: '[FileValueInput!]',
};

const FILTER_BY_SCALAR: Record<string, string> = {
  UUID: 'UUIDFilter',
  String: 'StringFilter',
  Float: 'FloatFilter',
  BigFloat: 'BigFloatFilter',
  Position: 'FloatFilter',
  Boolean: 'BooleanFilter',
  DateTime: 'DateTimeFilter',
  Date: 'DateFilter',
  RawJSON: 'RawJsonFilter',
  '[FileValue!]': 'RawJsonFilter',
  '[String]': 'ArrayFilter',
};

// twenty-front selects into three composite sub-properties that are jsonb in
// the database: secondaryLinks, additionalPhones and the ACTOR context. A leaf
// scalar there fails the document with "must not have a selection".
const STRUCTURED_PROPERTY_TYPES: Record<string, string> = {
  secondaryLinks: '[LinkValue!]',
  additionalPhones: '[PhoneValue!]',
  context: 'ActorContext',
};

const STRUCTURED_INPUT_TYPES: Record<string, string> = {
  secondaryLinks: '[LinkValueInput!]',
  additionalPhones: '[PhoneValueInput!]',
  context: 'ActorContextInput',
};

export const COMMON_SDL = `
type LinkValue { label: String url: String }
input LinkValueInput { label: String url: String }

type PhoneValue { number: String callingCode: String countryCode: String }
input PhoneValueInput { number: String callingCode: String countryCode: String }

type ActorContext { provider: String }
input ActorContextInput { provider: String }

type FileValue { fileId: UUID label: String extension: String url: String }
input FileValueInput { fileId: UUID label: String extension: String url: String }

enum OrderByDirection {
  AscNullsFirst
  AscNullsLast
  DescNullsFirst
  DescNullsLast
}

enum FilterIs { NULL NOT_NULL }

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: Cursor
  endCursor: Cursor
}

input StringFilter {
  eq: String neq: String in: [String!] is: FilterIs
  gt: String gte: String lt: String lte: String
  like: String ilike: String startsWith: String endsWith: String
  regex: String iregex: String search: String
}
input UUIDFilter { eq: UUID neq: UUID in: [UUID!] is: FilterIs gt: UUID gte: UUID lt: UUID lte: UUID }
input FloatFilter { eq: Float neq: Float in: [Float!] is: FilterIs gt: Float gte: Float lt: Float lte: Float }
input BigFloatFilter { eq: BigFloat neq: BigFloat in: [BigFloat!] is: FilterIs gt: BigFloat gte: BigFloat lt: BigFloat lte: BigFloat }
input BooleanFilter { eq: Boolean is: FilterIs }
input DateTimeFilter { eq: DateTime neq: DateTime in: [DateTime!] is: FilterIs gt: DateTime gte: DateTime lt: DateTime lte: DateTime }
input DateFilter { eq: Date neq: Date in: [Date!] is: FilterIs gt: Date gte: Date lt: Date lte: Date }
input RawJsonFilter { eq: RawJSON is: FilterIs }
input ArrayFilter { is: FilterIs contains: [String!] containsAny: [String!] notContains: [String!] containsIlike: String isEmptyArray: Boolean }
`;

const buildCompositeSdl = (type: FieldMetadataType): string => {
  const definition = getCompositeTypeDefinitionOrThrow(type);
  const typeName = pascalCase(toCamelCase(type));

  const outputFields = definition.properties
    .filter((property) => property.hidden !== 'output' && property.hidden !== true)
    .map(
      (property) =>
        `  ${property.name}: ${
          STRUCTURED_PROPERTY_TYPES[property.name] ??
          SCALAR_BY_FIELD_TYPE[property.type] ??
          'String'
        }`,
    )
    .join('\n');

  const inputFields = definition.properties
    .filter((property) => property.hidden !== 'input' && property.hidden !== true)
    .map(
      (property) =>
        `  ${property.name}: ${
          STRUCTURED_INPUT_TYPES[property.name] ??
          SCALAR_BY_FIELD_TYPE[property.type] ??
          'String'
        }`,
    )
    .join('\n');

  const filterFields = definition.properties
    .map((property) => {
      const scalar = SCALAR_BY_FIELD_TYPE[property.type] ?? 'String';

      return `  ${property.name}: ${FILTER_BY_SCALAR[scalar] ?? 'StringFilter'}`;
    })
    .join('\n');

  return `
type ${typeName} {
${outputFields}
}
input ${typeName}CreateInput {
${inputFields}
}
input ${typeName}FilterInput {
${filterFields}
}
input ${typeName}OrderByInput {
${definition.properties.map((property) => `  ${property.name}: OrderByDirection`).join('\n')}
}`;
};

const toCamelCase = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((part, index) => (index === 0 ? part : pascalCase(part)))
    .join('');

export const buildCompositeTypesSdl = (): string =>
  (
    [
      'FULL_NAME',
      'CURRENCY',
      'LINKS',
      'EMAILS',
      'PHONES',
      'ADDRESS',
      'ACTOR',
      'RICH_TEXT',
    ] as FieldMetadataType[]
  )
    .map(buildCompositeSdl)
    .join('\n');

const buildSelectEnumName = (
  object: FlatObjectMetadata,
  field: FlatFieldMetadata,
): string => `${pascalCase(object.nameSingular)}${pascalCase(field.name)}Enum`;

const resolveFieldOutputType = ({
  object,
  field,
  objectById,
}: {
  object: FlatObjectMetadata;
  field: FlatFieldMetadata;
  objectById: Map<string, FlatObjectMetadata>;
}): string | null => {
  if (field.type === 'RELATION' || field.type === 'MORPH_RELATION') {
    const target =
      field.relationTargetObjectMetadataId === null
        ? undefined
        : objectById.get(field.relationTargetObjectMetadataId);

    if (target === undefined) {
      return null;
    }

    return field.settings?.relationType === 'MANY_TO_ONE'
      ? pascalCase(target.nameSingular)
      : `${pascalCase(target.nameSingular)}Connection`;
  }

  if (isCompositeFieldMetadataType(field.type)) {
    return pascalCase(toCamelCase(field.type));
  }

  if (field.type === 'SELECT' || field.type === 'RATING') {
    return buildSelectEnumName(object, field);
  }

  if (field.type === 'MULTI_SELECT') {
    return `[${buildSelectEnumName(object, field)}]`;
  }

  return SCALAR_BY_FIELD_TYPE[field.type] ?? 'String';
};

const resolveFieldFilterType = ({
  object,
  field,
}: {
  object: FlatObjectMetadata;
  field: FlatFieldMetadata;
}): string | null => {
  if (field.type === 'RELATION' || field.type === 'MORPH_RELATION') {
    return null;
  }

  if (isCompositeFieldMetadataType(field.type)) {
    return `${pascalCase(toCamelCase(field.type))}FilterInput`;
  }

  if (field.type === 'SELECT' || field.type === 'RATING' || field.type === 'MULTI_SELECT') {
    return 'StringFilter';
  }

  const scalar = SCALAR_BY_FIELD_TYPE[field.type] ?? 'String';

  return FILTER_BY_SCALAR[scalar] ?? 'StringFilter';
};

export const buildObjectSdl = ({
  object,
  objectById,
}: {
  object: FlatObjectMetadata;
  objectById: Map<string, FlatObjectMetadata>;
}): string => {
  const typeName = pascalCase(object.nameSingular);
  const activeFields = object.fields.filter((field) => field.isActive);

  const enums = activeFields
    .filter(
      (field) =>
        field.type === 'SELECT' ||
        field.type === 'MULTI_SELECT' ||
        field.type === 'RATING',
    )
    .map((field) => {
      const values = (field.options ?? []).map((option) => option.value);

      return values.length === 0
        ? ''
        : `enum ${buildSelectEnumName(object, field)} {\n${values.map((value) => `  ${value}`).join('\n')}\n}`;
    })
    .filter((sdl) => sdl.length > 0)
    .join('\n');

  const outputFields = activeFields
    .map((field) => {
      const outputType = resolveFieldOutputType({ object, field, objectById });

      if (outputType === null) {
        return null;
      }

      const joinColumn =
        field.settings?.relationType === 'MANY_TO_ONE'
          ? `  ${field.name}Id: UUID\n`
          : '';

      return `${joinColumn}  ${field.name}: ${outputType}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');

  const filterFields = activeFields
    .map((field) => {
      const filterType = resolveFieldFilterType({ object, field });

      if (filterType === null) {
        return field.settings?.relationType === 'MANY_TO_ONE'
          ? `  ${field.name}Id: UUIDFilter`
          : null;
      }

      return `  ${field.name}: ${filterType}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');

  const orderByFields = activeFields
    .filter(
      (field) =>
        field.type !== 'RELATION' &&
        field.type !== 'MORPH_RELATION' &&
        field.type !== 'TS_VECTOR',
    )
    .map((field) =>
      isCompositeFieldMetadataType(field.type)
        ? `  ${field.name}: ${pascalCase(toCamelCase(field.type))}OrderByInput`
        : `  ${field.name}: OrderByDirection`,
    )
    .join('\n');

  const mutationInputFields = activeFields
    .filter(
      (field) =>
        field.type !== 'TS_VECTOR' &&
        (field.type !== 'RELATION' ||
          field.settings?.relationType === 'MANY_TO_ONE'),
    )
    .map((field) => {
      if (field.type === 'RELATION' || field.type === 'MORPH_RELATION') {
        return `  ${field.name}Id: UUID`;
      }

      if (isCompositeFieldMetadataType(field.type)) {
        return `  ${field.name}: ${pascalCase(toCamelCase(field.type))}CreateInput`;
      }

      if (field.type === 'SELECT' || field.type === 'RATING') {
        return `  ${field.name}: ${buildSelectEnumName(object, field)}`;
      }

      if (field.type === 'MULTI_SELECT') {
        return `  ${field.name}: [${buildSelectEnumName(object, field)}]`;
      }

      return `  ${field.name}: ${
        INPUT_SCALAR_BY_FIELD_TYPE[field.type] ??
        SCALAR_BY_FIELD_TYPE[field.type] ??
        'String'
      }`;
    })
    .join('\n');

  return `
${enums}

type ${typeName} {
${outputFields}
}

type ${typeName}Edge {
  node: ${typeName}!
  cursor: Cursor!
}

type ${typeName}Connection {
  edges: [${typeName}Edge!]!
  pageInfo: PageInfo!
  totalCount: Int
}

input ${typeName}FilterInput {
  and: [${typeName}FilterInput!]
  or: [${typeName}FilterInput!]
  not: ${typeName}FilterInput
${filterFields}
}

input ${typeName}OrderByInput {
${orderByFields}
}

input ${typeName}CreateInput {
${mutationInputFields}
}

input ${typeName}UpdateInput {
${mutationInputFields}
}

input ${typeName}WhereUniqueInput {
  id: UUID!
}`;
};

const buildRootSdl = (objects: FlatObjectMetadata[]): string => {
  const queries = objects
    .map((object) => {
      const typeName = pascalCase(object.nameSingular);

      return `  ${object.namePlural}(filter: ${typeName}FilterInput, orderBy: [${typeName}OrderByInput], first: Int, last: Int, before: String, after: String, offset: Int): ${typeName}Connection!
  ${object.nameSingular}(filter: ${typeName}FilterInput): ${typeName}`;
    })
    .join('\n');

  const mutations = objects
    .map((object) => {
      const singular = pascalCase(object.nameSingular);
      const plural = pascalCase(object.namePlural);

      return `  create${singular}(data: ${singular}CreateInput!): ${singular}
  create${plural}(data: [${singular}CreateInput!]!): [${singular}!]!
  update${singular}(id: UUID!, data: ${singular}UpdateInput!): ${singular}
  delete${singular}(id: UUID!): ${singular}
  destroy${singular}(id: UUID!): ${singular}
  restore${singular}(id: UUID!): ${singular}`;
    })
    .join('\n');

  return `
type Query {
${queries}
}

type Mutation {
${mutations}
}`;
};

export const buildWorkspaceSchemaSdl = (metadata: WorkspaceMetadata): string => {
  const objects = metadata.objects.filter((object) => object.isActive);
  const objectById = new Map(objects.map((object) => [object.id, object]));

  return [
    SCALAR_SDL,
    COMMON_SDL,
    buildCompositeTypesSdl(),
    ...objects.map((object) => buildObjectSdl({ object, objectById })),
    buildRootSdl(objects),
  ].join('\n');
};
