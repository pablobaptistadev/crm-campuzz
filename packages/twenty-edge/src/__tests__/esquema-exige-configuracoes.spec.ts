import { describe, expect, it, vi } from 'vitest';

import { type Client } from 'pg';

import { METADATA_RESOLVERS } from 'src/graphql/metadata-schema';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

// Responde a busca do papel com o que o teste pedir e anota toda outra
// consulta: se o papel não pode mexer em Configurações, nada além da busca do
// papel pode chegar ao banco.
const clienteComPapel = (canUpdateAllSettings: boolean) => {
  const outras: string[] = [];
  const client = {
    query: vi.fn(async (texto: string) => {
      if (texto.includes('core."roleTarget"')) {
        return {
          rows: [
            {
              id: 'papel',
              label: canUpdateAllSettings ? 'Admin' : 'Membro',
              canUpdateAllSettings,
              canReadAllObjectRecords: true,
              canUpdateAllObjectRecords: true,
              canSoftDeleteAllObjectRecords: true,
              canDestroyAllObjectRecords: false,
              objectPermissions: [],
              fieldPermissions: [],
              permissionFlags: [],
            },
          ],
        };
      }

      outras.push(texto.trim().split(/\s+/).slice(0, 3).join(' '));

      return { rows: [] };
    }),
  } as unknown as Client;

  return { client, outras };
};

const contextoDe = (client: Client) =>
  ({
    client,
    sessionContext: {
      session: { id: 'sessao', userId: 'usuario' },
      user: { id: 'usuario' },
      membership: {
        workspace: { id: WORKSPACE_ID, metadataVersion: 1 },
        userWorkspaceId: 'user-workspace',
      },
    },
  }) as never;

type Mutacao = (parent: unknown, args: unknown, context: unknown) => Promise<unknown>;

const mutacoes = METADATA_RESOLVERS.Mutation as unknown as Record<string, Mutacao>;

const CHAMADAS: [string, unknown][] = [
  [
    'createOneObject',
    {
      input: {
        nameSingular: 'teste',
        namePlural: 'testes',
        labelSingular: 'Teste',
        labelPlural: 'Testes',
      },
    },
  ],
  ['deleteOneObject', { id: 'objeto' }],
  [
    'createOneField',
    { input: { objectMetadataId: 'objeto', name: 'novo', label: 'Novo', type: 'TEXT' } },
  ],
  ['updateOneField', { input: { id: 'campo', options: [{ value: 'X', label: 'X' }] } }],
  ['deleteOneField', { id: 'campo' }],
];

describe('mudar o esquema exige acesso a Configurações', () => {
  it.each(CHAMADAS)('%s é recusada para quem não tem o acesso', async (nome, args) => {
    const { client, outras } = clienteComPapel(false);

    await expect(mutacoes[nome](null, args, contextoDe(client))).rejects.toThrow(
      'Not allowed to change settings with your role',
    );

    expect(outras).toEqual([]);
  });

  // Com o acesso, a trava sai da frente: o que acontece depois — criar, ou
  // não achar o objeto de mentira no metadata vazio — já não é a recusa.
  it.each(CHAMADAS)('%s passa da trava para quem tem o acesso', async (nome, args) => {
    const { client } = clienteComPapel(true);

    const erro = await mutacoes[nome](null, args, contextoDe(client)).then(
      () => null,
      (causa: unknown) => causa,
    );

    expect(erro instanceof Error ? erro.message : '').not.toContain(
      'Not allowed to change settings',
    );
  });
});
