import { describe, expect, it } from 'vitest';

import {
  FILTRO_DE_MEMBRO_VAZIO,
  type FiltroDeMembro,
  filtrarMembros,
  type MembroFiltravel,
} from 'src/ui/FiltrosDeMembro';

const HOJE = new Date().toISOString().slice(0, 10);
const ONTEM = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const DAQUI_A_UM_MES = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .slice(0, 10);

const membro = (dados: Partial<MembroFiltravel>): MembroFiltravel => ({
  name: 'Fulano',
  situacao: 'ATIVO',
  contratoSituacao: 'PENDENTE',
  emails: { primaryEmail: 'fulano@exemplo.com.br' },
  parcelas: { edges: [] },
  contratos: { edges: [] },
  ...dados,
});

const comParcela = (situacao: string, vencimento: string) => ({
  parcelas: { edges: [{ node: { situacao, vencimento, pagaEm: null } }] },
});

const comFatura = (invoiceStatus: string, dueAt: string) => ({
  contratos: {
    edges: [
      { node: { faturas: { edges: [{ node: { invoiceStatus, dueAt, paidAt: null } }] } } },
    ],
  },
});

const filtro = (mudancas: Partial<FiltroDeMembro>): FiltroDeMembro => ({
  ...FILTRO_DE_MEMBRO_VAZIO,
  ...mudancas,
});

describe('busca por nome e e-mail', () => {
  const lista = [
    membro({ name: 'Sérgio Henrique ibanez', emails: { primaryEmail: 'sergio@catarinaco.com.br' } }),
    membro({ name: 'Mayara marinov', emails: { primaryEmail: 'consultoria@gmail.com' } }),
  ];

  it('acha sem acento e sem caixa', () => {
    expect(filtrarMembros(lista, filtro({ busca: 'sergio' }))).toHaveLength(1);
    expect(filtrarMembros(lista, filtro({ busca: 'SÉRGIO' }))).toHaveLength(1);
  });

  it('acha por pedaco do e-mail', () => {
    expect(filtrarMembros(lista, filtro({ busca: 'catarinaco' }))).toHaveLength(1);
  });

  it('acha pelo e-mail financeiro, que e onde o aluno trocou de endereco', () => {
    const comFinanceiro = [
      membro({ name: 'Talita', emails: { primaryEmail: 'antigo@x.com' }, emailFinanceiro: 'novo@materialpedagogico.com.br' }),
    ];

    expect(filtrarMembros(comFinanceiro, filtro({ busca: 'materialpedagogico' }))).toHaveLength(1);
  });

  it('busca vazia devolve todo mundo', () => {
    expect(filtrarMembros(lista, filtro({ busca: '   ' }))).toHaveLength(2);
  });

  it('nao quebra com membro sem nome nem e-mail', () => {
    const semNada = [membro({ name: null, emails: null })];

    expect(filtrarMembros(semNada, filtro({ busca: 'qualquer' }))).toHaveLength(0);
    expect(filtrarMembros(semNada, FILTRO_DE_MEMBRO_VAZIO)).toHaveLength(1);
  });
});

describe('status do membro', () => {
  const lista = [
    membro({ name: 'Ativa', situacao: 'ATIVO' }),
    membro({ name: 'Inativo', situacao: 'INATIVO' }),
    membro({ name: 'Pausado', situacao: 'PAUSADO' }),
  ];

  it('filtra pelo status escolhido', () => {
    expect(filtrarMembros(lista, filtro({ status: 'INATIVO' })).map((m) => m.name)).toEqual([
      'Inativo',
    ]);
  });

  // O campo tem quatro opcoes, nao duas: chumbar "ativo e inativo" esconderia
  // pausado e pendente, que sao membros de verdade em algum lugar.
  it('alcanca as opcoes alem de ativo e inativo', () => {
    expect(filtrarMembros(lista, filtro({ status: 'PAUSADO' }))).toHaveLength(1);
  });

  it('vazio nao filtra nada', () => {
    expect(filtrarMembros(lista, FILTRO_DE_MEMBRO_VAZIO)).toHaveLength(3);
  });
});

describe('status do contrato', () => {
  const lista = [
    membro({ contratoSituacao: 'PENDENTE' }),
    membro({ contratoSituacao: 'ASSINADO' }),
    membro({ contratoSituacao: null }),
  ];

  it('filtra pelo status escolhido', () => {
    expect(filtrarMembros(lista, filtro({ contrato: 'ASSINADO' }))).toHaveLength(1);
  });

  it('vazio nao filtra nada', () => {
    expect(filtrarMembros(lista, FILTRO_DE_MEMBRO_VAZIO)).toHaveLength(3);
  });
});

describe('situacao financeira', () => {
  const atrasadoNoManual = membro({ name: 'Manual', ...comParcela('PENDENTE', ONTEM) });
  const atrasadoNoAutomatico = membro({ name: 'Automatico', ...comFatura('PENDING', ONTEM) });
  const emDia = membro({ name: 'Em dia', ...comParcela('PENDENTE', DAQUI_A_UM_MES) });
  const pago = membro({ name: 'Pago', ...comParcela('PAGA', ONTEM) });
  const lista = [atrasadoNoManual, atrasadoNoAutomatico, emDia, pago];

  // A regra que o cliente pediu: atraso num dos dois lados ja e atraso.
  it('pega o atraso dos dois financeiros', () => {
    const atrasados = filtrarMembros(lista, filtro({ financeiro: 'EM_ATRASO' }));

    expect(atrasados.map((m) => m.name)).toEqual(['Manual', 'Automatico']);
  });

  it('em dia e o complemento exato', () => {
    const emDias = filtrarMembros(lista, filtro({ financeiro: 'EM_DIA' }));

    expect(emDias.map((m) => m.name)).toEqual(['Em dia', 'Pago']);
  });

  it('vencida hoje ainda nao e atraso', () => {
    const hoje = [membro({ name: 'Hoje', ...comParcela('PENDENTE', HOJE) })];

    expect(filtrarMembros(hoje, filtro({ financeiro: 'EM_ATRASO' }))).toHaveLength(0);
  });

  it('membro sem financeiro nenhum conta como em dia', () => {
    expect(filtrarMembros([membro({})], filtro({ financeiro: 'EM_DIA' }))).toHaveLength(1);
  });
});

describe('filtros combinados', () => {
  it('os tres somam, nao competem', () => {
    const lista = [
      membro({ name: 'Ana', contratoSituacao: 'ASSINADO', ...comParcela('PENDENTE', ONTEM) }),
      membro({ name: 'Ana', contratoSituacao: 'PENDENTE', ...comParcela('PENDENTE', ONTEM) }),
      membro({ name: 'Bruno', contratoSituacao: 'ASSINADO', ...comParcela('PENDENTE', ONTEM) }),
    ];

    const achados = filtrarMembros(
      lista,
      filtro({ busca: 'ana', contrato: 'ASSINADO', financeiro: 'EM_ATRASO' }),
    );

    expect(achados).toHaveLength(1);
  });

  it('os quatro somam', () => {
    const lista = [
      membro({ name: 'Ana', situacao: 'ATIVO', contratoSituacao: 'ASSINADO', ...comParcela('PENDENTE', ONTEM) }),
      membro({ name: 'Ana', situacao: 'INATIVO', contratoSituacao: 'ASSINADO', ...comParcela('PENDENTE', ONTEM) }),
    ];

    const achados = filtrarMembros(
      lista,
      filtro({ busca: 'ana', status: 'ATIVO', contrato: 'ASSINADO', financeiro: 'EM_ATRASO' }),
    );

    expect(achados).toHaveLength(1);
  });
});
