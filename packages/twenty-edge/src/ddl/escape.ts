// DDL cannot use bind parameters and object/field names come from user input, so
// every identifier and literal that reaches a CREATE/ALTER statement must pass
// through here. This is the only barrier against SQL injection in the DDL path.
export const escapeIdentifier = (identifier: string): string => {
  if (identifier.includes('\0')) {
    throw new Error('Identifier contains a null byte');
  }

  return `"${identifier.replace(/"/g, '""')}"`;
};

export const escapeLiteral = (literal: string): string => {
  if (literal.includes('\0')) {
    throw new Error('Literal contains a null byte');
  }

  const escaped = literal.replace(/'/g, "''");

  // A backslash inside a standard string literal is only special when
  // standard_conforming_strings is off; E'' makes the escaping explicit either way.
  return literal.includes('\\') ? `E'${escaped.replace(/\\/g, '\\\\')}'` : `'${escaped}'`;
};

export const qualifiedTableName = ({
  schemaName,
  tableName,
}: {
  schemaName: string;
  tableName: string;
}): string => `${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}`;
