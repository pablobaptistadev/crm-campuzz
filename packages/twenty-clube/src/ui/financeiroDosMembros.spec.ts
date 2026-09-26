import { describe, expect, it } from 'vitest';

import { agruparFinanceiro } from 'src/ui/financeiroDosMembros';
import { estaEmAtraso } from 'src/ui/FiltrosDeMembro';

const ONTEM = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

describe('agrupar o financeiro achatado por membro', () => {
  const agrupado = agruparFinanceiro({
    membroIds: ['m1', 'm2', 'm3'],
    parcelas: [
      { membroId: 'm1', situacao: 'PENDENTE', vencimento: ONTEM, pagaEm: null },
      { membroId: 'm1', situacao: 'PAGA', vencimento: ONTEM, pagaEm: ONTEM },
      { membroId: 'outro-clube', situacao: 'PENDENTE', vencimento: ONTEM, pagaEm: null },
    ],
    contratos: [
      { id: 'c1', membroId: 'm2' },
      { id: 'c2', membroId: 'm2' },
    ],
    faturas: [
      { contratoId: 'c1', invoiceStatus: 'PAID', dueAt: ONTEM, paidAt: ONTEM },
      { contratoId: 'c2', invoiceStatus: 'PENDING', dueAt: ONTEM, paidAt: null },
      { contratoId: 'c2', invoiceStatus: 'PAID', dueAt: ONTEM, paidAt: ONTEM },
    ],
  });

  it('põe cada parcela no seu membro', () => {
    expect(agrupado.get('m1')?.parcelas.edges).toHaveLength(2);
  });

  it('põe as faturas dentro do contrato certo', () => {
    const contratos = agrupado.get('m2')?.contratos.edges ?? [];

    expect(contratos.map((c) => c.node.faturas.edges.length)).toEqual([1, 2]);
  });

  it('membro sem nada fica com listas vazias, não ausente', () => {
    expect(agrupado.get('m3')).toEqual({ parcelas: { edges: [] }, contratos: { edges: [] } });
  });

  // Dado de membro que não é deste clube não pode vazar para ele.
  it('ignora parcela de quem não está na lista', () => {
    expect(agrupado.has('outro-clube')).toBe(false);
  });

  // O formato é o mesmo da relação aninhada: o filtro de atraso lê igual,
  // pelo mesmo caminho que usa na tela.
  it('o filtro de atraso lê o resultado sem adaptação', () => {
    const membro = (id: string) => ({
      name: id,
      situacao: 'ATIVO',
      contratoSituacao: null,
      emails: null,
      ...agrupado.get(id),
    });

    expect(estaEmAtraso(membro('m1'))).toBe(true);
    expect(estaEmAtraso(membro('m2'))).toBe(true);
    expect(estaEmAtraso(membro('m3'))).toBe(false);
  });
});
