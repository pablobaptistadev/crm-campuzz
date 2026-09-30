import { describe, expect, it, vi } from 'vitest';

import { type Client } from 'pg';

import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildRecordResolvers } from 'src/graphql/record-resolvers';
import { FULL_ACCESS } from 'src/services/permissions';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const objeto: FlatObjectMetadata = {
  id: 'object-etapa',
  workspaceId: WORKSPACE_ID,
  nameSingular: 'etapa',
  namePlural: 'etapas',
  labelSingular: 'Etapa',
  labelPlural: 'Etapas',
  description: null,
  icon: null,
  isActive: true,
  isSystem: false,
  isCustom: true,
  isSearchable: false,
  labelIdentifierFieldMetadataId: null,
  duplicateCriteria: null,
  imageIdentifierFieldMetadataId: null,
  fields: (
    [
      ['id', 'UUID'],
      ['name', 'TEXT'],
    ] as const
  ).map(([name, type]) => ({
    id: `field-${name}`,
    objectMetadataId: 'object-etapa',
    workspaceId: WORKSPACE_ID,
    name,
    label: name,
    type,
    description: null,
    icon: null,
    isActive: true,
    isSystem: false,
    isNullable: true,
    isUnique: false,
    defaultValue: null,
    options: null,
    settings: null,
    relationTargetFieldMetadataId: null,
    relationTargetObjectMetadataId: null,
  })),
};

const METADATA = {
  workspaceId: WORKSPACE_ID,
  schemaName: `workspace_${WORKSPACE_ID.replace(/-/g, '')}`,
  metadataVersion: 1,
  objects: [objeto],
};

const montarContexto = (client: Client) => ({
  client,
  metadata: METADATA,
  userId: null,
  permissions: {
    role: null,
    permissionFlags: [],
    canUpdateAllSettings: true,
    byObjectMetadataId: new Map([[objeto.id, FULL_ACCESS]]),
  },
});

const criarMuitos = () => {
  const { Mutation } = buildRecordResolvers(METADATA);

  return Mutation.createEtapas as (
    parent: unknown,
    args: { data: Record<string, unknown>[] },
    context: ReturnType<typeof montarContexto>,
  ) => Promise<unknown>;
};

describe('criação em lote', () => {
  it('abre e confirma uma transação quando tudo grava', async () => {
    const executadas: string[] = [];
    const client = {
      query: vi.fn(async (texto: string) => {
        executadas.push(texto.trim().split(/\s+/)[0] ?? '');

        return { rows: [{ etapa_id: 'a', etapa_name: 'Check Out' }] };
      }),
    } as unknown as Client;

    await criarMuitos()(null, { data: [{ name: 'a' }, { name: 'b' }] }, montarContexto(client));

    expect(executadas[0]).toBe('BEGIN');
    expect(executadas).toContain('COMMIT');
    expect(executadas).not.toContain('ROLLBACK');
  });

  // Sem isto o clube nasce com parte das etapas e sem contrato, e não há nada
  // na tela que mostre que faltou metade.
  it('desfaz tudo quando uma linha do meio falha', async () => {
    const executadas: string[] = [];
    let inserts = 0;
    const client = {
      query: vi.fn(async (texto: string) => {
        const comando = texto.trim().split(/\s+/)[0] ?? '';

        executadas.push(comando);

        if (comando === 'INSERT') {
          inserts += 1;

          if (inserts === 2) {
            throw new Error('conexão caiu');
          }
        }

        return { rows: [{ etapa_id: 'a', etapa_name: 'Check Out' }] };
      }),
    } as unknown as Client;

    await expect(
      criarMuitos()(
        null,
        { data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
        montarContexto(client),
      ),
    ).rejects.toThrow('conexão caiu');

    expect(executadas).toContain('ROLLBACK');
    expect(executadas).not.toContain('COMMIT');
    expect(inserts).toBe(2);
  });

  it('não engole o erro original se o rollback também falhar', async () => {
    const client = {
      query: vi.fn(async (texto: string) => {
        const comando = texto.trim().split(/\s+/)[0] ?? '';

        if (comando === 'INSERT') {
          throw new Error('erro de verdade');
        }

        if (comando === 'ROLLBACK') {
          throw new Error('socket já morreu');
        }

        return { rows: [] };
      }),
    } as unknown as Client;

    await expect(
      criarMuitos()(null, { data: [{ name: 'a' }] }, montarContexto(client)),
    ).rejects.toThrow('erro de verdade');
  });
});
