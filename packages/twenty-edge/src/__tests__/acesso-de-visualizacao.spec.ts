import { describe, expect, it, vi } from 'vitest';

import { type Client } from 'pg';

import { buildRecordResolvers } from 'src/graphql/record-resolvers';
import { METADATA_RESOLVERS } from 'src/graphql/metadata-schema';
import { podeAlterar } from 'src/routes/financeiro';
import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildWorkspacePermissions } from 'src/services/permissions';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

// O papel View como é criado no workspace: lê tudo, não grava nada, e guarda só
// o que é da própria pessoa — baixar arquivo, exportar e o próprio perfil.
const PAPEL_VIEW = {
  id: 'papel-view',
  workspaceId: WORKSPACE_ID,
  label: 'View',
  description: 'Esse tipo de acesso poderá apenas visualizar o projeto.',
  icon: 'IconEye',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  isEditable: true,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  isDefaultRole: false,
  standardId: null,
};
const FLAGS_DO_VIEW = ['DOWNLOAD_FILE', 'EXPORT_CSV', 'PROFILE_INFORMATION'];

const PAPEL_MEMBRO = {
  ...PAPEL_VIEW,
  id: 'papel-membro',
  label: 'Membro',
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
};
const FLAGS_DO_MEMBRO = [
  'UPLOAD_FILE',
  'DOWNLOAD_FILE',
  'IMPORT_CSV',
  'EXPORT_CSV',
  'VIEWS',
  'PROFILE_INFORMATION',
];

