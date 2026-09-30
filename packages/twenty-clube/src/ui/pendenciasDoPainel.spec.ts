import { describe, expect, it } from 'vitest';

import {
  FILTRO_DE_PENDENCIA_VAZIO,
  filtrarPendencias,
  filtroDaUrl,
  filtroParaUrl,
  montarPendencias,
  resumirPendencias,
} from 'src/ui/pendenciasDoPainel';

const HOJE = '2026-09-26';

const clube = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Clube ${id}`,
  situacao: 'ATIVO',
  fotoUrl: null,
  ...extra,
});

const membro = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Membro ${id}`,
  clubeId: 'c1',
  situacao: 'ATIVO',
  fotoUrl: null,
  emails: { primaryEmail: `${id}@exemplo.com` },
  emailFinanceiro: null,
  ...extra,
});

const etapa = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Etapa ${id}`,
  escopo: 'CLUBE',
  ordem: 1,
  situacao: 'PENDENTE',
  prazo: null,
  responsavel: null,
  opcional: null,
  clubeId: 'c1',
  membroId: null,
  ...extra,
});

const montar = (entrada: Partial<Parameters<typeof montarPendencias>[0]>) =>
  montarPendencias({
    hoje: HOJE,
    etapas: [],
    manuais: [],
    membros: [membro('m1')],
    clubes: [clube('c1')],
    ...entrada,
  });

const visiveis = (entrada: Partial<Parameters<typeof montarPendencias>[0]>, filtro = {}) =>
  filtrarPendencias(montar(entrada), { ...FILTRO_DE_PENDENCIA_VAZIO, ...filtro });

describe('o que é pendência', () => {
  it('é a etapa obrigatória da jornada ainda não concluída, do clube ou do membro', () => {
    const linhas = visiveis({
      etapas: [
        etapa('clube-pendente'),
        etapa('clube-andamento', { situacao: 'EM_ANDAMENTO' }),
        etapa('clube-feita', { situacao: 'CONCLUIDA' }),
        etapa('membro-pendente', { escopo: 'MEMBRO', membroId: 'm1', clubeId: null }),
      ],
    });

    expect(linhas.map((linha) => [linha.oQue, linha.origem])).toEqual([
      ['Etapa clube-pendente', 'jornadaDoClube'],
      ['Etapa clube-andamento', 'jornadaDoClube'],
      ['Etapa membro-pendente', 'jornadaDoMembro'],
    ]);
  });

  it('deixa a opcional de fora até o filtro pedir', () => {
    const entrada = { etapas: [etapa('e1', { opcional: true }), etapa('e2', { opcional: false })] };

    expect(visiveis(entrada).map((linha) => linha.oQue)).toEqual(['Etapa e2']);
    expect(visiveis(entrada, { opcionais: true }).map((linha) => linha.oQue)).toEqual([
      'Etapa e1',
      'Etapa e2',
    ]);
  });

  it('ignora o pipeline de venda e as etapas órfãs', () => {
    expect(
      visiveis({
        etapas: [
          etapa('pipeline', { ordem: 101 }),
          etapa('orfa', { escopo: 'MEMBRO', membroId: null, clubeId: null }),
          etapa('de-arquivado', { escopo: 'MEMBRO', membroId: 'sumiu', clubeId: null }),
        ],
      }),
    ).toEqual([]);
  });

  it('inclui a pendência manual aberta e deixa a resolvida de fora', () => {
    const linhas = visiveis({
      manuais: [
        { id: 'p1', name: 'Enviar kit', descricao: 'Enviar o kit de boas-vindas', situacao: 'ABERTA', prazo: '2026-09-30', membroId: 'm1' },
        { id: 'p2', name: 'Feita', descricao: null, situacao: 'RESOLVIDA', prazo: null, membroId: 'm1' },
      ],
    });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      origem: 'manual',
      oQue: 'Enviar o kit de boas-vindas',
      clube: { id: 'c1', nome: 'Clube c1' },
      diasDeAtraso: -4,
    });
  });

  it('esconde clube e membro inativos até o filtro pedir', () => {
    const entrada = {
      membros: [membro('m1', { situacao: 'INATIVO' }), membro('m2', { clubeId: 'perdido' })],
      clubes: [clube('c1'), clube('perdido', { situacao: 'PERDIDO' })],
      etapas: [
        etapa('do-inativo', { escopo: 'MEMBRO', membroId: 'm1', clubeId: null }),
        etapa('do-clube-perdido', { escopo: 'MEMBRO', membroId: 'm2', clubeId: null }),
        etapa('clube-perdido', { clubeId: 'perdido' }),
      ],
    };

    expect(visiveis(entrada)).toEqual([]);
    expect(visiveis(entrada, { inativos: true })).toHaveLength(3);
  });
});

describe('filtros', () => {
  const entrada = {
    membros: [membro('ana', { name: 'Ana Souza' }), membro('bia', { name: 'Bia Lima', clubeId: 'c2' })],
    clubes: [clube('c1'), clube('c2')],
    etapas: [
      etapa('vencida', { prazo: '2026-09-01', responsavel: 'Carol' }),
      etapa('semana', { escopo: 'MEMBRO', membroId: 'ana', clubeId: null, prazo: '2026-09-30' }),
      etapa('longe', { escopo: 'MEMBRO', membroId: 'bia', clubeId: null, prazo: '2026-12-01' }),
      etapa('sem-prazo', { clubeId: 'c2' }),
    ],
  };

  it('põe as vencidas primeiro, depois por prazo, e as sem prazo no fim', () => {
    expect(visiveis(entrada).map((linha) => linha.oQue)).toEqual([
      'Etapa vencida',
      'Etapa semana',
      'Etapa longe',
      'Etapa sem-prazo',
    ]);
  });

  it('filtra por prazo', () => {
    expect(visiveis(entrada, { prazo: 'vencidas' }).map((linha) => linha.oQue)).toEqual(['Etapa vencida']);
    expect(visiveis(entrada, { prazo: 'semana' }).map((linha) => linha.oQue)).toEqual(['Etapa semana']);
    expect(visiveis(entrada, { prazo: 'semPrazo' }).map((linha) => linha.oQue)).toEqual(['Etapa sem-prazo']);
  });

  it('filtra por clube, origem, etapa e responsável', () => {
    expect(visiveis(entrada, { clubeId: 'c2' }).map((linha) => linha.oQue)).toEqual([
      'Etapa longe',
      'Etapa sem-prazo',
    ]);
    expect(visiveis(entrada, { origem: 'jornadaDoMembro' })).toHaveLength(2);
    expect(visiveis(entrada, { etapa: 'Etapa longe' })).toHaveLength(1);
    expect(visiveis(entrada, { responsavel: 'carol ' }).map((linha) => linha.oQue)).toEqual(['Etapa vencida']);
  });

  it('busca por nome, e-mail, clube ou etapa, sem acento', () => {
    expect(visiveis(entrada, { busca: 'souza' }).map((linha) => linha.oQue)).toEqual(['Etapa semana']);
    expect(visiveis(entrada, { busca: 'bia@exemplo' }).map((linha) => linha.oQue)).toEqual(['Etapa longe']);
    expect(visiveis(entrada, { busca: 'SEM-PRAZO' })).toHaveLength(1);
  });

  it('resume total, vencidas e origem', () => {
    expect(resumirPendencias(visiveis(entrada))).toEqual({
      total: 4,
      vencidas: 1,
      porOrigem: { jornadaDoClube: 2, jornadaDoMembro: 2, manual: 0 },
    });
  });

  it('guarda o filtro no endereço e lê de volta', () => {
    const filtro = {
      ...FILTRO_DE_PENDENCIA_VAZIO,
      busca: 'ana',
      origem: 'manual' as const,
      prazo: 'vencidas' as const,
      opcionais: true,
    };

    expect(filtroDaUrl(new URLSearchParams(filtroParaUrl(filtro)))).toEqual(filtro);
    expect(filtroParaUrl(FILTRO_DE_PENDENCIA_VAZIO)).toEqual({});
    expect(filtroDaUrl(new URLSearchParams('origem=qualquer&prazo=ontem')).origem).toBe('');
  });
});
