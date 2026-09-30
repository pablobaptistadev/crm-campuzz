import { describe, expect, it, vi } from 'vitest';

import { type Client } from 'pg';

import { type FlatFieldMetadata, type FlatObjectMetadata } from 'src/metadata/types';
import { buildRecordResolvers } from 'src/graphql/record-resolvers';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import { montarGrafoDePosse } from 'src/services/cascata';
import { FULL_ACCESS } from 'src/services/permissions';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const campo = (
  objetoId: string,
  nome: string,
  tipo: string,
  extra: Partial<FlatFieldMetadata> = {},
): FlatFieldMetadata => ({
  id: `${objetoId}-${nome}`,
  objectMetadataId: objetoId,
  workspaceId: WORKSPACE_ID,
  name: nome,
  label: nome,
  type: tipo,
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
  ...extra,
} as FlatFieldMetadata);

const objeto = (
  id: string,
  nameSingular: string,
  namePlural: string,
  campos: FlatFieldMetadata[],
  isCustom = true,
): FlatObjectMetadata =>
  ({
    id,
    workspaceId: WORKSPACE_ID,
    nameSingular,
    namePlural,
    labelSingular: nameSingular,
    labelPlural: namePlural,
    description: null,
    icon: null,
    isActive: true,
    isSystem: false,
    isCustom,
    isSearchable: false,
    labelIdentifierFieldMetadataId: null,
    duplicateCriteria: null,
    imageIdentifierFieldMetadataId: null,
    fields: [
      campo(id, 'id', 'UUID'),
      campo(id, 'name', 'TEXT'),
      campo(id, 'deletedAt', 'DATE_TIME'),
      campo(id, 'updatedAt', 'DATE_TIME'),
      ...campos,
    ],
  }) as FlatObjectMetadata;

const paraPai = (
  filhoId: string,
  nome: string,
  paiId: string,
): FlatFieldMetadata =>
  campo(filhoId, nome, 'RELATION', {
    settings: { relationType: 'MANY_TO_ONE', onDelete: 'SET_NULL' },
    relationTargetObjectMetadataId: paiId,
  } as Partial<FlatFieldMetadata>);

const paraFilhos = (
  paiId: string,
  nome: string,
  filhoId: string,
): FlatFieldMetadata =>
  campo(paiId, nome, 'RELATION', {
    settings: { relationType: 'ONE_TO_MANY' },
    relationTargetObjectMetadataId: filhoId,
  } as Partial<FlatFieldMetadata>);

const CLUBE = objeto('obj-clube', 'clube', 'clubes', [
  paraFilhos('obj-clube', 'membros', 'obj-membro'),
  paraFilhos('obj-clube', 'anexos', 'obj-attachment'),
]);

const MEMBRO = objeto('obj-membro', 'membro', 'membros', [
  paraPai('obj-membro', 'clube', 'obj-clube'),
  paraFilhos('obj-membro', 'parcelas', 'obj-parcela'),
]);

const PARCELA = objeto('obj-parcela', 'parcela', 'parcelas', [
  paraPai('obj-parcela', 'membro', 'obj-membro'),
]);

// Anexo é padrão, não customizado: ele registra o que aconteceu e não pertence
// ao clube, então a cascata não pode encostar nele.
const ANEXO = objeto(
  'obj-attachment',
  'attachment',
  'attachments',
  [paraPai('obj-attachment', 'clube', 'obj-clube')],
  false,
);

const METADATA = {
  workspaceId: WORKSPACE_ID,
  schemaName: `workspace_${WORKSPACE_ID.replace(/-/g, '')}`,
  metadataVersion: 1,
  objects: [CLUBE, MEMBRO, PARCELA, ANEXO],
};

const SEM_ARQUIVAR = {
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
  restrictedFields: {},
};

const montarContexto = (client: Client, semArquivar: string[] = []) => ({
  client,
  metadata: METADATA,
  userId: null,
  permissions: {
    role:
      semArquivar.length === 0
        ? null
        : ({ id: 'papel-restrito', canUpdateAllSettings: false } as never),
    permissionFlags: [],
    canUpdateAllSettings: true,
    byObjectMetadataId: new Map(
      METADATA.objects.map((entrada) => [
        entrada.id,
        semArquivar.includes(entrada.id) ? SEM_ARQUIVAR : FULL_ACCESS,
      ]),
    ),
  },
});

