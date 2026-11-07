import { describe, expect, it } from 'vitest';

import { listarDevedores, resumirDevedores } from 'src/ui/devedores';

const HOJE = '2026-09-26';
const BRL = (reais: number) => ({ amountMicros: reais * 1_000_000, currencyCode: 'BRL' });

const membro = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Membro ${id}`,
  clubeId: 'clube-1',
  situacao: 'ATIVO',
  fotoUrl: null,
  inadimplenciaMarcada: null,
  inadimplenciaValor: null,
  inadimplenciaVencimento: null,
  ...extra,
});

const clube = (id: string) => ({ id, name: `Clube ${id}`, situacao: 'ATIVO', fotoUrl: null });

const parcela = (extra: Record<string, unknown>) => ({
  membroId: null,
  clubeId: null,
  situacao: 'PENDENTE',
  vencimento: '2026-12-01',
  pagaEm: null,
  valor: BRL(1000),
  ...extra,
});

const fatura = (extra: Record<string, unknown>) => ({
  contratoId: 'contrato-1',
  invoiceStatus: 'PENDING',
  dueAt: '2026-12-01T03:00:00.000Z',
  paidAt: null,
  amount: BRL(500),
  ...extra,
});

const listar = (entrada: Partial<Parameters<typeof listarDevedores>[0]>) =>
  listarDevedores({
    hoje: HOJE,
    membros: [],
    clubes: [clube('clube-1')],
    parcelas: [],
    contratos: [],
    faturas: [],
    ...entrada,
  });

describe('quem está em atraso', () => {
  it('lista o membro com parcela vencida, com valor, data e dias', () => {
    const [devedor] = listar({
      membros: [membro('ana')],
      parcelas: [parcela({ membroId: 'ana', clubeId: 'clube-1', vencimento: '2026-08-31' })],
    });

    expect(devedor).toMatchObject({
      tipo: 'membro',
      id: 'ana',
      clube: { id: 'clube-1', nome: 'Clube clube-1' },
      origens: ['manual'],
      valorEmAtraso: 1000 * 1_000_000,
      vencidoDesde: '2026-08-31',
      diasDeAtraso: 26,
    });
  });

  // Os 5 que o painel antigo não via: a dívida estava só no gateway.
  it('lista quem só deve no financeiro automático', () => {
    const [devedor] = listar({
      membros: [membro('airton')],
      contratos: [{ id: 'contrato-1', membroId: 'airton', clubeId: null }],
      faturas: [fatura({ invoiceStatus: 'OVERDUE', dueAt: '2026-09-10T03:00:00.000Z' })],
    });

    expect(devedor?.origens).toEqual(['automatico']);
    expect(devedor?.valorEmAtraso).toBe(500 * 1_000_000);
  });

  it('lista quem a equipe marcou, mesmo sem valor nem vencimento', () => {
    const [devedor] = listar({ membros: [membro('ingra', { inadimplenciaMarcada: true })] });

    expect(devedor).toMatchObject({
      origens: ['marcacao'],
      valorEmAtraso: 0,
      vencidoDesde: null,
      diasDeAtraso: null,
    });
  });

  it('junta as três origens numa linha só e guarda o vencimento mais antigo', () => {
    const devedores = listar({
      membros: [
        membro('joao', {
          inadimplenciaMarcada: true,
          inadimplenciaValor: BRL(7500),
          inadimplenciaVencimento: '2026-07-15',
        }),
      ],
      parcelas: [parcela({ membroId: 'joao', vencimento: '2026-09-01' })],
      contratos: [{ id: 'contrato-1', membroId: 'joao', clubeId: null }],
      faturas: [fatura({ dueAt: '2026-09-20T03:00:00.000Z' })],
    });

    expect(devedores).toHaveLength(1);
    expect(devedores[0]).toMatchObject({
      origens: ['manual', 'automatico', 'marcacao'],
      valorEmAtraso: (1000 + 500 + 7500) * 1_000_000,
      vencidoDesde: '2026-07-15',
    });
  });

  it('cobra do clube a parcela que não tem membro', () => {
    const [devedor] = listar({
      parcelas: [parcela({ clubeId: 'clube-1', vencimento: '2026-09-01' })],
    });

    expect(devedor).toMatchObject({ tipo: 'clube', id: 'clube-1', clube: null });
  });

  it('não conta o que está pago, cancelado, a vencer ou vence hoje', () => {
    const devedores = listar({
      membros: [membro('ok', { inadimplenciaMarcada: false, inadimplenciaVencimento: '2026-01-01' })],
      parcelas: [
        parcela({ membroId: 'ok', situacao: 'PAGA', vencimento: '2026-01-01' }),
        parcela({ membroId: 'ok', situacao: 'CANCELADA', vencimento: '2026-01-01' }),
        parcela({ membroId: 'ok', vencimento: '2026-01-01', pagaEm: '2026-01-02' }),
        parcela({ membroId: 'ok', vencimento: HOJE }),
      ],
      contratos: [{ id: 'contrato-1', membroId: 'ok', clubeId: null }],
      faturas: [fatura({ invoiceStatus: 'PAID', dueAt: '2026-01-01T03:00:00.000Z', paidAt: '2026-01-01' })],
    });

    expect(devedores).toEqual([]);
  });

  it('ignora dívida de registro arquivado, que não vem na lista', () => {
    expect(
      listar({ parcelas: [parcela({ membroId: 'arquivado', vencimento: '2026-01-01' })] }),
    ).toEqual([]);
  });

  it('põe quem deve há mais tempo primeiro e quem não tem data no fim', () => {
    const devedores = listar({
      membros: [
        membro('recente'),
        membro('antigo'),
        membro('sem-data', { inadimplenciaMarcada: true, inadimplenciaValor: BRL(99999) }),
      ],
      parcelas: [
        parcela({ membroId: 'recente', vencimento: '2026-09-20' }),
        parcela({ membroId: 'antigo', vencimento: '2026-06-01' }),
      ],
    });

    expect(devedores.map((devedor) => devedor.id)).toEqual(['antigo', 'recente', 'sem-data']);
  });

  it('resume em pessoas, não em parcelas', () => {
    const resumo = resumirDevedores(
      listar({
        membros: [membro('ana'), membro('bia', { inadimplenciaMarcada: true })],
        parcelas: [
          parcela({ membroId: 'ana', vencimento: '2026-09-01' }),
          parcela({ membroId: 'ana', vencimento: '2026-09-02' }),
        ],
      }),
    );

    expect(resumo).toEqual({
      pessoas: 2,
      valorEmAtraso: 2000 * 1_000_000,
      pessoasPorOrigem: { manual: 1, automatico: 0, marcacao: 1 },
    });
  });
});
