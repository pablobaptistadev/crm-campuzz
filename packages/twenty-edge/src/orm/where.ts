import { escapeIdentifier } from 'src/ddl/escape';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';
import { type ParameterBag } from 'src/orm/params';

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'is'
  | 'like'
  | 'ilike'
  | 'startsWith'
  | 'endsWith'
  | 'contains'
  | 'containsAny'
  | 'notContains'
  | 'containsIlike'
  | 'search'
  | 'isEmptyArray'
  // Strict variants skip the empty-value widening below. Only the keyset
  // pagination filter uses them, because a cursor must compare exactly.
  | 'eqStrict'
  | 'isStrictly';

export type FieldCondition = Partial<Record<FilterOperator, unknown>>;

export type RecordFilter = {
  and?: RecordFilter[];
  or?: RecordFilter[];
  not?: RecordFilter;
} & Record<string, unknown>;

// Postgres has no single "empty" value, so Twenty treats the per-type empty
// value as equivalent to NULL. Dropping this changes which rows match: a filter
// for eq:'' must also return rows where the column is NULL.
const findDefaultNullEquivalentValue = (
  type: FieldMetadataType,
): string | null => {
  switch (type) {
    case 'TEXT':
    case 'RICH_TEXT':
      return '';
    case 'ARRAY':
    case 'MULTI_SELECT':
      return '{}';
    case 'RAW_JSON':
    case 'FILES':
      return '{}';
    default:
      return null;
  }
};

const WIDENED_OPERATORS = new Set<FilterOperator>(['eq', 'is', 'like']);

export type WhereConditionInput = {
  columnExpression: string;
  operator: FilterOperator;
  value: unknown;
  fieldType: FieldMetadataType;
  parameters: ParameterBag;
};

export const computeWhereConditionParts = ({
  columnExpression,
  operator,
  value,
  fieldType,
  parameters,
}: WhereConditionInput): string => {
  const base = computeBaseCondition({
    columnExpression,
    operator,
    value,
    fieldType,
    parameters,
  });

  if (!WIDENED_OPERATORS.has(operator)) {
    return base;
  }

  const nullEquivalent = findDefaultNullEquivalentValue(fieldType);

  if (nullEquivalent === null) {
    return base;
  }

  if (operator === 'is') {
    return base;
  }

  if (value === nullEquivalent) {
    return `(${base} OR ${columnExpression} IS NULL)`;
  }

  return base;
};

const computeBaseCondition = ({
  columnExpression,
  operator,
  value,
  fieldType,
  parameters,
}: WhereConditionInput): string => {
  switch (operator) {
    case 'eq':
    case 'eqStrict':
      // A DATE_TIME equality must span the stored millisecond, not match an
      // exact instant the client never sent.
      return fieldType === 'DATE_TIME'
        ? `(${columnExpression} >= ${parameters.add(value)} AND ${columnExpression} < ${parameters.add(value)}::timestamptz + interval '1 millisecond')`
        : `${columnExpression} = ${parameters.add(value)}`;
    case 'neq':
      return `${columnExpression} <> ${parameters.add(value)}`;
    case 'gt':
      return `${columnExpression} > ${parameters.add(value)}`;
    case 'gte':
      return `${columnExpression} >= ${parameters.add(value)}`;
    case 'lt':
      return `${columnExpression} < ${parameters.add(value)}`;
    case 'lte':
      return `${columnExpression} <= ${parameters.add(value)}`;
    case 'in':
      return `${columnExpression} = ANY(${parameters.add(value)})`;
    case 'is':
    case 'isStrictly':
      return value === 'NULL'
        ? `${columnExpression} IS NULL`
        : `${columnExpression} IS NOT NULL`;
    case 'like':
      return `${columnExpression}::text LIKE ${parameters.add(value)}`;
    case 'ilike':
      return `${columnExpression}::text ILIKE ${parameters.add(value)}`;
    case 'startsWith':
      return `${columnExpression}::text ^@ ${parameters.add(value)}`;
    case 'endsWith':
      return `RIGHT(${columnExpression}::text, LENGTH(${parameters.add(value)})) = ${parameters.add(value)}`;
    case 'contains':
      return `${columnExpression} @> ${parameters.add(value)}`;
    case 'containsAny':
      return `${columnExpression}::text[] && ${parameters.add(value)}::text[]`;
    case 'notContains':
      return `NOT (${columnExpression}::text[] && ${parameters.add(value)}::text[])`;
    case 'containsIlike':
      return `EXISTS (SELECT 1 FROM unnest(${columnExpression}) AS element WHERE element ILIKE ${parameters.add(value)})`;
    case 'search':
      return `(${columnExpression} @@ to_tsquery('simple', public.unaccent_immutable(${parameters.add(value)})) OR public.unaccent_immutable(${columnExpression}::text) ILIKE public.unaccent_immutable(${parameters.add(`%${String(value)}%`)}))`;
    case 'isEmptyArray':
      return `${columnExpression} = '{}'`;
    default:
      throw new Error(`Unsupported filter operator: ${String(operator)}`);
  }
};

export const buildColumnExpression = ({
  alias,
  columnName,
}: {
  alias: string;
  columnName: string;
}): string => `${escapeIdentifier(alias)}.${escapeIdentifier(columnName)}`;