describe('grafo de posse', () => {
  const shapeByObjectId = new Map(
    METADATA.objects.map((entrada) => [
      entrada.id,
      buildWorkspaceTableShape({ object: entrada, workspaceId: WORKSPACE_ID }),
    ]),
  );

  const grafo = montarGrafoDePosse({ metadata: METADATA, shapeByObjectId });

  it('liga o clube aos membros e o membro às parcelas', () => {
    expect(grafo.get('obj-clube')?.map((aresta) => aresta.nomeDoFilho)).toEqual([
      'membro',
    ]);
    expect(grafo.get('obj-membro')?.map((aresta) => aresta.nomeDoFilho)).toEqual([
      'parcela',
    ]);
  });

  // O anexo aponta para o clube igual ao membro; o que o separa é não ser um
  // objeto do workspace. Sem esta linha, arquivar um clube levaria junto a
  // timeline e as notas, que são registro do que aconteceu.
  it('não considera objeto padrão como propriedade do clube', () => {
    expect(
      grafo.get('obj-clube')?.some((aresta) => aresta.nomeDoFilho === 'attachment'),
    ).toBe(false);
  });
});

type Chamada = { texto: string; valores: unknown[] };

const clienteFalso = (aoConsultar: (texto: string) => { rows: unknown[] }) => {
  const chamadas: Chamada[] = [];
  const client = {
    query: vi.fn(async (texto: string, valores: unknown[] = []) => {
      chamadas.push({ texto, valores });

      return aoConsultar(texto);
    }),
  } as unknown as Client;

  return { client, chamadas };
};

const ARQUIVADO_EM = '2026-09-14T12:00:00.000Z';

describe('arquivar em cascata', () => {
  const arquivarClube = () => {
    const { Mutation } = buildRecordResolvers(METADATA);

    return Mutation.deleteClube as (
      parent: unknown,
      args: { id: string },
      context: ReturnType<typeof montarContexto>,
    ) => Promise<unknown>;
  };

  it('leva membros e parcelas com o mesmo carimbo do clube', async () => {
    const { client, chamadas } = clienteFalso((texto) => {
      if (texto.startsWith('UPDATE') && texto.includes('"clubeId"')) {
        return { rows: [{ id: 'membro-1' }] };
      }

      if (texto.startsWith('UPDATE') && texto.includes('"membroId"')) {
        return { rows: [{ id: 'parcela-1' }, { id: 'parcela-2' }] };
      }

      return {
        rows: [{ clube_id: 'clube-1', clube_deletedAt: ARQUIVADO_EM }],
      };
    });

    await arquivarClube()(null, { id: 'clube-1' }, montarContexto(client));

    const cascatas = chamadas.filter(
      (chamada) =>
        chamada.texto.includes('"deletedAt" = $1::timestamptz') &&
        chamada.texto.includes('IS NULL'),
    );

    expect(cascatas).toHaveLength(2);
    // O mesmo instante em todos: é a única marca que o restaurar tem para
    // saber quem saiu junto.
    expect(cascatas.every((chamada) => chamada.valores[0] === ARQUIVADO_EM)).toBe(true);
    expect(cascatas[0]?.valores[1]).toEqual(['clube-1']);
    expect(cascatas[1]?.valores[1]).toEqual(['membro-1']);
  });

  it('faz tudo numa transação só', async () => {
    const { client, chamadas } = clienteFalso((texto) =>
      texto.startsWith('UPDATE') && texto.includes('ANY($2::uuid[])')
        ? { rows: [] }
        : { rows: [{ clube_id: 'clube-1', clube_deletedAt: ARQUIVADO_EM }] },
    );

    await arquivarClube()(null, { id: 'clube-1' }, montarContexto(client));

    const verbos = chamadas.map((chamada) => chamada.texto.trim().split(/\s+/)[0]);

    expect(verbos[0]).toBe('BEGIN');
    expect(verbos).toContain('COMMIT');
    expect(verbos).not.toContain('ROLLBACK');
  });

  it('recusa quando o papel não pode arquivar membro', async () => {
    const { client } = clienteFalso(() => ({
      rows: [{ clube_id: 'clube-1', clube_deletedAt: ARQUIVADO_EM }],
    }));

    await expect(
      arquivarClube()(
        null,
        { id: 'clube-1' },
        montarContexto(client, [MEMBRO.id]),
      ),
    ).rejects.toThrow(/membro/);
  });

  // O driver devolve timestamptz como Date. Com o cliente falso mandando texto,
  // a suíte passava enquanto a cascata não acontecia em produção — este caso
  // existe para o tipo do driver não voltar a passar despercebido.
  it('aceita o Date que o driver devolve, não só texto', async () => {
    const { client, chamadas } = clienteFalso((texto) =>
      texto.startsWith('UPDATE') && texto.includes('ANY($2::uuid[])')
        ? { rows: [{ id: 'membro-1' }] }
        : {
            rows: [
              { clube_id: 'clube-1', clube_deletedAt: new Date(ARQUIVADO_EM) },
            ],
          },
    );

    await arquivarClube()(null, { id: 'clube-1' }, montarContexto(client));

    const cascatas = chamadas.filter((chamada) =>
      chamada.texto.includes('ANY($2::uuid[])'),
    );

    expect(cascatas.length).toBeGreaterThan(0);
    expect(cascatas[0]?.valores[0]).toBe(ARQUIVADO_EM);
  });

  it('falha alto se deletedAt vier num tipo que não dá para carimbar', async () => {
    const { client } = clienteFalso(() => ({
      rows: [{ clube_id: 'clube-1', clube_deletedAt: null }],
    }));

    await expect(
      arquivarClube()(null, { id: 'clube-1' }, montarContexto(client)),
    ).rejects.toThrow(/deletedAt/);
  });

  it('não arquiva um clube que já estava arquivado', async () => {
    const { client, chamadas } = clienteFalso(() => ({ rows: [] }));

    const resultado = await arquivarClube()(
      null,
      { id: 'clube-1' },
      montarContexto(client),
    );

    expect(resultado).toBeNull();
    expect(
      chamadas.some((chamada) => chamada.texto.includes('ANY($2::uuid[])')),
    ).toBe(false);
  });
});