// Responde a busca do papel e anota toda outra consulta: o que o papel não pode
// fazer não pode chegar ao banco além da própria busca do papel.
const clienteComPapel = (papel: typeof PAPEL_VIEW, flags: string[]) => {
  const outras: string[] = [];
  const client = {
    query: vi.fn(async (texto: string) => {
      if (texto.includes('core."roleTarget"')) {
        return {
          rows: [
            {
              ...papel,
              objectPermissions: [],
              fieldPermissions: [],
              permissionFlags: flags,
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

const contextoDaSessao = (client: Client) =>
  ({
    client,
    appSecret: 'segredo',
    serverUrl: 'https://crm.campuzz.com.br',
    sessionContext: {
      session: { id: 'sessao', userId: 'usuario' },
      user: { id: 'usuario' },
      membership: {
        workspace: { id: WORKSPACE_ID, metadataVersion: 1 },
        userWorkspaceId: 'user-workspace',
      },
    },
  }) as never;

type Mutacao = (
  parent: unknown,
  args: unknown,
  context: unknown,
) => Promise<unknown>;

const mutacoesDoMetadata = METADATA_RESOLVERS.Mutation as unknown as Record<
  string,
  Mutacao
>;

const recusa = async (nome: string, args: unknown, context: unknown) =>
  mutacoesDoMetadata[nome](null, args, context).then(
    () => '',
    (causa: unknown) =>
      causa instanceof Error ? causa.message : String(causa),
  );

const MUTACOES_DE_VISAO: [string, unknown][] = [
  [
    'createView',
    { input: { objectMetadataId: 'objeto', name: 'Minha visão' } },
  ],
  ['updateView', { id: 'visao', input: { name: 'Outra' } }],
  ['deleteView', { id: 'visao' }],
  ['destroyView', { id: 'visao' }],
  ['createManyViewFields', { inputs: [] }],
  ['updateViewField', { input: { id: 'coluna', update: {} } }],
  ['deleteViewField', { input: { id: 'coluna' } }],
  ['destroyViewField', { input: { id: 'coluna' } }],
  ['createViewFilter', { input: {} }],
  ['updateViewFilter', { input: { id: 'filtro', update: {} } }],
  ['deleteViewFilter', { input: { id: 'filtro' } }],
  ['destroyViewFilter', { input: { id: 'filtro' } }],
  ['createViewSort', { input: {} }],
  ['updateViewSort', { input: { id: 'ordem', update: {} } }],
  ['deleteViewSort', { input: { id: 'ordem' } }],
  ['destroyViewSort', { input: { id: 'ordem' } }],
  ['createManyViewGroups', { inputs: [] }],
  ['updateManyViewGroups', { inputs: [] }],
  ['createViewFilterGroup', { input: {} }],
  ['updateViewFilterGroup', { input: { id: 'grupo', update: {} } }],
  ['destroyViewFilterGroup', { id: 'grupo' }],
];

describe('acesso View no /metadata', () => {
  it.each(MUTACOES_DE_VISAO)(
    '%s é recusada: mudar a visão muda o que todos veem',
    async (nome, args) => {
      const { client, outras } = clienteComPapel(PAPEL_VIEW, FLAGS_DO_VIEW);

      expect(await recusa(nome, args, contextoDaSessao(client))).toBe(
        'Not allowed to use VIEWS with your role',
      );
      expect(outras).toEqual([]);
    },
  );

  it.each(MUTACOES_DE_VISAO)(
    '%s continua liberada para o Membro',
    async (nome, args) => {
      const { client } = clienteComPapel(PAPEL_MEMBRO, FLAGS_DO_MEMBRO);

      expect(await recusa(nome, args, contextoDaSessao(client))).not.toContain(
        'Not allowed',
      );
    },
  );

  it('não sobe arquivo para os registros', async () => {
    const { client, outras } = clienteComPapel(PAPEL_VIEW, FLAGS_DO_VIEW);

    expect(
      await recusa(
        'createFileUpload',
        { filename: 'contrato.pdf', size: 10, fileFolder: 'FilesField' },
        contextoDaSessao(client),
      ),
    ).toBe('Not allowed to use UPLOAD_FILE with your role');
    expect(outras).toEqual([]);
  });

  it('sobe a foto do próprio perfil', async () => {
    const { client, outras } = clienteComPapel(PAPEL_VIEW, FLAGS_DO_VIEW);

    expect(
      await recusa(
        'createFileUpload',
        { filename: 'eu.webp', size: 10, fileFolder: 'CorePicture' },
        contextoDaSessao(client),
      ),
    ).not.toContain('Not allowed');
    expect(outras[0]).toContain('INSERT INTO');
  });

  it.each([
    ['setWorkspaceCustomDomain', { customDomain: 'crm.exemplo.com.br' }],
    ['syncStandardMetadata', {}],
  ])(
    '%s é configuração e fica com quem tem Configurações',
    async (nome, args) => {
      const { client, outras } = clienteComPapel(PAPEL_MEMBRO, FLAGS_DO_MEMBRO);

      expect(await recusa(nome, args, contextoDaSessao(client))).toBe(
        'Not allowed to change settings with your role',
      );
      expect(outras).toEqual([]);
    },
  );
});

const campo = (objeto: string, name: string, type: string) => ({
  id: `field-${objeto}-${name}`,
  objectMetadataId: `object-${objeto}`,
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
});

const objeto = (
  nameSingular: string,
  namePlural: string,
  campos: [string, string][],
): FlatObjectMetadata =>
  ({
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
    fields: campos.map(([name, type]) => campo(nameSingular, name, type)),
  }) as FlatObjectMetadata;

const membroDoWorkspace = objeto('workspaceMember', 'workspaceMembers', [
  ['id', 'UUID'],
  ['avatarUrl', 'TEXT'],
  ['locale', 'TEXT'],
  ['colorScheme', 'TEXT'],
  ['userEmail', 'TEXT'],
  ['userId', 'UUID'],
]);
const membro = objeto('membro', 'membros', [
  ['id', 'UUID'],
  ['name', 'TEXT'],
]);

const METADATA = {
  workspaceId: WORKSPACE_ID,
  schemaName: `workspace_${WORKSPACE_ID.replace(/-/g, '')}`,
  metadataVersion: 1,
  objects: [membroDoWorkspace, membro],
};

const USUARIO = 'usuario-da-sessao';
const MEU_MEMBRO = 'membro-da-sessao';

// Só o membro da sessão pertence ao usuário da sessão; qualquer UPDATE que
// chegue aqui é anotado, para o teste saber se a gravação passou.
const clienteDoWorkspace = () => {
  const gravacoes: string[] = [];
  const client = {
    query: vi.fn(async (texto: string, valores: unknown[] = []) => {
      if (texto.trim().startsWith('SELECT 1 FROM')) {
        return {
          rows: valores[0] === MEU_MEMBRO && valores[1] === USUARIO ? [{}] : [],
        };
      }

      if (/^\s*(WITH|UPDATE|INSERT|DELETE)/.test(texto)) {
        gravacoes.push(texto.trim().split(/\s+/)[0] ?? '');
      }

      return { rows: [] };
    }),
  } as unknown as Client;

  return { client, gravacoes };
};

const contextoDoView = (client: Client) => ({
  client,
  metadata: METADATA,
  userId: USUARIO,
  permissions: buildWorkspacePermissions({
    role: PAPEL_VIEW,
    objectPermissions: [],
    fieldPermissions: [],
    permissionFlags: FLAGS_DO_VIEW,
    objectMetadataIds: METADATA.objects.map((entrada) => entrada.id),
  }),
});

type Resolver = (
  parent: unknown,
  args: Record<string, unknown>,
  context: ReturnType<typeof contextoDoView>,
) => Promise<unknown>;

const mutacaoDeRegistro = (nome: string): Resolver =>
  (buildRecordResolvers(METADATA).Mutation as Record<string, Resolver>)[nome];

const tentar = (
  nome: string,
  args: Record<string, unknown>,
  context: ReturnType<typeof contextoDoView>,
) =>
  mutacaoDeRegistro(nome)(null, args, context).then(
    () => '',
    (causa: unknown) =>
      causa instanceof Error ? causa.message : String(causa),
  );

describe('acesso View no /graphql', () => {
  it.each([
    ['createMembro', { data: { name: 'Novo' } }],
    ['updateMembro', { id: 'membro-1', data: { name: 'Outro nome' } }],
    ['deleteMembro', { id: 'membro-1' }],
    ['restoreMembro', { id: 'membro-1' }],
    ['destroyMembro', { id: 'membro-1' }],
  ])('%s é recusada sem tocar o banco', async (nome, args) => {
    const { client, gravacoes } = clienteDoWorkspace();

    expect(await tentar(nome, args, contextoDoView(client))).toMatch(
      /^Not allowed to /,
    );
    expect(gravacoes).toEqual([]);
  });

  it('troca a foto do próprio perfil', async () => {
    const { client, gravacoes } = clienteDoWorkspace();

    expect(
      await tentar(
        'updateWorkspaceMember',
        {
          id: MEU_MEMBRO,
          data: {
            avatarUrl: 'https://crm.campuzz.com.br/files/core-picture/1',
          },
        },
        contextoDoView(client),
      ),
    ).not.toContain('Not allowed');
    expect(gravacoes.length).toBeGreaterThan(0);
  });

  it('não mexe no perfil de outra pessoa', async () => {
    const { client, gravacoes } = clienteDoWorkspace();

    expect(
      await tentar(
        'updateWorkspaceMember',
        {
          id: 'membro-de-outra-pessoa',
          data: { avatarUrl: 'https://exemplo.com/foto.webp' },
        },
        contextoDoView(client),
      ),
    ).toBe('Not allowed to update records of workspaceMember with your role');
    expect(gravacoes).toEqual([]);
  });

  it('não troca de quem é o próprio perfil', async () => {
    const { client, gravacoes } = clienteDoWorkspace();

    expect(
      await tentar(
        'updateWorkspaceMember',
        { id: MEU_MEMBRO, data: { userEmail: 'outra@exemplo.com' } },
        contextoDoView(client),
      ),
    ).toBe('Not allowed to update records of workspaceMember with your role');
    expect(gravacoes).toEqual([]);
  });
});

const clienteDoFinanceiro = (papel: typeof PAPEL_VIEW, flags: string[]) =>
  clienteComPapel(papel, flags).client;

const METADATA_DO_FINANCEIRO = {
  ...METADATA,
  objects: [
    objeto('businessUnit', 'businessUnits', [['id', 'UUID']]),
    objeto('gatewayContract', 'gatewayContracts', [['id', 'UUID']]),
    objeto('gatewayInvoice', 'gatewayInvoices', [['id', 'UUID']]),
  ],
};

const MEMBERSHIP = {
  workspace: { id: WORKSPACE_ID },
  userWorkspaceId: 'user-workspace',
};

describe('acesso View no /financeiro', () => {
  it.each([[['businessUnit']], [['gatewayContract', 'gatewayInvoice']]])(
    'não grava %j',
    async (objetos) => {
      expect(
        await podeAlterar({
          client: clienteDoFinanceiro(PAPEL_VIEW, FLAGS_DO_VIEW),
          membership: MEMBERSHIP,
          metadata: METADATA_DO_FINANCEIRO,
          objetos,
        }),
      ).toBe(false);
    },
  );

  it('o Membro continua gravando', async () => {
    expect(
      await podeAlterar({
        client: clienteDoFinanceiro(PAPEL_MEMBRO, FLAGS_DO_MEMBRO),
        membership: MEMBERSHIP,
        metadata: METADATA_DO_FINANCEIRO,
        objetos: ['businessUnit', 'gatewayContract', 'gatewayInvoice'],
      }),
    ).toBe(true);
  });

  it('ler não pede nada', async () => {
    expect(
      await podeAlterar({
        client: clienteDoFinanceiro(PAPEL_VIEW, FLAGS_DO_VIEW),
        membership: MEMBERSHIP,
        metadata: METADATA_DO_FINANCEIRO,
        objetos: [],
      }),
    ).toBe(true);
  });
});
