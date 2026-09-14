import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildCreateTableStatements,
  buildForeignKeyStatements,
} from 'src/ddl/create-workspace-schema';
import { getWorkspaceSchemaName } from 'src/metadata/naming';
import { applyFieldColumns } from 'src/services/metadata-mutations';
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

describe('enum options on an existing field', () => {
  // Editing a SELECT's options finds the type already there. Without the ALTER
  // the new option passes GraphQL validation and then fails every write.
  it('adds every value to a type that may already exist', async () => {
    const executadas: string[] = [];
    const client = {
      query: async (texto: string) => {
        executadas.push(texto);

        return { rows: [] };
      },
    } as unknown as Parameters<typeof applyFieldColumns>[0]['client'];

    await applyFieldColumns({
      client,
      schemaName: 'workspace_teste',
      tableName: '_membro',
      field: {
        id: 'field-situacao',
        objectMetadataId: 'object-membro',
        workspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea419',
        name: 'situacao',
        label: 'Status',
        type: 'SELECT',
        description: null,
        icon: null,
        isActive: true,
        isSystem: false,
        isNullable: true,
        isUnique: false,
        defaultValue: null,
        options: [
          { value: 'ATIVO', label: 'Ativo' },
          { value: 'PENDENTE', label: 'Pendente' },
        ],
        settings: null,
        relationTargetFieldMetadataId: null,
        relationTargetObjectMetadataId: null,
      },
    });

    const alteracoes = executadas.filter((texto) => texto.includes('ADD VALUE IF NOT EXISTS'));

    expect(alteracoes).toHaveLength(2);
    expect(alteracoes.join('\n')).toContain("'PENDENTE'");
  });
});
