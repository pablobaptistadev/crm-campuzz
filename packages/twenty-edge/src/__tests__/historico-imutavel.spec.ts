import { describe, expect, it, vi } from 'vitest';

import { type Client } from 'pg';

import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildRecordResolvers } from 'src/graphql/record-resolvers';
import { FULL_ACCESS } from 'src/services/permissions';
import { MENSAGEM_HISTORICO_IMUTAVEL } from 'src/services/historico-imutavel';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const objeto = (
  nameSingular: string,
  namePlural: string,
): FlatObjectMetadata => ({
  id: `object-${nameSingular}`,
  workspaceId: WORKSPACE_ID,
  nameSingular,
  namePlural,
  labelSingular: nameSingular,
  labelPlural: namePlural,
  description: null,
  icon: null,
  isActive: true,
  isSystem: false,
  isCustom: false,
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
    id: `field-${nameSingular}-${name}`,
    objectMetadataId: `object-${nameSingular}`,
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
});

const historico = objeto('timelineActivity', 'timelineActivities');
const membro = objeto('membro', 'membros');

const METADATA = {
  workspaceId: WORKSPACE_ID,
  schemaName: `workspace_${WORKSPACE_ID.replace(/-/g, '')}`,
  metadataVersion: 1,
  objects: [historico, membro],
};

const clienteQueAnota = () => {
  const executadas: string[] = [];
  const client = {
    query: vi.fn(async (texto: string) => {
      executadas.push(texto.trim().split(/\s+/)[0] ?? '');

      return {
        rows: [
          {
            timelineActivity_id: 'nota-1',
            timelineActivity_name: 'note',
            membro_id: 'membro-1',
            membro_name: 'Ana',
          },
        ],
      };
    }),
  } as unknown as Client;

  return { client, executadas };
};

// Papel de dono, com acesso total: a trava vale para todo mundo, e é
// justamente quem pode tudo que precisa ser impedido de reescrever o passado.
const contextoDe = (client: Client) => ({
  client,
  metadata: METADATA,
  userId: null,
  permissions: {
    role: null,
    permissionFlags: [],
    canUpdateAllSettings: true,
    byObjectMetadataId: new Map([
      [historico.id, FULL_ACCESS],
      [membro.id, FULL_ACCESS],
    ]),
  },
});

type Resolver = (
  parent: unknown,
  args: Record<string, unknown>,
  context: ReturnType<typeof contextoDe>,
) => Promise<unknown>;

const mutacao = (nome: string): Resolver => {
  const { Mutation } = buildRecordResolvers(METADATA);

  return (Mutation as Record<string, Resolver>)[nome];
};

describe('histórico só acrescenta', () => {
  it.each([
    ['updateTimelineActivity', { id: 'nota-1', data: { name: 'outra coisa' } }],
    ['deleteTimelineActivity', { id: 'nota-1' }],
    ['restoreTimelineActivity', { id: 'nota-1' }],
    ['destroyTimelineActivity', { id: 'nota-1' }],
    ['mergeTimelineActivities', { ids: ['nota-1', 'nota-2'], conflictPriorityIndex: 0 }],
    ['createTimelineActivity', { data: { id: 'nota-1', name: 'reescrita' }, upsert: true }],
    ['createTimelineActivities', { data: [{ id: 'nota-1', name: 'reescrita' }], upsert: true }],
  ])('recusa %s sem tocar no banco', async (nome, args) => {
    const { client, executadas } = clienteQueAnota();

    await expect(mutacao(nome)(null, args, contextoDe(client))).rejects.toThrow(
      MENSAGEM_HISTORICO_IMUTAVEL,
    );

    expect(executadas.filter((comando) => comando !== 'BEGIN' && comando !== 'ROLLBACK')).toEqual(
      [],
    );
  });

  it('continua deixando acrescentar uma anotação nova', async () => {
    const { client, executadas } = clienteQueAnota();

    await mutacao('createTimelineActivity')(
      null,
      { data: { name: 'note' } },
      contextoDe(client),
    );

    expect(executadas).toContain('INSERT');
  });

  it('não trava os outros objetos', async () => {
    const { client, executadas } = clienteQueAnota();

    await mutacao('updateMembro')(
      null,
      { id: 'membro-1', data: { name: 'Ana Paula' } },
      contextoDe(client),
    );

    expect(executadas.some((comando) => comando.startsWith('UPDATE') || comando === 'WITH')).toBe(
      true,
    );
  });
});
