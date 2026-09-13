import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildCreateTableStatements,
  buildForeignKeyStatements,
} from 'src/ddl/create-workspace-schema';
import { getWorkspaceSchemaName } from 'src/metadata/naming';
import { buildStandardObjects } from 'src/standard/objects';

// Emits the exact DDL the bootstrap would run, so it can be executed against a
// real database and the generator verified end to end.
describe('DDL emission', () => {
  it('writes the full bootstrap DDL', () => {
    const workspaceId = '11111111-2222-4333-8444-555555555555';
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const objects = buildStandardObjects(workspaceId);

    const statements = [
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`,
      ...objects.flatMap((object) =>
        buildCreateTableStatements({ object, schemaName }),
      ),
      ...buildForeignKeyStatements({ objects, schemaName }),
    ].map((statement) =>
      statement.trim().endsWith(';') ? statement : `${statement};`,
    );

    writeFileSync(
      process.env.DDL_OUTPUT_PATH ?? '/tmp/bootstrap-ddl.sql',
      statements.join('\n\n'),
    );
  });
});

describe('foreign key DDL', () => {
  it('emits SET NULL with a space, not the SET_NULL metadata identifier', () => {
    const workspaceId = '11111111-2222-4333-8444-555555555555';
    const objects = buildStandardObjects(workspaceId);
    const statements = buildForeignKeyStatements({
      objects,
      schemaName: getWorkspaceSchemaName(workspaceId),
    });

    expect(statements.join('\n')).toContain('ON DELETE SET NULL');
    expect(statements.join('\n')).not.toContain('SET_NULL');
  });
});
