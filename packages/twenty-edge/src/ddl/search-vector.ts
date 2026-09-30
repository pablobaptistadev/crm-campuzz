import { escapeIdentifier, escapeLiteral } from 'src/ddl/escape';
import { type FlatObjectMetadata } from 'src/metadata/types';
import { type WorkspaceTableShape } from 'src/orm/table-shape';

export const SEARCH_VECTOR_COLUMN_NAME = 'searchVector';

// Which field types carry text worth matching. RICH_TEXT is deliberately out:
// its body is markdown, and indexing it drowns the label identifier in noise.
const SEARCHABLE_FIELD_TYPES = new Set([
  'TEXT',
  'FULL_NAME',
  'EMAILS',
  'PHONES',
  'LINKS',
  'ADDRESS',
]);

// A generated column can only call immutable functions, and unaccent is not one
// — it reads its dictionary at runtime. The wrapper pins the dictionary, which
// is what lets "Joao" find "João".
export const UNACCENT_IMMUTABLE_STATEMENT = `
CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$`;

const findSearchableColumnNames = ({
  object,
  shape,
}: {
  object: FlatObjectMetadata;
  shape: WorkspaceTableShape;
}): string[] => {
  const searchableFieldNames = new Set(
    object.fields
      .filter(
        (field) => field.isActive && SEARCHABLE_FIELD_TYPES.has(field.type),
      )
      .map((field) => field.name),
  );

  return [...shape.columnShapeByColumnName.values()]
    .filter((column) => {
      const owningFieldName =
        column.compositeParentFieldName ?? column.fieldName;

      if (!searchableFieldNames.has(owningFieldName)) {
        return false;
      }

      // A composite column carries the type of its own property, not of the
      // field. An address spreads over text plus a numeric latitude and
      // longitude, a phone over text plus a JSON list of the extra numbers —
      // concatenating those is a type error, not merely useless.
      return (
        column.compositePropertyName === null || column.fieldType === 'TEXT'
      );
    })
    .map((column) => column.columnName)
    .sort();
};

// Weighted the way Postgres ranks: the label identifier is what someone types
// when they mean this record, everything else is context.
export const buildSearchVectorExpression = ({
  object,
  shape,
}: {
  object: FlatObjectMetadata;
  shape: WorkspaceTableShape;
}): string | null => {
  const columnNames = findSearchableColumnNames({ object, shape });

  if (columnNames.length === 0) {
    return null;
  }

  const labelFieldName = object.fields.find(
    (field) => field.id === object.labelIdentifierFieldMetadataId,
  )?.name;

  const toVector = (names: string[], weight: 'A' | 'B'): string =>
    `setweight(to_tsvector('simple', public.unaccent_immutable(${names
      .map((name) => `coalesce(${escapeIdentifier(name)}::text, '')`)
      .join(` || ' ' || `)})), ${escapeLiteral(weight)})`;

  const labelColumnNames = columnNames.filter((columnName) => {
    const column = shape.columnShapeByColumnName.get(columnName);

    return (
      (column?.compositeParentFieldName ?? column?.fieldName) === labelFieldName
    );
  });

  const restColumnNames = columnNames.filter(
    (columnName) => !labelColumnNames.includes(columnName),
  );

  const parts = [
    labelColumnNames.length > 0 ? toVector(labelColumnNames, 'A') : null,
    restColumnNames.length > 0 ? toVector(restColumnNames, 'B') : null,
  ].filter((part): part is string => part !== null);

  return parts.join(' || ');
};

// Dropping and re-adding is what keeps the column in step with the fields: a
// generated column's expression cannot be altered in place, and the column is
// derived, so nothing is lost.
export const buildSearchVectorStatements = ({
  object,
  shape,
}: {
  object: FlatObjectMetadata;
  shape: WorkspaceTableShape;
}): string[] => {
  const expression = buildSearchVectorExpression({ object, shape });
  const table = `${escapeIdentifier(shape.schemaName)}.${escapeIdentifier(shape.tableName)}`;
  const column = escapeIdentifier(SEARCH_VECTOR_COLUMN_NAME);
  const indexName = escapeIdentifier(`IDX_${shape.tableName}_search`);

  if (expression === null) {
    return [`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`];
  }

  return [
    `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`,
    `ALTER TABLE ${table} ADD COLUMN ${column} tsvector GENERATED ALWAYS AS (${expression}) STORED`,
    `CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} USING GIN (${column})`,
  ];
};