describe('restaurar em cascata', () => {
  const restaurarClube = () => {
    const { Mutation } = buildRecordResolvers(METADATA);

    return Mutation.restoreClube as (
      parent: unknown,
      args: { id: string },
      context: ReturnType<typeof montarContexto>,
    ) => Promise<unknown>;
  };

  it('traz de volta só quem saiu no mesmo instante', async () => {
    const { client, chamadas } = clienteFalso((texto) => {
      if (texto.startsWith('SELECT')) {
        return { rows: [{ deletedAt: ARQUIVADO_EM }] };
      }

      if (texto.includes('"deletedAt" = $1::timestamptz')) {
        return { rows: [{ id: 'membro-1' }] };
      }

      return { rows: [{ clube_id: 'clube-1', clube_deletedAt: null }] };
    });

    await restaurarClube()(null, { id: 'clube-1' }, montarContexto(client));

    const cascatas = chamadas.filter(
      (chamada) =>
        chamada.texto.includes('"deletedAt" = NULL') &&
        chamada.texto.includes('ANY($2::uuid[])'),
    );

    expect(cascatas.length).toBeGreaterThan(0);
    // Um membro arquivado sozinho tem outro horário e continua arquivado.
    expect(
      cascatas.every(
        (chamada) =>
          chamada.texto.includes('"deletedAt" = $1::timestamptz') &&
          chamada.valores[0] === ARQUIVADO_EM,
      ),
    ).toBe(true);
  });

  it('lê o horário antes de apagá-lo', async () => {
    const { client, chamadas } = clienteFalso((texto) =>
      texto.startsWith('SELECT')
        ? { rows: [{ deletedAt: ARQUIVADO_EM }] }
        : { rows: [{ clube_id: 'clube-1', clube_deletedAt: null }] },
    );

    await restaurarClube()(null, { id: 'clube-1' }, montarContexto(client));

    const indiceSelect = chamadas.findIndex((chamada) =>
      chamada.texto.startsWith('SELECT'),
    );
    const indiceRestore = chamadas.findIndex((chamada) =>
      chamada.texto.includes('"deletedAt" = NULL'),
    );

    expect(indiceSelect).toBeGreaterThanOrEqual(0);
    expect(indiceSelect).toBeLessThan(indiceRestore);
  });
});
